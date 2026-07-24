param(
  [Parameter(Mandatory = $true)][string]$DatabaseUrl,
  [string]$Psql = 'psql'
)

$ErrorActionPreference = 'Stop'
$root = Resolve-Path (Join-Path $PSScriptRoot '..')
$preflight = Join-Path $root 'supabase/validation/buffago-baseline-preflight.sql'
$migrationDir = Join-Path $root 'supabase/migrations'

# Migrations are append-only source artifacts. Deployment must never move,
# archive, rename, or delete SQL; nested timestamped files indicate a broken
# migration-management repair and are rejected before any database command.
$nestedMigrations = Get-ChildItem -LiteralPath $migrationDir -Recurse -File -Filter '*.sql' |
  Where-Object { $_.DirectoryName -ne (Resolve-Path -LiteralPath $migrationDir).Path -and $_.Name -match '^\d{14}_' }
if ($nestedMigrations) {
  throw "Refusing deployment: timestamped migrations must remain directly under $migrationDir; found $($nestedMigrations.FullName -join ', ')"
}

Write-Host 'Running BuffaGo baseline preflight (read-only)...'
& $Psql $DatabaseUrl --set ON_ERROR_STOP=1 --file $preflight
if ($LASTEXITCODE -ne 0) {
  throw 'BuffaGo baseline preflight failed; no engagement migration was applied.'
}

Get-ChildItem $migrationDir -Filter '*.sql' -File |
  Where-Object { $_.Name -match '^\d{14}_[a-z0-9][a-z0-9_-]*\.sql$' } |
  Sort-Object Name |
  ForEach-Object {
    Write-Host "Applying $($_.Name)..."
    & $Psql $DatabaseUrl --set ON_ERROR_STOP=1 --file $_.FullName
    if ($LASTEXITCODE -ne 0) { throw "Migration failed: $($_.Name)" }
  }

Write-Host 'BuffaGo engagement migration chain completed.'
