@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is required for the JARVIS Desktop Companion.
  echo Install Node.js LTS, then run this file again.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installing JARVIS Desktop Companion...
  call npm install
  if errorlevel 1 (
    echo Installation failed.
    pause
    exit /b 1
  )
)
echo.
echo Starting JARVIS Desktop Companion...
call npm start
pause
