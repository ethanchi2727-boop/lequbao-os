param(
  [Parameter(Mandatory = $true)][string]$EncryptedBackup,
  [Parameter(Mandatory = $true)][ValidatePattern('^lequ_restore_[a-z0-9_]+$')][string]$TargetDatabase,
  [Parameter(Mandatory = $true)][ValidatePattern('\.json$')][string]$ReportPath
)

$ErrorActionPreference = 'Stop'
function Format-CanonicalUtc([DateTimeOffset]$Value) {
  $Value.ToUniversalTime().ToString(
    "yyyy-MM-dd'T'HH:mm:ss.fff'Z'",
    [Globalization.CultureInfo]::InvariantCulture
  )
}
if (-not $env:RESTORE_ADMIN_URL) { throw 'RESTORE_ADMIN_URL is required' }
if (-not $env:AGE_IDENTITY_FILE) { throw 'AGE_IDENTITY_FILE is required' }
if (-not $env:DRILL_FAILURE_TIME_UTC) { throw 'DRILL_FAILURE_TIME_UTC is required' }
if ($env:RESTORE_DRILL_ENVIRONMENT -notin @('controlled-preproduction', 'staging')) {
  throw 'RESTORE_DRILL_ENVIRONMENT must be controlled-preproduction or staging'
}
if ($env:RESTORE_DRILL_CONFIRMED_NON_PRODUCTION -ne 'true') {
  throw 'RESTORE_DRILL_CONFIRMED_NON_PRODUCTION=true is required'
}
$adminUri = [Uri]$env:RESTORE_ADMIN_URL
if ($adminUri.Scheme -notin @('postgres', 'postgresql') -or -not $adminUri.Host -or $adminUri.Fragment) {
  throw 'RESTORE_ADMIN_URL must be a PostgreSQL connection URL without a fragment'
}
if ("$($adminUri.Host) $($adminUri.AbsolutePath)" -match 'prod(uction)?') {
  throw 'refusing a production-shaped restore target'
}
foreach ($tool in @('age', 'createdb', 'dropdb', 'pg_restore', 'psql')) {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { throw "$tool is required" }
}

$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$backup = [System.IO.Path]::GetFullPath($EncryptedBackup)
$reportFile = [System.IO.Path]::GetFullPath($ReportPath)
$reportTemp = "$reportFile.$([guid]::NewGuid().ToString('N')).tmp"
$manifestPath = "$backup.manifest.json"
if (-not (Test-Path -LiteralPath $backup)) { throw 'backup missing' }
if (-not (Test-Path -LiteralPath $manifestPath)) { throw 'backup manifest missing' }
if (Test-Path -LiteralPath $reportFile) { throw 'restore report already exists' }
$manifest = Get-Content -Raw -Encoding UTF8 -LiteralPath $manifestPath | ConvertFrom-Json
$expectedManifestFields = @(
  'backupCompletedAt',
  'backupFile',
  'backupStartedAt',
  'encryptedSha256',
  'encryptedSizeBytes',
  'financialSnapshot',
  'financialSnapshotSha256',
  'schemaVersion',
  'writeFrozen'
)
$actualManifestFields = @($manifest.PSObject.Properties.Name | Sort-Object)
if (($actualManifestFields -join "`n") -ne ($expectedManifestFields -join "`n")) {
  throw 'backup manifest fields are incomplete or undeclared'
}
if (($manifest.schemaVersion -isnot [int] -and $manifest.schemaVersion -isnot [long]) -or $manifest.schemaVersion -ne 1) {
  throw 'unsupported backup manifest schema'
}
if ($manifest.writeFrozen -isnot [bool] -or $manifest.writeFrozen -ne $true) {
  throw 'backup manifest does not prove a write-frozen snapshot'
}
if ([string]$manifest.backupFile -cne [System.IO.Path]::GetFileName($backup)) {
  throw 'backup manifest filename mismatch'
}
if ([string]$manifest.encryptedSha256 -cnotmatch '^[a-f0-9]{64}$' -or
    [string]$manifest.financialSnapshotSha256 -cnotmatch '^[a-f0-9]{64}$') {
  throw 'backup manifest digest format is invalid'
}
$encryptedSize = (Get-Item -LiteralPath $backup).Length
if (($manifest.encryptedSizeBytes -isnot [int] -and $manifest.encryptedSizeBytes -isnot [long]) -or
    $manifest.encryptedSizeBytes -le 0 -or $manifest.encryptedSizeBytes -ne $encryptedSize) {
  throw 'encrypted backup size mismatch'
}
if ($null -eq $manifest.financialSnapshot -or $manifest.financialSnapshot -isnot [pscustomobject]) {
  throw 'backup manifest financial snapshot is invalid'
}
$canonicalUtcPattern = '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
$backupStartedAtText = if ($manifest.backupStartedAt -is [DateTime]) {
  Format-CanonicalUtc ([DateTime]$manifest.backupStartedAt)
} else { [string]$manifest.backupStartedAt }
$backupCompletedAtText = if ($manifest.backupCompletedAt -is [DateTime]) {
  Format-CanonicalUtc ([DateTime]$manifest.backupCompletedAt)
} else { [string]$manifest.backupCompletedAt }
if ($backupStartedAtText -cnotmatch $canonicalUtcPattern -or
    $backupCompletedAtText -cnotmatch $canonicalUtcPattern -or
    $env:DRILL_FAILURE_TIME_UTC -cnotmatch $canonicalUtcPattern) {
  throw 'backup or failure timestamp is not canonical UTC'
}
$actualHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $backup).Hash.ToLowerInvariant()
if ($actualHash -ne $manifest.encryptedSha256) { throw 'encrypted backup hash mismatch' }

