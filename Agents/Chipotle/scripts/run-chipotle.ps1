[CmdletBinding()]
param([switch]$DryRun, [switch]$SmokeTest, [string]$ReportDate)
$ErrorActionPreference = 'Stop'
$base = Split-Path -Parent $PSScriptRoot
$root = Split-Path -Parent (Split-Path -Parent $base)
$envFile = Join-Path (Split-Path -Parent $base) 'Chipotle.env.local'
$lockPath = Join-Path $base 'artifacts\chipotle.lock'
$logPath = Join-Path $base 'logs\chipotle.log'
New-Item -ItemType Directory -Force (Split-Path $lockPath), (Split-Path $logPath) | Out-Null
$ownsLock = $false
$staleAfter = New-TimeSpan -Hours 3
if (Test-Path -LiteralPath $lockPath) {
  $lock = Get-Item -LiteralPath $lockPath
  if ((Get-Date) - $lock.LastWriteTime -gt $staleAfter) {
    Remove-Item -LiteralPath $lockPath -Force
  } else {
    Write-Error 'Chipotle is already running (lock exists).'; exit 75
  }
}
try {
  # CreateNew makes acquisition atomic when two scheduled/manual runs start together.
  $stream = [System.IO.File]::Open($lockPath, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::Write, [System.IO.FileShare]::Read)
  try {
    $bytes = [System.Text.Encoding]::UTF8.GetBytes("PID=$PID`nSTARTED=$((Get-Date).ToUniversalTime().ToString('o'))`n")
    $stream.Write($bytes, 0, $bytes.Length)
  } finally { $stream.Dispose() }
  $ownsLock = $true
} catch [System.IO.IOException] {
  Write-Error 'Chipotle is already running (lock exists).'; exit 75
}
try {
  if (Test-Path -LiteralPath $envFile) {
    foreach ($line in Get-Content -LiteralPath $envFile) {
      if ($line -match '^\s*#' -or $line -notmatch '=') { continue }
      $key, $value = $line.Split('=', 2); $key = $key.Trim(); $value = $value.Trim().Trim('"').Trim("'")
      if ($key) { [Environment]::SetEnvironmentVariable($key, $value, 'Process') }
    }
  }
  $args = @((Join-Path $base 'src\chipotle.py'))
  if ($DryRun) { $args += '--dry-run' }; if ($SmokeTest) { $args += '--smoke-test' }; if ($ReportDate) { $args += @('--date', $ReportDate) }
  $python = [Environment]::GetEnvironmentVariable('CHIPOTLE_PYTHON', 'Process')
  if (-not $python) { $python = (Get-Command python -ErrorAction SilentlyContinue).Source }
  if (-not $python) { $candidate = Join-Path $env:LOCALAPPDATA 'Programs\Python\Python312\python.exe'; if (Test-Path $candidate) { $python = $candidate } }
  if (-not $python) { throw 'Python 3.11+ was not found. Set CHIPOTLE_PYTHON to its executable path.' }
  & $python @args 2>&1 | ForEach-Object { $_.ToString() -replace '(?i)(bearer\s+|apikey[=:]\s*|service_role[^\s=]*[=:]\s*)[^\s]+','$1[REDACTED]' } | Tee-Object -FilePath $logPath -Append
  exit $LASTEXITCODE
} catch { $_.Exception.Message -replace '(?i)(bearer\s+|apikey[=:]\s*|service_role[^\s=]*[=:]\s*)[^\s]+','$1[REDACTED]' | Tee-Object -FilePath $logPath -Append; exit 2
} finally {
  if ($ownsLock) { Remove-Item -LiteralPath $lockPath -Force -ErrorAction SilentlyContinue }
}
