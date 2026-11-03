# -*- coding: utf-8 -*-
"""
生成「地球 Online」高保真原型图（莫兰迪色系 / 卡片化，不照搬表格）。
运行后在同目录导出三张 PNG：周视图、手机今日、奖赏页。
"""
import os
from PIL import Image, ImageDraw, ImageFont, ImageFilter

OUT = os.path.dirname(os.path.abspath(__file__))

# ---------------- 色板 ----------------
BG         = (244, 242, 238, 255)
SURFACE    = (255, 255, 255, 255)
SURFACE_2  = (250, 249, 246, 255)
TEXT       = (51, 50, 47, 255)
TEXT_2     = (110, 107, 102, 255)
TEXT_3     = (162, 158, 150, 255)
LINE       = (231, 227, 220, 255)
LINE_2     = (241, 238, 232, 255)
ACCENT     = (143, 163, 142, 255)
ACCENT_SOFT= (231, 236, 230, 255)
WARN       = (192, 139, 125, 255)
WARN_SOFT  = (246, 236, 232, 255)

CAT = {
    "学习提升": (155, 167, 176, 255),
    "生活琐事": (203, 187, 154, 255),
    "习惯养成": (168, 181, 162, 255),
    "休闲玩耍": (176, 166, 188, 255),
    "文娱锻炼": (201, 169, 166, 255),
}

def mix(c, a, base=255):
    """把颜色按比例混向白色，得到实心浅色（避免 alpha 叠色发灰）"""
    return (int(base - (base - c[0]) * a),
            int(base - (base - c[1]) * a),
            int(base - (base - c[2]) * a), 255)

FONT_DIR = r"C:\Windows\Fonts"
_fonts = {}

def font(size, bold=False):
    size = max(1, int(round(size)))
    key = (size, bold)
    if key not in _fonts:
        path = os.path.join(FONT_DIR, "msyhbd.ttc" if bold else "msyh.ttc")
        _fonts[key] = ImageFont.truetype(path, size)
    return _fonts[key]

def new_canvas(w, h, bg=BG):
    img = Image.new("RGBA", (w, h), bg)
    return img, ImageDraw.Draw(img)

def shadow(img, box, radius=16, offset=(0, 6), blur=16, alpha=18):
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    x0, y0, x1, y1 = box
    d.rounded_rectangle([x0 + offset[0], y0 + offset[1], x1 + offset[0], y1 + offset[1]],
                        radius=radius, fill=(88, 82, 72, alpha))
    layer = layer.filter(ImageFilter.GaussianBlur(blur))
    img.alpha_composite(layer)

def card(img, d, box, radius=16, fill=SURFACE, border=LINE, sh=True):
    if sh:
        shadow(img, box, radius)
    d.rounded_rectangle(box, radius=radius, fill=fill, outline=border, width=1)

def txt(d, *args, **kw):
    """支持 txt(d, x, y, s, ...) 与 txt(d, (x, y), s, ...) 两种写法"""
    a = list(args)
    if isinstance(a[0], (tuple, list)):
        xy = tuple(a.pop(0))
    else:
        xy = (a.pop(0), a.pop(0))
    s = a.pop(0)
    size = a.pop(0) if a else kw.get("size", 13)
    color = a.pop(0) if a else kw.get("color", TEXT)
    bold = a.pop(0) if a else kw.get("bold", False)
    anchor = a.pop(0) if a else kw.get("anchor", "la")
    d.text(xy, s, font=font(size, bold), fill=color, anchor=anchor)

