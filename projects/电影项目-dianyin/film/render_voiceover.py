import json
import subprocess
from pathlib import Path

root = Path(__file__).parent
segments = json.loads((root / "voiceover_segments.json").read_text())
out = root / "audio"
out.mkdir(exist_ok=True)

for segment in segments:
    path = out / f"{segment['id']}.aiff"
    subprocess.run(
        ["/usr/bin/say", "-v", "Tingting", "-r", "145", "-o", str(path), segment["text"]],
        check=True,
    )
    print(path)
