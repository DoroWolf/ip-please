#!/usr/bin/env python3
"""把像素素材预渲染成网页游戏用的图集，输出 src/assets.js。

  pip install -r tools/requirements.txt
  python tools/build_assets.py

- 字体图集：扫描 src/ 下所有 JS 与 index.html 里出现的字符，只渲染这些字（缝合像素字体 8/10/12px）
- 精灵图集：节点的网络头像（风景、宠物、花、字母、几何、马赛克、表情、星球、杯子、默认剪影、自拍），统一套像素滤镜；Claude 徽标；
  故事模式《安索兹卡对齐报》的配图
产物是一个 JS 文件（图片以 base64 内嵌），所以 index.html 直接双击也能玩。
"""
import base64
import io
import json
import random
import sys
from pathlib import Path

from PIL import Image

TOOLS = Path(__file__).resolve().parent
SITE = TOOLS.parent
sys.path.insert(0, str(TOOLS))

from pp.base import CLAUDE, CLAUDE_L, FONTS, draw, pattern, spark, txt  # noqa: E402
from pp.people import Person  # noqa: E402

# ———————————————————— 字体 ————————————————————


def used_chars():
    chars = {chr(c) for c in range(32, 127)}
    for p in sorted((SITE / "src").rglob("*.js")) + [SITE / "index.html"]:
        if p.name == "assets.js" or not p.exists():
            continue
        chars |= set(p.read_text(encoding="utf-8"))
    return sorted(c for c in chars if c.isprintable() and c not in "\t\r\n")


def glyph_mask(ch, size):
    im = Image.new("L", (size * 2 + 8, size * 2 + 8), 0)
    d = draw(im)
    txt(d, (4, 4), ch, size, 255)
    return im


def build_font():
    chars = used_chars()
    missing = []
    sheets = {}
    for size in (8, 10, 12):
        f = FONTS[size]
        notdef = glyph_mask("͸", size).tobytes()   # 未分配码位 → 缺字方块
        glyphs, cells = {}, []
        for ch in chars:
            m = glyph_mask(ch, size)
            if ch != " " and m.tobytes() == notdef:
                if size == 12:
                    missing.append(ch)
                continue
            adv = round(f.getlength(ch))
            bb = m.getbbox()
            if bb is None:
                glyphs[ch] = [0, 0, 0, 0, 0, 0, adv]
                continue
            crop = m.crop(bb)
            cells.append((ch, crop, bb[0] - 4, bb[1] - 4, adv))
        sheets[size] = (glyphs, cells)
    # 三个字号排进同一张图（白字透明底，运行时再上色）
    W = 1024
    x = y = row_h = 0
    placed = []
    for size in (8, 10, 12):
        glyphs, cells = sheets[size]
        for ch, crop, ox, oy, adv in cells:
            if x + crop.width > W:
                x, y, row_h = 0, y + row_h + 1, 0
            placed.append((size, ch, crop, x, y, ox, oy, adv))
            x += crop.width + 1
            row_h = max(row_h, crop.height)
    sheet = Image.new("LA", (W, y + row_h + 1), (255, 0))
    out = {8: {}, 10: {}, 12: {}}
    for size, ch, crop, gx, gy, ox, oy, adv in placed:
        sheet.paste(Image.new("LA", crop.size, (255, 255)), (gx, gy), crop)
        out[size][ch] = [gx, gy, crop.width, crop.height, ox, oy, adv]
    for size in (8, 10, 12):
        out[size].update(sheets[size][0])
    if missing:
        print("字体缺字（会被跳过）：", "".join(missing))
    return sheet, out


# ———————————————————— 网络头像 ————————————————————
# 先画 88×88 的“原图”，再缩成 AV×AV、压色：游戏里按整数倍放大，就是像素滤镜。

S = 88
AV = 22


def pixelate(im, colors=10):
    small = im.convert("RGB").resize((AV, AV), Image.BOX)
    return small.quantize(colors=colors, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).convert("RGB")


def shade(c, k):
    return tuple(max(0, min(255, int(v * k))) for v in c)


def av_diff(a, b):
    """两张头像逐像素的平均色差。"""
    pa, pb = a.tobytes(), b.tobytes()
    return sum(abs(x - y) for x, y in zip(pa, pb)) / len(pa)


