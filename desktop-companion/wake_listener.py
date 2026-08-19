import collections
import io
import logging
import os
import pathlib
import re
import subprocess
import tempfile
import time
import wave

import numpy as np
import openwakeword
import pyaudiowpatch as pyaudio
import requests
from openwakeword.model import Model
from openwakeword.utils import download_models

RATE = 16000
CHANNELS = 1
CHUNK = 1280
FORMAT = pyaudio.paInt16
WAKE_THRESHOLD = float(os.environ.get("JARVIS_WAKE_THRESHOLD", "0.50"))
MAX_COMMAND_SECONDS = float(os.environ.get("JARVIS_MAX_COMMAND_SECONDS", "12"))
SILENCE_SECONDS = float(os.environ.get("JARVIS_SILENCE_SECONDS", "1.25"))
RMS_THRESHOLD = float(os.environ.get("JARVIS_RMS_THRESHOLD", "430"))
BASE_URL = os.environ.get("JARVIS_BASE_URL", "https://legacyjewelrycrmphonereadyfixed.vercel.app").rstrip("/")
LOCAL_PORT = int(os.environ.get("JARVIS_LOCAL_PORT", "45451"))
LOCAL_URL = f"http://127.0.0.1:{LOCAL_PORT}/voice-command"
STATE_DIR = pathlib.Path(os.environ.get("JARVIS_STATE_DIR", pathlib.Path.home() / ".legacy-jarvis"))
STATE_DIR.mkdir(parents=True, exist_ok=True)
SECRET_FILE = STATE_DIR / "local-secret"
LOG_FILE = STATE_DIR / "wake-listener.log"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    handlers=[logging.FileHandler(LOG_FILE, encoding="utf-8"), logging.StreamHandler()],
)
log = logging.getLogger("jarvis-wake")


def local_secret():
    for _ in range(60):
        try:
            value = SECRET_FILE.read_text(encoding="utf-8").strip()
            if value:
                return value
        except FileNotFoundError:
            pass
        time.sleep(0.25)
    raise RuntimeError("Local JARVIS secret was not created by the resident service.")


def rms_int16(raw_bytes):
    samples = np.frombuffer(raw_bytes, dtype=np.int16).astype(np.float32)
    if samples.size == 0:
        return 0.0
    return float(np.sqrt(np.mean(samples * samples)))


def build_wav(frames):
    output = io.BytesIO()
    with wave.open(output, "wb") as wav_file:
        wav_file.setnchannels(CHANNELS)
        wav_file.setsampwidth(2)
        wav_file.setframerate(RATE)
        wav_file.writeframes(b"".join(frames))
    return output.getvalue()


def strip_wake_phrase(text):
    clean = str(text or "").strip()
    clean = re.sub(r"^\s*(?:hey\s+)?jarvis[\s,.:;!\-]*", "", clean, flags=re.IGNORECASE)
    return clean.strip()


def transcribe(wav_bytes):
    response = requests.post(
        f"{BASE_URL}/api/transcribe",
        data=wav_bytes,
        headers={"Content-Type": "audio/wav"},
        timeout=45,
    )
    try:
        data = response.json()
    except Exception:
        data = {}
    if not response.ok:
        raise RuntimeError(data.get("error") or f"Transcription failed ({response.status_code})")
    return strip_wake_phrase(data.get("text", ""))


def ask_resident(text):
    response = requests.post(
        LOCAL_URL,
        json={"text": text},
        headers={"X-Jarvis-Local-Secret": local_secret()},
        timeout=60,
    )
    try:
        data = response.json()
    except Exception:
        data = {}
    if not response.ok:
        raise RuntimeError(data.get("error") or f"Resident request failed ({response.status_code})")
    return str(data.get("reply") or "I'm here.")


def play_mp3(mp3_bytes):
    temp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".mp3") as temp_file:
            temp_file.write(mp3_bytes)
            temp_path = temp_file.name

        script = r'''
Add-Type -AssemblyName PresentationCore
$player = New-Object System.Windows.Media.MediaPlayer
$player.Open([Uri]$env:JARVIS_AUDIO_FILE)
$deadline = [DateTime]::UtcNow.AddSeconds(8)
while (-not $player.NaturalDuration.HasTimeSpan -and [DateTime]::UtcNow -lt $deadline) {
  Start-Sleep -Milliseconds 50
}
$player.Play()
if ($player.NaturalDuration.HasTimeSpan) {
  $ms = [Math]::Ceiling($player.NaturalDuration.TimeSpan.TotalMilliseconds) + 250
  Start-Sleep -Milliseconds $ms
} else {
  Start-Sleep -Seconds 10
}
$player.Close()
'''
        env = os.environ.copy()
        env["JARVIS_AUDIO_FILE"] = temp_path
        subprocess.run(
            ["powershell.exe", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script],
            env=env,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            timeout=45,
            check=False,
        )
    finally:
        if temp_path:
            try:
                os.unlink(temp_path)
            except OSError:
                pass


def speak(text):
    response = requests.post(
        f"{BASE_URL}/api/speech",
        json={"text": str(text)[:3900]},
        timeout=60,
    )
    if not response.ok:
        raise RuntimeError(f"Speech failed ({response.status_code})")
    play_mp3(response.content)


