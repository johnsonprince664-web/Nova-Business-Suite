@echo off
setlocal
cd /d "%~dp0"
echo Installing Legacy JARVIS Resident...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install-resident.ps1"
if errorlevel 1 (
  echo.
  echo JARVIS installation did not finish successfully.
  pause
  exit /b 1
)
echo.
echo JARVIS Resident setup complete.
pause
