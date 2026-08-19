$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js LTS is required. Install Node.js, then run this again."
}

$email = Read-Host "Legacy CRM / JARVIS account email"
$secure = Read-Host "Legacy CRM / JARVIS password" -AsSecureString
$ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
  $plain = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  $env:JARVIS_EMAIL = $email
  $env:JARVIS_PASSWORD = $plain
  node .\pair.mjs
  if ($LASTEXITCODE -ne 0) { throw "JARVIS pairing failed." }
}
finally {
  [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  Remove-Item Env:JARVIS_PASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:JARVIS_EMAIL -ErrorAction SilentlyContinue
}
