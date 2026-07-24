param([Parameter(Mandatory=$true)][string]$RunId)
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$run = Join-Path $root (Join-Path 'artifacts\cayenne' $RunId)
if (-not (Test-Path $run)) { throw "Cayenne run not found: $RunId" }
Get-ChildItem -LiteralPath $run -Filter '.run.lock' -Force -ErrorAction SilentlyContinue | Remove-Item -Force
Write-Output "Cleaned Cayenne lock for $RunId"