def av_default(rng):
    """注册后从没改过的默认头像。"""
    bg = rng.choice([(150, 150, 146), (176, 184, 194), (196, 190, 180), (110, 124, 150), (176, 146, 160), (130, 160, 130),
                     (100, 100, 104), (190, 170, 120), (120, 160, 170)])
    im = Image.new("RGB", (S, S), bg)
    d = draw(im)
    fg = shade(bg, 1.28)
    d.ellipse([28, 14, 60, 46], fill=fg)
    d.ellipse([10, 52, 78, 120], fill=fg)
    return im


def av_landscape(rng):
    sky, sun, hill = rng.choice([((110, 150, 190), (236, 214, 150), (70, 100, 80)),
                                 ((200, 130, 100), (240, 200, 120), (80, 60, 70)),
                                 ((40, 50, 80), (220, 220, 200), (30, 34, 44)),
                                 ((150, 190, 210), (250, 240, 210), (110, 120, 130)),
                                 ((230, 170, 130), (250, 230, 180), (120, 80, 70)),
                                 ((90, 70, 110), (240, 180, 120), (50, 40, 60)),
                                 ((170, 200, 180), (250, 250, 220), (60, 110, 90))])
    im = Image.new("RGB", (S, S), sky)
    d = draw(im)
    sx = rng.randint(14, 60)
    d.ellipse([sx, 10, sx + 20, 30], fill=sun)
    k = rng.randrange(3)
    if k == 0:     # 山
        a, b = rng.randint(24, 40), rng.randint(50, 70)
        d.polygon([(0, 70), (a, 32), (a + 22, 60), (b, 42), (88, 68), (88, 88), (0, 88)], fill=hill)
        d.rectangle([0, 72, 88, 88], fill=shade(sky, 0.75))
    elif k == 1:   # 海
        d.rectangle([0, 56, 88, 88], fill=shade(hill, 1.3))
        for y in range(62, 88, 8):
            d.line([0, y, 88, y], fill=shade(sun, 0.9))
    else:          # 城市天际线
        x = 0
        while x < S:
            w, h = rng.randint(8, 16), rng.randint(20, 50)
            d.rectangle([x, 88 - h, x + w - 1, 88], fill=shade(hill, rng.choice([0.8, 1.0, 1.2])))
            x += w
    return im


def av_pet(rng):
    """猫或狗的侧影。"""
    bg = rng.choice([(220, 200, 170), (180, 200, 210), (200, 210, 180), (230, 190, 190), (200, 190, 220), (90, 100, 110)])
    fur = rng.choice([(60, 50, 46), (200, 140, 80), (230, 226, 216), (120, 110, 104), (160, 120, 90), (220, 180, 120)])
    im = Image.new("RGB", (S, S), bg)
    d = draw(im)
    if rng.random() < 0.5:   # 猫：尖耳
        d.polygon([(22, 36), (28, 8), (44, 28)], fill=fur)
        d.polygon([(66, 36), (60, 8), (44, 28)], fill=fur)
        d.ellipse([18, 22, 70, 72], fill=fur)
    else:                    # 狗：垂耳
        d.ellipse([20, 20, 68, 72], fill=fur)
        d.ellipse([10, 24, 30, 60], fill=shade(fur, 0.7))
        d.ellipse([58, 24, 78, 60], fill=shade(fur, 0.7))
        d.ellipse([34, 50, 54, 70], fill=shade(fur, 1.25))
    eye = (30, 30, 30) if sum(fur) > 300 else (230, 220, 120)
    d.ellipse([32, 40, 38, 46], fill=eye)
    d.ellipse([50, 40, 56, 46], fill=eye)
    d.rectangle([0, 76, 88, 88], fill=shade(bg, 0.85))
    return im


def av_flower(rng):
    bg = rng.choice([(70, 110, 80), (40, 60, 70), (220, 214, 196), (110, 90, 120), (180, 200, 220)])
    pet = rng.choice([(230, 120, 140), (240, 210, 90), (240, 240, 236), (170, 120, 200), (230, 140, 80)])
    im = Image.new("RGB", (S, S), bg)
    d = draw(im)
    r = rng.choice([10, 12])
    for ox, oy in ((0, -18), (0, 18), (-18, 0), (18, 0), (-13, -13), (13, 13), (-13, 13), (13, -13)):
        d.ellipse([44 + ox - r, 44 + oy - r, 44 + ox + r, 44 + oy + r], fill=pet)
    d.ellipse([34, 34, 54, 54], fill=rng.choice([(200, 150, 60), (120, 80, 50)]))
    return im


