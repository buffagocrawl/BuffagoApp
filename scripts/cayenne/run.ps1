[CmdletBinding()]
param(
  [ValidateSet('smoke','auth','onboarding','full','accessibility','exploratory')][string]$Suite='smoke',
  [ValidateSet('local-mock','qa','production-readonly')][string]$Environment='production-readonly',
  [string]$DeviceId='emulator-5554', [string]$RunId, [switch]$CaptureVideo, [switch]$ResetApp,
  [switch]$Rebuild, [switch]$KeepFixtureData, [switch]$SerranoReview, [string]$OutputDirectory, [switch]$DryRun
)
$ErrorActionPreference='Stop'
$root=(Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$py=Get-Command python -ErrorAction SilentlyContinue
if (-not $py) { $candidate=Join-Path $env:LOCALAPPDATA 'Programs\Python\Python312\python.exe'; if(Test-Path $candidate){$py=Get-Command $candidate}else{throw 'Python is required for Cayenne orchestration.'} }
$args=@('-u',(Join-Path $root 'cayenne\scripts\run_runtime.py'),'--suite',$Suite,'--environment',$Environment,'--device-id',$DeviceId)
if($RunId){$args+=@('--run-id',$RunId)}; if($CaptureVideo){$args+='--capture-video'}; if($ResetApp){$args+='--reset-app'}; if($Rebuild){$args+='--rebuild'}; if($KeepFixtureData){$args+='--keep-fixture-data'}; if($SerranoReview){$args+='--serrano-review'}; if($OutputDirectory){$args+=@('--output-directory',$OutputDirectory)}; if($DryRun){$args+='--dry-run'}
$env:PYTHONPATH=Join-Path $root 'cayenne\scripts'
& $py.Source @args
exit $LASTEXITCODE
