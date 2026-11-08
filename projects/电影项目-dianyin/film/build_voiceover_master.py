import json
import wave
from pathlib import Path

import numpy as np


root = Path(__file__).parent
segments = json.loads((root / "voiceover_segments.json").read_text())
sample_rate = 22050
duration_seconds = 180
master = np.zeros(sample_rate * duration_seconds, dtype=np.float32)

for segment in segments:
    with wave.open(str(root / "audio" / f"{segment['id']}.wav"), "rb") as audio:
        assert audio.getnchannels() == 1
        assert audio.getframerate() == sample_rate
        assert audio.getsampwidth() == 2
        samples = np.frombuffer(audio.readframes(audio.getnframes()), dtype="<i2").astype(np.float32) / 32768
    fade_samples = min(round(0.03 * sample_rate), len(samples) // 2)
    samples[:fade_samples] *= np.linspace(0, 1, fade_samples, dtype=np.float32)
    samples[-fade_samples:] *= np.linspace(1, 0, fade_samples, dtype=np.float32)
    start = round(segment["start"] * sample_rate)
    end = start + len(samples)
    if end > len(master):
        raise ValueError(f"{segment['id']} extends past the film duration")
    master[start:end] += samples

peak = float(np.max(np.abs(master)))
if peak > 0.72:
    master *= 0.72 / peak

destination = root / "audio" / "voiceover_master.wav"
with wave.open(str(destination), "wb") as audio:
    audio.setnchannels(1)
    audio.setsampwidth(2)
    audio.setframerate(sample_rate)
    audio.writeframes((np.clip(master, -1, 1) * 32767).astype("<i2").tobytes())
print(destination)
