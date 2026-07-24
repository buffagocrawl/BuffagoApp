param()
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$env:PYTHONPATH = Join-Path $root 'Agents\Cayenne'
python -m cayenne.cli check-prerequisites --repo-root $root
