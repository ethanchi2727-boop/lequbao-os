param([Parameter(Mandatory = $true)][string]$OutputDirectory)

$ErrorActionPreference = 'Stop'
if (-not $env:DATABASE_URL) { throw 'DATABASE_URL is required' }
if (-not $env:BACKUP_ENCRYPTION_RECIPIENT) { throw 'BACKUP_ENCRYPTION_RECIPIENT is required' }
if ($env:BACKUP_DRILL_WRITE_FROZEN -ne 'true') {
  throw 'BACKUP_DRILL_WRITE_FROZEN=true is required for a comparable logical drill snapshot'
}
foreach ($tool in @('pg_dump', 'psql', 'age')) {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "$tool is required" }
}

$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$snapshotSql = Join-Path $repositoryRoot 'ops\sql\financial-snapshot.sql'
$resolved = [System.IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Force -Path $resolved | Out-Null
$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$plain = Join-Path $resolved "lequ-$stamp.dump"
$encrypted = "$plain.age"
$manifestPath = "$encrypted.manifest.json"
if ((Test-Path -LiteralPath $encrypted) -or (Test-Path -LiteralPath $manifestPath)) {
  throw 'backup artifact already exists'
}

$startedAt = (Get-Date).ToUniversalTime()
try {
  $financialSnapshot = (& psql --dbname=$env:DATABASE_URL --tuples-only --no-align --set=ON_ERROR_STOP=1 --file=$snapshotSql | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or -not $financialSnapshot) { throw 'source financial snapshot failed' }
  $snapshotObject = $financialSnapshot | ConvertFrom-Json
  $snapshotDigest = [Convert]::ToHexString(
    [Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($financialSnapshot))
  ).ToLowerInvariant()

  & pg_dump --dbname=$env:DATABASE_URL --format=custom --no-owner --no-acl --file=$plain
  if ($LASTEXITCODE -ne 0) { throw 'pg_dump failed' }
  & age --recipient $env:BACKUP_ENCRYPTION_RECIPIENT --output $encrypted $plain
  if ($LASTEXITCODE -ne 0) { throw 'backup encryption failed' }
  if (-not (Test-Path -LiteralPath $encrypted) -or (Get-Item -LiteralPath $encrypted).Length -le 0) {
    throw 'backup encryption produced no artifact'
  }

  $completedAt = (Get-Date).ToUniversalTime()
  $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $encrypted).Hash.ToLowerInvariant()
  $manifest = [ordered]@{
    schemaVersion = 1
    backupFile = [System.IO.Path]::GetFileName($encrypted)
    backupStartedAt = $startedAt.ToString('o')
    backupCompletedAt = $completedAt.ToString('o')
    encryptedSizeBytes = [long](Get-Item -LiteralPath $encrypted).Length
    encryptedSha256 = $hash
    financialSnapshotSha256 = $snapshotDigest
    financialSnapshot = $snapshotObject
    writeFrozen = $true
  }
  $manifest | ConvertTo-Json -Depth 20 | Set-Content -Encoding UTF8 -LiteralPath $manifestPath -NoNewline
  Write-Output $encrypted
}
finally {
  if (Test-Path -LiteralPath $plain) { Remove-Item -LiteralPath $plain -Force }
}
