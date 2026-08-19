@echo off
setlocal
cd /d "%~dp0"
if not exist "%USERPROFILE%\.legacy-jarvis" mkdir "%USERPROFILE%\.legacy-jarvis" >nul 2>nul

echo.
echo Starting Legacy JARVIS Resident in diagnostic mode...
echo Keep this window open while testing Hey Jarvis.
echo.
node resident.mjs
set "JARVIS_EXIT=%errorlevel%"

echo.
if not "%JARVIS_EXIT%"=="0" (
  echo JARVIS stopped with exit code %JARVIS_EXIT%.
  echo.
  echo Last resident log lines:
  powershell -NoProfile -Command "if (Test-Path $env:USERPROFILE+'\.legacy-jarvis\resident.log') { Get-Content ($env:USERPROFILE+'\.legacy-jarvis\resident.log') -Tail 30 }"
) else (
  echo JARVIS stopped normally.
)
echo.
echo This window is intentionally staying open so the error cannot disappear.
pause
exit /b %JARVIS_EXIT%