def av_letter(rng):
    """系统按用户名首字母生成的头像。"""
    bg = rng.choice([(60, 120, 180), (180, 80, 90), (90, 150, 110), (150, 100, 180), (200, 140, 60), (70, 140, 150),
                     (110, 110, 120), (190, 110, 150), (60, 80, 130), (130, 150, 60), (160, 90, 50), (40, 110, 100),
                     (120, 70, 120), (200, 170, 70)])
    im = Image.new("RGB", (S, S), bg)
    ch = rng.choice("ABCDEFGHJKLMNOPRSTUVWXYZ")
    m = Image.new("L", (12, 14), 0)
    txt(draw(m), (1, 1), ch, 12, 255)
    m = m.resize((12 * 5, 14 * 5), Image.NEAREST)
    im.paste((30, 30, 34) if sum(bg) >= 400 else (240, 240, 236), (14, 8), m)
    return im


def av_geo(rng):
    a = rng.choice([(40, 46, 70), (70, 40, 60), (30, 70, 70), (60, 60, 64), (90, 70, 40), (30, 30, 34)])
    b = rng.choice([(90, 160, 200), (220, 120, 100), (120, 200, 140), (200, 180, 90), (180, 140, 220), (230, 230, 220)])
    im = Image.new("RGB", (S, S), a)
    d = draw(im)
    k = rng.randrange(6)
    if k == 0:
        for r in range(40, 0, -10):
            d.ellipse([44 - r, 44 - r, 44 + r, 44 + r], fill=b if r % 20 else a)
    elif k == 1:
        for y in range(0, S, 22):
            for x in range(0, S, 22):
                if (x + y) // 22 % 2:
                    d.rectangle([x, y, x + 21, y + 21], fill=b)
    elif k == 2:
        for i in range(-S, S, 20):
            d.polygon([(i, 0), (i + 10, 0), (i + 10 + S, S), (i + S, S)], fill=b)
    elif k == 3:
        d.polygon([(44, 8), (80, 44), (44, 80), (8, 44)], fill=b)
        d.polygon([(44, 26), (62, 44), (44, 62), (26, 44)], fill=a)
    elif k == 4:   # 三角
        d.polygon([(44, 10), (80, 74), (8, 74)], fill=b)
    else:          # 横条
        for y in range(0, S, 16):
            d.rectangle([0, y, S, y + 7], fill=b)
    return im


def av_identicon(rng):
    """系统按账号哈希生成的 5×5 对称马赛克。"""
    fg = rng.choice([(90, 160, 200), (220, 120, 100), (120, 190, 110), (200, 170, 80), (170, 120, 210),
                     (220, 110, 160), (80, 170, 170)])
    im = Image.new("RGB", (S, S), (236, 234, 228))
    d = draw(im)
    for y in range(5):
        for x in range(3):
            if rng.random() < 0.5:
                for xx in {x, 4 - x}:
                    d.rectangle([4 + xx * 16, 4 + y * 16, 4 + xx * 16 + 15, 4 + y * 16 + 15], fill=fg)
    return im


def av_smiley(rng):
    """表情符号。"""
    bg = rng.choice([(70, 110, 160), (160, 70, 80), (60, 120, 90), (90, 80, 110), (220, 214, 196)])
    face = rng.choice([(240, 200, 70), (240, 160, 70), (140, 200, 120)])
    im = Image.new("RGB", (S, S), bg)
    d = draw(im)
    d.ellipse([10, 10, 78, 78], fill=face)
    ink = (50, 36, 30)
    k = rng.randrange(4)
    if k == 3:     # 墨镜
        d.rectangle([20, 32, 68, 42], fill=ink)
    else:
        d.ellipse([28, 30, 36, 42], fill=ink)
        d.ellipse([52, 30, 60, 42] if k != 2 else [50, 36, 62, 39], fill=ink)   # k=2 眨眼
    if k == 1:
        d.line([32, 58, 56, 58], fill=ink, width=4)
    else:
        d.arc([24, 36, 64, 66], 20, 160, fill=ink, width=4)
    return im


def av_planet(rng):
    bg = rng.choice([(20, 22, 40), (30, 20, 44), (10, 30, 40)])
    body = rng.choice([(200, 120, 80), (110, 150, 210), (200, 180, 120), (150, 200, 160), (190, 110, 170)])
    im = Image.new("RGB", (S, S), bg)
    d = draw(im)
    for _ in range(14):
        x, y = rng.randrange(S), rng.randrange(S)
        d.rectangle([x, y, x + 1, y + 1], fill=(220, 220, 230))
    r = rng.randint(20, 28)
    box = [44 - r, 44 - r, 44 + r, 44 + r]
    d.ellipse(box, fill=body)
    d.chord(box, 300, 120, fill=shade(body, 0.7))
    if rng.random() < 0.6:   # 土星环：先画整圈，再用星球上半部盖住后半圈
        d.ellipse([6, 38, 82, 52], outline=(230, 220, 190), width=3)
        d.chord(box, 180, 360, fill=body)
    return im


