$ErrorActionPreference = "SilentlyContinue"
$startup = [Environment]::GetFolderPath("Startup")
Remove-Item (Join-Path $startup "Legacy JARVIS.lnk") -Force

Get-CimInstance Win32_Process | Where-Object {
  $_.CommandLine -and ($_.CommandLine -like "*desktop-companion*resident.mjs*" -or $_.CommandLine -like "*desktop-companion*wake_listener.py*")
} | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }

Write-Host "Legacy JARVIS startup entry removed."
Write-Host "Your encrypted pairing and logs were left in $env:USERPROFILE\.legacy-jarvis so reinstalling does not require re-pairing."
