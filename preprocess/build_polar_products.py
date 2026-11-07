"""
High-resolution south-polar products for close zoom (Orbital View) and Surface View.

Inputs (data_raw/):
  WAC_ROI_SOUTH_SUMMER_100M.TIF  LROC WAC South Pole Summer Mosaic, 643 nm, 100 m/px,
                                 polar stereographic (R = 1737.4 km), images 2010-09-21..10-23
                                 chosen for minimal shadows (Speyerer et al. 2020, LSSW #5132).
      https://pds.lroc.im-ldi.com/data/LRO-L-LROC-5-RDR-V1.0/LROLRC_2001/EXTRAS/BROWSE/WAC_ROI/WAC_ROI_SOUTH_SUMMER/
  ldem_80s_80m.img               LOLA 80 m polar DEM (see process_dem.py)
  public/textures/moon_color_4k.jpg  (for brightness matching)

Outputs:
  public/textures/polar/wac_cap_{4096,2048}.jpg    imagery, ±300 km around the pole (146 / 293 m/px)
  public/textures/polar/nrm_cap_2048.png           LOLA (lossless: JPEG blocks show under grazing light) normals, ±300 km (293 m/px, mobile tier)
  public/textures/polar/<site>_wac.jpg             2048² native 100 m crop centred on the observation point
  public/textures/polar/<site>_nrm.png             2048² LOLA object-space normals on the same grid
  public/data/terrain/<site>_regional.bin          301² heights, 1 km spacing (±150 km) for Surface View
  public/data/sites.json                           updated with these product descriptors

No resampling to a finer grid than the source: the site crops are pixel-aligned
100 m source pixels; the cap textures are downsampled (box filter).
"""
from __future__ import annotations

import json
import math
import pathlib
import sys

import numpy as np
from PIL import Image

sys.path.insert(0, str(pathlib.Path(__file__).parent))
import process_dem as pdm  # noqa: E402

Image.MAX_IMAGE_PIXELS = None
ROOT = pathlib.Path(__file__).resolve().parents[1]
RAW = ROOT / "data_raw" / "WAC_ROI_SOUTH_SUMMER_100M.TIF"
OUT_TEX = ROOT / "public" / "textures" / "polar"
OUT_DATA = ROOT / "public" / "data"

CAP_KM = 300.0
WIN_PX = 2048
WIN_M = 100.0


def open_wac():
    im = Image.open(RAW)
    tags = im.tag_v2
    n = im.size[0]
    assert im.size == (n, n) and im.mode == "L"
    scale = tags[33550][0]  # m / px
    x0, y0 = tags[33922][3], tags[33922][4]  # upper-left corner, m
    offsets = tags[273]
    off = offsets[0]
    assert offsets[1] - offsets[0] == n, "expected contiguous uncompressed rows"
    arr = np.memmap(RAW, dtype=np.uint8, mode="r", offset=off, shape=(n, n))
    return arr, scale / 1000.0, x0 / 1000.0, y0 / 1000.0  # km units


def wac_rc(x_km, y_km, scale, x0, y0):
    """Fractional (row, col) of pixel centres for projected x, y (km)."""
    return (y0 - y_km) / scale - 0.5, (x_km - x0) / scale - 0.5


def sample(arr, row, col):
    r = np.clip(np.round(row).astype(np.int64), 0, arr.shape[0] - 1)
    c = np.clip(np.round(col).astype(np.int64), 0, arr.shape[1] - 1)
    return arr[r, c]


def orientation_check(arr, scale, x0, y0):
    # Permanently shadowed crater floors (IAU centres) must be dark in the mosaic.
    psr = {"Shackleton": (-89.67, 129.78), "Haworth": (-87.45, -5.17), "Faustini": (-87.18, 84.31),
           "Shoemaker": (-88.14, 44.91), "Cabeus": (-85.33, -42.13)}
    res = {}
    for name, (la, lo) in psr.items():
        vals = []
        for lon in (lo, -lo, 180 - lo, lo + 180):
            x, y = pdm.ll_to_xy(la, lon)
            r, c = wac_rc(np.array([x]), np.array([y]), scale, x0, y0)
            rr, cc = int(r[0]), int(c[0])
            vals.append(int(np.asarray(arr[rr - 5:rr + 6, cc - 5:cc + 6], dtype=np.float32).mean()))
        res[name] = vals
    print("orientation (correct, mirrored, flipped, rotated):", res)
    ok = all(v[0] <= min(v[1:]) + 3 for v in res.values())
    assert ok, "WAC orientation check failed"
    return res


def global_ring_mean():
    g = np.asarray(Image.open(ROOT / "public" / "textures" / "moon_color_4k.jpg").convert("L"), dtype=np.float32)
    H, W = g.shape
    lat = 90 - (np.arange(H) + 0.5) * 180 / H
    rows = (lat <= -80.5) & (lat >= -83.0)
    return float(g[rows].mean())


