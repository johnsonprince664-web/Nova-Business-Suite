$ErrorActionPreference = "Stop"

try {
  Add-Type -AssemblyName System.Speech
} catch {
  Write-Error "Windows System.Speech could not load. Install the English Speech language feature in Windows Settings."
  exit 1
}

$installed = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers()
if (-not $installed -or $installed.Count -eq 0) {
  Write-Error "No Windows speech recognizer is installed. Go to Settings > Time & language > Language & region > English > Language options and install Speech."
  exit 1
}

$info = $installed | Where-Object { $_.Culture.Name -eq "en-US" } | Select-Object -First 1
if (-not $info) { $info = $installed | Select-Object -First 1 }

$engine = $null
try {
  $engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine($info.Id)
  $choices = New-Object System.Speech.Recognition.Choices
  $choices.Add([string[]]@("hey jarvis", "jarvis", "wake up jarvis"))
  $builder = New-Object System.Speech.Recognition.GrammarBuilder
  $builder.Culture = $info.Culture
  $builder.Append($choices)
  $grammar = New-Object System.Speech.Recognition.Grammar($builder)
  $engine.LoadGrammar($grammar)
  $engine.SetInputToDefaultAudioDevice()
  Write-Host "Windows speech engine: OK ($($info.Culture.Name))"
  Write-Host "Default microphone connection: OK"
  Write-Host "Wake phrases loaded: Hey Jarvis / Jarvis / Wake up Jarvis"
  exit 0
} catch {
  Write-Error "Windows speech/microphone self-test failed: $($_.Exception.Message)"
  exit 1
} finally {
  if ($engine) {
    try { $engine.Dispose() } catch {}
  }
}
