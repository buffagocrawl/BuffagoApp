[CmdletBinding()]
param(
  [string]$DeviceId = 'emulator-5554',
  [switch]$Preflight
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$localFiles = @((Join-Path $root '.env.cayenne.local'), (Join-Path $root '.secrets\cayenne.local.env'))
$blocked = 'CAYENNE_AUTH_BLOCKED: Required Cayenne authentication credentials are unavailable.'
$placeholders = @('', 'changeme', 'change-me', 'example', 'password', 'your-password', '<password>')

function Test-CayenneCredentialPair([string]$Email, [AllowNull()][string]$Password) {
  return -not [string]::IsNullOrWhiteSpace($Email) -and $null -ne $Password -and
    -not [string]::IsNullOrWhiteSpace($Password) -and
    -not ($placeholders -contains $Email.Trim().ToLowerInvariant()) -and
    -not ($placeholders -contains $Password.ToLowerInvariant())
}

function ConvertFrom-CayenneLocalValue([string]$Value) {
  $value = $Value.Trim()
  if ($value.Length -ge 2 -and (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'")))) {
    return $value.Substring(1, $value.Length - 2)
  }
  return $value
}

function Get-CayenneCredentials {
  $email = $env:CAYENNE_TEST_EMAIL
  $password = $env:CAYENNE_TEST_PASSWORD
  if (Test-CayenneCredentialPair $email $password) {
    return [pscustomobject]@{ Email = $email.Trim(); Password = $password; Source = 'inherited_environment' }
  }
  foreach ($localFile in $localFiles) {
  if (-not (Test-Path -LiteralPath $localFile -PathType Leaf)) { continue }
  $parsed = @{}
  foreach ($line in [System.IO.File]::ReadLines($localFile)) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith('#')) { continue }
    $match = [regex]::Match($line, '^([^=]+)=(.*)$')
    if (-not $match.Success) { continue }
    $key = $match.Groups[1].Value.Trim()
    if ($key -in @('CAYENNE_TEST_EMAIL', 'CAYENNE_TEST_PASSWORD')) { $parsed[$key] = ConvertFrom-CayenneLocalValue $match.Groups[2].Value }
  }
  $email = if ($parsed.ContainsKey('CAYENNE_TEST_EMAIL')) { $parsed['CAYENNE_TEST_EMAIL'].Trim() } else { $null }
  $password = if ($parsed.ContainsKey('CAYENNE_TEST_PASSWORD')) { $parsed['CAYENNE_TEST_PASSWORD'] } else { $null }
  if (Test-CayenneCredentialPair $email $password) {
    return [pscustomobject]@{ Email = $email; Password = $password; Source = 'ignored_local_file' }
  }
  }
  return $null
}

$oldEmail = [Environment]::GetEnvironmentVariable('CAYENNE_TEST_EMAIL', 'Process')
$oldPassword = [Environment]::GetEnvironmentVariable('CAYENNE_TEST_PASSWORD', 'Process')
$oldCredentialSource = [Environment]::GetEnvironmentVariable('CAYENNE_CREDENTIAL_SOURCE', 'Process')
try {
  $credentials = Get-CayenneCredentials
  $credentialPath = $localFiles | Where-Object { Test-Path -LiteralPath $_ -PathType Leaf } | Select-Object -First 1
  & git -C $root check-ignore -q -- $credentialPath
  $ignored = $LASTEXITCODE -eq 0
  $trackedPaths = @(& git -C $root ls-files -- $credentialPath)
  $tracked = $trackedPaths.Count -gt 0
  if ($Preflight) {
    $source = if ($credentials) { $credentials.Source } else { 'unavailable' }
    Write-Output "Credential source: $source"
    Write-Output ('Git ignored: ' + $(if ($ignored) { 'PASS' } else { 'FAIL' }))
    Write-Output ('Git tracked: ' + $(if ($tracked) { 'YES' } else { 'NO' }))
    if (-not $credentials) { Write-Output 'CAYENNE_AUTH_BLOCKED: Required Cayenne authentication credentials are unavailable.'; exit 2 }
    if (-not $ignored -or $tracked) { exit 2 }
    exit 0
  }
  if (-not $credentials) { throw $blocked }
  if (-not $ignored -or $tracked) { throw 'CAYENNE_AUTH_BLOCKED: Local credential file must be ignored and untracked.' }
  $env:CAYENNE_TEST_EMAIL = $credentials.Email
  $env:CAYENNE_TEST_PASSWORD = $credentials.Password
  $env:CAYENNE_CREDENTIAL_SOURCE = $credentials.Source
  & (Join-Path $root 'scripts\cayenne\run.ps1') -Suite auth -Environment qa -DeviceId $DeviceId -ResetApp
  exit $LASTEXITCODE
}
finally {
  if ($null -eq $oldEmail) { Remove-Item Env:CAYENNE_TEST_EMAIL -ErrorAction SilentlyContinue } else { $env:CAYENNE_TEST_EMAIL = $oldEmail }
  if ($null -eq $oldPassword) { Remove-Item Env:CAYENNE_TEST_PASSWORD -ErrorAction SilentlyContinue } else { $env:CAYENNE_TEST_PASSWORD = $oldPassword }
  if ($null -eq $oldCredentialSource) { Remove-Item Env:CAYENNE_CREDENTIAL_SOURCE -ErrorAction SilentlyContinue } else { $env:CAYENNE_CREDENTIAL_SOURCE = $oldCredentialSource }
}
