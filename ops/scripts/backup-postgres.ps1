param([Parameter(Mandatory = $true)][string]$OutputDirectory)

$ErrorActionPreference = 'Stop'
function Format-CanonicalUtc([DateTimeOffset]$Value) {
  $Value.ToUniversalTime().ToString(
    "yyyy-MM-dd'T'HH:mm:ss.fff'Z'",
    [Globalization.CultureInfo]::InvariantCulture
  )
}
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
$plain = Join-Path ([System.IO.Path]::GetTempPath()) "lequ-$stamp-$([guid]::NewGuid().ToString('N')).dump"
$encrypted = Join-Path $resolved "lequ-$stamp.dump.age"
$manifestPath = "$encrypted.manifest.json"
$manifestTemp = "$manifestPath.$([guid]::NewGuid().ToString('N')).tmp"
if ((Test-Path -LiteralPath $encrypted) -or (Test-Path -LiteralPath $manifestPath)) {
  throw 'backup artifact already exists'
}

$startedAt = (Get-Date).ToUniversalTime()
$published = $false
try {
  $financialSnapshot = (& psql --dbname=$env:DATABASE_URL --tuples-only --no-align --set=ON_ERROR_STOP=1 --file=$snapshotSql | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or -not $financialSnapshot) { throw 'source financial snapshot failed' }
  $snapshotObject = $financialSnapshot | ConvertFrom-Json
  $snapshotFields = @($snapshotObject.PSObject.Properties.Name | Sort-Object)
  if (($snapshotFields -join "`n") -ne (@('schemaVersion', 'tenantCount', 'tenants') -join "`n") -or
      $snapshotObject.schemaVersion -ne 1 -or
      ($snapshotObject.tenantCount -isnot [int] -and $snapshotObject.tenantCount -isnot [long]) -or
      $snapshotObject.tenantCount -lt 1 -or
      $snapshotObject.tenants -isnot [pscustomobject] -or
      @($snapshotObject.tenants.PSObject.Properties).Count -ne $snapshotObject.tenantCount) {
    throw 'source financial snapshot has invalid tenant coverage'
  }
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
    backupStartedAt = Format-CanonicalUtc $startedAt
    backupCompletedAt = Format-CanonicalUtc $completedAt
    encryptedSizeBytes = [long](Get-Item -LiteralPath $encrypted).Length
    encryptedSha256 = $hash
    financialSnapshotSha256 = $snapshotDigest
    financialSnapshot = $snapshotObject
    writeFrozen = $true
  }
  [IO.File]::WriteAllText(
    $manifestTemp,
    ($manifest | ConvertTo-Json -Depth 20),
    [Text.UTF8Encoding]::new($false)
  )
  Move-Item -LiteralPath $manifestTemp -Destination $manifestPath
  $published = $true
  Write-Output $encrypted
}
finally {
  if (Test-Path -LiteralPath $plain) { Remove-Item -LiteralPath $plain -Force }
  if (Test-Path -LiteralPath $manifestTemp) { Remove-Item -LiteralPath $manifestTemp -Force }
  if (-not $published) {
    if (Test-Path -LiteralPath $manifestPath) { Remove-Item -LiteralPath $manifestPath -Force }
    if (Test-Path -LiteralPath $encrypted) { Remove-Item -LiteralPath $encrypted -Force }
  }
}
