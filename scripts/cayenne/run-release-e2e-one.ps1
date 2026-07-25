[CmdletBinding()]
param([string]$DeviceId = 'emulator-5554', [string]$RunDirectory)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
if (-not $RunDirectory) { throw 'CAYENNE_RELEASE_E2E_BLOCKED: a run directory is required.' }
$run = [IO.Path]::GetFullPath($RunDirectory)
New-Item -ItemType Directory -Force -Path $run | Out-Null
$values = @{}
Get-Content -LiteralPath (Join-Path $root '.env.cayenne.local') | ForEach-Object {
  if ($_ -match '^\s*(CAYENNE_TEST_EMAIL|CAYENNE_TEST_PASSWORD)=(.*)$') { $values[$matches[1]] = $matches[2].Trim().Trim('"') }
}
if (-not $values['CAYENNE_TEST_EMAIL'] -or -not $values['CAYENNE_TEST_PASSWORD']) { throw 'CAYENNE_AUTH_BLOCKED' }
$oldEmail = $env:CAYENNE_TEST_EMAIL; $oldPassword = $env:CAYENNE_TEST_PASSWORD
try {
  $env:CAYENNE_TEST_EMAIL = $values['CAYENNE_TEST_EMAIL']; $env:CAYENNE_TEST_PASSWORD = $values['CAYENNE_TEST_PASSWORD']
  maestro --device $DeviceId test (Join-Path $root 'cayenne\flows\auth\cayenne-secure-auth.yaml') --format junit --output (Join-Path $run 'junit.xml')
  exit $LASTEXITCODE
} finally {
  if ($null -eq $oldEmail) { Remove-Item Env:CAYENNE_TEST_EMAIL -ErrorAction SilentlyContinue } else { $env:CAYENNE_TEST_EMAIL = $oldEmail }
  if ($null -eq $oldPassword) { Remove-Item Env:CAYENNE_TEST_PASSWORD -ErrorAction SilentlyContinue } else { $env:CAYENNE_TEST_PASSWORD = $oldPassword }
}
