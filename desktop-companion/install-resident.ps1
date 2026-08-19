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

$stateDir = Join-Path $env:USERPROFILE ".legacy-jarvis"
New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
$sessionFile = Join-Path $stateDir "session.dpapi"
$residentLog = Join-Path $stateDir "resident.log"
$wakeLog = Join-Path $stateDir "wake-listener.log"

# Stop only previous JARVIS resident/wake processes. This prevents two copies
# from racing the same refresh token or trying to use the same local port.
Write-Host "Stopping any older JARVIS resident process..."
try {
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
      $_.CommandLine -and (
        $_.CommandLine -match "resident\.mjs" -or
        $_.CommandLine -match "wake_listener\.py"
      )
    } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
} catch {}
Start-Sleep -Milliseconds 700

# Remove the startup shortcut while setup is incomplete. It is recreated only
# after auth + wake-word + microphone self-tests all pass.
$startup = [Environment]::GetFolderPath("Startup")
$shortcutPath = Join-Path $startup "Legacy JARVIS.lnk"
Remove-Item $shortcutPath -Force -ErrorAction SilentlyContinue

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
if ($LASTEXITCODE -ne 0) { throw "pip upgrade failed." }
& $venvPython -m pip install -r requirements.txt
if ($LASTEXITCODE -ne 0) { throw "Wake-word dependency installation failed." }

# A reinstall must not silently trust a stale session left by an older build.
# Force one clean pairing, then immediately prove that the saved refresh token
# can restore a new authenticated client before continuing.
if (Test-Path $sessionFile) {
  Write-Host "Removing stale/previous JARVIS pairing before clean setup..." -ForegroundColor Yellow
  Remove-Item $sessionFile -Force
}

Write-Host ""
Write-Host "One-time Legacy CRM / JARVIS pairing is required now." -ForegroundColor Yellow
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "pair.ps1")
if ($LASTEXITCODE -ne 0) { throw "Pairing did not complete." }

Write-Host "Validating encrypted JARVIS session restore..."
node .\self-test.mjs
if ($LASTEXITCODE -ne 0) {
  Remove-Item $sessionFile -Force -ErrorAction SilentlyContinue
  throw "The saved JARVIS session could not be restored. Pairing was not accepted."
}

Write-Host "Testing Hey Jarvis model and Windows microphone..."
& $venvPython .\wake-self-test.py
if ($LASTEXITCODE -ne 0) {
  throw "Wake-word or microphone self-test failed. JARVIS startup was not registered."
}

# Clear old logs so any startup failure shown below belongs to this build.
Remove-Item $residentLog -Force -ErrorAction SilentlyContinue
Remove-Item $wakeLog -Force -ErrorAction SilentlyContinue

$wsh = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut($shortcutPath)
$shortcut.TargetPath = Join-Path $env:WINDIR "System32\wscript.exe"
$shortcut.Arguments = '"' + (Join-Path $PSScriptRoot "launch-hidden.vbs") + '"'
$shortcut.WorkingDirectory = $PSScriptRoot
$shortcut.Description = "Legacy JARVIS resident voice assistant"
$shortcut.Save()

Write-Host "Starting JARVIS Resident..."
Start-Process -FilePath (Join-Path $env:WINDIR "System32\wscript.exe") -ArgumentList ('"' + (Join-Path $PSScriptRoot "launch-hidden.vbs") + '"')

$healthy = $false
for ($i = 0; $i -lt 15; $i++) {
  Start-Sleep -Milliseconds 700
  try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:45451/health" -Method Get -TimeoutSec 2
    if ($health.ok -eq $true) {
      $healthy = $true
      break
    }
  } catch {}
}

if (-not $healthy) {
  Write-Host ""
  Write-Host "JARVIS did not stay alive after startup." -ForegroundColor Red
  if (Test-Path $residentLog) {
    Write-Host "Last resident log lines:" -ForegroundColor Yellow
    Get-Content $residentLog -Tail 40
  }
  Remove-Item $shortcutPath -Force -ErrorAction SilentlyContinue
  throw "Resident startup health check failed. The error above was preserved instead of hiding it."
}

Write-Host ""
Write-Host "JARVIS Resident is installed and ONLINE." -ForegroundColor Green
Write-Host "Paired session: OK"
Write-Host "Wake model + microphone: OK"
Write-Host "Resident health endpoint: OK"
Write-Host "Windows startup: ENABLED"
Write-Host ""
Write-Host "Say: Hey Jarvis"
Write-Host "Logs: $stateDir"
Write-Host "For visible diagnostics, run start-resident.cmd."
