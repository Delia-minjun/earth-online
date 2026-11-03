# -*- coding: utf-8 -*-
"""生成「地球 Online」的几款图标候选（512×512，圆角方形）。"""
import os
import math
from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = os.path.dirname(os.path.abspath(__file__))
S = 512
R = 112  # 圆角半径

CREAM = (244, 242, 238, 255)
INK = (51, 50, 47, 255)
GREEN = (143, 163, 142, 255)
GREEN_D = (118, 138, 117, 255)
SOFT = (231, 236, 230, 255)
BLUE = (155, 167, 176, 255)
SAND = (203, 187, 154, 255)
PINK = (201, 169, 166, 255)
FONT = r"C:\Windows\Fonts\msyhbd.ttc"


def canvas(bg):
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, S, S], radius=R, fill=bg)
    return img, d


def rounded(img):
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, S, S], radius=R, fill=255)
    out = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def save(img, name):
    img.convert("RGB").save(os.path.join(OUT, name), quality=95)
    print("saved", name)


# ---------- 01 地球仪 ----------
def icon_globe():
    img, d = canvas(SOFT)
    cx, cy, r = 256, 256, 148
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=GREEN, width=18)
    # 经线：两条竖椭圆
    for rx in (58, 110):
        d.ellipse([cx - rx, cy - r + 6, cx + rx, cy + r - 6], outline=GREEN, width=12)
    # 纬线
    for dy in (-70, 0, 70):
        half = math.sqrt(max(r * r - dy * dy, 0))
        d.line([cx - half, cy + dy, cx + half, cy + dy], fill=GREEN, width=12)
    save(rounded(img), "01-地球仪.png")


# ---------- 02 星球与环 ----------
def icon_planet():
    img, d = canvas(CREAM)
    # 环整体在星球之后
    ring = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    rd = ImageDraw.Draw(ring)
    rd.ellipse([64, 186, 448, 326], outline=PINK, width=22)
    ring = ring.rotate(-15, resample=Image.BICUBIC, center=(256, 256))
    img.alpha_composite(ring)
    # 星球
    d = ImageDraw.Draw(img)
    d.ellipse([142, 142, 370, 370], fill=GREEN)
    # 柔和高光
    d.ellipse([186, 182, 268, 238], fill=(200, 214, 198, 255))
    # 暗部
    d.arc([142, 142, 370, 370], start=20, end=150, fill=(128, 148, 127, 120), width=16)
    save(rounded(img), "02-星球环.png")


# ---------- 03 一周节律 ----------
def icon_rhythm():
    img, d = canvas(CREAM)
    cx, cy, r = 256, 256, 128
    for i in range(7):
        a = math.radians(-90 + i * (360 / 7))
        x = cx + r * math.cos(a)
        y = cy + r * math.sin(a)
        done = i < 4
        rad = 26 if done else 20
        d.ellipse([x - rad, y - rad, x + rad, y + rad], fill=GREEN if done else (223, 219, 211, 255))
    d.ellipse([cx - 26, cy - 26, cx + 26, cy + 26], fill=INK)
    save(rounded(img), "03-一周节律.png")


# ---------- 04 环形进度 ----------
def icon_ring():
    img, d = canvas(CREAM)
    box = [116, 116, 396, 396]
    d.arc(box, start=-90, end=200, fill=GREEN, width=44)
    d.arc(box, start=200, end=270, fill=(222, 218, 210, 255), width=44)
    d.ellipse([216, 216, 296, 296], fill=INK)
    save(rounded(img), "04-环形进度.png")


# ---------- 05 像素地球 ----------
def icon_pixel():
    img, d = canvas(CREAM)
    n = 13
    cell = 26
    pad = (S - n * cell) / 2
    cx = cy = (n - 1) / 2
    # 几块“大陆”的判定：用几组圆去覆盖
    lands = [((4.6, 3.6), 2.6), ((7.8, 5.4), 2.4), ((5.2, 9.2), 2.2), ((9.6, 9.0), 1.6)]
    for gy in range(n):
        for gx in range(n):
            dist = math.hypot(gx - cx, gy - cy)
            if dist > 5.9:
                continue
            land = any(math.hypot(gx - lx, gy - ly) <= lr for (lx, ly), lr in lands)
            if land and dist <= 5.2:
                fill = GREEN
            elif dist > 5.0:
                fill = (208, 218, 206, 255)
            else:
                fill = (236, 240, 235, 255)
            x = pad + gx * cell
            y = pad + gy * cell
            d.rectangle([x, y, x + cell - 4, y + cell - 4], fill=fill)
    save(rounded(img), "05-像素地球.png")


if __name__ == "__main__":
    icon_globe()
    icon_planet()
    icon_rhythm()
    icon_ring()
    icon_pixel()
    print("done ->", OUT)