def cap_image(arr, scale, x0, y0, size):
    """Box-downsample the mosaic onto the ±CAP_KM grid."""
    step = 2 * CAP_KM / size
    k = max(1, int(round(step / scale)))
    out = np.zeros((size, size), np.float32)
    g = (np.arange(size) + 0.5) * step - CAP_KM
    for i in range(size):
        y = CAP_KM - (i + 0.5) * step
        acc = np.zeros(size, np.float32)
        for a in range(k):
            for b in range(k):
                yy = y + (a - (k - 1) / 2) * scale
                xx = g + (b - (k - 1) / 2) * scale
                r, c = wac_rc(xx, np.full_like(xx, yy), scale, x0, y0)
                acc += sample(arr, r, c)
        out[i] = acc / (k * k)
    return out


def box_prefilter(dem, step_km):
    """Separable box low-pass so a grid of spacing `step_km` samples the DEM without aliasing
    (point-sampling the 80 m grid at 146/293 m produced a ~1 km moiré in the normals)."""
    k = int(round(step_km / pdm.SCALE_KM))
    if k <= 1:
        return dem
    out = dem.astype(np.float64)
    for axis in (0, 1):
        c = np.cumsum(np.pad(out, [(k // 2 + 1, k - k // 2)] * 1 + [(0, 0)] if axis == 0 else [(0, 0), (k // 2 + 1, k - k // 2)], mode="edge"), axis=axis)
        out = (np.take(c, range(k, k + out.shape[axis]), axis=axis) - np.take(c, range(0, out.shape[axis]), axis=axis)) / k
    return out.astype(np.float32)


def normals_grid(dem, cx, cy, half_km, size):
    """Object-space normals (three.js frame) on a size² grid centred at (cx, cy) km."""
    step = 2 * half_km / size
    g = (np.arange(size) + 0.5) * step - half_km
    rgb = np.empty((size, size, 3), np.uint8)
    strip = 256
    for r0 in range(0, size, strip):
        r1 = min(size, r0 + strip)
        lo, hi = max(0, r0 - 1), min(size, r1 + 1)
        Y = (cy + half_km - (np.arange(lo, hi) + 0.5) * step)[:, None] * np.ones((1, size))
        X = np.ones((hi - lo, 1)) * (cx + g)[None, :]
        h = pdm.bilinear(dem, *pdm.xy_to_pix(X, Y))
        h = np.where(np.isnan(h), 0, h)
        lat, lon = pdm.xy_to_ll(X, Y)
        P = pdm.unit(lat, lon) * (pdm.R_KM + h[..., None] / 1000)
        P3 = np.stack([P[..., 0], P[..., 2], -P[..., 1]], axis=-1)
        n = np.cross(np.gradient(P3, axis=1), -np.gradient(P3, axis=0))
        n /= np.linalg.norm(n, axis=-1, keepdims=True)
        o = pdm.unit(lat, lon)
        o3 = np.stack([o[..., 0], o[..., 2], -o[..., 1]], axis=-1)
        n[np.sum(n * o3, axis=-1) < 0] *= -1
        sl = slice(r0 - lo, r0 - lo + (r1 - r0))
        rgb[r0:r1] = np.clip((n[sl] * 0.5 + 0.5) * 255 + 0.5, 0, 255).astype(np.uint8)
    return rgb


def main():
    OUT_TEX.mkdir(parents=True, exist_ok=True)
    arr, scale, x0, y0 = open_wac()
    print(f"WAC mosaic {arr.shape}, {scale * 1000:.0f} m/px, UL=({x0:.1f},{y0:.1f}) km")
    orient = orientation_check(arr, scale, x0, y0)

    sites_only = "--sites-only" in sys.argv
    if sites_only:
        prev = json.loads((OUT_DATA / "sites.json").read_text()).get("_polarImagery_prev") or {}
        gain = float(prev.get("brightnessGain") or 1.5402)  # value recorded by the full run
        print("sites only; brightness gain", gain)
    else:
        # Brightness: match the mosaic's lit-pixel mean in an 80.5–83°S ring to the global map's mean there.
        # Pixels < 25 DN are baked shadows; the app treats them as 'no albedo data' (see moonMaterial.ts).
        xs = np.linspace(-280, 280, 600)
        X, Y = np.meshgrid(xs, xs)
        lat, _ = pdm.xy_to_ll(X, Y)
        ring = (lat <= -80.5) & (lat >= -83.0)
        r, c = wac_rc(X[ring], Y[ring], scale, x0, y0)
        vals = np.asarray(sample(arr, r, c), dtype=np.float32)
        wac_mean = float(vals[vals > 25].mean())
        gmean = global_ring_mean()
        gain = gmean / max(wac_mean, 1.0)
        print(f"brightness gain {gain:.3f} (global {gmean:.1f} / WAC lit {wac_mean:.1f})")
        for size in (4096, 2048):
            img = np.clip(cap_image(arr, scale, x0, y0, size) * gain, 0, 255).astype(np.uint8)
            Image.fromarray(img, "L").save(OUT_TEX / f"wac_cap_{size}.jpg", quality=90, optimize=True)
            print("wrote wac_cap", size)

    dem, _ = pdm.load_dem()
    if not sites_only:
        for size, name in ((2048, "polar/nrm_cap_2048.png"), (4096, "southpole_normal.png")):
            step = 2 * CAP_KM / size
            Image.fromarray(normals_grid(box_prefilter(np.asarray(dem, np.float32) * 0.5, step), 0.0, 0.0, CAP_KM, size), "RGB").save(OUT_TEX.parent / name, optimize=True)
            print("wrote", name)

    pad = pdm.Coarse(dem, 12)  # 1 km regional tile from a 12×12 block-mean of the 80 m DEM

    sites = json.loads((OUT_DATA / "sites.json").read_text())
    for reg in sites["regions"]:
        p = reg["observationPoint"]
        x, y = pdm.ll_to_xy(p["latDeg"], p["lonDeg"])
        # Snap the window to the source pixel grid (no resampling of imagery).
        rr, cc = wac_rc(np.array([float(x)]), np.array([float(y)]), scale, x0, y0)
        r0 = int(round(rr[0])) - WIN_PX // 2
        c0 = int(round(cc[0])) - WIN_PX // 2
        crop = np.asarray(arr[r0:r0 + WIN_PX, c0:c0 + WIN_PX], dtype=np.float32)
        Image.fromarray(np.clip(crop * gain, 0, 255).astype(np.uint8), "L").save(OUT_TEX / f"{reg['id']}_wac.jpg", quality=92, optimize=True)
        cx = x0 + (c0 + WIN_PX / 2) * scale
        cy = y0 - (r0 + WIN_PX / 2) * scale
        half = WIN_PX * scale / 2
        Image.fromarray(normals_grid(dem, cx, cy, half, WIN_PX), "RGB").save(OUT_TEX / f"{reg['id']}_nrm.png", optimize=True)
        reg["detail"] = {
            "imagery": f"textures/polar/{reg['id']}_wac.jpg",
            "normals": f"textures/polar/{reg['id']}_nrm.png",
            "centerKm": [round(cx, 4), round(cy, 4)],
            "halfExtentKm": round(half, 4),
            "imageryResolutionM": WIN_M,
            "reliefSource": "LOLA LDEM_80S_80M sampled at 100 m",
        }
        # Regional terrain tile (±150 km at 1 km) for Surface View.
        tile = pdm.terrain_tile(pad, p["latDeg"], p["lonDeg"], p["elevationM"], 301, 1000.0)
        tile = np.where(np.isnan(tile), -20000, tile).astype("<f4")
        (OUT_DATA / "terrain" / f"{reg['id']}_regional.bin").write_bytes(tile.tobytes())
        reg["terrain"]["regional"] = {"file": f"data/terrain/{reg['id']}_regional.bin", "n": 301, "spacingM": 1000.0,
                                      "note": "12×12 block-mean of LDEM_80S_80M; cells outside the 80°S product set to −20 km"}
        print("site products", reg["id"])

    if sites_only:
        sites["polarImagery"] = sites.get("_polarImagery_prev") or sites.get("polarImagery")
        sites.pop("_polarImagery_prev", None)
        sites["polarCap"]["standard"] = "textures/polar/nrm_cap_2048.png"
        (OUT_DATA / "sites.json").write_text(json.dumps(sites, indent=1))
        print("updated sites.json (sites only)")
        return
    sites["polarImagery"] = {
        "product": "LROC WAC South Pole Summer Mosaic (WAC_ROI_SOUTH_SUMMER_100M)",
        "source": "https://pds.lroc.im-ldi.com/data/LRO-L-LROC-5-RDR-V1.0/LROLRC_2001/EXTRAS/BROWSE/WAC_ROI/WAC_ROI_SOUTH_SUMMER/",
        "acquired": "2010-09-21 to 2010-10-23 (selected for minimal shadows)",
        "band": "643 nm",
        "nativeResolutionM": 100,
        "cap": {"high": "textures/polar/wac_cap_4096.jpg", "standard": "textures/polar/wac_cap_2048.jpg", "extentKm": CAP_KM},
        "brightnessGain": round(gain, 4),
        "orientationCheck": orient,
    }
    sites["polarCap"]["standard"] = "textures/polar/nrm_cap_2048.png"
    (OUT_DATA / "sites.json").write_text(json.dumps(sites, indent=1))
    print("updated sites.json")


if __name__ == "__main__":
    main()
