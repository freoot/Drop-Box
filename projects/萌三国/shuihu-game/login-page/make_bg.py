#!/usr/bin/env python3
"""Paint the login background: cold ink-wash mountains with real tonal range.

v1's failure was measurable: 96% of pixels sat in the 0-32 luminance band and
the middle of the page was empty. This painter targets a histogram where the
midtone band (32-95) carries ~40% of the image.
"""
from PIL import Image, ImageDraw, ImageFilter
import math, random

W, H = 1600, 2400
random.seed(42)

img = Image.new("RGB", (W, H))
px = img.load()

# --- sky: vertical gradient with a lifted midtone band (cloud glow) ---
# stops chosen so most rows land in luminance 30-90, not 0-32
stops = [
    (0.00, (10, 16, 30)),    # deep top
    (0.18, (28, 42, 66)),    # upper sky
    (0.34, (52, 70, 98)),    # cloud-glow band (brightest)
    (0.52, (40, 55, 80)),    # falling
    (0.72, (24, 34, 54)),    # low sky
    (1.00, (12, 18, 32)),    # horizon dark
]
def lerp(a, b, t): return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))
for y in range(H):
    t = y / (H - 1)
    for i in range(len(stops) - 1):
        if stops[i][0] <= t <= stops[i + 1][0]:
            lt = (t - stops[i][0]) / (stops[i + 1][0] - stops[i][0])
            c = lerp(stops[i][1], stops[i + 1][1], lt)
            break
    for x in range(W):
        px[x, y] = c

draw = ImageDraw.Draw(img, "RGBA")

# --- soft cloud bands (large translucent ellipses, brightest near 1/3 height) ---
clouds = Image.new("RGBA", (W, H), (0, 0, 0, 0))
cd = ImageDraw.Draw(clouds)
for _ in range(46):
    cy = random.gauss(0.34, 0.16)
    cy = min(0.62, max(0.06, cy))
    cx = random.uniform(-0.1, 1.1)
    rw = random.uniform(0.18, 0.5) * W
    rh = rw * random.uniform(0.10, 0.2)
    a = int(random.uniform(8, 22) * (1 - abs(cy - 0.34) * 2.2))
    a = max(4, min(20, a))
    cd.ellipse([cx * W - rw, cy * H - rh, cx * W + rw, cy * H + rh],
               fill=(150, 170, 200, a))
clouds = clouds.filter(ImageFilter.GaussianBlur(60))
img = Image.alpha_composite(img.convert("RGBA"), clouds).convert("RGB")
draw = ImageDraw.Draw(img, "RGBA")

# --- mountain ridges: 4 layers, back to front, midtones in the 40-90 range ---
ridges = [
    # (base_y_frac, amp_frac, color, alpha)
    (0.46, 0.050, (74, 92, 118), 150),   # farthest - lightest
    (0.56, 0.062, (52, 66, 90), 185),
    (0.66, 0.055, (33, 43, 64), 220),
    (0.80, 0.045, (16, 22, 38), 245),    # nearest - darkest
]
for base, amp, col, alpha in ridges:
    pts = [(0, H), (0, int(base * H))]
    phase = random.uniform(0, math.tau)
    f1, f2, f3 = random.uniform(1.5, 2.5), random.uniform(4, 6), random.uniform(9, 14)
    steps = 220
    for i in range(1, steps + 1):
        x = W * i / steps
        t = i / steps
        y = base + amp * (
            0.55 * math.sin(t * math.pi * f1 + phase)
            + 0.30 * math.sin(t * math.pi * f2 + phase * 1.7)
            + 0.15 * math.sin(t * math.pi * f3 + phase * 2.3)
        )
        # slight peak sharpening
        y -= amp * 0.25 * abs(math.sin(t * math.pi * f2 + phase))
        pts.append((x, int(y * H)))
    pts.append((W, H))
    overlay = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    od = ImageDraw.Draw(overlay)
    od.polygon(pts, fill=col + (alpha,))
    overlay = overlay.filter(ImageFilter.GaussianBlur(2))
    img = Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")
    draw = ImageDraw.Draw(img, "RGBA")

# --- water below horizon: subtle horizontal streaks reflecting sky ---
for _ in range(260):
    wy = random.uniform(0.82, 1.0)
    wx = random.uniform(0, W)
    wl = random.uniform(0.03, 0.16) * W
    a = int(random.uniform(6, 18))
    draw.line([wx, wy * H, wx + wl, wy * H], fill=(110, 130, 158, a), width=1)

# --- camp fires: tiny warm dots near the waterline, keep sparse (~1.5% gold) ---
for _ in range(26):
    fx = random.uniform(0.04, 0.96)
    fy = random.uniform(0.70, 0.80)
    r = random.uniform(1.2, 3.0)
    draw.ellipse([fx * W - r, fy * H - r, fx * W + r, fy * H + r],
                 fill=(224, 180, 92, random.randint(90, 160)))

# --- vignette: gentle, keep midtones alive ---
vig = Image.new("L", (W, H), 0)
vd = ImageDraw.Draw(vig)
vd.ellipse([-W * 0.25, -H * 0.15, W * 1.25, H * 1.15], fill=255)
vig = vig.filter(ImageFilter.GaussianBlur(220))
black = Image.new("RGB", (W, H), (4, 6, 12))
img = Image.composite(img, black, vig)

img.save("/Users/user/Documents/Codex/youxi/meng/shuihu-game/login-page/assets/bg.jpg", quality=88)

# --- self-check: luminance histogram bands ---
g = img.convert("L")
hist = g.histogram()
total = W * H
b0 = sum(hist[0:32]) / total
b1 = sum(hist[32:64]) / total
b2 = sum(hist[64:96]) / total
b3 = sum(hist[96:]) / total
print(f"bands  0-31:{b0:.1%}  32-63:{b1:.1%}  64-95:{b2:.1%}  96+:{b3:.1%}")
print(f"midtone(32-95): {b1+b2:.1%}")
print(f"size: {img.size}, saved")
