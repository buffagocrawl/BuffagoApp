param([Parameter(Mandatory=$true)][string]$RunId)
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$result = Join-Path $root (Join-Path (Join-Path 'artifacts\cayenne' $RunId) 'result.json')
if (-not (Test-Path $result)) { throw "Cayenne result not found: $RunId" }
Get-Content -Raw $result
