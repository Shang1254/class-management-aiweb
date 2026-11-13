# -*- coding: utf-8 -*-
"""
应用图标渲染脚本（藏青金·班徽硬币）
=====================================================
交付：应用图标_1024/512/300.png + 圆角预览_512.png
设计：深藏青→宝蓝渐变方底 · 金色硬币(¥)+细金环 · 证书角饰 · 底部「班缴」金线托带
可复现：python render_icon.py（需 Pillow；2× 超采样抗锯齿）
与 应用图标.svg 同一套几何参数，改这里后请同步 SVG。
"""

import os
from PIL import Image, ImageDraw, ImageFont

SS = 2                      # 超采样倍数（2048 渲染 → 1024 输出）
OUT = os.path.dirname(os.path.abspath(__file__))

# ---- 调色（与宿主「川大·藏青金」同源） ----
NAVY = (22, 41, 78)         # #16294e 深藏青
MIDB = (27, 58, 122)        # #1b3a7a
BLUE = (29, 93, 216)        # #1d5dd8 宝蓝
GOLD = (201, 162, 75)       # #c9a24b 金
GOLD_L = (226, 200, 127)    # #e2c87f 浅金
GOLD_PALE = (244, 226, 176) # #f4e2b0 淡金
GOLD_DARK = (138, 106, 42)  # #8a6a2a 暗金描边
WHITE = (255, 255, 255)


def lerp(c1, c2, t):
    return tuple(int(round(a + (b - a) * t)) for a, b in zip(c1, c2))


def gradient_bg(size):
    """135° 三段渐变底（先小图后放大，线性渐变足够平滑）"""
    small = 320
    img = Image.new('RGB', (small, small))
    px = img.load()
    for y in range(small):
        for x in range(small):
            t = (x + y) / (2 * small - 2)
            if t < 0.55:
                px[x, y] = lerp(NAVY, MIDB, t / 0.55)
            else:
                px[x, y] = lerp(MIDB, BLUE, (t - 0.55) / 0.45)
    return img.resize((size, size), Image.BILINEAR)


def coin_radial(size, cx, cy, r):
    """硬币面径向渐变（淡金中心 → 金边缘），仅遍历硬币包围盒"""
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    px = img.load()
    r2 = r * r
    for y in range(max(0, cy - r), min(size, cy + r + 1)):
        dy = y - cy
        span = int((r2 - dy * dy) ** 0.5)
        for x in range(max(0, cx - span), min(size, cx + span + 1)):
            d2 = (x - cx) ** 2 + dy * dy
            if d2 <= r2:
                t = (d2 / r2) ** 0.6          # 中心亮、边缘深
                px[x, y] = lerp(GOLD_PALE, GOLD, t) + (255,)
    return img


def rounded_corner_paths(d, S, w, color, arm, off):
    """四角证书角饰（金线，带圆角转折）"""
    o, a = off * S, arm * S
    s = 20 * S   # 转角半径
    W, H = 1024 * S, 1024 * S
    corners = [
        [(o, o + a), (o, o + s), (o + s, o), (o + a, o)],                                   # 左上
        [(W - o - a, o), (W - o - s, o), (W - o, o + s), (W - o, o + a)],                   # 右上
        [(W - o, H - o - a), (W - o, H - o - s), (W - o - s, H - o), (W - o - a, H - o)],   # 右下
        [(o + a, H - o), (o + s, H - o), (o, H - o - s), (o, H - o - a)],                   # 左下
    ]
    for pts in corners:
        # 三段折线 + 两端圆帽：转角处用短弧近似（细线视觉上圆润即可）
        d.line(pts[0:2], fill=color, width=w)
        d.line(pts[1:3], fill=color, width=w)
        d.line(pts[2:4], fill=color, width=w)
        for p in (pts[0], pts[3]):
            d.ellipse([p[0] - w / 2, p[1] - w / 2, p[0] + w / 2, p[1] + w / 2], fill=color)


def round_line(d, p1, p2, width, color):
    d.line([p1, p2], fill=color, width=width)
    r = width / 2
    for p in (p1, p2):
        d.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=color)


def load_font(size_px):
    for name in ('simkai.ttf', 'STKAITI.TTF', 'simsun.ttc', 'msyh.ttc'):
        p = os.path.join('C:/Windows/Fonts', name)
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size_px)
            except Exception:
                continue
    return ImageFont.load_default()


