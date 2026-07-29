@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title BuffaGo Mango Habanero
echo.
echo  Mango Habanero - Wing Shot review dashboard
echo  -------------------------------------------
where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js was not found. Install Node.js 20+ and reopen this launcher.
  pause
  exit /b 1
)
if not exist "node_modules\vite\bin\vite.js" (
  echo Installing Mango Habanero dependencies...
  call npm install
  if errorlevel 1 (
    echo ERROR: Dependency installation failed. Check npm output and try again.
    pause
    exit /b 1
  )
)
if not exist ".env" (
  echo ERROR: .env is missing. Copy .env.example to .env and add Supabase values.
  pause
  exit /b 1
)
for %%V in (SUPABASE_URL SUPABASE_SERVICE_ROLE_KEY MANGO_REVIEWER_ID) do (
  findstr /B /C:"%%V=" ".env" >nul 2>nul
  if errorlevel 1 (
    echo ERROR: Required environment variable %%V is missing from .env.
    pause
    exit /b 1
  )
)
echo Starting backend on http://127.0.0.1:4318 ...
start "Mango Habanero API" cmd /k "cd /d "%~dp0" && npm run server"
echo Starting dashboard on http://127.0.0.1:4317 ...
start "Mango Habanero UI" cmd /k "cd /d "%~dp0" && npm run dev"
for /L %%I in (1,1,30) do (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Invoke-WebRequest -UseBasicParsing http://127.0.0.1:4317 -TimeoutSec 1 | Out-Null; exit 0 } catch { exit 1 }" >nul 2>nul
  if not errorlevel 1 goto ready
  timeout /t 1 /nobreak >nul
)
echo ERROR: The dashboard did not become reachable. Inspect the two Mango Habanero log windows.
pause
exit /b 1
:ready
echo Dashboard is ready. Opening browser...
start "" "http://127.0.0.1:4317"
echo This launcher stays open so startup errors remain visible. Close it to finish.
pause