def activation_chime():
    try:
        import winsound
        winsound.Beep(880, 65)
        winsound.Beep(1175, 55)
    except Exception:
        pass


def load_wake_model():
    log.info("Preparing Hey Jarvis wake-word model...")
    try:
        download_models(["hey_jarvis"])
    except Exception:
        download_models()

    model_paths = openwakeword.get_pretrained_model_paths(inference_framework="onnx")
    jarvis_path = next((p for p in model_paths if "hey_jarvis" in str(p).lower()), None)
    if not jarvis_path:
        raise RuntimeError("The openWakeWord Hey Jarvis model could not be found.")
    model = Model(wakeword_models=[jarvis_path], inference_framework="onnx")
    model.predict(np.zeros(CHUNK, dtype=np.int16))
    return model


def microphone_candidates(audio):
    candidates = []
    try:
        default = audio.get_default_input_device_info()
        candidates.append(int(default["index"]))
    except Exception:
        pass

    for index in range(audio.get_device_count()):
        try:
            info = audio.get_device_info_by_index(index)
            if int(info.get("maxInputChannels", 0)) > 0 and index not in candidates:
                candidates.append(index)
        except Exception:
            pass
    return candidates


def open_input_stream(audio):
    last_error = None
    for index in microphone_candidates(audio):
        try:
            info = audio.get_device_info_by_index(index)
            stream = audio.open(
                format=FORMAT,
                channels=CHANNELS,
                rate=RATE,
                input=True,
                input_device_index=index,
                frames_per_buffer=CHUNK,
            )
            log.info("Microphone online: %s (device %s)", info.get("name", index), index)
            return stream
        except Exception as exc:
            last_error = exc
    raise RuntimeError(f"No microphone could be opened at 16 kHz mono. Last error: {last_error}")


def capture_command(stream, pre_roll=None):
    frames = list(pre_roll or [])
    started = time.monotonic()
    last_voice = started
    saw_voice = False

    while time.monotonic() - started < MAX_COMMAND_SECONDS:
        raw = stream.read(CHUNK, exception_on_overflow=False)
        frames.append(raw)
        level = rms_int16(raw)
        now = time.monotonic()
        if level >= RMS_THRESHOLD:
            last_voice = now
            if now - started > 0.18:
                saw_voice = True

        if now - started > 1.15 and saw_voice and now - last_voice >= SILENCE_SECONDS:
            break
        if now - started > 2.8 and not saw_voice:
            break

    return build_wav(frames)


def safely_pause_stream(stream):
    try:
        stream.stop_stream()
    except Exception:
        pass


def safely_resume_stream(stream):
    try:
        stream.start_stream()
    except Exception:
        pass


def voice_cycle(stream, pre_roll):
    activation_chime()
    wav_bytes = capture_command(stream, list(pre_roll)[-7:])
    text = transcribe(wav_bytes)
    log.info("Transcript after wake phrase: %r", text)

    if not text:
        safely_pause_stream(stream)
        speak("Yes?")
        safely_resume_stream(stream)
        follow_up = capture_command(stream, [])
        text = transcribe(follow_up)
        log.info("Follow-up transcript: %r", text)

    if text:
        reply = ask_resident(text)
        log.info("Reply: %s", reply)
        safely_pause_stream(stream)
        speak(reply)
        safely_resume_stream(stream)


def listen_forever(model):
    audio = pyaudio.PyAudio()
    try:
        while True:
            stream = None
            try:
                stream = open_input_stream(audio)
                pre_roll = collections.deque(maxlen=10)
                last_activation = 0.0
                log.info("JARVIS Resident is listening locally for 'Hey Jarvis'.")

                while True:
                    raw = stream.read(CHUNK, exception_on_overflow=False)
                    pre_roll.append(raw)
                    frame = np.frombuffer(raw, dtype=np.int16)
                    prediction = model.predict(frame)
                    score = max((float(v) for v in prediction.values()), default=0.0)
                    now = time.monotonic()

                    if score < WAKE_THRESHOLD or now - last_activation < 2.0:
                        continue

                    last_activation = now
                    log.info("Wake phrase detected (score %.3f).", score)
                    try:
                        voice_cycle(stream, pre_roll)
                    except Exception as exc:
                        log.exception("Voice cycle failed: %s", exc)
                        try:
                            safely_pause_stream(stream)
                            speak("I hit a voice error. Check the JARVIS resident log and try me again.")
                            safely_resume_stream(stream)
                        except Exception:
                            pass
                    finally:
                        pre_roll.clear()

            except KeyboardInterrupt:
                return
            except Exception as exc:
                log.exception("Microphone listener error: %s", exc)
                log.info("Retrying the microphone in 3 seconds instead of shutting JARVIS down.")
                time.sleep(3)
            finally:
                if stream is not None:
                    try:
                        stream.stop_stream()
                        stream.close()
                    except Exception:
                        pass
    finally:
        audio.terminate()


def run():
    model = load_wake_model()
    listen_forever(model)


if __name__ == "__main__":
    run()
