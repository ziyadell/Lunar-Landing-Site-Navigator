"""
Derive site data products from the LOLA south polar DEM.

Input  : data_raw/ldem_80s_80m.img (+ .lbl)  — LRO LOLA GDR, PDS Geosciences Node
         https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/
         80 m/px, polar stereographic (spherical, R = 1737.4 km), 80°S–90°S,
         int16 DN, height (m) = DN * 0.5 relative to 1737.4 km, MEAN EARTH/POLAR AXIS (DE421).

Outputs:
  public/data/sites.json                 regions, observation points, horizon profiles
  public/data/terrain/<id>.bin           float32 local heightfield for Surface View
  (polar-cap normals, imagery and site detail: see build_polar_products.py, run afterwards)

Method summary (also documented in docs/SCIENCE.md):
  * Observation point: a reproducible rule per region (see REGIONS below), applied
    to a 3x3-smoothed copy of the DEM. It is NOT a NASA-designated landing site.
  * Horizon profile: for 720 azimuths (0.5°), march outward along great circles
    from 80 m to 150 km, bilinearly sample the DEM, and take the maximum elevation
    angle of terrain seen from an observer 2 m above the surface. Curvature is
    handled exactly with 3-D vectors on the 1737.4 km sphere.

Usage:  python preprocess/process_dem.py
Needs:  numpy, Pillow
"""
from __future__ import annotations

import json
import math
import pathlib
from datetime import datetime, timezone

import numpy as np
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parents[1]
RAW = ROOT / "data_raw" / "ldem_80s_80m.img"
OUT_DATA = ROOT / "public" / "data"
OUT_TEX = ROOT / "public" / "textures"

R_KM = 1737.4
N_PIX = 7600
SCALE_KM = 0.080
OFFSET_PIX = 3799.5
OBSERVER_H_M = 2.0
AZ_STEP = 0.5
MAX_DIST_KM = 150.0
TILE_N = 301  # samples per side (24 km at 80 m)
TILE_SPACING_M = 80.0
FAR_N = 301  # 120 km at 400 m
FAR_SPACING_M = 400.0

GAZ = "https://planetarynames.wr.usgs.gov/Feature/"

# Region geometry: NASA's official map of the nine regions (release 2024-10-28),
# registered to the LROC WAC mosaic by register_nasa_regions.py -> nasa_regions.json.
NASA_BOXES = json.loads((pathlib.Path(__file__).parent / "nasa_regions.json").read_text())["regions"]
RULE = ("Observation point = of candidate points on a {g:g} km grid inside NASA's published region outline, "
        "with local slope at most {s:g}° (LOLA, 240 m baseline), the one where the Sun's centre is above the "
        "LOLA terrain horizon for the largest fraction of 2027 (hourly). A representative point for this "
        "analysis, not a NASA landing site.")
MAX_SLOPE_DEG = 10.0
L24 = "Artemis III candidate region in NASA's refined list of nine (Oct 28, 2024)"
L22 = "Artemis III candidate region in NASA's Aug 2022 list and its refined list of nine (Oct 28, 2024)"

