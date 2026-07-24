param(
  [string]$MigrationRoot = (Join-Path $PSScriptRoot '..\migrations')
)

$files = Get-ChildItem -LiteralPath $MigrationRoot -Recurse -File -Filter '*.sql' |
  Where-Object { $_.Name -notin @('deployed-archive.sql') }
$duplicates = $files | Group-Object Name | Where-Object Count -gt 1
if ($duplicates) {
  $duplicates | ForEach-Object { Write-Error "Duplicate migration version: $($_.Name) -> $($_.Group.FullName -join ', ')" }
  exit 1
}
Write-Output "Migration duplicate guard passed: $($files.Count) active SQL files under $MigrationRoot"