def pill(d, box, text, size=11, fg=TEXT_2, bg=SURFACE_2, border=LINE, radius=None, bold=False):
    x0, y0, x1, y1 = box
    r = radius if radius is not None else (y1 - y0) // 2
    d.rounded_rectangle(box, radius=r, fill=bg, outline=border, width=1)
    txt(d, ((x0 + x1) // 2, (y0 + y1) // 2), text, size=size, color=fg, bold=bold, anchor="mm")

def dot(d, cx, cy, r, fill, outline=None, width=1):
    cx, cy, r = int(round(cx)), int(round(cy)), int(round(r))
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=fill, outline=outline,
              width=max(0, int(round(width))))

def progress(d, box, pct, color=ACCENT, track=(238, 236, 230, 255), radius=None):
    x0, y0, x1, y1 = box
    r = radius if radius is not None else max(2, (y1 - y0) // 2)
    d.rounded_rectangle(box, radius=r, fill=track)
    w = int((x1 - x0) * pct)
    if w > 0:
        d.rounded_rectangle([x0, y0, x0 + max(w, r * 2), y1], radius=r, fill=color)

# ---------------- 侧边栏 ----------------
NAV = ["今日", "本周", "习惯", "复盘", "学习", "奖赏", "设置"]

def sidebar(img, d, h, active="本周", w=208):
    d.rectangle([0, 0, w, h], fill=SURFACE_2)
    d.line([w, 0, w, h], fill=LINE, width=1)
    dot(d, 32, 40, 9, ACCENT)
    txt(d, 50, 40, "地球 Online", 15, TEXT, True, "lm")
    txt(d, 22, 78, "EARTH ONLINE", 9.5, TEXT_3, True, "la")
    y = 112
    for item in NAV:
        box = [16, y, w - 16, y + 40]
        if item == active:
            d.rounded_rectangle(box, radius=11, fill=ACCENT_SOFT)
            dot(d, 40, y + 20, 3.2, ACCENT)
            txt(d, 54, y + 20, item, 13, TEXT, True, "lm")
        else:
            dot(d, 40, y + 20, 3.2, (206, 202, 194, 255))
            txt(d, 54, y + 20, item, 13, TEXT_2, False, "lm")
        y += 44
    box = [16, h - 108, w - 16, h - 24]
    d.rounded_rectangle(box, radius=14, fill=SURFACE)
    txt(d, 30, h - 92, "连续打卡", 10.5, TEXT_3, False, "la")
    txt(d, 30, h - 72, "12 天", 20, TEXT, True, "la")
    txt(d, 30, h - 44, "本周 5 / 7", 10, TEXT_3, False, "la")
    return w

# ---------------- 图一：桌面周视图 ----------------
DAYS = [
    ("周一", "11/3", True, [
        ("08:00", "英语精读", "学习提升"),
        ("10:00", "人形机器人强化学习", "学习提升"),
        ("14:00", "实验课", "学习提升"),
        ("19:00", "健身 · 臀腿日", "文娱锻炼"),
    ]),
    ("周二", "11/4", False, [
        ("09:00", "小组头脑风暴", "学习提升"),
        ("13:30", "传播学复习", "学习提升"),
        ("20:00", "修改论文", "学习提升"),
    ]),
    ("周三", "11/5", False, [
        ("08:30", "广告学资料整理", "学习提升"),
        ("15:00", "取快递 · 洗衣", "生活琐事"),
        ("21:00", "看电影", "休闲玩耍"),
    ]),
    ("周四", "11/6", False, [
        ("10:00", "理工科英文", "学习提升"),
        ("14:00", "策划案初稿", "学习提升"),
        ("18:30", "晚饭 · 散步", "生活琐事"),
    ]),
    ("周五", "11/7", False, [
        ("09:00", "创业管理", "学习提升"),
        ("13:00", "排版定稿", "学习提升"),
        ("19:30", "聚餐", "休闲玩耍"),
    ]),
    ("周六", "11/8", False, [
        ("09:30", "模拟卷一套", "学习提升"),
        ("14:00", "打扫卫生", "生活琐事"),
        ("20:00", "口语练习", "习惯养成"),
    ]),
    ("周日", "11/9", False, [
        ("10:00", "周复盘", "习惯养成"),
        ("13:00", "休息 · 追剧", "休闲玩耍"),
        ("16:00", "整理笔记", "学习提升"),
    ]),
]

def render_week():
    W, H = 1600, 980
    img, d = new_canvas(W, H)
    sw = sidebar(img, d, H, "本周")

    # 顶栏
    txt(d, sw + 32, 40, "第 45 周", 22, TEXT, True, "lm")
    txt(d, sw + 128, 42, "11 月 3 日 — 11 月 9 日", 13, TEXT_3, False, "lm")
    for i, ch in enumerate(["‹", "›"]):
        bx = sw + 300 + i * 34
        d.rounded_rectangle([bx, 28, bx + 28, 56], radius=9, fill=SURFACE, outline=LINE, width=1)
        txt(d, (bx + 14, 42), ch, 15, TEXT_2, False, "mm")
    pill(d, [W - 236, 28, W - 150, 56], "中文 / EN", 10.5)
    d.rounded_rectangle([W - 132, 28, W - 32, 56], radius=9, fill=SURFACE, outline=LINE, width=1)
    txt(d, W - 108, 42, "搜索", 11.5, TEXT_3, False, "lm")

    # 7 天列
    gap = 12
    x = sw + 32
    colw = (W - 32 - x - gap * 6) // 7
    top, ch_ = 76, 474
    for name, date, today, blocks in DAYS:
        box = [x, top, x + colw, top + ch_]
        card(img, d, box, radius=14, border=ACCENT if today else LINE)
        txt(d, x + 14, top + 22, name, 12.5, TEXT_2, True, "lm")
        txt(d, x + 14, top + 42, date, 10.5, TEXT_3, False, "lm")
        if today:
            pill(d, [x + colw - 56, top + 14, x + colw - 12, top + 34], "今天", 9.5,
                 fg=(255, 255, 255, 255), bg=ACCENT, border=ACCENT, bold=True)
        y = top + 56
        for tm, title, cat in blocks:
            c = CAT[cat]
            bh = 64
            b = [x + 10, y, x + colw - 10, y + bh]
            d.rounded_rectangle(b, radius=10, fill=mix(c, 0.20))
            d.rounded_rectangle([b[0], b[1] + 10, b[0] + 3, b[3] - 10], radius=2, fill=c)
            txt(d, x + 22, y + 18, tm, 10.5, TEXT_2, False, "lm")
            if len(title) > 11:
                txt(d, x + 22, y + 36, title[:11], 11.5, TEXT, False, "lm")
                txt(d, x + 22, y + 51, title[11:], 11.5, TEXT, False, "lm")
            else:
                txt(d, x + 22, y + 40, title, 11.5, TEXT, False, "lm")
            y += bh + 10
        # 空位：加时间块的入口
        if y + 46 < top + ch_ - 10:
            gb = [x + 10, y, x + colw - 10, y + 42]
            d.rounded_rectangle(gb, radius=10, fill=LINE_2)
            txt(d, (x + colw // 2, y + 21), "＋ 添加", 10.5, TEXT_3, False, "mm")
        x += colw + gap

    # 底部三卡
    by = top + ch_ + 18
    bh = H - by - 22
    # 本周目标
    b1 = [sw + 32, by, sw + 32 + 480, by + bh]
    card(img, d, b1, radius=16)
    txt(d, b1[0] + 20, by + 26, "本周目标", 13, TEXT, True, "lm")
    txt(d, b1[2] - 20, by + 26, "2 / 6", 11, TEXT_3, False, "rm")
    goals = [("英语精读 5 篇", 3, 5, False), ("全套复习资料整理", 1, 1, True),
             ("修改论文", 1, 2, False), ("完成策划案初稿", 0, 1, False),
             ("每天背 20 个单词", 6, 7, False), ("周末跑一次 5km", 0, 1, False)]
    gy = by + 58
    for label, cur, tot, done in goals:
        dot(d, b1[0] + 28, gy + 8, 7, ACCENT if done else (255, 255, 255, 255),
            outline=ACCENT if done else LINE, width=2)
        if done:
            txt(d, b1[0] + 28, gy + 8, "✓", 8, (255, 255, 255, 255), True, "mm")
        txt(d, b1[0] + 46, gy + 8, label, 11.5, TEXT_3 if done else TEXT_2, False, "lm")
        txt(d, b1[2] - 20, gy + 8, f"{cur}/{tot}", 10, TEXT_3, False, "rm")
        gy += 36

    # 习惯打卡
    b2 = [b1[2] + 14, by, b1[2] + 14 + 390, by + bh]
    card(img, d, b2, radius=16)
    txt(d, b2[0] + 20, by + 26, "习惯打卡", 13, TEXT, True, "lm")
    txt(d, b2[2] - 20, by + 26, "第 45 周", 10, TEXT_3, False, "rm")
    wd = ["一", "二", "三", "四", "五", "六", "日"]
    for i, w_ in enumerate(wd):
        txt(d, b2[0] + 118 + i * 32, by + 54, w_, 9.5, TEXT_3, False, "mm")
    habits = [("早睡", [1, 1, 0, 1, 1, 0, 0]), ("喝水", [1, 1, 1, 1, 1, 1, 0]),
              ("护肤", [1, 0, 1, 1, 0, 1, 0]), ("早起", [1, 1, 1, 0, 1, 1, 1]),
              ("背单词", [0, 1, 1, 1, 0, 0, 0]), ("运动", [1, 0, 0, 1, 0, 1, 0]),
              ("读书", [0, 0, 1, 0, 1, 1, 1])]
    gy = by + 82
    for name, marks in habits:
        txt(d, b2[0] + 20, gy, name, 10.5, TEXT_2, False, "lm")
        for i, m in enumerate(marks):
            cx = b2[0] + 118 + i * 32
            dot(d, cx, gy, 8, ACCENT if m else (255, 255, 255, 255),
                outline=None if m else LINE, width=1.6)
        gy += 34

    # 奖赏
    b3 = [b2[2] + 14, by, W - 32, by + bh]
    card(img, d, b3, radius=16)
    txt(d, b3[0] + 20, by + 26, "奖赏", 13, TEXT, True, "lm")
    txt(d, b3[0] + 20, by + 80, "1,284", 26, TEXT, True, "ls")
    txt(d, b3[0] + 100, by + 80, "币", 11, TEXT_3, False, "ls")
    pill(d, [b3[0] + 20, by + 92, b3[0] + 110, by + 116], "本周 +86", 9.5,
         fg=ACCENT, bg=ACCENT_SOFT, border=ACCENT_SOFT, bold=True)
    pill(d, [b3[0] + 118, by + 92, b3[0] + 208, by + 116], "本周 −40", 9.5,
         fg=WARN, bg=WARN_SOFT, border=WARN_SOFT, bold=True)
    pill(d, [b3[2] - 88, by + 20, b3[2] - 18, by + 44], "去兑换", 10, fg=TEXT,
         bg=ACCENT_SOFT, border=ACCENT_SOFT, bold=True)
    gy = by + 146
    for name, pct in [("健康", 0.72), ("学业", 0.88), ("关系", 0.55), ("成长", 0.64)]:
        txt(d, b3[0] + 20, gy, name, 10, TEXT_3, False, "lm")
        progress(d, [b3[0] + 56, gy - 3, b3[2] - 62, gy + 3], pct)
        txt(d, b3[2] - 20, gy, f"{int(pct*100)}%", 9.5, TEXT_3, False, "rm")
        gy += 26

    img.convert("RGB").save(os.path.join(OUT, "01-周视图-桌面.png"))
    print("saved 01")

# ---------------- 图二：手机 今日 ----------------
def render_today():
    W, H = 390, 844
    img, d = new_canvas(W, H)

    txt(d, 24, 34, "11 月 3 日", 21, TEXT, True, "la")
    txt(d, 24, 62, "周一 · 第 45 周", 11.5, TEXT_3, False, "la")
    dot(d, W - 40, 46, 15, ACCENT_SOFT)
    txt(d, W - 40, 46, "我", 10, ACCENT, True, "mm")

    # 问候卡
    cy = 96
    card(img, d, [20, cy, W - 20, cy + 88], radius=16)
    txt(d, 38, cy + 24, "早上好，还剩 3 件重点", 13.5, TEXT, True, "la")
    txt(d, 38, cy + 48, "连续 12 天 · 今日完成 1 / 3", 10.5, TEXT_3, False, "la")
    progress(d, [38, cy + 66, W - 38, cy + 72], 0.33)

    # 今日重点
    ty = cy + 108
    txt(d, 24, ty, "今日重点", 12.5, TEXT, True, "la")
    txt(d, W - 24, ty, "3 件", 10, TEXT_3, False, "ra")
    card(img, d, [20, ty + 14, W - 20, ty + 14 + 172], radius=16)
    items = [("09:00", "人形机器人强化学习 · 实验课", "学习", False),
             ("14:00", "修改论文第二节", "学业", True),
             ("20:00", "英语精读 1 篇", "学习", False)]
    iy = ty + 32
    for tm, label, cat, done in items:
        dot(d, 42, iy + 20, 9, ACCENT if done else (255, 255, 255, 255),
            outline=ACCENT if done else LINE, width=1.6)
        if done:
            txt(d, 42, iy + 20, "✓", 10, (255, 255, 255, 255), True, "mm")
        txt(d, 58, iy + 12, label, 12, TEXT_3 if done else TEXT, False, "la")
        txt(d, 58, iy + 32, tm, 9.5, TEXT_3, False, "la")
        dot(d, W - 44, iy + 22, 4.5, CAT["学习提升"] if cat == "学习" else CAT["生活琐事"])
        iy += 52

    # 接下来
    ny = ty + 202
    txt(d, 24, ny, "接下来", 12.5, TEXT, True, "la")
    card(img, d, [20, ny + 14, W - 20, ny + 14 + 92], radius=16)
    nxt = [("13:30", "传播学复习", "学习提升"), ("15:00", "取快递 · 洗衣", "生活琐事")]
    iy = ny + 26
    for tm, label, cat in nxt:
        d.rounded_rectangle([32, iy + 4, 35, iy + 32], radius=2, fill=CAT[cat])
        txt(d, 46, iy + 10, label, 11.5, TEXT, False, "la")
        txt(d, 46, iy + 26, tm, 9.5, TEXT_3, False, "la")
        iy += 38

    # 习惯
    hy = ny + 128
    txt(d, 24, hy, "习惯打卡", 12.5, TEXT, True, "la")
    txt(d, W - 24, hy, "3 / 6", 10, TEXT_3, False, "ra")
    chips = [("早睡", True), ("喝水", True), ("护肤", False), ("早起", True),
             ("背单词", False), ("运动", True)]
    cx_, cy_ = 20, hy + 16
    for name, done in chips:
        w_ = 24 + len(name) * 12
        if cx_ + w_ > W - 20:
            cx_ = 20
            cy_ += 42
        b = [cx_, cy_, cx_ + w_, cy_ + 34]
        d.rounded_rectangle(b, radius=17, fill=ACCENT if done else SURFACE,
                            outline=ACCENT if done else LINE, width=1)
        txt(d, cx_ + w_ // 2, cy_ + 17, ("✓ " if done else "") + name, 11,
            (255, 255, 255, 255) if done else TEXT_2, done, "mm")
        cx_ += w_ + 8

    # 随手记
    qy = cy_ + 56
    txt(d, 24, qy, "随手记", 12.5, TEXT, True, "la")
    card(img, d, [20, qy + 14, W - 20, qy + 90], radius=16)
    txt(d, 38, qy + 36, "今天想到什么…", 11.5, TEXT_3, False, "la")
    txt(d, 38, qy + 60, "心情 · 碎碎念 · 摘抄", 9.5, (190, 186, 178, 255), False, "la")
    dot(d, W - 46, qy + 68, 14, ACCENT)
    txt(d, W - 46, qy + 68, "＋", 15, (255, 255, 255, 255), True, "mm")

    # 底部导航
    d.rectangle([0, H - 72, W, H], fill=SURFACE)
    d.line([0, H - 72, W, H - 72], fill=LINE, width=1)
    tabs = ["今日", "本周", "学习", "奖赏", "设置"]
    tw = W // len(tabs)
    for i, t_ in enumerate(tabs):
        cx = tw * i + tw // 2
        active = (i == 0)
        dot(d, cx, H - 44, 5, ACCENT if active else (208, 204, 196, 255))
        txt(d, cx, H - 26, t_, 9.5, TEXT if active else TEXT_3, active, "mm")

    img.convert("RGB").save(os.path.join(OUT, "02-今日-手机.png"))
    print("saved 02")

# ---------------- 图三：奖赏页 ----------------
def render_reward():
    W, H = 1600, 980
    img, d = new_canvas(W, H)
    sw = sidebar(img, d, H, "奖赏")

    txt(d, sw + 32, 40, "奖赏", 22, TEXT, True, "lm")
    txt(d, sw + 104, 42, "做实事赚币，用币兑换自己定的奖励", 12, TEXT_3, False, "lm")

    # 钱包 + 六领域
    wx0, wy0 = sw + 32, 78
    card(img, d, [wx0, wy0, wx0 + 500, wy0 + 176], radius=18)
    txt(d, wx0 + 28, wy0 + 30, "我的余额", 11, TEXT_3, False, "la")
    txt(d, wx0 + 28, wy0 + 108, "1,284", 46, TEXT, True, "ls")
    txt(d, wx0 + 160, wy0 + 108, "币", 13, TEXT_3, False, "ls")
    pill(d, [wx0 + 28, wy0 + 120, wx0 + 118, wy0 + 146], "本周 +86", 10,
         fg=ACCENT, bg=ACCENT_SOFT, border=ACCENT_SOFT, bold=True)
    pill(d, [wx0 + 128, wy0 + 120, wx0 + 218, wy0 + 146], "本周 −40", 10,
         fg=WARN, bg=WARN_SOFT, border=WARN_SOFT, bold=True)

    ex0 = wx0 + 520
    card(img, d, [ex0, wy0, W - 32, wy0 + 176], radius=18)
    txt(d, ex0 + 24, wy0 + 28, "六领域进度", 12.5, TEXT, True, "la")
    txt(d, W - 56, wy0 + 28, "每日 −1%，下限 40%", 9.5, TEXT_3, False, "ra")
    areas = [("健康", 0.72), ("学业", 0.88), ("关系", 0.55),
             ("财务", 0.63), ("成长", 0.64), ("娱乐", 0.41)]
    for i, (name, pct) in enumerate(areas):
        col, row = i % 3, i // 3
        bx = ex0 + 24 + col * 250
        by_ = wy0 + 62 + row * 48
        txt(d, bx, by_, name, 10, TEXT_2, False, "la")
        txt(d, bx + 214, by_, f"{int(pct*100)}%", 9.5, TEXT_3, False, "ra")
        progress(d, [bx, by_ + 18, bx + 214, by_ + 25], pct)

    # 商店
    sy = wy0 + 204
    txt(d, sw + 32, sy, "奖赏商店", 13, TEXT, True, "la")
    txt(d, sw + 112, sy + 2, "自己填的奖励，价格也自己定", 10, TEXT_3, False, "la")
    items = [("奶茶一杯", 30, "生活琐事"), ("看一集剧", 40, "休闲玩耍"),
             ("游戏 1 小时", 60, "休闲玩耍"), ("买一本书", 150, "学习提升"),
             ("周末出游", 400, "文娱锻炼"), ("睡到自然醒", 80, "习惯养成")]
    gw, gh, gap = 296, 120, 16
    for i, (name, price, cat) in enumerate(items):
        col, row = i % 3, i // 3
        bx = sw + 32 + col * (gw + gap)
        by_ = sy + 26 + row * (gh + gap)
        box = [bx, by_, bx + gw, by_ + gh]
        card(img, d, box, radius=16)
        d.rounded_rectangle([bx + 18, by_ + 22, bx + 58, by_ + 62], radius=13,
                            fill=mix(CAT[cat], 0.35))
        dot(d, bx + 38, by_ + 42, 5.5, CAT[cat])
        txt(d, bx + 72, by_ + 32, name, 12.5, TEXT, False, "la")
        txt(d, bx + 72, by_ + 52, f"{price} 币", 10, TEXT_3, False, "la")
        afford = price <= 1284
        d.rounded_rectangle([bx + gw - 88, by_ + 74, bx + gw - 18, by_ + 104], radius=9,
                            fill=ACCENT if afford else (243, 241, 236, 255),
                            outline=ACCENT if afford else LINE, width=1)
        txt(d, (bx + gw - 53, by_ + 89), "兑换", 10.5,
            (255, 255, 255, 255) if afford else TEXT_3, True, "mm")

    # 账本
    ly = sy + 26 + 2 * (gh + gap) + 14
    card(img, d, [sw + 32, ly, W - 32, H - 22], radius=16)
    txt(d, sw + 52, ly + 28, "最近的账本", 12.5, TEXT, True, "la")
    txt(d, W - 54, ly + 28, "查看全部 ›", 10, TEXT_3, False, "ra")
    rows = [("11/03 21:40", "兑换 · 看一集剧", "−40", False),
            ("11/03 19:10", "完成 · 健身臀腿日", "+3", True),
            ("11/03 09:20", "打卡 · 早起 7 天额外", "+10", True),
            ("11/02 23:50", "完成 · 周复盘", "+10", True),
            ("11/02 22:00", "全勤周奖励", "+20", True),
            ("11/02 20:30", "兑换 · 一杯奶茶", "−30", False)]
    ry = ly + 62
    for left, mid, val, plus in rows:
        dot(d, sw + 60, ry + 6, 3.5, ACCENT if plus else WARN)
        txt(d, sw + 76, ry + 6, left, 9.5, TEXT_3, False, "lm")
        txt(d, sw + 190, ry + 6, mid, 11, TEXT_2, False, "lm")
        txt(d, W - 54, ry + 6, val, 11.5, ACCENT if plus else WARN, True, "rm")
        ry += 40

    img.convert("RGB").save(os.path.join(OUT, "03-奖赏-桌面.png"))
    print("saved 03")

if __name__ == "__main__":
    render_week()
    render_today()
    render_reward()
    print("done ->", OUT)
