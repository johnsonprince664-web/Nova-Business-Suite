$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host ""
Write-Host "Installing Legacy JARVIS Resident..." -ForegroundColor Cyan

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js LTS is required. Install Node.js LTS, reopen PowerShell, and run this installer again."
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw "npm was not found. Reinstall Node.js LTS and include npm."
}

$pythonCommand = $null
$pythonArgs = @()
if (Get-Command py -ErrorAction SilentlyContinue) {
  $pythonCommand = "py"
  $pythonArgs = @("-3")
} elseif (Get-Command python -ErrorAction SilentlyContinue) {
  $pythonCommand = "python"
} else {
  throw "Python 3.10 or newer is required for the local Hey Jarvis wake-word engine. Install Python, reopen PowerShell, and run this installer again."
}

Write-Host "Installing Node companion dependencies..."
npm install
if ($LASTEXITCODE -ne 0) { throw "npm install failed." }

if (-not (Test-Path ".venv\Scripts\python.exe")) {
  Write-Host "Creating private Python environment..."
  & $pythonCommand @pythonArgs -m venv .venv
  if ($LASTEXITCODE -ne 0) { throw "Could not create the JARVIS Python environment." }
}

$venvPython = Join-Path $PSScriptRoot ".venv\Scripts\python.exe"
Write-Host "Installing local wake-word engine..."
& $venvPython -m pip install --upgrade pip
& $venvPython -m pip install -r requirements.txt
if ($LASTEXITCODE -ne 0) { throw "Wake-word dependency installation failed." }

$stateDir = Join-Path $env:USERPROFILE ".legacy-jarvis"
New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
$sessionFile = Join-Path $stateDir "session.dpapi"
if (-not (Test-Path $sessionFile)) {
  Write-Host ""
  Write-Host "One-time pairing:" -ForegroundColor Yellow
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "pair.ps1")
  if ($LASTEXITCODE -ne 0) { throw "Pairing did not complete." }
}

$startup = [Environment]::GetFolderPath("Startup")
$shortcutPath = Join-Path $startup "Legacy JARVIS.lnk"
$wsh = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut($shortcutPath)
$shortcut.TargetPath = Join-Path $env:WINDIR "System32\wscript.exe"
$shortcut.Arguments = '"' + (Join-Path $PSScriptRoot "launch-hidden.vbs") + '"'
$shortcut.WorkingDirectory = $PSScriptRoot
$shortcut.Description = "Legacy JARVIS resident voice assistant"
$shortcut.Save()

Write-Host "Registered JARVIS to start when you sign in to Windows."
Write-Host "Starting JARVIS Resident now..."
Start-Process -FilePath (Join-Path $env:WINDIR "System32\wscript.exe") -ArgumentList ('"' + (Join-Path $PSScriptRoot "launch-hidden.vbs") + '"')

Write-Host ""
Write-Host "JARVIS is installed." -ForegroundColor Green
Write-Host "Say: Hey Jarvis"
Write-Host "Logs: $stateDir"
Write-Host "Windows Startup Apps can disable or re-enable Legacy JARVIS at any time."