# Reference features: IAU Gazetteer of Planetary Nomenclature (retrieved 2026-11-07), used for naming only.
F_MALAPERT = {"name": "Mons Malapert", "type": "Mons", "latDeg": -85.98, "lonDeg": -1.67, "diameterKm": 67.0, "gazetteerId": 16338}
F_MOUTON = {"name": "Mons Mouton", "type": "Mons", "latDeg": -84.60, "lonDeg": 31.00, "diameterKm": 130.0, "gazetteerId": 16070}
F_NOBILE = {"name": "Nobile", "type": "Crater", "latDeg": -85.28, "lonDeg": 53.27, "diameterKm": 79.27, "gazetteerId": 4321}
REGIONS = [
    {"id": "peak-near-cabeus-b", "name": "Peak near Cabeus B", "nasaListing": L24,
     "feature": {"name": "Cabeus B", "type": "Crater", "latDeg": -82.26, "lonDeg": -54.58, "diameterKm": 59.62, "gazetteerId": 8058}},
    {"id": "haworth", "name": "Haworth", "nasaListing": L22,
     "feature": {"name": "Haworth", "type": "Crater", "latDeg": -87.45, "lonDeg": -5.17, "diameterKm": 51.42, "gazetteerId": 14502}},
    {"id": "malapert-massif", "name": "Malapert Massif", "nasaListing": L22, "feature": F_MALAPERT},
    {"id": "mons-mouton-plateau", "name": "Mons Mouton Plateau", "nasaListing": L24, "feature": F_MOUTON, "gridKm": 2.0},
    {"id": "mons-mouton", "name": "Mons Mouton", "nasaListing": L24, "feature": F_MOUTON},
    {"id": "nobile-rim-1", "name": "Nobile Rim 1", "nasaListing": L22, "feature": F_NOBILE},
    {"id": "nobile-rim-2", "name": "Nobile Rim 2", "nasaListing": L22, "feature": F_NOBILE},
    {"id": "de-gerlache-rim-2", "name": "de Gerlache Rim 2", "nasaListing": L22,
     "feature": {"name": "de Gerlache", "type": "Crater", "latDeg": -88.48, "lonDeg": -88.34, "diameterKm": 32.71, "gazetteerId": 1439}},
    {"id": "slater-plain", "name": "Slater Plain", "nasaListing": L24,
     "feature": {"name": "Slater", "type": "Crater", "latDeg": -88.08, "lonDeg": 111.29, "diameterKm": 25.12, "gazetteerId": None}},
]
for _r in REGIONS:
    _r.setdefault("gridKm", 1.0)
    _b = NASA_BOXES[_r["id"]]
    _r["box"] = _b
    _r["notes"] = [
        f"Region outline digitised from NASA's official map of the nine regions (2024-10-28): about "
        f"{_b['sizeKm'][0]:.0f} × {_b['sizeKm'][1]:.0f} km, centred {abs(_b['centreLatDeg']):.2f}°S "
        f"{abs(_b['centreLonDeg']):.2f}°{'E' if _b['centreLonDeg'] >= 0 else 'W'}. NASA has not published coordinates; "
        "the outline is accurate to about 0.5 km.",
        RULE.format(g=_r["gridKm"], s=MAX_SLOPE_DEG),
    ]

NASA_REFERENCES = [
    {"title": "NASA Provides Update on Artemis III Moon Landing Regions", "date": "2024-10-28",
     "url": "https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/",
     "regions": ["Peak near Cabeus B", "Haworth", "Malapert Massif", "Mons Mouton Plateau", "Mons Mouton",
                 "Nobile Rim 1", "Nobile Rim 2", "de Gerlache Rim 2", "Slater Plain"]},
    {"title": "Artemis III site selection update: down-selection from 13 to 9 candidate regions (George et al., LPSC 2026 #1901)",
     "date": "2026-03", "url": "https://www.hou.usra.edu/meetings/lpsc2026/pdf/1901.pdf"},
    {"title": "NASA Identifies Candidate Regions for Landing Next Americans on Moon (release 22-089)", "date": "2022-08-19",
     "url": "https://www.nasa.gov/news-release/nasa-identifies-candidate-regions-for-landing-next-americans-on-moon/"},
]


# ---------------------------------------------------------------- projection
def ll_to_xy(lat, lon):
    """South polar stereographic (spherical), km. 0° longitude toward +y (image top)."""
    lat = np.asarray(lat, dtype=np.float64)
    lon = np.asarray(lon, dtype=np.float64)
    rho = 2 * R_KM * np.tan(np.pi / 4 + np.deg2rad(lat) / 2)
    return rho * np.sin(np.deg2rad(lon)), rho * np.cos(np.deg2rad(lon))


def xy_to_ll(x, y):
    rho = np.hypot(x, y)
    lat = np.rad2deg(2 * np.arctan(rho / (2 * R_KM))) - 90
    lon = np.rad2deg(np.arctan2(x, y))
    return lat, lon


def xy_to_pix(x, y):
    """0-based (row, col) for DEM pixel centres."""
    return OFFSET_PIX - y / SCALE_KM, x / SCALE_KM + OFFSET_PIX