$failureTime = [DateTimeOffset]::Parse(
  $env:DRILL_FAILURE_TIME_UTC,
  [Globalization.CultureInfo]::InvariantCulture,
  [Globalization.DateTimeStyles]::AssumeUniversal
).ToUniversalTime()
$validationTime = [DateTimeOffset]::UtcNow
if ($failureTime -gt $validationTime) { throw 'drill failure time is in the future' }
$backupCompletedAt = if ($manifest.backupCompletedAt -is [DateTime]) {
  ([DateTimeOffset]$manifest.backupCompletedAt).ToUniversalTime()
} else {
  [DateTimeOffset]::Parse(
    [string]$manifest.backupCompletedAt,
    [Globalization.CultureInfo]::InvariantCulture,
    [Globalization.DateTimeStyles]::AssumeUniversal
  ).ToUniversalTime()
}
$backupStartedAt = if ($manifest.backupStartedAt -is [DateTime]) {
  ([DateTimeOffset]$manifest.backupStartedAt).ToUniversalTime()
} else {
  [DateTimeOffset]::Parse(
    [string]$manifest.backupStartedAt,
    [Globalization.CultureInfo]::InvariantCulture,
    [Globalization.DateTimeStyles]::AssumeUniversal
  ).ToUniversalTime()
}
if ($backupStartedAt -gt $backupCompletedAt) { throw 'backup manifest chronology is invalid' }
$rpoSeconds = ($failureTime - $backupCompletedAt).TotalSeconds
if ($rpoSeconds -lt 0) { throw 'drill failure time precedes backup completion' }

$targetBuilder = [UriBuilder]$env:RESTORE_ADMIN_URL
$targetBuilder.Path = "/$TargetDatabase"
$targetUrl = $targetBuilder.Uri.AbsoluteUri.TrimEnd('/')
$fixtureDatabase = "lequ_fixture_$([guid]::NewGuid().ToString('N'))"
$fixtureBuilder = [UriBuilder]$env:RESTORE_ADMIN_URL
$fixtureBuilder.Path = "/$fixtureDatabase"
$fixtureUrl = $fixtureBuilder.Uri.AbsoluteUri.TrimEnd('/')
$temp = Join-Path ([System.IO.Path]::GetTempPath()) "lequ-restore-$([guid]::NewGuid()).dump"
$startedAt = (Get-Date).ToUniversalTime()
$fixtureResults = @()
$privacyReplayCount = 0
$financialMatch = $false
$failure = $null
$completedAt = $null

