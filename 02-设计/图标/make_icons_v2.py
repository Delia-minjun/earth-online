# -*- coding: utf-8 -*-
"""「地球 Online」高级版图标：深色底、渐变、光晕、星尘。

思路：numpy 做渐变与噪点，PIL 在 4 倍分辨率下画形状再缩回，
      避免锯齿；发光用高斯模糊叠加。
"""
import os
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = os.path.dirname(os.path.abspath(__file__))
S = 512
SS = 4  # 超采样倍数
R = 112


# ---------------- 基础工具 ----------------
def radial_base(c_in, c_out, center=(0.5, 0.38), power=1.4):
    """从中心到边缘的径向渐变"""
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    nx = (xx / (S - 1) - center[0]) * 2
    ny = (yy / (S - 1) - center[1]) * 2
    d = np.sqrt(nx ** 2 + ny ** 2) / math.sqrt(2)
    t = np.clip(d ** power, 0, 1)[..., None]
    a = np.array(c_in, dtype=np.float32)
    b = np.array(c_out, dtype=np.float32)
    return a * (1 - t) + b * t


def add_grain(arr, amount=3.0):
    noise = np.random.normal(0, amount, (S, S, 1)).astype(np.float32)
    return np.clip(arr + noise, 0, 255)


def vignette(arr, strength=0.35):
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    nx = xx / (S - 1) * 2 - 1
    ny = yy / (S - 1) * 2 - 1
    d = np.sqrt(nx ** 2 + ny ** 2) / math.sqrt(2)
    k = 1 - strength * (d ** 2)
    return np.clip(arr * k[..., None], 0, 255)


def to_img(arr):
    return Image.fromarray(arr.astype(np.uint8), "RGB").convert("RGBA")


def layer():
    """4 倍分辨率的透明图层"""
    img = Image.new("L", (S * SS, S * SS), 0)
    return img, ImageDraw.Draw(img)


def compose(base, mask, color, alpha=1.0, blur=0):
    """把 4 倍遮罩缩小后按颜色叠加到 base 上"""
    if blur:
        mask = mask.filter(ImageFilter.GaussianBlur(blur * SS))
    small = mask.resize((S, S), Image.LANCZOS)
    m = np.asarray(small, dtype=np.float32) / 255.0 * alpha
    c = np.array(color, dtype=np.float32)
    b = np.asarray(base.convert("RGB"), dtype=np.float32)
    out = b * (1 - m[..., None]) + c * m[..., None]
    return Image.fromarray(np.clip(out, 0, 255).astype(np.uint8), "RGB").convert("RGBA")


def rounded(img):
    mask = Image.new("L", (S, S), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, S, S], radius=R, fill=255)
    out = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out


def save(img, name):
    rounded(img).convert("RGB").save(os.path.join(OUT, name), quality=96)
    print("saved", name)


def scatter_stars(draw, count=70, seed=7):
    rng = np.random.default_rng(seed)
    for _ in range(count):
        x = rng.uniform(0, S * SS)
        y = rng.uniform(0, S * SS)
        r = rng.uniform(1.5, 3.6) * SS * rng.uniform(0.5, 1.0)
        a = int(rng.uniform(70, 210))
        draw.ellipse([x - r, y - r, x + r, y + r], fill=a)


# ---------------- 01 深渊星球 ----------------
def icon_deep_orb():
    base = to_img(vignette(add_grain(radial_base((52, 62, 56), (20, 24, 23))), 2.5))
    cx = cy = S * SS / 2
    r = 150 * SS

    # 星球暗面
    m, d = layer()
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)
    img = compose(base, m, (46, 58, 50), alpha=0.95)

    # 边缘光（右上一道细亮边）
    m, d = layer()
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=255, width=9 * SS)
    img = compose(img, m, (168, 190, 168), alpha=0.5, blur=3)

    # 经纬线
    m, d = layer()
    for k in (0.35, 0.68):
        d.ellipse([cx - r * k, cy - r, cx + r * k, cy + r], outline=255, width=3 * SS)
    for dy in (-0.55, -0.18, 0.18, 0.55):
        half = r * math.sqrt(max(1 - dy * dy, 0))
        d.line([cx - half, cy + dy * r, cx + half, cy + dy * r], fill=255, width=3 * SS)
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=255, width=3 * SS)
    img = compose(img, m, (150, 172, 150), alpha=0.55)

    # 高光
    m, d = layer()
    d.ellipse([cx - r * 0.62, cy - r * 0.78, cx - r * 0.05, cy - r * 0.28], fill=255)
    img = compose(img, m, (210, 226, 208), alpha=0.20, blur=26)

    # 星尘
    m, d = layer()
    scatter_stars(d)
    img = compose(img, m, (226, 232, 222), alpha=0.85)

    save(img, "11-深渊星球.png")


