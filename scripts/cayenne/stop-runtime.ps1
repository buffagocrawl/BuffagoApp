[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$RunDirectory)
$ErrorActionPreference='Stop'
$manifest=Join-Path (Resolve-Path $RunDirectory).Path 'runtime\processes.json'
if(-not (Test-Path $manifest)){throw "No Cayenne process manifest exists at $manifest"}
$state=Get-Content -Raw $manifest | ConvertFrom-Json
if($state.owner -ne 'cayenne'){throw 'Refusing to clean a process manifest not owned by Cayenne.'}
$cleaned=@()
foreach($owned in $state.processes){
  $process=Get-CimInstance Win32_Process -Filter "ProcessId=$($owned.pid)" -ErrorAction SilentlyContinue
  if($process -and $process.ExecutablePath -and ((Resolve-Path $process.ExecutablePath).Path -eq (Resolve-Path $owned.executable).Path)){
    & taskkill /PID $owned.pid /T /F | Out-Null
    if($LASTEXITCODE -eq 0){$cleaned+=$owned.pid}
  }
}
Write-Output "Cayenne runtime cleanup complete. Stopped owned PIDs: $($cleaned -join ', ')"