try {
  & age --decrypt --identity $env:AGE_IDENTITY_FILE --output $temp $backup
  if ($LASTEXITCODE -ne 0) { throw 'backup decrypt failed' }
  & createdb --maintenance-db=$env:RESTORE_ADMIN_URL $TargetDatabase
  if ($LASTEXITCODE -ne 0) { throw 'fresh restore database creation failed' }
  & pg_restore --dbname=$targetUrl --no-owner --no-acl --exit-on-error $temp
  if ($LASTEXITCODE -ne 0) { throw 'pg_restore failed' }

  $privacyOutput = (& psql --dbname=$targetUrl --tuples-only --no-align --set=ON_ERROR_STOP=1 --command='SELECT COALESCE(sum(app.enqueue_restore_privacy_deletions(id)),0) FROM tenants' | Out-String).Trim()
  if ($LASTEXITCODE -ne 0) { throw 'privacy deletion replay enqueue failed' }
  $privacyReplayCount = [int]$privacyOutput
  if ($privacyReplayCount -lt 1) { throw 'restore drill contains no privacy deletion replay evidence' }

  $snapshotSql = Join-Path $repositoryRoot 'ops\sql\financial-snapshot.sql'
  $restoredSnapshot = (& psql --dbname=$targetUrl --tuples-only --no-align --set=ON_ERROR_STOP=1 --file=$snapshotSql | Out-String).Trim()
  if ($LASTEXITCODE -ne 0 -or -not $restoredSnapshot) { throw 'restored financial snapshot failed' }
  $restoredDigest = [Convert]::ToHexString(
    [System.Security.Cryptography.SHA256]::HashData([System.Text.Encoding]::UTF8.GetBytes($restoredSnapshot))
  ).ToLowerInvariant()
  $financialMatch = $restoredDigest -eq $manifest.financialSnapshotSha256
  if (-not $financialMatch) { throw 'restored financial totals differ from the backup manifest' }

  # Fixtures prove the current schema independently. Running them in the restored
  # business database would mutate recovery evidence and can collide with fixed IDs.
  & createdb --maintenance-db=$env:RESTORE_ADMIN_URL $fixtureDatabase
  if ($LASTEXITCODE -ne 0) { throw 'fresh fixture verification database creation failed' }
  $schemaSql = Join-Path $repositoryRoot 'database\schema.sql'
  & psql --dbname=$fixtureUrl --set=ON_ERROR_STOP=1 --file=$schemaSql
  if ($LASTEXITCODE -ne 0) { throw 'fixture verification schema creation failed' }
  $fixtureFiles = Get-ChildItem -LiteralPath (Join-Path $repositoryRoot 'database\tests') -Filter '*.sql' | Sort-Object Name
  foreach ($fixture in $fixtureFiles) {
    $fixturePath = $fixture.FullName
    & psql --dbname=$fixtureUrl --set=ON_ERROR_STOP=1 --file=$fixturePath
    if ($LASTEXITCODE -ne 0) { throw "database fixture failed: $($fixture.Name)" }
    $fixtureResults += $fixture.Name
  }
  $completedAt = (Get-Date).ToUniversalTime()
  $rtoSeconds = ([DateTimeOffset]$completedAt - $failureTime).TotalSeconds
  if ($rpoSeconds -gt 300) { throw 'RPO exceeds 300 seconds' }
  if ($rtoSeconds -lt 0) { throw 'RTO cannot be negative' }
  if ($rtoSeconds -gt 3600) { throw 'RTO exceeds 3600 seconds' }
}
catch {
  $failure = $_.Exception.Message
  if (-not $completedAt) { $completedAt = (Get-Date).ToUniversalTime() }
}
finally {
  if (Test-Path -LiteralPath $temp) { Remove-Item -LiteralPath $temp -Force }
  & dropdb --maintenance-db=$env:RESTORE_ADMIN_URL --if-exists $fixtureDatabase
  if ($LASTEXITCODE -ne 0 -and -not $failure) { $failure = 'fixture verification database cleanup failed' }
  if (-not $completedAt) { $completedAt = (Get-Date).ToUniversalTime() }
  $rtoSeconds = ([DateTimeOffset]$completedAt - $failureTime).TotalSeconds
  $report = [ordered]@{
    schemaVersion = 1
    result = $(if ($failure) { 'FAIL' } else { 'PASS' })
    backupFile = [System.IO.Path]::GetFileName($backup)
    targetDatabase = $TargetDatabase
    fixtureDatabase = $fixtureDatabase
    failureTime = Format-CanonicalUtc $failureTime
    backupCompletedAt = Format-CanonicalUtc $backupCompletedAt
    restoreStartedAt = Format-CanonicalUtc $startedAt
    restoreCompletedAt = Format-CanonicalUtc ([DateTimeOffset]$completedAt)
    rpoSeconds = $rpoSeconds
    rtoSeconds = $rtoSeconds
    rpoThresholdSeconds = 300
    rtoThresholdSeconds = 3600
    encryptedSha256 = $manifest.encryptedSha256
    financialSnapshotSha256 = $manifest.financialSnapshotSha256
    encryptedSha256Verified = $true
    financialSnapshotMatch = $financialMatch
    privacyReplayTasksEnqueued = $privacyReplayCount
    databaseFixturesPassed = $fixtureResults
    error = $failure
  }
  $reportDirectory = Split-Path -Parent $reportFile
  if ($reportDirectory) { New-Item -ItemType Directory -Force -Path $reportDirectory | Out-Null }
  try {
    [IO.File]::WriteAllText(
      $reportTemp,
      ($report | ConvertTo-Json -Depth 20),
      [Text.UTF8Encoding]::new($false)
    )
    [IO.File]::Move($reportTemp, $reportFile)
  }
  finally {
    if (Test-Path -LiteralPath $reportTemp) { Remove-Item -LiteralPath $reportTemp -Force }
  }
}

if ($failure) { throw "restore verification failed; see report: $reportFile" }
Write-Output "restore verification passed; evidence: $reportFile"
