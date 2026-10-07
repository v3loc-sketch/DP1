#!/usr/bin/env python3
"""Builds side-by-side comparison sheets: reference photo | render, plus
zoomed detail crops (same normalised region from both images).
Usage: compose.py <dir-with-render_imgN.png>"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
REFS = {
    'img1': 'docs/reference/img1_open.webp',
    'img3': 'docs/reference/img3_back.png',
    'img2': 'docs/reference/img2_closed_top.png',
    'img4': 'docs/reference/img4_front.png',
}
# normalised (x0, y0, x1, y1) detail regions
CROPS = {
    'img1': {
        'latch + loop': (0.27, 0.53, 0.53, 0.82),
        'seam + corner (right end)': (0.76, 0.45, 1.0, 0.82),
        'ribs (front panel)': (0.04, 0.58, 0.30, 0.84),
        'pillows + dividers': (0.22, 0.33, 0.62, 0.58),
        'lid velvet border + glass': (0.14, 0.0, 0.52, 0.27),
        'left end + rim lip': (0.0, 0.33, 0.24, 0.72),
    },
    'img3': {
        'hinge (left)': (0.0, 0.33, 0.36, 0.84),
        'hinge (right) + stacked rivets + corner': (0.6, 0.27, 1.0, 0.84),
        'lid bullnose + glass + interior': (0.25, 0.16, 0.75, 0.55),
        'ribs (back panel)': (0.3, 0.6, 0.6, 0.85),
    },
    'img2': {},
    'img4': {},
}

FONT = ImageFont.load_default(size=22)


def label(im, text):
    d = ImageDraw.Draw(im)
    d.rectangle((0, 0, im.width, 30), fill=(255, 255, 255))
    d.text((8, 4), text, fill=(0, 0, 0), font=FONT)
    return im


def pair(a, b, h, title):
    a = a.resize((max(1, round(a.width * h / a.height)), h), Image.LANCZOS)
    b = b.resize((max(1, round(b.width * h / b.height)), h), Image.LANCZOS)
    out = Image.new('RGB', (a.width + b.width + 12, h + 34), 'white')
    out.paste(a, (0, 34))
    out.paste(b, (a.width + 12, 34))
    d = ImageDraw.Draw(out)
    d.rectangle((a.width + 4, 34, a.width + 7, h + 34), fill=(220, 30, 30))
    d.text((6, 6), f'{title}   [left: photo | right: render]', fill=(0, 0, 0), font=FONT)
    return out


def main(d):
    for name, rel in REFS.items():
        rp = os.path.join(d, f'render_{name}.png')
        if not os.path.exists(rp):
            continue
        ref = Image.open(os.path.join(ROOT, rel)).convert('RGB')
        ren = Image.open(rp).convert('RGB')
        refu = ref.resize(ren.size, Image.LANCZOS)
        rows = [pair(refu, ren, 520 if ref.width > 600 else 480, f'{name} full view')]
        for title, (x0, y0, x1, y1) in CROPS[name].items():
            box = lambda im: im.crop((round(x0 * im.width), round(y0 * im.height), round(x1 * im.width), round(y1 * im.height)))
            rows.append(pair(box(refu), box(ren), 380, title))
        W = max(r.width for r in rows)
        sheet = Image.new('RGB', (W, sum(r.height + 10 for r in rows)), 'white')
        y = 0
        for r in rows:
            sheet.paste(r, (0, y))
            y += r.height + 10
        sheet.save(os.path.join(d, f'compare_{name}.jpg'), quality=88)
        # overlay: photo 50% / render 50% to reveal misalignment
        Image.blend(refu, ren, 0.5).save(os.path.join(d, f'overlay_{name}.jpg'), quality=85)
        print('sheet', name)


if __name__ == '__main__':
    main(sys.argv[1])