def av_cup(rng):
    """咖啡 / 奶茶。"""
    bg = rng.choice([(220, 200, 170), (180, 200, 190), (200, 180, 200), (70, 80, 90), (230, 220, 200)])
    cup = rng.choice([(240, 240, 236), (200, 80, 70), (80, 120, 170), (230, 190, 90)])
    im = Image.new("RGB", (S, S), bg)
    d = draw(im)
    d.rounded_rectangle([20, 36, 62, 76], radius=6, fill=cup)
    d.ellipse([58, 44, 76, 64], outline=cup, width=5)
    d.rectangle([22, 36, 60, 42], fill=rng.choice([(90, 56, 40), (190, 150, 110)]))
    for x in (30, 42, 54):
        if rng.random() < 0.7:
            d.arc([x - 6, 10, x + 2, 30], 270, 90, fill=shade(bg, 1.3), width=2)
    return im


def av_selfie(rng):
    """少数人用自拍当头像。"""
    hair = rng.choice(["short", "short", "side", "slick", "bald", "buzz", "curly", "long", "long", "bun"])
    p = Person(
        skin=rng.choice(["light", "mid", "tan", "deep"]),
        face=rng.choice(["oval", "round", "long", "square"]),
        hair=hair,
        hair_color=rng.choice([(42, 34, 31), (30, 26, 24), (80, 60, 44), (206, 176, 104), (160, 156, 150),
                               (150, 70, 50), (60, 70, 110)]),
        beard=rng.choice([None] * 6 + ["mustache", "stubble"]) if hair not in ("long", "bun") else None,
        eyes=rng.choice([None] * 4 + ["glasses", "rimless", "sunglasses"]),
        hat=rng.choice([None] * 6 + ["cap", "flatcap", "hood"]),
        hat_color=rng.choice([(150, 48, 42), (52, 56, 70), (70, 96, 96), (200, 170, 80)]),
        acc=rng.choice([None] * 8 + ["headphones"]),
        top=rng.choice(["jacket", "hoodie", "polo", "tee", "shirt_tie", "cardigan", "plaid"]),
        top_color=rng.choice([(86, 82, 64), (52, 56, 70), (90, 96, 104), (70, 96, 96), (150, 60, 50), (80, 90, 120),
                              (130, 110, 150), (180, 150, 90)]),
        expr=rng.choice(["neutral", "smile", "smile", "grin"]),
    )
    spr = p.sprite()
    src = spr.crop((90 - 46, 4, 90 + 46, 96))   # 立绘画布 180x128，人物中轴 x=90
    flat = Image.new("RGB", src.size, rng.choice([(170, 180, 190), (200, 190, 170), (120, 140, 120), (90, 100, 120),
                                                  (190, 160, 160), (150, 170, 200)]))
    flat.paste(src, (0, 0), src)
    return flat.resize((S, S), Image.BOX)


KINDS = [(av_default, 6), (av_landscape, 12), (av_pet, 12), (av_flower, 8), (av_letter, 12), (av_geo, 12),
         (av_identicon, 10), (av_smiley, 6), (av_planet, 6), (av_cup, 6), (av_selfie, 20)]
# 两张头像平均色差低于这个值就算撞脸、重抽：否则“头像不符”可能换上一张肉眼分不出的
MIN_DIFF = 14


def title_emblem():
    im = Image.new("RGBA", (45, 45), (0, 0, 0, 0))
    d = draw(im)
    d.ellipse([0, 0, 44, 44], fill=(60, 24, 22))
    d.ellipse([0, 0, 44, 44], outline=CLAUDE)
    spark(d, 22, 22, CLAUDE_L, k=2)
    return im


# 请求券横幅上的小号徽记：同一枚圆章，星芒按小尺寸重画（13px 的图案缩不下来，硬缩会断线）
SPARK_15 = [
    ".......X.......",
    "...X...X...X...",
    "....X..X..X....",
    ".....X.X.X.....",
    ".X....XXX....X.",
    "..XX..XXX..XX..",
    "...XX.XXX.XX...",
    "XXXXXXXXXXXXXXX",
    "...XX.XXX.XX...",
    "..XX..XXX..XX..",
    ".X....XXX....X.",
    ".....X.X.X.....",
    "....X..X..X....",
    "...X...X...X...",
    ".......X.......",
]


