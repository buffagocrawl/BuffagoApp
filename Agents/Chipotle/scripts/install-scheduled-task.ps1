[CmdletBinding()]
param([string]$TaskName = 'Buffago-Chipotle-Daily-Metrics')
$ErrorActionPreference = 'Stop'
$run = Join-Path $PSScriptRoot 'run-chipotle.ps1'
$action = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$run`""
$trigger = New-ScheduledTaskTrigger -Daily -At 6:00AM
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Hours 2)
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Description 'Read-only Buffago Chipotle daily metrics; secrets load from ignored local env at runtime.' -Force | Out-Null
Write-Host "Installed $TaskName for 6:00 AM local Windows time (America/New_York host required)."