def bilinear(dem, row, col):
    row = np.asarray(row)
    col = np.asarray(col)
    ok = (row >= 0) & (col >= 0) & (row < dem.shape[0] - 1) & (col < dem.shape[1] - 1)
    r = np.where(ok, row, 0)
    c = np.where(ok, col, 0)
    r0 = np.floor(r).astype(np.int64)
    c0 = np.floor(c).astype(np.int64)
    fr = r - r0
    fc = c - c0
    v = (dem[r0, c0] * (1 - fr) * (1 - fc) + dem[r0, c0 + 1] * (1 - fr) * fc
         + dem[r0 + 1, c0] * fr * (1 - fc) + dem[r0 + 1, c0 + 1] * fr * fc)
    if dem.dtype == np.int16:  # raw LOLA DN (memory-mapped): height = DN * 0.5 m
        v = v * 0.5
    return np.where(ok, v, np.nan)


def height_ll(dem, lat, lon):
    x, y = ll_to_xy(lat, lon)
    if isinstance(dem, Coarse):
        return dem.sample(*xy_to_pix(x, y))
    return bilinear(dem, *xy_to_pix(x, y))


def unit(lat, lon):
    la, lo = np.deg2rad(lat), np.deg2rad(lon)
    return np.stack([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)], axis=-1)


def destination(lat, lon, az, dist_km):
    """Great-circle destination; az clockwise from north, degrees."""
    la1, lo1, a = np.deg2rad(lat), np.deg2rad(lon), np.deg2rad(az)
    d = np.asarray(dist_km) / R_KM
    la2 = np.arcsin(np.sin(la1) * np.cos(d) + np.cos(la1) * np.sin(d) * np.cos(a))
    lo2 = lo1 + np.arctan2(np.sin(a) * np.sin(d) * np.cos(la1), np.cos(d) - np.sin(la1) * np.sin(la2))
    return np.rad2deg(la2), (np.rad2deg(lo2) + 180) % 360 - 180


def gc_distance_km(lat1, lon1, lat2, lon2):
    u1, u2 = unit(lat1, lon1), unit(lat2, lon2)
    return R_KM * np.arccos(np.clip(np.sum(u1 * u2, axis=-1), -1, 1))


# ---------------------------------------------------------------- products
def load_dem():
    """LOLA heights as a read-only memory map of the raw int16 file (height = DN * 0.5 m).
    File-backed, so it costs almost no committed memory. The second value is the grid
    used for slope screening (the same DEM; the 240 m baseline already smooths)."""
    dem = np.memmap(RAW, dtype="<i2", mode="r", shape=(N_PIX, N_PIX))
    return dem, dem


