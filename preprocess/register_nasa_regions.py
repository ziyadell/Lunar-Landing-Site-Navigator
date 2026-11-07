"""
Locate NASA's nine Artemis III candidate regions on the LOLA/WAC polar grid.

NASA has not published coordinates for the regions. The only official geometry is the
map in the release of 2024-10-28 ("artemis-iii-landing-region-candidates.jpg", credit
NASA/GSFC/ASU/JSC/AGDT; also Image 1 of George et al., LPSC 2026 #1901), which draws each
region as a yellow box on an LROC WAC mosaic with a 50 km scale bar and a South Pole star.

This script:
  1. registers that map to our own LROC WAC South Pole Summer Mosaic cap (polar
     stereographic, +y toward 0 deg E) with a 4-parameter similarity transform
     (scale, rotation, pole position) by maximising normalised cross-correlation of the
     imagery, starting from the scale bar and the star;
  2. finds the yellow boxes and converts their edges to polar-stereographic km and lat/lon.

The result is a digitised outline of a published map, not a NASA coordinate list.
Its accuracy is bounded by the map's resolution (about 0.28 km/px), line width and
the registration residual. All of them are recorded in the output.

usage: python register_nasa_regions.py <nasa_map.jpg> [out.json]
"""
from __future__ import annotations

import json
import math
import pathlib
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

ROOT = pathlib.Path(__file__).resolve().parents[1]
CAP = ROOT / "public" / "textures" / "polar" / "wac_cap_4096.jpg"
CAP_KM = 300.0
R_M = 1737.4

# Box labels, assigned by position on the map (checked visually against the printed labels).
LABEL_NEAREST = {
    "peak-near-cabeus-b": (100, 510),
    "haworth": (610, 437),
    "malapert-massif": (745, 325),
    "mons-mouton-plateau": (1060, 230),
    "mons-mouton": (1007, 338),
    "nobile-rim-1": (1046, 367),
    "nobile-rim-2": (1308, 421),
    "de-gerlache-rim-2": (572, 678),
    "slater-plain": (997, 940),
}


