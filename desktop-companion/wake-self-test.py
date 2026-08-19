import sys

import numpy as np
import openwakeword
import pyaudiowpatch as pyaudio
from openwakeword.model import Model
from openwakeword.utils import download_models

RATE = 16000
CHANNELS = 1
CHUNK = 1280
FORMAT = pyaudio.paInt16


def find_working_input(audio):
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

    last_error = None
    for index in candidates:
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
            raw = stream.read(CHUNK, exception_on_overflow=False)
            stream.stop_stream()
            stream.close()
            if len(raw) >= CHUNK * 2:
                return index, str(info.get("name", f"device-{index}"))
        except Exception as exc:
            last_error = exc

    raise RuntimeError(f"No microphone could be opened at 16 kHz mono. Last error: {last_error}")


def main():
    print("Checking Hey Jarvis model...")
    try:
        download_models(["hey_jarvis"])
    except Exception:
        download_models()

    model_paths = openwakeword.get_pretrained_model_paths(inference_framework="onnx")
    jarvis_path = next((p for p in model_paths if "hey_jarvis" in str(p).lower()), None)
    if not jarvis_path:
        raise RuntimeError("The Hey Jarvis wake model was not found after download.")

    model = Model(wakeword_models=[jarvis_path], inference_framework="onnx")
    # Force one inference pass so ONNX/model-load failures happen during setup.
    model.predict(np.zeros(CHUNK, dtype=np.int16))

    print("Checking Windows microphone...")
    audio = pyaudio.PyAudio()
    try:
        index, name = find_working_input(audio)
    finally:
        audio.terminate()

    print(f"WAKE_OK microphone={name} index={index}")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"WAKE_FAILED {exc}", file=sys.stderr)
        sys.exit(1)
