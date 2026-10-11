param(
  [string]$MigrationRoot = (Join-Path $PSScriptRoot '..\migrations')
)

$files = Get-ChildItem -LiteralPath $MigrationRoot -Recurse -File -Filter '*.sql' |
  Where-Object { $_.Name -notin @('deployed-archive.sql') }
$versioned = $files | ForEach-Object {
  if ($_.Name -match '^(?<version>\d{14})_') {
    [pscustomobject]@{ Version = $Matches.version; Path = $_.FullName }
  }
}
$duplicates = $versioned | Group-Object Version | Where-Object Count -gt 1
if ($duplicates) {
  $duplicates | ForEach-Object { Write-Error "Duplicate migration version: $($_.Name) -> $($_.Group.Path -join ', ')" }
  exit 1
}
Write-Output "Migration duplicate guard passed: $($files.Count) active SQL files under $MigrationRoot"
