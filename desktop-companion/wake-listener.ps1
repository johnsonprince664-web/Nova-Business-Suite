$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Speech
Add-Type -AssemblyName PresentationCore

$BaseUrl = if ($env:JARVIS_BASE_URL) { $env:JARVIS_BASE_URL.TrimEnd('/') } else { "https://legacyjewelrycrmphonereadyfixed.vercel.app" }
$LocalPort = if ($env:JARVIS_LOCAL_PORT) { [int]$env:JARVIS_LOCAL_PORT } else { 45451 }
$StateDir = if ($env:JARVIS_STATE_DIR) { $env:JARVIS_STATE_DIR } else { Join-Path $env:USERPROFILE ".legacy-jarvis" }
$SecretFile = Join-Path $StateDir "local-secret"
$LogFile = Join-Path $StateDir "wake-listener.log"
$WakeConfidence = if ($env:JARVIS_WAKE_THRESHOLD) { [double]$env:JARVIS_WAKE_THRESHOLD } else { 0.58 }

New-Item -ItemType Directory -Path $StateDir -Force | Out-Null

function Write-JarvisLog([string]$Message) {
  $line = "{0:u} {1}" -f (Get-Date), $Message
  Add-Content -Path $LogFile -Value $line -Encoding UTF8
  Write-Host $line
}

function Get-LocalSecret {
  for ($i = 0; $i -lt 40; $i++) {
    if (Test-Path $SecretFile) {
      $value = (Get-Content $SecretFile -Raw).Trim()
      if ($value) { return $value }
    }
    Start-Sleep -Milliseconds 250
  }
  throw "Local JARVIS secret was not created by the resident service."
}

function Invoke-Resident([string]$Text) {
  $secret = Get-LocalSecret
  $headers = @{ "X-Jarvis-Local-Secret" = $secret }
  $body = @{ text = $Text } | ConvertTo-Json -Compress
  return Invoke-RestMethod -Uri "http://127.0.0.1:$LocalPort/voice-command" -Method Post -Headers $headers -ContentType "application/json" -Body $body -TimeoutSec 75
}

function Play-Mp3([byte[]]$Bytes) {
  $temp = Join-Path ([IO.Path]::GetTempPath()) ("jarvis-" + [guid]::NewGuid().ToString("N") + ".mp3")
  try {
    [IO.File]::WriteAllBytes($temp, $Bytes)
    $player = New-Object System.Windows.Media.MediaPlayer
    $player.Open([Uri]$temp)
    $deadline = (Get-Date).AddSeconds(8)
    while (-not $player.NaturalDuration.HasTimeSpan -and (Get-Date) -lt $deadline) {
      Start-Sleep -Milliseconds 50
    }
    $player.Play()
    if ($player.NaturalDuration.HasTimeSpan) {
      Start-Sleep -Milliseconds ([Math]::Ceiling($player.NaturalDuration.TimeSpan.TotalMilliseconds) + 250)
    } else {
      Start-Sleep -Seconds 8
    }
    $player.Close()
  } finally {
    Remove-Item $temp -Force -ErrorAction SilentlyContinue
  }
}

function Speak-Jarvis([string]$Text) {
  if (-not $Text) { return }
  try {
    $payload = @{ text = $Text } | ConvertTo-Json -Compress
    $response = Invoke-WebRequest -Uri "$BaseUrl/api/speech" -Method Post -ContentType "application/json" -Body $payload -TimeoutSec 75 -UseBasicParsing
    Play-Mp3 -Bytes $response.Content
  } catch {
    Write-JarvisLog "Cedar playback failed: $($_.Exception.Message)"
    try {
      $fallback = New-Object System.Speech.Synthesis.SpeechSynthesizer
      $fallback.Rate = -1
      $fallback.Speak($Text)
      $fallback.Dispose()
    } catch {}
  }
}

function Activation-Chime {
  try {
    [Console]::Beep(880, 65)
    [Console]::Beep(1175, 55)
  } catch {}
}

$installed = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers()
if (-not $installed -or $installed.Count -eq 0) {
  throw "Windows Speech Recognition is not installed. Add the Speech language feature for English in Windows Settings, then run JARVIS again."
}

$recognizerInfo = $installed | Where-Object { $_.Culture.Name -eq "en-US" } | Select-Object -First 1
if (-not $recognizerInfo) { $recognizerInfo = $installed | Select-Object -First 1 }

$engine = New-Object System.Speech.Recognition.SpeechRecognitionEngine($recognizerInfo.Id)
$engine.InitialSilenceTimeout = [TimeSpan]::FromSeconds(8)
$engine.BabbleTimeout = [TimeSpan]::FromSeconds(3)
$engine.EndSilenceTimeout = [TimeSpan]::FromMilliseconds(700)
$engine.EndSilenceTimeoutAmbiguous = [TimeSpan]::FromMilliseconds(900)
$engine.SetInputToDefaultAudioDevice()

function Load-WakeGrammar {
  $engine.UnloadAllGrammars()
  $choices = New-Object System.Speech.Recognition.Choices
  $choices.Add([string[]]@("hey jarvis", "jarvis", "wake up jarvis"))
  $builder = New-Object System.Speech.Recognition.GrammarBuilder
  $builder.Culture = $recognizerInfo.Culture
  $builder.Append($choices)
  $grammar = New-Object System.Speech.Recognition.Grammar($builder)
  $grammar.Name = "JARVIS Wake"
  $engine.LoadGrammar($grammar)
}

function Listen-ForCommand {
  $engine.UnloadAllGrammars()
  $dictation = New-Object System.Speech.Recognition.DictationGrammar
  $dictation.Name = "JARVIS Command"
  $engine.LoadGrammar($dictation)
  try {
    $result = $engine.Recognize([TimeSpan]::FromSeconds(10))
    if ($null -eq $result) { return "" }
    if ($result.Confidence -lt 0.25) { return "" }
    return [string]$result.Text
  } finally {
    $engine.UnloadAllGrammars()
  }
}

Load-WakeGrammar
Write-JarvisLog "Windows-native JARVIS wake listener online using $($recognizerInfo.Culture.Name)."
Write-JarvisLog "Wake phrases: Hey Jarvis / Jarvis / Wake up Jarvis"

try {
  while ($true) {
    $wake = $engine.Recognize()
    if ($null -eq $wake) { continue }
    if ($wake.Confidence -lt $WakeConfidence) {
      Write-JarvisLog ("Ignored low-confidence wake phrase '{0}' ({1:N2})." -f $wake.Text, $wake.Confidence)
      continue
    }

    Write-JarvisLog ("Wake phrase detected: '{0}' ({1:N2})." -f $wake.Text, $wake.Confidence)
    Activation-Chime

    try {
      $command = Listen-ForCommand
      if (-not $command) {
        Speak-Jarvis "Yes?"
        $command = Listen-ForCommand
      }

      if ($command) {
        Write-JarvisLog "Command: $command"
        $result = Invoke-Resident $command
        $reply = [string]$result.reply
        Write-JarvisLog "Reply: $reply"
        Speak-Jarvis $reply
      }
    } catch {
      Write-JarvisLog "Voice cycle failed: $($_.Exception.Message)"
      Speak-Jarvis "I hit a voice error. Check the JARVIS resident log."
    } finally {
      Load-WakeGrammar
    }
  }
} finally {
  try { $engine.Dispose() } catch {}
}
