@echo off
setlocal
cd /d "%~dp0"
if not exist "%USERPROFILE%\.legacy-jarvis" mkdir "%USERPROFILE%\.legacy-jarvis" >nul 2>nul
node resident.mjs >> "%USERPROFILE%\.legacy-jarvis\resident.log" 2>&1
