"""
Wide south-polar imagery for the Orbit globe: fills the band between about 60°S and the
existing 300 km polar cap, where the global colour map is washed out.

Input (data_raw/):
  WAC_ROI_SOUTH_SUMMER_100M.TIF  LROC WAC South Pole Summer Mosaic, 643 nm, 100 m/px, polar
                                 stereographic (same file as build_polar_products.py).
  public/textures/moon_color_8k.jpg  global colour map (large-scale brightness reference only)

Output:
  public/textures/polar/wac_wide_{4096,2048}.jpg   imagery, ±WIDE_KM around the pole

Method. The mosaic is box-downsampled (never upsampled) onto the ±WIDE_KM grid. Its large-scale
brightness is then matched to the global map: both are blurred over about 70 km and the mosaic
is multiplied by their ratio, so the two layers meet without a visible step while every crater
and ridge still comes from the measured mosaic. Nothing is synthesised.
"""
from __future__ import annotations

import pathlib
import sys

import numpy as np
from PIL import Image, ImageFilter

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import build_polar_products as bpp  # noqa: E402
import process_dem as pdm  # noqa: E402

Image.MAX_IMAGE_PIXELS = None
ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "textures" / "polar"
WIDE_KM = 960.0  # stereographic radius of 59.4°S; the shader blends in between 60°S and 64°S
SHADOW_DN = 25  # same baked-shadow threshold as the 300 km cap


def downsample(arr, scale, x0, y0, size):
    step = 2 * WIDE_KM / size
    k = max(1, int(round(step / scale)))
    out = np.zeros((size, size), np.float32)
    lit = np.zeros((size, size), np.float32)
    g = (np.arange(size) + 0.5) * step - WIDE_KM
    offs = (np.arange(k) - (k - 1) / 2) * step / k
    for i in range(size):
        y = WIDE_KM - (i + 0.5) * step
        acc = np.zeros(size, np.float32)
        nlit = np.zeros(size, np.float32)
        for a in offs:
            for b in offs:
                r, c = bpp.wac_rc(g + b, np.full(size, y + a), scale, x0, y0)
                v = np.asarray(bpp.sample(arr, r, c), dtype=np.float32)
                acc += v
                nlit += v > SHADOW_DN
        out[i] = acc / (k * k)
        lit[i] = nlit / (k * k)
        if i % 512 == 0:
            print(f"  row {i}/{size}", flush=True)
    return out, lit


def global_luminance(size):
    g = np.asarray(Image.open(ROOT / "public" / "textures" / "moon_color_8k.jpg").convert("L"), dtype=np.float32)
    H, W = g.shape
    step = 2 * WIDE_KM / size
    xs = (np.arange(size) + 0.5) * step - WIDE_KM
    X, Y = np.meshgrid(xs, WIDE_KM - (np.arange(size) + 0.5) * step)
    lat, lon = pdm.xy_to_ll(X, Y)
    col = np.clip(((np.mod(lon + 180.0, 360.0)) / 360.0 * W).astype(np.int64), 0, W - 1)
    row = np.clip(((90.0 - lat) / 180.0 * H).astype(np.int64), 0, H - 1)
    return g[row, col]


def blur(a, sigma):
    """Gaussian low-pass of a float image: box-reduce by 8, separable kernel, bilinear back up."""
    n = a.shape[0]
    f = 8
    small = a.reshape(n // f, f, n // f, f).mean(axis=(1, 3))
    sg = sigma / f
    r = int(3 * sg)
    k = np.exp(-0.5 * (np.arange(-r, r + 1) / sg) ** 2)
    k /= k.sum()
    pad = np.pad(small, r, mode="edge")
    tmp = np.apply_along_axis(lambda v: np.convolve(v, k, mode="valid"), 0, pad)
    out = np.apply_along_axis(lambda v: np.convolve(v, k, mode="valid"), 1, tmp)
    return np.asarray(Image.fromarray(out.astype(np.float32), "F").resize((n, n), Image.BILINEAR), dtype=np.float32)


def main():
    arr, scale, x0, y0 = bpp.open_wac()
    n = arr.shape[0]
    print(f"WAC mosaic {arr.shape}, {scale * 1000:.0f} m/px, UL=({x0:.1f},{y0:.1f}) km, half-width {n * scale / 2:.0f} km")
    assert n * scale / 2 >= WIDE_KM, "mosaic does not reach the wide extent"
    bpp.orientation_check(arr, scale, x0, y0)

    size = 4096
    cache = ROOT / "data_raw" / "wide_cache.npz"
    if cache.exists():
        z = np.load(cache)
        wac, lit = z["wac"], z["lit"]
    else:
        wac, lit = downsample(arr, scale, x0, y0, size)
        np.savez(cache, wac=wac, lit=lit)
    glob = global_luminance(size)
    sigma = 70.0 / (2 * WIDE_KM / size)  # ~70 km
    w = np.clip(lit, 0, 1)
    num = blur(glob * w, sigma)
    den = blur(wac * w, sigma)
    ratio = np.clip(num / np.maximum(den, 1e-3), 0.6, 3.0)
    print(f"brightness ratio: median {np.median(ratio):.3f}, 5-95% {np.percentile(ratio, 5):.3f}-{np.percentile(ratio, 95):.3f}")
    out = np.clip(wac * ratio, 0, 255)
    full = Image.fromarray(out.astype(np.uint8), "L")
    full.save(OUT / "wac_wide_4096.jpg", quality=88, optimize=True)
    full.resize((2048, 2048), Image.BOX).save(OUT / "wac_wide_2048.jpg", quality=88, optimize=True)
    # side-by-side check image (not shipped)
    chk = Image.new("L", (2048, 1024))
    chk.paste(full.resize((1024, 1024), Image.BOX), (0, 0))
    chk.paste(Image.fromarray(np.clip(glob, 0, 255).astype(np.uint8), "L").resize((1024, 1024), Image.BOX), (1024, 0))
    chk.save(ROOT / "data_raw" / "wide_check.jpg", quality=85)
    for f in ("wac_wide_4096.jpg", "wac_wide_2048.jpg"):
        print("wrote", f, (OUT / f).stat().st_size // 1024, "KB")


if __name__ == "__main__":
    main()
