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

function Play-Mp3File([string]$Path) {
  $player = [System.Windows.Media.MediaPlayer]::new()
  try {
    $player.Open([Uri]$Path)
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
  } finally {
    try { $player.Close() } catch {}
  }
}

function Speak-Jarvis([string]$Text) {
  if (-not $Text) { return }
  $temp = Join-Path ([IO.Path]::GetTempPath()) ("jarvis-" + [guid]::NewGuid().ToString("N") + ".mp3")
  try {
    $payload = @{ text = $Text } | ConvertTo-Json -Compress
    Invoke-WebRequest -Uri "$BaseUrl/api/speech" -Method Post -ContentType "application/json" -Body $payload -TimeoutSec 75 -UseBasicParsing -OutFile $temp
    Play-Mp3File $temp
  } catch {
    Write-JarvisLog "Cedar playback failed: $($_.Exception.Message)"
    try {
      $fallback = [System.Speech.Synthesis.SpeechSynthesizer]::new()
      $fallback.Rate = -1
      $fallback.Speak($Text)
      $fallback.Dispose()
    } catch {}
  } finally {
    Remove-Item $temp -Force -ErrorAction SilentlyContinue
  }
}

function Activation-Chime {
  try {
    [Console]::Beep(880, 65)
    [Console]::Beep(1175, 55)
  } catch {}
}

function Remove-WakePhrase([string]$Text) {
  if (-not $Text) { return "" }
  return ($Text -replace '^\s*(?:hey\s+jarvis|wake\s+up\s+jarvis|jarvis)[\s,.:;!\-]*', '').Trim()
}

$installed = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers()
if (-not $installed -or $installed.Count -eq 0) {
  throw "Windows Speech Recognition is not installed. Add the Speech language feature for English in Windows Settings, then run JARVIS again."
}

$recognizerInfo = $installed | Where-Object { $_.Culture.Name -eq "en-US" } | Select-Object -First 1
if (-not $recognizerInfo) { $recognizerInfo = $installed | Select-Object -First 1 }

$engine = [System.Speech.Recognition.SpeechRecognitionEngine]::new($recognizerInfo.Id)
$engine.InitialSilenceTimeout = [TimeSpan]::FromSeconds(6)
$engine.BabbleTimeout = [TimeSpan]::FromSeconds(3)
$engine.EndSilenceTimeout = [TimeSpan]::FromMilliseconds(600)
$engine.EndSilenceTimeoutAmbiguous = [TimeSpan]::FromMilliseconds(800)
$engine.SetInputToDefaultAudioDevice()

function Load-WakeGrammar {
  $engine.UnloadAllGrammars()

  $choices = [System.Speech.Recognition.Choices]::new()
  $choices.Add([string[]]@("hey jarvis", "jarvis", "wake up jarvis"))

  # Exact wake phrase grammar: "Hey Jarvis"
  $wakeBuilder = [System.Speech.Recognition.GrammarBuilder]::new()
  $wakeBuilder.Culture = $recognizerInfo.Culture
  $wakeBuilder.Append($choices)
  $wakeGrammar = [System.Speech.Recognition.Grammar]::new($wakeBuilder)
  $wakeGrammar.Name = "JARVIS Wake"
  $engine.LoadGrammar($wakeGrammar)

  # Combined grammar also allows: "Hey Jarvis open calculator" in one breath.
  # If Windows recognizes the command inline we can skip the second listen.
  try {
    $combinedChoices = [System.Speech.Recognition.Choices]::new()
    $combinedChoices.Add([string[]]@("hey jarvis", "jarvis", "wake up jarvis"))
    $combinedBuilder = [System.Speech.Recognition.GrammarBuilder]::new()
    $combinedBuilder.Culture = $recognizerInfo.Culture
    $combinedBuilder.Append($combinedChoices)
    $combinedBuilder.AppendDictation()
    $combinedGrammar = [System.Speech.Recognition.Grammar]::new($combinedBuilder)
    $combinedGrammar.Name = "JARVIS Wake + Command"
    $engine.LoadGrammar($combinedGrammar)
  } catch {
    Write-JarvisLog "Inline wake+command grammar unavailable; using two-stage wake mode."
  }
}

function Listen-ForCommand {
  $engine.UnloadAllGrammars()
  $dictation = [System.Speech.Recognition.DictationGrammar]::new()
  $dictation.Name = "JARVIS Command"
  $engine.LoadGrammar($dictation)
  try {
    Write-JarvisLog "Listening for command..."
    $result = $engine.Recognize([TimeSpan]::FromSeconds(8))
    if ($null -eq $result) {
      Write-JarvisLog "No command was recognized before timeout."
      return ""
    }
    Write-JarvisLog ("Command recognition confidence: {0:N2}" -f $result.Confidence)
    if ($result.Confidence -lt 0.18) {
      Write-JarvisLog ("Rejected low-confidence command: '{0}'" -f $result.Text)
      return ""
    }
    return [string]$result.Text
  } finally {
    $engine.UnloadAllGrammars()
  }
}

Load-WakeGrammar
Write-JarvisLog "Windows-native JARVIS wake listener V4.1 online using $($recognizerInfo.Culture.Name)."
Write-JarvisLog "Wake phrases: Hey Jarvis / Jarvis / Wake up Jarvis"
Write-JarvisLog "Say the wake phrase, wait for 'Yes?', then speak. You can also try wake phrase + command in one sentence."

try {
  while ($true) {
    $wake = $engine.Recognize()
    if ($null -eq $wake) { continue }
    if ($wake.Confidence -lt $WakeConfidence) {
      Write-JarvisLog ("Ignored low-confidence wake phrase '{0}' ({1:N2})." -f $wake.Text, $wake.Confidence)
      continue
    }

    $heard = [string]$wake.Text
    $inlineCommand = Remove-WakePhrase $heard
    Write-JarvisLog ("Wake phrase detected: '{0}' ({1:N2})." -f $heard, $wake.Confidence)
    Activation-Chime

    try {
      $command = ""

      if ($inlineCommand) {
        $command = $inlineCommand
        Write-JarvisLog "Inline command captured: $command"
      } else {
        # V4.1 change: acknowledge the wake immediately. V4 waited silently for
        # up to ten seconds first, which made a successful wake look broken.
        Speak-Jarvis "Yes?"
        Start-Sleep -Milliseconds 180
        $command = Listen-ForCommand
      }

      if ($command) {
        Write-JarvisLog "Command: $command"
        $result = Invoke-Resident $command
        $reply = [string]$result.reply
        Write-JarvisLog "Reply: $reply"
        Speak-Jarvis $reply
      } else {
        Speak-Jarvis "I didn't catch that."
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