def voucher_emblem(size=33):
    """请求券横幅左侧的小徽记：圆章小一圈，星芒和边框留出边距，不顶到上下边。"""
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = draw(im)
    d.ellipse([0, 0, size - 1, size - 1], fill=(60, 24, 22))
    d.ellipse([0, 0, size - 1, size - 1], outline=CLAUDE)
    off = (size - len(SPARK_15)) // 2
    pattern(d, SPARK_15, off, off, {"X": CLAUDE_L})
    return im


def news_icon(kind):
    """《安索兹卡对齐报》配图：透明底上的墨色单色像素画（133×101），直接印在报纸上。"""
    w, h = 132, 100
    ink = (60, 50, 44)
    im = Image.new("RGBA", (w + 1, h + 1), (0, 0, 0, 0))
    d = draw(im)
    cx, cy = w // 2, h // 2
    if kind == "gate":   # 边境开放：栅栏 + 门楣上的徽记
        d.rectangle([8, cy + 10, w - 8, cy + 12], fill=ink)
        for px in range(12, w - 8, 10):
            d.line([px, cy - 14, px, cy + 12], fill=ink)
        d.rectangle([cx - 14, cy - 22, cx + 14, cy - 6], fill=ink)
        spark(d, cx, cy - 14, (200, 188, 166), big=False)
    return im


NEWS_ICONS = ["gate"]


# ———————————————————— 图集 ————————————————————


class Packer:
    def __init__(self, width=512):
        self.width = width
        self.items = []

    def add(self, key, im):
        self.items.append((key, im.convert("RGBA")))

    def build(self):
        items = sorted(self.items, key=lambda it: -it[1].height)
        x = y = row_h = 0
        pos = {}
        for key, im in items:
            if x + im.width > self.width:
                x, y, row_h = 0, y + row_h + 1, 0
            pos[key] = (x, y, im.width, im.height, 0, 0)
            x += im.width + 1
            row_h = max(row_h, im.height)
        sheet = Image.new("RGBA", (self.width, y + row_h + 1), (0, 0, 0, 0))
        for key, im in items:
            sheet.paste(im, pos[key][:2])
        return sheet, pos


def png_b64(im):
    buf = io.BytesIO()
    im.save(buf, "PNG", optimize=True)
    return base64.b64encode(buf.getvalue()).decode(), len(buf.getvalue())


def main():
    font_sheet, font_meta = build_font()

    rng = random.Random(417)
    pk = Packer()
    avatars = []
    picked = []
    for fn, n in KINDS:
        for i in range(n):
            key = f"av:{fn.__name__[3:]}{i}"
            for _ in range(200):
                im = pixelate(fn(rng))
                if all(av_diff(im, o) >= MIN_DIFF for o in picked):
                    break
            else:
                raise SystemExit(f"{key}: 重抽 200 次都和已有头像太像，调一下画法或 MIN_DIFF")
            picked.append(im)
            pk.add(key, im)
            avatars.append(key)
    pk.add("title_emblem", title_emblem())
    pk.add("voucher_emblem", voucher_emblem())
    for k in NEWS_ICONS:
        pk.add(f"news:{k}", news_icon(k))
    sheet, pos = pk.build()

    blobs, sizes = {}, {}
    for name, im in (("font", font_sheet), ("atlas", sheet)):
        blobs[name], sizes[name] = png_b64(im)

    data = {
        "font": {str(k): v for k, v in font_meta.items()},
        "sprites": pos,
        "avatars": avatars,
    }
    js = ["// 由 build_assets.py 生成，不要手改", "window.ASSETS = " + json.dumps(data, ensure_ascii=False,
                                                                                 separators=(",", ":")) + ";"]
    js.append("window.ASSET_IMAGES = {")
    for name, b in blobs.items():
        js.append(f'  {name}: "data:image/png;base64,{b}",')
    js.append("};")
    out = SITE / "src" / "assets.js"
    # 明确用 LF：Windows 上 write_text 默认会把 \n 转成 CRLF，和仓库约定不一致
    with out.open("w", encoding="utf-8", newline="\n") as f:
        f.write("\n".join(js) + "\n")
    print("字体字符数：", len(font_meta[12]), " 图集尺寸：", sheet.size)
    print("PNG 大小：", {k: f"{v / 1024:.0f}KB" for k, v in sizes.items()})
    print(f"assets.js：{out.stat().st_size / 1024:.0f}KB")


if __name__ == "__main__":
    main()
