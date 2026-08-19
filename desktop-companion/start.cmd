@echo off
setlocal
cd /d "%~dp0"

if not exist ".venv\Scripts\python.exe" (
  echo JARVIS Resident has not been installed yet.
  echo Run INSTALL-JARVIS.cmd first.
  pause
  exit /b 1
)

if not exist "%USERPROFILE%\.legacy-jarvis\session.dpapi" (
  echo JARVIS needs one-time pairing first.
  powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0pair.ps1"
  if errorlevel 1 (
    pause
    exit /b 1
  )
)

echo Starting JARVIS Resident...
call npm start
pause
