[CmdletBinding()]
param([string]$TaskName = 'Buffago-Chipotle-Daily-Metrics')
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction Stop
Write-Host "Removed $TaskName."
