"""
Build web textures for the global Moon from the NASA SVS "CGI Moon Kit"
(https://svs.gsfc.nasa.gov/4720/), which is derived from LRO data:

  lroc_color_poles_8k.tif  LROC WAC colour mosaic (with polar fill), equirectangular,
                           longitude -180..180 left to right, latitude 90..-90 top to bottom
  ldem_16.tif              LOLA elevation, 16 px/deg, km relative to 1737.4 km

Outputs (public/textures/):
  moon_color_{8k,4k}.jpg      sRGB albedo/colour base maps (8K used on high-DPI screens)
  moon_normal_{4k,2k}.jpg     tangent-space normal map computed from LOLA at true
                              vertical scale (no exaggeration). +X = east, +Y = north.
  tiles/c_<row>_<col>.jpg     16K colour mosaic (lroc_color_poles_16k.tif) as 8x4 tiles of 2048 px

Usage:  python preprocess/build_globe_textures.py
Needs:  numpy, Pillow
"""
from __future__ import annotations

import pathlib

import numpy as np
from PIL import Image

Image.MAX_IMAGE_PIXELS = None
ROOT = pathlib.Path(__file__).resolve().parents[1]
RAW = ROOT / "data_raw"
OUT = ROOT / "public" / "textures"
R_KM = 1737.4


def colour() -> None:
    img = Image.open(RAW / "lroc_color_poles_8k.tif").convert("RGB")
    print("colour source", img.size)
    for w, q in ((8192, 86), (4096, 88)):  # 8K base for high-DPI screens; 4K otherwise; zoom detail from 16K tiles
        im = img if img.size[0] == w else img.resize((w, w // 2), Image.LANCZOS)
        p = OUT / f"moon_color_{w // 1024}k.jpg"
        im.save(p, quality=q, optimize=True, progressive=True)
        print("wrote", p.name, f"{p.stat().st_size / 1e6:.2f} MB")


def normals() -> None:
    dem = np.asarray(Image.open(RAW / "ldem_16.tif"), dtype=np.float32)  # km
    print("ldem_16", dem.shape, float(dem.min()), float(dem.max()))
    # downsample 5760x2880 -> 4096x2048 for the texture grid
    W, H = 4096, 2048
    im = Image.fromarray(dem, mode="F").resize((W, H), Image.BILINEAR)
    h = np.asarray(im, dtype=np.float64)
    lat = np.deg2rad(90 - (np.arange(H) + 0.5) * 180 / H)[:, None]
    dlon = 2 * np.pi / W
    dlat = np.pi / H
    dx = (R_KM * np.maximum(np.cos(lat), 0.02)) * dlon  # km per px eastward
    dy = R_KM * dlat
    hx = (np.roll(h, -1, axis=1) - np.roll(h, 1, axis=1)) / (2 * dx)
    hn = np.empty_like(h)
    hn[1:-1] = (h[:-2] - h[2:]) / (2 * dy)  # row above is north
    hn[0] = hn[1]
    hn[-1] = hn[-2]
    n = np.stack([-hx, -hn, np.ones_like(h)], axis=-1)
    n /= np.linalg.norm(n, axis=-1, keepdims=True)
    rgb = np.clip((n * 0.5 + 0.5) * 255 + 0.5, 0, 255).astype(np.uint8)
    im = Image.fromarray(rgb, "RGB")
    for w in (4096, 2048):
        p = OUT / f"moon_normal_{w // 1024}k.jpg"
        (im if w == W else im.resize((w, w // 2), Image.LANCZOS)).save(p, quality=92, optimize=True)
        print("wrote", p.name, f"{p.stat().st_size / 1e6:.2f} MB")


def tiles() -> None:
    """16K colour mosaic split into 8 x 4 tiles of 2048 px for level-of-detail streaming.
    Tile (row j, col i) covers longitude -180+45i .. -135+45i and latitude 90-45j .. 45-45j."""
    src = RAW / "lroc_color_poles_16k.tif"
    if not src.exists():
        print("skip tiles: 16k source missing")
        return
    img = Image.open(src).convert("RGB")
    assert img.size == (16384, 8192), img.size
    d = OUT / "tiles"
    d.mkdir(exist_ok=True)
    total = 0
    for j in range(4):
        for i in range(8):
            t = img.crop((i * 2048, j * 2048, (i + 1) * 2048, (j + 1) * 2048))
            p = d / f"c_{j}_{i}.jpg"
            t.save(p, quality=86, optimize=True, progressive=True)
            total += p.stat().st_size
    print(f"wrote 32 tiles, {total / 1e6:.1f} MB")


if __name__ == "__main__":
    OUT.mkdir(parents=True, exist_ok=True)
    colour()
    normals()
    tiles()
