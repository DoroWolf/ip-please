#!/usr/bin/env python3
"""把像素素材预渲染成网页游戏用的图集，输出 src/assets.js。

  pip install -r tools/requirements.txt
  python tools/build_assets.py

- 字体图集：扫描 src/ 下所有 JS 与 index.html 里出现的字符，只渲染这些字（缝合像素字体 8/10/12px）
- 精灵图集：节点的网络头像（风景、宠物、花、字母、几何、默认剪影、少量自拍），统一套像素滤镜；Claude 徽标；
  故事模式《安索兹卡真理报》的配图
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

from pp.base import CLAUDE, CLAUDE_L, FONTS, draw, spark, txt  # noqa: E402
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


def av_default(rng):
    """注册后从没改过的默认头像。"""
    bg = rng.choice([(150, 150, 146), (176, 184, 194), (196, 190, 180)])
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
                                 ((150, 190, 210), (250, 240, 210), (110, 120, 130))])
    im = Image.new("RGB", (S, S), sky)
    d = draw(im)
    sx = rng.randint(14, 60)
    d.ellipse([sx, 10, sx + 20, 30], fill=sun)
    a, b = rng.randint(24, 40), rng.randint(50, 70)
    d.polygon([(0, 70), (a, 32), (a + 22, 60), (b, 42), (88, 68), (88, 88), (0, 88)], fill=hill)
    d.rectangle([0, 72, 88, 88], fill=shade(sky, 0.75))
    return im


def av_pet(rng):
    """猫或狗的侧影。"""
    bg = rng.choice([(220, 200, 170), (180, 200, 210), (200, 210, 180), (230, 190, 190)])
    fur = rng.choice([(60, 50, 46), (200, 140, 80), (230, 226, 216), (120, 110, 104)])
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
    bg = rng.choice([(70, 110, 80), (40, 60, 70), (220, 214, 196)])
    pet = rng.choice([(230, 120, 140), (240, 210, 90), (240, 240, 236), (170, 120, 200)])
    im = Image.new("RGB", (S, S), bg)
    d = draw(im)
    for ox, oy in ((0, -18), (0, 18), (-18, 0), (18, 0), (-13, -13), (13, 13), (-13, 13), (13, -13)):
        d.ellipse([44 + ox - 12, 44 + oy - 12, 44 + ox + 12, 44 + oy + 12], fill=pet)
    d.ellipse([34, 34, 54, 54], fill=(200, 150, 60))
    return im


def av_letter(rng):
    """系统按用户名首字母生成的头像。"""
    bg = rng.choice([(60, 120, 180), (180, 80, 90), (90, 150, 110), (150, 100, 180), (200, 140, 60), (70, 140, 150)])
    im = Image.new("RGB", (S, S), bg)
    ch = rng.choice("ABCDEFGHJKLMNPRSTWZ")
    m = Image.new("L", (12, 14), 0)
    txt(draw(m), (1, 1), ch, 12, 255)
    m = m.resize((12 * 5, 14 * 5), Image.NEAREST)
    im.paste((240, 240, 236), (14, 8), m)
    return im


def av_geo(rng):
    a = rng.choice([(40, 46, 70), (70, 40, 60), (30, 70, 70), (60, 60, 64), (90, 70, 40)])
    b = shade(rng.choice([(90, 160, 200), (220, 120, 100), (120, 200, 140), (200, 180, 90), (180, 140, 220)]), 1)
    im = Image.new("RGB", (S, S), a)
    d = draw(im)
    k = rng.randrange(4)
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
    else:
        d.polygon([(44, 8), (80, 44), (44, 80), (8, 44)], fill=b)
        d.polygon([(44, 26), (62, 44), (44, 62), (26, 44)], fill=a)
    return im


def av_selfie(rng):
    """少数人用自拍当头像。"""
    hair = rng.choice(["short", "short", "side", "slick", "bald", "buzz", "curly", "long", "long", "bun"])
    p = Person(
        skin=rng.choice(["light", "mid", "tan", "deep"]),
        face=rng.choice(["oval", "round", "long", "square"]),
        hair=hair,
        hair_color=rng.choice([(42, 34, 31), (30, 26, 24), (80, 60, 44), (206, 176, 104), (160, 156, 150)]),
        eyes=rng.choice([None] * 4 + ["glasses", "rimless"]),
        top=rng.choice(["jacket", "hoodie", "polo", "tee", "shirt_tie"]),
        top_color=rng.choice([(86, 82, 64), (52, 56, 70), (90, 96, 104), (70, 96, 96), (150, 60, 50), (80, 90, 120)]),
        expr=rng.choice(["neutral", "smile", "smile"]),
    )
    spr = p.sprite()
    src = spr.crop((90 - 46, 4, 90 + 46, 96))   # 立绘画布 180x128，人物中轴 x=90
    flat = Image.new("RGB", src.size, rng.choice([(170, 180, 190), (200, 190, 170), (120, 140, 120), (90, 100, 120)]))
    flat.paste(src, (0, 0), src)
    return flat.resize((S, S), Image.BOX)


KINDS = [(av_default, 6), (av_landscape, 6), (av_pet, 6), (av_flower, 4), (av_letter, 6), (av_geo, 6), (av_selfie, 6)]


def title_emblem():
    im = Image.new("RGBA", (45, 45), (0, 0, 0, 0))
    d = draw(im)
    d.ellipse([0, 0, 44, 44], fill=(60, 24, 22))
    d.ellipse([0, 0, 44, 44], outline=CLAUDE)
    spark(d, 22, 22, CLAUDE_L, k=2)
    return im


def news_icon(kind):
    """《安索兹卡真理报》配图：透明底上的墨色单色像素画（133×101），直接印在报纸上。"""
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
    for fn, n in KINDS:
        for i in range(n):
            key = f"av:{fn.__name__[3:]}{i}"
            pk.add(key, pixelate(fn(rng)))
            avatars.append(key)
    pk.add("title_emblem", title_emblem())
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
