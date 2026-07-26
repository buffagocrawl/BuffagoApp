[CmdletBinding()]
param([string]$ReportDate)
$args = @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $PSScriptRoot 'run-chipotle.ps1'),'-DryRun')
if ($ReportDate) { $args += @('-ReportDate',$ReportDate) }
& powershell @args
exit $LASTEXITCODE