def main():
    nasa_path = pathlib.Path(sys.argv[1])
    out_path = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else ROOT / "preprocess" / "nasa_regions.json"
    rgb = np.asarray(Image.open(nasa_path).convert("RGB"), np.float32)
    R, G, B = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    yellow = (R > 170) & (G > 170) & (B < 110)
    gray = rgb.mean(-1)
    H, W = gray.shape

    mask = ~ndi.binary_dilation(yellow, iterations=4)
    mask[int(H * 0.9):, : int(W * 0.21)] = False  # scale bar
    mask[int(H * 0.96):, int(W * 0.77):] = False  # credit
    green = (G > 150) & (R < 120) & (B < 120)
    mask &= ~ndi.binary_dilation(green, iterations=6)
    mask &= ~ndi.binary_dilation(gray > 248, iterations=3)  # white labels

    cap = np.asarray(Image.open(CAP).convert("L"), np.float32)
    step_km = 2 * CAP_KM / cap.shape[0]

    # scale bar: 50 km between the 0 and 50 ticks (measured on the image: x = 47..226)
    s0 = 50.0 / (226 - 47)
    ys, xs = np.mgrid[0:H:3, 0:W:3]
    m = mask[::3, ::3]
    g = gray[::3, ::3][m]
    xs = xs[m].astype(np.float32)
    ys = ys[m].astype(np.float32)
    g = (g - g.mean()) / g.std()

    def to_km(p, px, py):
        s, th, tx, ty = p
        c, sn = math.cos(th), math.sin(th)
        u = px - tx
        v = -(py - ty)
        return s * (c * u - sn * v), s * (sn * u + c * v)

    def score(p):
        X, Y = to_km(p, xs, ys)
        val = ndi.map_coordinates(cap, [(CAP_KM - Y) / step_km - 0.5, (X + CAP_KM) / step_km - 0.5], order=1)
        val = (val - val.mean()) / val.std()
        return float((val * g).mean())

    best = (s0, 0.0, 745.0, 765.0)  # star centre
    bs = score(best)
    init = bs
    for st in [(0.004, 0.01, 6, 6), (0.0015, 0.004, 2, 2), (0.0005, 0.0015, 0.7, 0.7), (0.0002, 0.0005, 0.25, 0.25)]:
        improved = True
        while improved:
            improved = False
            for i in range(4):
                for d in (-1, 1):
                    p = list(best)
                    p[i] += d * st[i]
                    sc = score(p)
                    if sc > bs:
                        bs, best, improved = sc, tuple(p), True
    print("init ncc", round(init, 4), "-> fit", [round(v, 5) for v in best], "ncc", round(bs, 4))

    # local check: sub-window NCC shift in 6 tiles -> registration residual (km)
    resid = []
    for (cx, cy) in [(300, 300), (700, 250), (1100, 300), (300, 800), (700, 900), (1150, 800)]:
        sel = (np.abs(xs - cx) < 180) & (np.abs(ys - cy) < 180)
        bsl, bo = -9, (0, 0)
        for dx in np.arange(-4, 4.01, 0.5):
            for dy in np.arange(-4, 4.01, 0.5):
                X, Y = to_km(best, xs[sel], ys[sel])
                val = ndi.map_coordinates(cap, [(CAP_KM - (Y + dy)) / step_km - 0.5, (X + dx + CAP_KM) / step_km - 0.5], order=1)
                gg = g[sel]
                val = (val - val.mean()) / val.std()
                sc = float((val * (gg - gg.mean()) / gg.std()).mean())
                if sc > bsl:
                    bsl, bo = sc, (float(dx), float(dy))
        resid.append({"tilePx": [cx, cy], "shiftKm": bo, "ncc": round(bsl, 3)})
    print("tile residuals", resid)

    lab, _ = ndi.label(ndi.binary_closing(yellow, iterations=2))
    rects = []
    for sl in ndi.find_objects(lab):
        h = sl[0].stop - sl[0].start
        w = sl[1].stop - sl[1].start
        if h > 40 and w > 40:
            rects.append((sl[1].start, sl[0].start, sl[1].stop - 1, sl[0].stop - 1))
    # overlapping Mons Mouton / Nobile Rim 1 boxes merge into one component: split by line scan
    out = {}
    used = set()
    hollow = ndi.binary_closing(yellow, iterations=2)
    # find rectangles via edge runs: rows/cols with long yellow runs
    def runs(line, minlen):
        res, start = [], None
        for i, v in enumerate(np.append(line, False)):
            if v and start is None:
                start = i
            elif not v and start is not None:
                if i - start >= minlen:
                    res.append((start, i - 1))
                start = None
        return res
    hseg = []
    for y in range(H):
        for a, b in runs(hollow[y], 45):
            hseg.append((y, a, b))
    vseg = []
    for x in range(W):
        for a, b in runs(hollow[:, x], 45):
            vseg.append((x, a, b))
    # candidate rectangles: pair top & bottom horizontal segments sharing x-extent, verify verticals
    def merge(segs):
        segs = sorted(segs)
        merged = []
        for s in segs:
            if merged and s[0] - merged[-1][0] <= 6 and abs(s[1] - merged[-1][1]) <= 6 and abs(s[2] - merged[-1][2]) <= 6:
                merged[-1] = (s[0], min(s[1], merged[-1][1]), max(s[2], merged[-1][2]), merged[-1][3])
            else:
                merged.append((s[0], s[1], s[2], s[0]))
        return [(m[3], m[0], m[1], m[2]) for m in merged]  # (first, last, a, b)
    hs = merge(hseg)
    vs = merge(vseg)
    cands = []
    for i, t in enumerate(hs):
        for bt in hs[i + 1:]:
            x0, x1 = max(t[2], bt[2]), min(t[3], bt[3])
            if x1 - x0 < 45 or abs(t[2] - bt[2]) > 8 or abs(t[3] - bt[3]) > 8:
                continue
            y0, y1 = (t[0] + t[1]) / 2, (bt[0] + bt[1]) / 2
            if y1 - y0 < 45:
                continue
            xl, xr = (t[2] + bt[2]) / 2, (t[3] + bt[3]) / 2
            okl = any(abs(v[2] - xl) <= 4 or True for v in [])
            def has_v(xx):
                return any(abs((v[0] + v[1]) / 2 - xx) <= 5 and v[2] <= y0 + 6 and v[3] >= y1 - 6 for v in vs)
            if has_v(xl) and has_v(xr):
                cands.append((xl, y0, xr, y1))
    # keep innermost-consistent rectangles: dedupe near-identical
    rect_list = []
    for c in sorted(cands, key=lambda r: (r[2] - r[0]) * (r[3] - r[1])):
        if not any(all(abs(c[k] - d[k]) < 6 for k in range(4)) for d in rect_list):
            rect_list.append(c)
    print("rectangles", [tuple(round(v) for v in r) for r in rect_list])
    for rid, (lx, ly) in LABEL_NEAREST.items():
        best_r = min(rect_list, key=lambda r: math.hypot((r[0] + r[2]) / 2 - lx, (r[1] + r[3]) / 2 - ly))
        x0, y0, x1, y1 = best_r
        cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
        X, Y = to_km(best, cx, cy)
        corners = [to_km(best, px, py) for px, py in [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]]
        r = math.hypot(X, Y)
        lat = -(90 - math.degrees(2 * math.atan(r / (2 * R_M))))
        lon = math.degrees(math.atan2(X, Y))
        out[rid] = {
            "boxPx": [round(v, 1) for v in best_r],
            "centreKm": [round(X, 2), round(Y, 2)],
            "cornersKm": [[round(a, 2), round(b, 2)] for a, b in corners],
            "sizeKm": [round((x1 - x0) * best[0], 1), round((y1 - y0) * best[0], 1)],
            "centreLatDeg": round(lat, 3),
            "centreLonDeg": round(lon, 3),
        }
        print(rid, out[rid])
    json.dump(
        {
            "source": {
                "title": "NASA Provides Update on Artemis III Moon Landing Regions (map)",
                "url": "https://www.nasa.gov/wp-content/uploads/2024/10/artemis-iii-landing-region-candidates.jpg",
                "release": "https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/",
                "credit": "NASA/GSFC/ASU/JSC/AGDT",
                "imagePx": [W, H],
            },
            "fit": {"kmPerPx": best[0], "rotationDeg": math.degrees(best[1]), "polePx": [best[2], best[3]],
                    "ncc": bs, "nccInitial": init, "tileResiduals": resid},
            "regions": out,
        },
        open(out_path, "w"),
        indent=1,
    )


if __name__ == "__main__":
    main()
