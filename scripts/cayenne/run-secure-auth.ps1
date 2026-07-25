[CmdletBinding()]
param([string]$DeviceId = 'emulator-5554', [switch]$Preflight)

& (Join-Path $PSScriptRoot '..\run-cayenne-auth.ps1') -DeviceId $DeviceId -Preflight:$Preflight
exit $LASTEXITCODE
