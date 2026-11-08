"""Validate the editing brief and, when provided, the exported video."""
import argparse
import json
from pathlib import Path
import subprocess
import hashlib
import re
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent


def probe(path):
    return json.loads(subprocess.check_output([
        "ffprobe", "-v", "error", "-show_streams", "-show_format",
        "-of", "json", str(path)
    ]))


def validate_fullscreen():
    """Check actual ChatCut state against the requested viewing experience."""
    model = json.loads((ROOT / "timeline-v2.json").read_text())
    clips = [r["item"] for r in model["items"]
             if r["track"]["id"] == "0f20758455" and r["item"]["type"] == "video"]
    cursor = 0
    for clip in sorted(clips, key=lambda c: c["startFrame"]):
        assert clip["startFrame"] == cursor, "Main footage has a gap or overlap"
        cursor += clip["durationFrames"]
        w, h = clip["width"], clip["height"]
        edges = [clip["left"] + w * clip["cropLeft"],
                 clip["top"] + h * clip["cropTop"],
                 clip["left"] + w * (1 - clip["cropRight"]),
                 clip["top"] + h * (1 - clip["cropBottom"])]
        assert all(abs(a - b) < 1 for a, b in zip(edges, [0, 0, 1080, 1920])), edges
        assert abs(w / h - 1280 / 592) < .001, "Footage is stretched"
        start = clip["sourceIn"] / 1e6
        end = start + clip["durationFrames"] / 30 * clip.get("speed", {}).get("rate", 1)
        assert 0 <= start < end <= 80
        assert end <= 32.5 or start >= 44, "Other-brand product section used"
    assert cursor == 1950 and len(clips) == 27
    pips = [r["item"] for r in model["items"]
            if r["track"]["id"] == "9d10cebb7f" and r["item"]["type"] == "video"]
    masks = [r["item"] for r in model["items"] if r["item"]["type"] == "pixel-effect"]
    assert len(pips) == len(masks) == 3
    for pip in pips:
        mask = next(m for m in masks if m["target"]["itemId"].replace("-", "").startswith(pip["id"]))
        node = mask["mask"]["nodes"][0]
        assert node["kind"] == "ellipse" and node["enabled"] and not node["invert"]
        params = node["parameters"].copy()
        prefix = "mask." + node["id"] + "."
        params.update({k[len(prefix):]: v for k, v in mask["propertyOverrides"].items() if k.startswith(prefix)})
        # Native ellipse diameters are fractions of the shorter input side.
        dx = params["radius_x"] * min(pip["width"], pip["height"])
        dy = params["radius_y"] * min(pip["width"], pip["height"])
        assert abs(dx - 340) < 1 and abs(dy - 340) < 1
        cx = pip["left"] + params["center_x"] * pip["width"]
        cy = pip["top"] + params["center_y"] * pip["height"]
        assert abs(cx - 850) < 1 and abs(cy - 1400) < 1
        assert cy + dy / 2 < 1590, "Presenter overlaps subtitles"
        assert pip["sourceIn"] / 1e6 + pip["durationFrames"] / 30 < 210
    images = [r["item"] for r in model["items"] if r["item"]["type"] == "image"]
    assert len(images) == 2, "Old text-board layers remain"
    for item in images:
        with Image.open(ROOT / model["overlays"][item["assetId"]]) as im:
            alpha = np.asarray(im.convert("RGBA"))[:, :, 3]
            assert (alpha < 128).mean() > .90, "Opaque text board obscures footage"
    for card in model["captionCards"]:
        box = card["layout"]
        assert box["top"] >= 1590 and box["top"] + box["height"] <= 1800
        assert 0 <= box["left"] and box["left"] + box["width"] <= 1080
    assert len(model["captionCards"]) == 25
    assert next(t for t in model["tracks"] if t["id"] == "757c8db3da")["muted"]
    return model


def validate_render(path):
    """Inspect the rendered pixels and audio, independently of the edit plan."""
    raw = subprocess.check_output([
        "ffmpeg", "-v", "error", "-i", str(path), "-vf", "fps=2,scale=108:192",
        "-f", "rawvideo", "-pix_fmt", "gray", "-"
    ])
    frames = np.frombuffer(raw, np.uint8).reshape(-1, 192, 108)
    assert len(frames) == 130
    assert not ((frames < 16).mean(axis=(1, 2)) > .99).any(), "Black frame found"
    for index, frame in enumerate(frames):
        for edge in [frame[:24], frame[-24:]]:
            assert edge.std() > 3, f"Large flat letterbox detected at {index / 2}s"
    audio = subprocess.run([
        "ffmpeg", "-hide_banner", "-i", str(path), "-vn", "-af", "volumedetect",
        "-f", "null", "-"
    ], check=True, capture_output=True, text=True).stderr
    peak = float(re.search(r"max_volume: ([-.\d]+) dB", audio).group(1))
    mean = float(re.search(r"mean_volume: ([-.\d]+) dB", audio).group(1))
    assert -20 < peak <= 0 and -40 < mean < -5, "Unexpected audio level"
    return {"sampled_frames": len(frames), "black_frames": 0,
            "flat_top_bottom_bars": 0, "audio_peak_db": peak, "audio_mean_db": mean}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--video", type=Path)
    args = parser.parse_args()
    brief = json.loads((ROOT / "brief.json").read_text())
    assert len(brief["sources"]) == 2
    for source in brief["sources"]:
        info = probe(source["path"])
        duration = float(info["format"]["duration"])
        assert abs(duration - source["duration"]) < 0.1
        assert 0 < source["usable_end"] < duration
    script = (ROOT / "口播文案-v2.md").read_text().split("## 修订说明")[0]
    for phrase in ["两次投料", "九次蒸煮", "八次发酵", "七次取酒", "基酒生产周期", "贮存与勾调", "茅曲坊"]:
        assert phrase in script, phrase
    assert "九蒸九煮" not in script
    model = validate_fullscreen()
    titles_path = ROOT / "titles.json"
    if titles_path.exists():
        titles = json.loads(titles_path.read_text())
        cursor = 0
        for title in titles:
            assert title["startFrame"] == cursor, "Title gap or overlap"
            assert title["durationFrames"] > 0
            cursor += title["durationFrames"]
            with Image.open(title["path"]) as image:
                assert image.size == (brief["width"], brief["height"])
                assert image.mode == "RGBA"
        assert cursor == 1950, "Title coverage must end at 65 seconds"
    if args.video:
        info = probe(args.video)
        video = next(s for s in info["streams"] if s["codec_type"] == "video")
        assert (video["width"], video["height"]) == (brief["width"], brief["height"])
        n, d = map(float, video["avg_frame_rate"].split("/"))
        assert abs(n / d - brief["fps"]) < 0.1
        assert abs(float(info["format"]["duration"]) - 65) < .1
        assert any(s["codec_type"] == "audio" for s in info["streams"])
        subprocess.run(["ffmpeg", "-v", "error", "-xerror", "-i", str(args.video), "-f", "null", "-"], check=True)
        rendered = validate_render(args.video)
        report = {"status": "pass", "file": args.video.name,
                  "sha256": hashlib.sha256(args.video.read_bytes()).hexdigest(),
                  "bytes": args.video.stat().st_size, "width": video["width"],
                  "height": video["height"], "fps": n / d,
                  "duration_seconds": float(info["format"]["duration"]),
                  "full_decode": "pass", "main_shots": 27, "circular_presenter_segments": 3,
                  "captions": len(model["captionCards"]), **rendered}
        (ROOT / "validation-report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2))
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        print("PASS: source media and script; exported video has NOT been checked")


if __name__ == "__main__":
    main()
