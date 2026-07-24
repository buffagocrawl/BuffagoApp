[CmdletBinding()]
param(
  [string]$DeviceId='emulator-5554',
  [string]$RunDirectory
)
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$py=Get-Command python -ErrorAction SilentlyContinue
if(-not $py){
  $candidate=Join-Path $env:LOCALAPPDATA 'Programs\Python\Python312\python.exe'
  if(Test-Path $candidate){$py=Get-Command $candidate}else{throw 'Python is required for Cayenne orchestration.'}
}
if(-not $RunDirectory){
  $stamp=Get-Date -Format 'yyyyMMddTHHmmss'
  $RunDirectory=Join-Path $root "artifacts\cayenne\runtime\$stamp"
}
$env:PYTHONPATH=Join-Path $root 'cayenne\scripts'
& $py.Source (Join-Path $root 'cayenne\scripts\start_android_runtime.py') --device-id $DeviceId --run-directory $RunDirectory
exit $LASTEXITCODE
