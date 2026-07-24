param(
  [Parameter(Mandatory = $true)][string]$DatabaseUrl,
  [string]$Psql = 'psql'
)

$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$preflight = Join-Path $root 'supabase/validation/buffago-baseline-preflight.sql'
$migrationDir = Join-Path $root 'supabase/migrations/deployed'

Write-Host 'Running BuffaGo baseline preflight (read-only)...'
& $Psql $DatabaseUrl --set ON_ERROR_STOP=1 --file $preflight
if ($LASTEXITCODE -ne 0) {
  throw 'BuffaGo baseline preflight failed; no engagement migration was applied.'
}

Get-ChildItem $migrationDir -Filter '*.sql' -File |
  Where-Object { $_.Name -notlike 'deployed-archive.sql' } |
  Sort-Object Name |
  ForEach-Object {
    Write-Host "Applying $($_.Name)..."
    & $Psql $DatabaseUrl --set ON_ERROR_STOP=1 --file $_.FullName
    if ($LASTEXITCODE -ne 0) { throw "Migration failed: $($_.Name)" }
  }

Write-Host 'BuffaGo engagement migration chain completed.'
