$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

Write-Host ""
Write-Host "Installing Legacy JARVIS Resident V4.1..." -ForegroundColor Cyan
Write-Host "Wake engine: Windows System.Speech (no Python / NumPy / PyAudio)" -ForegroundColor DarkCyan

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js LTS is required. Install Node.js LTS, reopen PowerShell, and run this installer again."
}
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) {
  throw "npm was not found. Reinstall Node.js LTS and include npm."
}

$stateDir = Join-Path $env:USERPROFILE ".legacy-jarvis"
New-Item -ItemType Directory -Path $stateDir -Force | Out-Null
$sessionFile = Join-Path $stateDir "session.dpapi"
$residentLog = Join-Path $stateDir "resident.log"
$wakeLog = Join-Path $stateDir "wake-listener.log"

Write-Host "Stopping any older JARVIS resident/wake processes..."
try {
  Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object {
      $_.CommandLine -and (
        $_.CommandLine -match "resident-v4\.mjs" -or
        $_.CommandLine -match "resident\.mjs" -or
        $_.CommandLine -match "wake-listener\.ps1" -or
        $_.CommandLine -match "wake_listener\.py"
      )
    } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
} catch {}
Start-Sleep -Milliseconds 800

$startup = [Environment]::GetFolderPath("Startup")
$shortcutPath = Join-Path $startup "Legacy JARVIS.lnk"
Remove-Item $shortcutPath -Force -ErrorAction SilentlyContinue

Write-Host "Installing/updating Node companion dependencies..."
npm install
if ($LASTEXITCODE -ne 0) { throw "npm install failed." }

Write-Host "Testing Windows-native wake engine and microphone..."
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot "wake-self-test.ps1")
if ($LASTEXITCODE -ne 0) {
  throw "Windows speech or microphone self-test failed. JARVIS startup was not registered."
}

if (Test-Path ".venv") {
  Write-Host "Removing obsolete Python wake-word environment from older JARVIS builds..."
  Remove-Item ".venv" -Recurse -Force -ErrorAction SilentlyContinue
}

# V4.1 preserves a valid existing pairing. Only ask for credentials when the
# encrypted session is missing or actually fails the authentication self-test.
$needsPair = $true
if (Test-Path $sessionFile) {
  Write-Host "Checking existing encrypted JARVIS pairing..."
  node .\self-test.mjs
  if ($LASTEXITCODE -eq 0) {
    Write-Host "Existing paired session: OK" -ForegroundColor Green
    $needsPair = $false
  } else {
    Write-Host "Existing pairing is invalid; a fresh pair is required." -ForegroundColor Yellow
    Remove-Item $sessionFile -Force -ErrorAction SilentlyContinue
  }
}

if ($needsPair) {
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
}

Remove-Item $residentLog -Force -ErrorAction SilentlyContinue
Remove-Item $wakeLog -Force -ErrorAction SilentlyContinue

$wsh = New-Object -ComObject WScript.Shell
$shortcut = $wsh.CreateShortcut($shortcutPath)
$shortcut.TargetPath = Join-Path $env:WINDIR "System32\wscript.exe"
$shortcut.Arguments = '"' + (Join-Path $PSScriptRoot "launch-hidden.vbs") + '"'
$shortcut.WorkingDirectory = $PSScriptRoot
$shortcut.Description = "Legacy JARVIS resident voice assistant"
$shortcut.Save()

Write-Host "Starting JARVIS Resident V4.1..."
Start-Process -FilePath (Join-Path $env:WINDIR "System32\wscript.exe") -ArgumentList ('"' + (Join-Path $PSScriptRoot "launch-hidden.vbs") + '"')

$healthy = $false
for ($i = 0; $i -lt 18; $i++) {
  Start-Sleep -Milliseconds 700
  try {
    $health = Invoke-RestMethod -Uri "http://127.0.0.1:45451/health" -Method Get -TimeoutSec 2
    if ($health.ok -eq $true -and $health.version -eq 4) {
      $healthy = $true
      break
    }
  } catch {}
}

if (-not $healthy) {
  Write-Host ""
  Write-Host "JARVIS Resident did not stay alive after startup." -ForegroundColor Red
  if (Test-Path $residentLog) {
    Write-Host "Last resident log lines:" -ForegroundColor Yellow
    Get-Content $residentLog -Tail 50
  }
  Remove-Item $shortcutPath -Force -ErrorAction SilentlyContinue
  throw "Resident startup health check failed."
}

Start-Sleep -Seconds 2
$wakeAlive = $false
try {
  $wakeAlive = [bool](Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -and $_.CommandLine -match "wake-listener\.ps1" } |
    Select-Object -First 1)
} catch {}

if (-not $wakeAlive) {
  Write-Host ""
  Write-Host "The JARVIS wake listener did not stay alive." -ForegroundColor Red
  if (Test-Path $wakeLog) {
    Write-Host "Last wake-listener log lines:" -ForegroundColor Yellow
    Get-Content $wakeLog -Tail 50
  }
  if (Test-Path $residentLog) {
    Write-Host "Last resident log lines:" -ForegroundColor Yellow
    Get-Content $residentLog -Tail 50
  }
  Remove-Item $shortcutPath -Force -ErrorAction SilentlyContinue
  throw "Windows-native wake listener startup failed."
}

Write-Host ""
Write-Host "JARVIS Resident V4.1 is installed and ONLINE." -ForegroundColor Green
Write-Host "Paired session: OK"
Write-Host "Windows speech + microphone: OK"
Write-Host "Resident health endpoint: OK"
Write-Host "Wake listener process: OK"
Write-Host "Windows startup: ENABLED"
Write-Host ""
Write-Host "New wake flow: Hey Jarvis -> chime -> Yes? -> speak your command"
Write-Host "Also supported: Hey Jarvis open calculator (one sentence, when Windows recognizes it inline)"
Write-Host "Logs: $stateDir"
Write-Host "For visible diagnostics, run start-resident.cmd."