def render():
    S = SS
    W = 1024 * S
    img = gradient_bg(W).convert('RGBA')

    # 证书角饰
    ov = Image.new('RGBA', (W, W), (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)
    rounded_corner_paths(d, S, 6 * S, GOLD + (150,), arm=90, off=64)
    img = Image.alpha_composite(img, ov)

    # 硬币（径向渐变 + 描边环 + 细金环 + 高光弧）
    cx, cy, r = 512 * S, 462 * S, 234 * S
    img = Image.alpha_composite(img, coin_radial(W, cx, cy, r))
    d = ImageDraw.Draw(img)
    d.ellipse([cx - 212 * S, cy - 212 * S, cx + 212 * S, cy + 212 * S],
              outline=GOLD_DARK + (255,), width=10 * S)
    d.ellipse([cx - 174 * S, cy - 174 * S, cx + 174 * S, cy + 174 * S],
              outline=GOLD_PALE + (200,), width=5 * S)
    d.arc([cx - 220 * S, cy - 220 * S, cx + 220 * S, cy + 220 * S],
          start=200, end=248, fill=(255, 255, 255, 130), width=9 * S)

    # ¥ 符号（白描边 + 深色投影）
    conv = (512 * S, 508 * S)
    stem_end = (512 * S, 652 * S)
    lw = 44 * S
    shadow = (10, 10, 24, 48)
    strokes = [
        [(410 * S, 330 * S), conv],
        [(614 * S, 330 * S), conv],
        [conv, stem_end],
        [(414 * S, 554 * S), (610 * S, 554 * S)],
        [(414 * S, 616 * S), (610 * S, 616 * S)],
    ]
    for p1, p2 in strokes:
        round_line(d, (p1[0] + 3 * S, p1[1] + 5 * S), (p2[0] + 3 * S, p2[1] + 5 * S), lw, shadow)
    for p1, p2 in strokes:
        round_line(d, p1, p2, lw, WHITE + (255,))

    # 底部托带：「班 缴」楷体金字 + 两侧金线
    f = load_font(88 * S)
    text_y = 806 * S
    for i, ch in enumerate(('班', '缴')):
        x = 512 * S + (i - 1) * (88 * S + 26 * S)
        d.text((x, text_y), ch, font=f, fill=GOLD_L + (255,), anchor='mm')
    ty = 846 * S
    d.line([(220 * S, ty), (324 * S, ty)], fill=GOLD + (200,), width=3 * S)
    d.line([(700 * S, ty), (804 * S, ty)], fill=GOLD + (200,), width=3 * S)
    for px_ in (220 * S, 324 * S, 700 * S, 804 * S):
        d.ellipse([px_ - 4 * S, ty - 4 * S, px_ + 4 * S, ty + 4 * S], fill=GOLD + (220,))

    # ---- 输出各尺寸 ----
    final = img.resize((1024, 1024), Image.LANCZOS)
    final.save(os.path.join(OUT, '应用图标_1024.png'), optimize=True)
    final.resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, '应用图标_512.png'), optimize=True)
    final.resize((300, 300), Image.LANCZOS).save(os.path.join(OUT, '应用图标_300.png'), optimize=True)
    # 320×320：支付宝开放平台「建议320*320像素」的精确匹配版（RGB 无透明通道 + JPG 备份）
    rgb320 = final.resize((320, 320), Image.LANCZOS).convert('RGB')
    rgb320.save(os.path.join(OUT, '应用图标_320.png'), optimize=True)
    rgb320.save(os.path.join(OUT, '应用图标_320.jpg'), quality=92, optimize=True)

    # 圆角预览（文档展示用；支付宝上传用直角原图，平台自行裁圆角）
    mask = Image.new('L', (1024, 1024), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, 1023, 1023], radius=180, fill=255)
    rounded = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
    rounded.paste(final, (0, 0), mask)
    rounded.resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, '圆角预览_512.png'), optimize=True)

    for n in ('应用图标_1024.png', '应用图标_512.png', '应用图标_300.png',
              '应用图标_320.png', '应用图标_320.jpg', '圆角预览_512.png'):
        p = os.path.join(OUT, n)
        print('OK %-22s %6.1f KB' % (n, os.path.getsize(p) / 1024))


if __name__ == '__main__':
    render()
