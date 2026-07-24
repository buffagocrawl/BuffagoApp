param(
  [string]$Branch,
  [string]$Commit,
  [string]$Suite = 'smoke',
  [string]$Environment = 'qa',
  [switch]$DryRun
)
$root = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$request = [ordered]@{
  schema_version='1.0'; request_id=('serrano-' + [guid]::NewGuid().ToString()); requested_by='serrano'; repository='BuffagoApp'; branch=$Branch; commit=$Commit; base_commit=$null; environment=$Environment; platforms=@('android'); suite=$Suite; changed_features=@(); required_journeys=@('launch-smoke'); visual_checkpoints=@(); database_assertions=@(); blocking_severity='high'; options=@{capture_video=$false; capture_logs=$true; reset_fixtures=$false}
}
$requestPath = Join-Path $root 'artifacts\cayenne\request.json'
New-Item -ItemType Directory -Force (Split-Path $requestPath) | Out-Null
$request | ConvertTo-Json -Depth 10 | Set-Content -Encoding UTF8 $requestPath
$env:PYTHONPATH = Join-Path $root 'Agents\Cayenne'
$args = @('-m','cayenne.cli','run','--repo-root',$root,'--request',$requestPath)
if ($DryRun) { $args += '--dry-run' }
python @args