# ---------------- 02 轨道光点 ----------------
def icon_orbit():
    base = to_img(vignette(add_grain(radial_base((58, 70, 62), (17, 20, 19), center=(0.5, 0.5))), 2.5))
    cx = cy = S * SS / 2
    a, b = 186 * SS, 56 * SS
    ang = math.radians(-15)

    def on_ellipse(t):
        x = a * math.cos(t)
        y = b * math.sin(t)
        return (cx + x * math.cos(ang) - y * math.sin(ang),
                cy + x * math.sin(ang) + y * math.cos(ang))

    # 轨道（暗）
    ring = Image.new("L", (S * SS, S * SS), 0)
    rd = ImageDraw.Draw(ring)
    rd.ellipse([cx - a, cy - b, cx + a, cy + b], outline=255, width=6 * SS)
    ring = ring.rotate(-15, resample=Image.BICUBIC, center=(cx, cy))
    img = compose(base, ring, (96, 92, 80), alpha=0.9)

    # 轨道受光的一段（左前侧更亮）
    lit = Image.new("L", (S * SS, S * SS), 0)
    ld = ImageDraw.Draw(lit)
    ld.arc([cx - a, cy - b, cx + a, cy + b], start=150, end=330, fill=255, width=6 * SS)
    lit = lit.rotate(-15, resample=Image.BICUBIC, center=(cx, cy))
    img = compose(img, lit, (206, 196, 168), alpha=0.85, blur=2)

    # 中心星球
    pr = 88 * SS
    m, d = layer()
    d.ellipse([cx - pr, cy - pr, cx + pr, cy + pr], fill=255)
    img = compose(img, m, (40, 52, 44), alpha=1.0)

    m, d = layer()
    d.ellipse([cx - pr, cy - pr, cx + pr, cy + pr], outline=255, width=5 * SS)
    img = compose(img, m, (150, 176, 148), alpha=0.45, blur=3)

    m, d = layer()
    d.ellipse([cx - pr * 0.9, cy - pr * 0.95, cx + pr * 0.6, cy + pr * 0.1], fill=255)
    img = compose(img, m, (150, 176, 148), alpha=0.22, blur=22)

    # 轨道前半段（压在星球下缘，制造环绕感）
    front = Image.new("L", (S * SS, S * SS), 0)
    fd = ImageDraw.Draw(front)
    fd.arc([cx - a, cy - b, cx + a, cy + b], start=10, end=170, fill=255, width=6 * SS)
    front = front.rotate(-15, resample=Image.BICUBIC, center=(cx, cy))
    img = compose(img, front, (214, 204, 176), alpha=0.75, blur=1)

    # 轨道上的光点：取环最左侧的实际像素，保证落在轨道上
    ring_np = np.asarray(ring, dtype=np.uint8)
    cols = np.where((ring_np > 128).any(axis=0))[0]
    if len(cols):
        left = int(cols[0] + 7 * SS)
        rows = np.where(ring_np[:, left] > 128)[0]
        px = float(left)
        py = float(rows.mean()) if len(rows) else float(cy)
    else:
        px, py = on_ellipse(math.radians(196))
    glow, d = layer()
    d.ellipse([px - 34 * SS, py - 34 * SS, px + 34 * SS, py + 34 * SS], fill=255)
    img = compose(img, glow, (196, 222, 180), alpha=0.30, blur=22)

    dot, d = layer()
    d.ellipse([px - 9 * SS, py - 9 * SS, px + 9 * SS, py + 9 * SS], fill=255)
    img = compose(img, dot, (242, 248, 232), alpha=1.0)

    m, d = layer()
    scatter_stars(d, 55, seed=11)
    img = compose(img, m, (214, 224, 212), alpha=0.5)

    save(img, "12-轨道光点.png")


