@echo off
setlocal

cd /d "%~dp0"
echo [PLC Crosswalk] Starting local services...
powershell -ExecutionPolicy Bypass -File scripts\app-up.ps1 -Mode dev -Port 3000

if errorlevel 1 (
  echo [PLC Crosswalk] Startup failed. Review the terminal output above.
  pause
  exit /b 1
)

start "" "http://localhost:3000/sign-in"
echo [PLC Crosswalk] App is available at http://localhost:3000/sign-in
echo [PLC Crosswalk] You can close this window.
exit /b 0
