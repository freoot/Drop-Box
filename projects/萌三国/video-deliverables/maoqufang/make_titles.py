"""Rebuild the locally authored, transparent title plates used by ChatCut."""
from pathlib import Path
import json
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "title-assets"
OUT.mkdir(exist_ok=True)
FONT = "/System/Library/Fonts/Hiragino Sans GB.ttc"
CREAM = "#F7EEDC"
GOLD = "#DBB577"
MUTED = "#AD9379"

SCENES = [
    (0, 3.7, ["为什么光酿造", "就要一整年？"], "时间，是酱香的第一道功夫"),
    (3.7, 12.05, ["贵在时间", "更贵在功夫"], "一铲粮食，也不能敷衍"),
    (12.05, 13.86, ["传统大曲酱香", "工艺里的时间"], "两次投料 · 九次蒸煮 · 八次发酵 · 七次取酒"),
    (13.86, 15.22, ["2 次投料"], "传统大曲酱香工艺"),
    (15.22, 16.58, ["9 次蒸煮"], "传统大曲酱香工艺"),
    (16.58, 17.86, ["8 次发酵"], "传统大曲酱香工艺"),
    (17.86, 19.3, ["7 次取酒"], "传统大曲酱香工艺"),
    (19.3, 28.84, ["一年", "只是基酒的起点"], "基酒生产周期 ≠ 成品上市时间"),
    (28.84, 31.43, ["急不得", "也省不得"], "尊重每一道工序"),
    (31.43, 34.22, ["茅", "敬重风土"], "茅曲坊 · 时间酿出来的酱香"),
    (34.22, 37.6, ["曲", "以曲定香"], "茅曲坊 · 时间酿出来的酱香"),
    (37.6, 44.72, ["坊", "守住匠心"], "设备可以更新，敬畏传统的心不能丢"),
    (44.72, 52.51, ["把时间", "酿进味道里"], "从工艺开始，读懂酱香"),
    (52.51, 61.5, ["下一条", "拆解七次取酒"], "关注茅曲坊 · 继续看懂酱香"),
    (61.5, 65, ["茅曲坊"], "喝好酒 · 少喝酒 · 喝老酒"),
]


def font(size):
    return ImageFont.truetype(FONT, size)


def center(draw, text, y, size, color):
    face = font(size)
    while draw.textbbox((0, 0), text, font=face)[2] > 936:
        size -= 1
        face = font(size)
    draw.text((540, y), text, font=face, fill=color, anchor="mt")


def main():
    entries = []
    for idx, (start, end, lines, note) in enumerate(SCENES):
        im = Image.new("RGBA", (1080, 1920), (0, 0, 0, 0))
        d = ImageDraw.Draw(im)
        final = idx == len(SCENES) - 1
        if final:
            d.rectangle((0, 0, 1080, 1920), fill="#24140E")
            d.line((120, 580, 960, 580), fill=GOLD, width=2)
            center(d, "时间酿出来的酱香", 660, 44, GOLD)
            center(d, "茅曲坊", 800, 150, CREAM)
            center(d, note, 1060, 42, GOLD)
            d.rounded_rectangle((230, 1240, 850, 1340), radius=12, fill="#81382D")
            center(d, "关注 · 下一条讲七次取酒", 1264, 34, CREAM)
        else:
            d.text((72, 96), "茅曲坊", font=font(42), fill=CREAM)
            d.text((1008, 104), "酱香工艺 · 01", font=font(26), fill=MUTED, anchor="rt")
            d.line((72, 168, 1008, 168), fill="#6E4C33", width=2)
            if len(lines) == 1:
                center(d, lines[0], 244, 120, GOLD)
            else:
                center(d, lines[0], 220, 76, CREAM)
                center(d, lines[1], 326, 86, GOLD)
            d.line((72, 1290, 1008, 1290), fill="#6E4C33", width=2)
            center(d, note, 1540, 32, GOLD)
        center(d, "喝好酒  ·  少喝酒  ·  喝老酒", 1760, 27, MUTED)
        path = OUT / f"title-{idx:02d}.png"
        im.save(path)
        entries.append({"path": str(path), "startFrame": round(start * 30), "durationFrames": round(end * 30) - round(start * 30), "text": lines, "note": note})
    (ROOT / "titles.json").write_text(json.dumps(entries, ensure_ascii=False, indent=2))
    print(f"Created {len(entries)} title plates")


if __name__ == "__main__":
    main()
