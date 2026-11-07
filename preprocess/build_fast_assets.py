"""Faster-loading copies of existing products (no new data, no resampling beyond downsizing).

1. moon_color_1k.jpg / moon_normal_1k.jpg: box-downsampled from the 4K maps, for the first
   frame. The 4K/8K maps and 16K tiles still stream in afterwards.
2. All LOLA normal maps re-encoded as lossless WebP (identical pixels, ~20% smaller).
   sites.json paths are updated.

Usage: python preprocess/build_fast_assets.py
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image

PUB = Path(__file__).resolve().parents[1] / "public"
T = PUB / "textures"

for src, dst, q in (("moon_color_4k.jpg", "moon_color_1k.jpg", 88), ("moon_normal_4k.jpg", "moon_normal_1k.jpg", 92)):
    im = Image.open(T / src)
    im.resize((1024, 512), Image.BOX).save(T / dst, quality=q, optimize=True)
    print(dst, (T / dst).stat().st_size // 1024, "KB")

pngs = [T / "southpole_normal.png", *sorted((T / "polar").glob("*_nrm.png")), T / "polar" / "nrm_cap_2048.png"]
for p in pngs:
    im = Image.open(p)
    out = p.with_suffix(".webp")
    im.save(out, "WEBP", lossless=True, method=4)
    assert np.array_equal(np.asarray(Image.open(out).convert(im.mode)), np.asarray(im)), p
    print(out.name, p.stat().st_size // 1024, "->", out.stat().st_size // 1024, "KB")
    p.unlink()

path = PUB / "data" / "sites.json"
s = path.read_text(encoding="utf-8").replace("_nrm.png", "_nrm.webp").replace("nrm_cap_2048.png", "nrm_cap_2048.webp").replace("southpole_normal.png", "southpole_normal.webp")
path.write_text(s, encoding="utf-8")
print("sites.json updated")
