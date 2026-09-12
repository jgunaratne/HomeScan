#!/usr/bin/env python3
"""Fetch the material swatches swatches.json names, from the retailers' image servers.

    python3 webviewer/swatches/fetch.py

Each is saved beside this file as <name>.jpg. A wood swatch comes back as a
square of board in a white field; "crop": "centre-square" trims the field. The
fabrics are square already. Re-running refetches everything; the files are
committed so a clone needs nothing from the network.
"""
import json, subprocess, sys
from pathlib import Path
from PIL import Image

HERE = Path(__file__).resolve().parent
doc = json.loads((HERE / 'swatches.json').read_text())
for name, s in doc['swatches'].items():
    out = HERE / f'{name}.jpg'
    r = subprocess.run(['curl', '-sS', '-L', '--max-time', '30', '-o', str(out), s['url']])
    if r.returncode or not out.exists() or out.stat().st_size < 12000:
        sys.exit(f'{name}: fetch failed or came back as the placeholder ({out.stat().st_size if out.exists() else 0} bytes)')
    im = Image.open(out).convert('RGB')
    if s.get('crop') == 'centre-square':
        # Trim the white field: the board is the non-white run in the middle row.
        px = im.load(); w, h = im.size; y = h // 2
        xs = [x for x in range(w) if sum(px[x, y]) < 720]
        x0, x1 = xs[0], xs[-1] + 1
        im = im.crop((x0, 0, x1, h))
        side = min(im.size); im = im.crop((0, 0, side, side))
    im.save(out, quality=90)
    print(f'{name:14s} {im.size[0]}x{im.size[1]}  {s["material"]}')