# ---------------- 03 玻璃球 ----------------
def icon_glass():
    base = to_img(vignette(add_grain(radial_base((44, 54, 48), (14, 17, 16), center=(0.5, 0.45))), 2.0))
    cx = cy = S * SS / 2
    r = 150 * SS

    # 球体：上亮下暗的径向渐变
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    nx = xx / (S - 1) - 0.42
    ny = yy / (S - 1) - 0.36
    t = np.clip(np.sqrt(nx ** 2 + ny ** 2) / 0.72, 0, 1)[..., None]
    sphere = (np.array([132, 152, 128], np.float32) * (1 - t)
              + np.array([26, 34, 28], np.float32) * t)
    sphere = np.clip(sphere, 0, 255)
    sph_img = Image.fromarray(sphere.astype(np.uint8), "RGB").convert("RGBA")

    mask, d = layer()
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)
    small = mask.resize((S, S), Image.LANCZOS)
    img = base.copy()
    img.paste(sph_img, (0, 0), small)

    # 轮廓光
    m, d = layer()
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=255, width=5 * SS)
    img = compose(img, m, (198, 216, 192), alpha=0.55, blur=2)

    # 底部反射光
    m, d = layer()
    d.arc([cx - r * 0.94, cy - r * 0.94, cx + r * 0.94, cy + r * 0.94], start=40, end=140,
          fill=255, width=7 * SS)
    img = compose(img, m, (150, 176, 146), alpha=0.5, blur=8)

    # 锐利高光
    m, d = layer()
    d.ellipse([cx - r * 0.50, cy - r * 0.66, cx - r * 0.28, cy - r * 0.46], fill=255)
    img = compose(img, m, (250, 252, 246), alpha=0.9, blur=3)

    # 大范围柔光
    m, d = layer()
    d.ellipse([cx - r * 0.80, cy - r * 0.92, cx + r * 0.20, cy - r * 0.10], fill=255)
    img = compose(img, m, (210, 226, 204), alpha=0.16, blur=40)

    save(img, "13-玻璃球.png")


# ---------------- 04 环中之球 ----------------
def icon_globe_ring():
    base = to_img(vignette(add_grain(radial_base((50, 62, 55), (16, 19, 18), center=(0.5, 0.44))), 2.5))
    cx = cy = S * SS / 2
    r = 128 * SS

    # 环（后半段）
    back = Image.new("L", (S * SS, S * SS), 0)
    bd = ImageDraw.Draw(back)
    bd.arc([cx - 186 * SS, cy - 52 * SS, cx + 186 * SS, cy + 52 * SS], start=180, end=360,
           fill=255, width=5 * SS)
    back = back.rotate(-14, resample=Image.BICUBIC, center=(cx, cy))
    img = compose(base, back, (156, 148, 120), alpha=0.55, blur=1)

    # 球体
    m, d = layer()
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=255)
    img = compose(img, m, (40, 52, 44), alpha=1.0)

    # 经纬线
    m, d = layer()
    d.ellipse([cx - r, cy - r, cx + r, cy + r], outline=255, width=3 * SS)
    for k in (0.38, 0.72):
        d.ellipse([cx - r * k, cy - r, cx + r * k, cy + r], outline=255, width=2 * SS)
    for dy in (-0.5, -0.16, 0.16, 0.5):
        half = r * math.sqrt(max(1 - dy * dy, 0))
        d.line([cx - half, cy + dy * r, cx + half, cy + dy * r], fill=255, width=2 * SS)
    img = compose(img, m, (150, 178, 148), alpha=0.5, blur=1)

    # 边缘光
    m, d = layer()
    d.arc([cx - r, cy - r, cx + r, cy + r], start=200, end=340, fill=255, width=7 * SS)
    img = compose(img, m, (190, 214, 184), alpha=0.5, blur=6)

    # 环（前半段，压住球体）
    front = Image.new("L", (S * SS, S * SS), 0)
    fd = ImageDraw.Draw(front)
    fd.arc([cx - 186 * SS, cy - 52 * SS, cx + 186 * SS, cy + 52 * SS], start=0, end=180,
           fill=255, width=5 * SS)
    front = front.rotate(-14, resample=Image.BICUBIC, center=(cx, cy))
    img = compose(img, front, (206, 196, 166), alpha=0.8, blur=1)

    m, d = layer()
    scatter_stars(d, 45, seed=5)
    img = compose(img, m, (214, 224, 212), alpha=0.4)

    save(img, "14-环中之球.png")


if __name__ == "__main__":
    np.random.seed(3)
    icon_deep_orb()
    icon_orbit()
    icon_glass()
    icon_globe_ring()
    print("done ->", OUT)
