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

function Transcribe-RecognizedAudio($RecognitionResult) {
  if ($null -eq $RecognitionResult -or $null -eq $RecognitionResult.Audio) {
    return ""
  }

  $wavPath = Join-Path ([IO.Path]::GetTempPath()) ("jarvis-command-" + [guid]::NewGuid().ToString("N") + ".wav")
  $stream = $null
  try {
    $stream = [IO.File]::Create($wavPath)
    $RecognitionResult.Audio.WriteToWaveStream($stream)
    $stream.Flush()
    $stream.Dispose()
    $stream = $null

    $size = (Get-Item $wavPath).Length
    Write-JarvisLog "Captured command WAV: $size bytes"
    if ($size -lt 1000) {
      Write-JarvisLog "Captured WAV was too small to transcribe."
      return ""
    }

    $transcription = Invoke-RestMethod -Uri "$BaseUrl/api/transcribe" -Method Post -InFile $wavPath -ContentType "audio/wav" -TimeoutSec 75
    return [string]$transcription.text
  } catch {
    Write-JarvisLog "Cloud transcription failed: $($_.Exception.Message)"
    return ""
  } finally {
    if ($stream) {
      try { $stream.Dispose() } catch {}
    }
    Remove-Item $wavPath -Force -ErrorAction SilentlyContinue
  }
}

$installed = [System.Speech.Recognition.SpeechRecognitionEngine]::InstalledRecognizers()
if (-not $installed -or $installed.Count -eq 0) {
  throw "Windows Speech Recognition is not installed. Add the Speech language feature for English in Windows Settings, then run JARVIS again."
}

$recognizerInfo = $installed | Where-Object { $_.Culture.Name -eq "en-US" } | Select-Object -First 1
if (-not $recognizerInfo) { $recognizerInfo = $installed | Select-Object -First 1 }

$engine = [System.Speech.Recognition.SpeechRecognitionEngine]::new($recognizerInfo.Id)
$engine.InitialSilenceTimeout = [TimeSpan]::FromSeconds(7)
$engine.BabbleTimeout = [TimeSpan]::FromSeconds(4)
$engine.EndSilenceTimeout = [TimeSpan]::FromMilliseconds(650)
$engine.EndSilenceTimeoutAmbiguous = [TimeSpan]::FromMilliseconds(900)
$engine.SetInputToDefaultAudioDevice()

function Load-WakeGrammar {
  $engine.UnloadAllGrammars()
  $choices = [System.Speech.Recognition.Choices]::new()
  $choices.Add([string[]]@("hey jarvis", "jarvis", "wake up jarvis"))
  $builder = [System.Speech.Recognition.GrammarBuilder]::new()
  $builder.Culture = $recognizerInfo.Culture
  $builder.Append($choices)
  $grammar = [System.Speech.Recognition.Grammar]::new($builder)
  $grammar.Name = "JARVIS Wake"
  $engine.LoadGrammar($grammar)
}

function Listen-ForCommand {
  $engine.UnloadAllGrammars()
  $dictation = [System.Speech.Recognition.DictationGrammar]::new()
  $dictation.Name = "JARVIS Audio Capture"
  $engine.LoadGrammar($dictation)

  try {
    Write-JarvisLog "Listening for command audio..."
    $result = $engine.Recognize([TimeSpan]::FromSeconds(10))
    if ($null -eq $result) {
      Write-JarvisLog "No speech result was returned before timeout."
      return ""
    }

    # Windows' text is diagnostic only. V4.1 acted on this text and could turn
    # 'open calculator' into 'Auburn calculator'. V5 uses the actual captured
    # audio and sends it through the existing OpenAI transcription endpoint.
    Write-JarvisLog ("Windows rough guess: '{0}' confidence={1:N2}" -f $result.Text, $result.Confidence)
    $accurate = (Transcribe-RecognizedAudio $result).Trim()
    if ($accurate) {
      Write-JarvisLog "OpenAI transcript: $accurate"
      return $accurate
    }

    Write-JarvisLog "Accurate transcription was empty."
    return ""
  } finally {
    $engine.UnloadAllGrammars()
  }
}

Load-WakeGrammar
Write-JarvisLog "JARVIS V5 hybrid wake listener online using $($recognizerInfo.Culture.Name)."
Write-JarvisLog "Wake phrases are local. Command audio is transcribed by the existing JARVIS transcription API."
Write-JarvisLog "Say: Hey Jarvis -> wait for Yes? -> speak your command."

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
      Speak-Jarvis "Yes?"
      Start-Sleep -Milliseconds 220
      $command = Listen-ForCommand

      if ($command) {
        Write-JarvisLog "Command accepted: $command"
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