class Coarse:
    """k x k block-mean DEM (metres) sampled bilinearly in full-resolution pixel coordinates.
    Built in row strips to bound memory."""

    def __init__(self, dem, k):
        m = N_PIX // k * k
        self.k = k
        a = np.empty((m // k, m // k), np.float32)
        rows = 40 * k
        for r0 in range(0, m, rows):
            r1 = min(m, r0 + rows)
            blk = np.asarray(dem[r0:r1, :m], dtype=np.float32)
            if dem.dtype == np.int16:
                blk *= 0.5
            a[r0 // k:r1 // k] = blk.reshape((r1 - r0) // k, k, m // k, k).mean(axis=(1, 3))
        self.a = a

    def sample(self, row, col):
        c = (self.k - 1) / 2
        return bilinear(self.a, (np.asarray(row) - c) / self.k, (np.asarray(col) - c) / self.k)


def slope_deg(dem_s, x, y):
    """Local slope (deg) from central differences over +-240 m (3 DEM pixels)."""
    r, c = xy_to_pix(x, y)
    d = 0.240
    hx = bilinear(dem_s, *xy_to_pix(x + d, y)) - bilinear(dem_s, *xy_to_pix(x - d, y))
    hy = bilinear(dem_s, *xy_to_pix(x, y + d)) - bilinear(dem_s, *xy_to_pix(x, y - d))
    return np.rad2deg(np.arctan(np.hypot(hx, hy) / (2 * d * 1000)))


def candidate_points(dem_s, reg):
    """Grid points inside NASA's region outline with slope <= MAX_SLOPE_DEG."""
    xs = [c[0] for c in reg["box"]["cornersKm"]]
    ys = [c[1] for c in reg["box"]["cornersKm"]]
    g = reg["gridKm"]
    gx = np.arange(min(xs) + g / 2, max(xs), g)
    gy = np.arange(min(ys) + g / 2, max(ys), g)
    X, Y = np.meshgrid(gx, gy)
    X, Y = X.ravel(), Y.ravel()
    sl = slope_deg(dem_s, X, Y)
    keep = sl <= MAX_SLOPE_DEG
    print(f"  grid {len(X)} points, {int(keep.sum())} with slope <= {MAX_SLOPE_DEG} deg")
    la, lo = xy_to_ll(X[keep], Y[keep])
    return la, lo


def sun_dirs_2027():
    """Hourly Sun unit vectors (Moon-fixed) for calendar 2027 from the Horizons table."""
    eph = json.loads((OUT_DATA / "ephemeris.json").read_text())
    t0 = datetime.strptime(eph["startUtc"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    a = int((datetime(2027, 1, 1, tzinfo=timezone.utc) - t0).total_seconds() // 3600)
    b = int((datetime(2028, 1, 1, tzinfo=timezone.utc) - t0).total_seconds() // 3600)
    lat = np.array(eph["subSolarLatDeg"][a:b])
    lon = np.array(eph["subSolarLonDeg"][a:b])
    return unit(lat, lon)


def sun_visible_fraction(dem, lat, lon, h0, sun):
    prof = horizon(dem, lat, lon, h0)
    u0 = unit(lat, lon)
    east = np.array([-math.sin(math.radians(lon)), math.cos(math.radians(lon)), 0.0])
    north = np.cross(u0, east)
    el = np.rad2deg(np.arcsin(np.clip(sun @ u0, -1, 1)))
    az = np.rad2deg(np.arctan2(sun @ east, sun @ north)) % 360
    hz = np.interp(az, np.arange(0, 360 + AZ_STEP, AZ_STEP), np.append(prof, prof[0]))
    return float(np.mean(el > hz)), prof


CACHE = pathlib.Path(__file__).parent / "_selection_cache.json"


def select_point(dem, dem_s, reg, sun):
    """Candidate with the greatest fraction of 2027 hours with the Sun's centre above the terrain horizon.
    The winning coordinates are cached per region (the search is slow); the fraction and horizon
    are always recomputed at the stored point."""
    key = f"{reg['id']}|{reg['box']['cornersKm']}|{reg['gridKm']}|{MAX_SLOPE_DEG}"
    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    if key in cache:
        lat, lon = cache[key]
        h0 = float(height_ll(dem, lat, lon))
        frac, prof = sun_visible_fraction(dem, lat, lon, h0, sun)
        print(f"  cached point, 2027 sun-visible fraction {frac:.3f}")
        return frac, lat, lon, h0, prof
    la, lo = candidate_points(dem_s, reg)
    best = None
    for lat, lon in zip(np.atleast_1d(la), np.atleast_1d(lo)):
        h0 = float(height_ll(dem, lat, lon))
        if math.isnan(h0):
            continue
        frac, prof = sun_visible_fraction(dem, float(lat), float(lon), h0, sun)
        if best is None or frac > best[0]:
            best = (frac, float(lat), float(lon), h0, prof)
    print(f"  {len(np.atleast_1d(la))} candidates, best 2027 sun-visible fraction {best[0]:.3f}")
    cache = json.loads(CACHE.read_text()) if CACHE.exists() else {}
    cache[key] = [round(best[1], 4), round(best[2], 4)]
    CACHE.write_text(json.dumps(cache, indent=1))
    return best


def horizon(dem, lat, lon, h0_m):
    az = np.arange(0, 360, AZ_STEP)
    ds = [0.08]
    while ds[-1] < MAX_DIST_KM:
        ds.append(ds[-1] + max(0.08, ds[-1] * 0.004))
    ds = np.array(ds)
    A, D = np.meshgrid(az, ds, indexing="ij")
    la2, lo2 = destination(lat, lon, A, D)
    h = height_ll(dem, la2, lo2)  # m
    u0 = unit(lat, lon)
    O = u0 * (R_KM + (h0_m + OBSERVER_H_M) / 1000)
    T = unit(la2, lo2) * (R_KM + h[..., None] / 1000)
    v = T - O
    el = np.rad2deg(np.arcsin(np.clip(np.sum(v * u0, axis=-1) / np.linalg.norm(v, axis=-1), -1, 1)))
    el = np.where(np.isnan(h), -90, el)
    return np.max(el, axis=1)


def terrain_tile(dem, lat, lon, h0_m, n=None, spacing_m=None):
    n = n or TILE_N
    spacing_m = spacing_m or TILE_SPACING_M
    half = (n - 1) / 2 * spacing_m / 1000
    g = np.linspace(-half, half, n)
    E, N = np.meshgrid(g, g[::-1], indexing="xy")  # row 0 = north edge
    dist = np.hypot(E, N)
    az = np.rad2deg(np.arctan2(E, N))
    la2, lo2 = destination(lat, lon, az, dist)
    h = height_ll(dem, la2, lo2)
    u0 = unit(lat, lon)
    T = unit(la2, lo2) * (R_KM + h[..., None] / 1000)
    O = u0 * (R_KM + h0_m / 1000)
    up = np.sum((T - O) * u0, axis=-1) * 1000  # m above tangent plane
    return up.astype("<f4")


def polar_cap_normals(dem, size=4096, extent_km=300.0, strip=256):
    """Object-space normals (three.js frame: x=ME x, y=ME z, z=-ME y), 80°S–90°S.
    Processed in row strips to bound memory."""
    small = np.asarray(Image.fromarray(dem, "F").resize((size, size), Image.BOX), dtype=np.float32)
    g = ((np.arange(size) + 0.5) / size * 2 * extent_km - extent_km).astype(np.float64)
    src_scale = N_PIX * SCALE_KM / size
    cols = (g + N_PIX * SCALE_KM / 2) / src_scale - 0.5
    rgb = np.empty((size, size, 3), np.uint8)

    def pos(rows_idx):
        Y = g[::-1][rows_idx][:, None] * np.ones((1, size))
        X = np.ones((len(rows_idx), 1)) * g[None, :]
        rr = (N_PIX * SCALE_KM / 2 - Y) / src_scale - 0.5
        cc = np.broadcast_to(cols, X.shape)
        h = bilinear(small, rr, cc)
        h = np.where(np.isnan(h), 0, h)
        lat, lon = xy_to_ll(X, Y)
        P = unit(lat, lon) * (R_KM + h[..., None] / 1000)
        return np.stack([P[..., 0], P[..., 2], -P[..., 1]], axis=-1), lat, lon

    for r0 in range(0, size, strip):
        r1 = min(size, r0 + strip)
        lo, hi = max(0, r0 - 1), min(size, r1 + 1)
        P3, lat, lon = pos(np.arange(lo, hi))
        dPx = np.gradient(P3, axis=1)
        dPy = -np.gradient(P3, axis=0)
        n = np.cross(dPx, dPy)
        n /= np.linalg.norm(n, axis=-1, keepdims=True)
        o = unit(lat, lon)
        o3 = np.stack([o[..., 0], o[..., 2], -o[..., 1]], axis=-1)
        n[np.sum(n * o3, axis=-1) < 0] *= -1
        sl = slice(r0 - lo, r0 - lo + (r1 - r0))
        rgb[r0:r1] = np.clip((n[sl] * 0.5 + 0.5) * 255 + 0.5, 0, 255).astype(np.uint8)
    return rgb


def main():
    dem, dem_s = load_dem()
    print("DEM", dem.shape)

    # Sanity check of projection orientation: Shackleton (IAU 89.67°S 129.78°E) floor is ~4 km deep.
    sh = float(height_ll(dem, -89.67, 129.78))
    sh_m = float(height_ll(dem, -89.67, -129.78))
    print(f"Shackleton centre height {sh:.0f} m (mirrored lon gives {sh_m:.0f} m)")
    assert sh < -2000, "projection orientation check failed"

    (OUT_DATA / "terrain").mkdir(parents=True, exist_ok=True)
    regions = []
    sun = sun_dirs_2027()
    dem_far = Coarse(dem, 5)
    for reg in REGIONS:
        print(reg["name"])
        frac, lat, lon, h0, prof = select_point(dem, dem_s, reg, sun)
        tile = terrain_tile(dem, lat, lon, h0)
        (OUT_DATA / "terrain" / f"{reg['id']}.bin").write_bytes(tile.tobytes())
        # Far ring: 120 km at 400 m, from a 5x5 block-averaged DEM (avoids aliasing).
        # Cells under the near tile are lowered 60 m so the near tile always wins.
        far = terrain_tile(dem_far, lat, lon, h0, FAR_N, FAR_SPACING_M)
        g = np.linspace(-(FAR_N - 1) / 2 * FAR_SPACING_M, (FAR_N - 1) / 2 * FAR_SPACING_M, FAR_N)
        inner = (TILE_N - 1) / 2 * TILE_SPACING_M - FAR_SPACING_M
        E, N = np.meshgrid(g, g)
        far = np.where((np.abs(E) < inner) & (np.abs(N) < inner), far - 60, far).astype("<f4")
        (OUT_DATA / "terrain" / f"{reg['id']}_far.bin").write_bytes(far.tobytes())
        f = reg["feature"]
        print(f"{reg['name']:16s} point {lat:.4f} {lon:.4f}  h={h0:.0f} m  horizon {prof.min():.2f}..{prof.max():.2f}°")
        rule_text = reg["notes"][-1]
        regions.append({
            "id": reg["id"],
            "name": reg["name"],
            "nasaListing": reg["nasaListing"],
            "referenceFeature": {**f, **({"url": GAZ + str(f["gazetteerId"])} if f["gazetteerId"] else {})},
            "nasaRegion": {
                "source": "Digitised from NASA's official map of the nine candidate regions (2024-10-28)",
                "centreLatDeg": reg["box"]["centreLatDeg"],
                "centreLonDeg": reg["box"]["centreLonDeg"],
                "sizeKm": reg["box"]["sizeKm"],
                "corners": [[round(float(v), 4) for v in xy_to_ll(cx, cy)] for cx, cy in reg["box"]["cornersKm"]],
                "accuracyKm": 0.5,
            },
            "observationPoint": {
                "latDeg": round(lat, 4),
                "lonDeg": round(lon, 4),
                "elevationM": round(h0, 1),
                "observerHeightM": OBSERVER_H_M,
                "selectionRule": rule_text,
                "sunVisibleFraction2027": round(frac, 4),
            },
            "horizon": {
                "azStepDeg": AZ_STEP,
                "elevationDeg": [round(float(v), 3) for v in prof],
                "maxDistanceKm": MAX_DIST_KM,
                "dem": "LOLA LDEM_80S_80M",
                "method": "Maximum terrain elevation angle along great-circle rays (80 m–150 km), observer 2 m above surface, spherical Moon R=1737.4 km; DEM samples beyond the 80°S product edge ignored.",
            },
            "terrain": {
                "file": f"data/terrain/{reg['id']}.bin",
                "n": TILE_N,
                "spacingM": TILE_SPACING_M,
                "encoding": "float32-le",
                "dem": "LOLA LDEM_80S_80M",
                "far": {"file": f"data/terrain/{reg['id']}_far.bin", "n": FAR_N, "spacingM": FAR_SPACING_M},
            },
            "notes": reg["notes"],
        })

    # Polar-cap relief normals are produced (anti-aliased) by build_polar_products.py.

    out = {
        "generatedUtc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "referenceRadiusKm": R_KM,
        "dem": {
            "name": "LOLA LDEM_80S_80M (LRO-L-LOLA-4-GDR-V1.0, product V2.0)",
            "source": "NASA PDS Geosciences Node",
            "url": "https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/data/lola_gdr/polar/img/",
            "resolutionM": 80,
            "projection": "Polar stereographic (spherical), MEAN EARTH/POLAR AXIS of DE421",
        },
        "nasaReferences": NASA_REFERENCES,
        "nasaRegionMap": {
            "url": "https://www.nasa.gov/wp-content/uploads/2024/10/artemis-iii-landing-region-candidates.jpg",
            "credit": "NASA/GSFC/ASU/JSC/AGDT",
            "method": "Map registered to the LROC WAC South Pole Summer Mosaic by maximising image correlation (similarity transform); region boxes converted to polar-stereographic coordinates. See preprocess/register_nasa_regions.py.",
        },
        "polarCap": {"texture": "textures/southpole_normal.png", "standard": "textures/polar/nrm_cap_2048.png", "extentKm": 300.0, "size": 4096},
        "regions": regions,
    }
    prev = OUT_DATA / "sites.json"
    if prev.exists():  # keep the polar imagery descriptor for build_polar_products.py --sites-only
        old = json.loads(prev.read_text())
        if old.get("polarImagery") or old.get("_polarImagery_prev"):
            out["_polarImagery_prev"] = old.get("polarImagery") or old["_polarImagery_prev"]
    (OUT_DATA / "sites.json").write_text(json.dumps(out, indent=1))
    print("wrote sites.json")


if __name__ == "__main__":
    main()
