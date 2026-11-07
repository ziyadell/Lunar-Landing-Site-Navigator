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

# Reference features: IAU Gazetteer of Planetary Nomenclature (retrieved 2026-11-07).
REGIONS = [
    {
        "id": "malapert-massif",
        "name": "Malapert Massif",
        "nasaListing": "Artemis III candidate region in NASA's Aug 2022 list and its refined list of nine (Oct 28, 2024)",
        "feature": {"name": "Mons Malapert", "type": "Mons", "latDeg": -85.98, "lonDeg": -1.67,
                    "diameterKm": 67.0, "gazetteerId": 16338},
        "rule": "summit",
        "searchKm": 15.0,
        "notes": [
            "Reference feature Mons Malapert: IAU-approved 2024, 67 km across, centred 85.98°S 1.67°W.",
            "Observation point = of candidate points on a 2 km grid within 15 km of the gazetteer centre, the one where the Sun's centre is above the LOLA terrain horizon for the largest fraction of 2027 (hourly).",
        ],
    },
    {
        "id": "mons-mouton",
        "name": "Mons Mouton",
        "nasaListing": "Artemis III candidate region added in NASA's refined list of nine (Oct 28, 2024), listed separately from 'Mons Mouton Plateau'",
        "feature": {"name": "Mons Mouton", "type": "Mons", "latDeg": -84.60, "lonDeg": 31.00,
                    "diameterKm": 130.0, "gazetteerId": 16070},
        "rule": "summit",
        "searchKm": 15.0,
        "notes": [
            "Reference feature Mons Mouton: IAU-approved 2022, 130 km across, centred 84.60°S 31.00°E.",
            "Observation point = of candidate points on a 2 km grid within 15 km of the gazetteer centre, the one where the Sun's centre is above the LOLA terrain horizon for the largest fraction of 2027 (hourly).",
        ],
    },
    {
        "id": "nobile-rim-1",
        "name": "Nobile Rim 1",
        "nasaListing": "Artemis III candidate region in NASA's Aug 2022 list and its refined list of nine (Oct 28, 2024)",
        "feature": {"name": "Nobile", "type": "Crater", "latDeg": -85.28, "lonDeg": 53.27,
                    "diameterKm": 79.27, "gazetteerId": 4321},
        "rule": "rim",
        "notes": [
            "Reference feature Nobile crater: 79.3 km diameter, centred 85.28°S 53.27°E.",
            "NASA has not published coordinates distinguishing 'Rim 1' from 'Rim 2'. Observation point = of 72 rim-crest points (highest point between 0.8 and 1.2 crater radii along radial profiles every 5°), the one with the largest fraction of 2027 hours with the Sun's centre above the LOLA terrain horizon. It is a representative rim location, not necessarily inside the Rim 1 region.",
        ],
    },
    {
        "id": "haworth",
        "name": "Haworth",
        "nasaListing": "Artemis III candidate region in NASA's Aug 2022 list and its refined list of nine (Oct 28, 2024)",
        "feature": {"name": "Haworth", "type": "Crater", "latDeg": -87.45, "lonDeg": -5.17,
                    "diameterKm": 51.42, "gazetteerId": 14502},
        "rule": "rim",
        "notes": [
            "Reference feature Haworth crater: 51.4 km diameter, centred 87.45°S 5.17°W.",
            "Observation point = of 72 rim-crest points (highest point between 0.8 and 1.2 crater radii along radial profiles every 5°), the one with the largest fraction of 2027 hours with the Sun's centre above the LOLA terrain horizon. The crater floor is not used.",
        ],
    },
    {
        "id": "peak-near-cabeus-b",
        "name": "Peak near Cabeus B",
        "nasaListing": "Artemis III candidate region in NASA's refined list of nine (Oct 28, 2024)",
        "feature": {"name": "Cabeus B", "type": "Crater", "latDeg": -82.26, "lonDeg": -54.58,
                    "diameterKm": 59.62, "gazetteerId": 8058},
        "rule": "peak",
        "notes": [
            "Reference feature Cabeus B crater: 59.6 km diameter, centred 82.26°S 54.58°W.",
            "NASA has not published the location of the peak. Observation point = the highest LOLA elevation (3×3-smoothed) between 0.6 and 1.6 crater radii of the Cabeus B centre, i.e. the most prominent peak adjoining the crater. Provisional reference: it may not coincide with the NASA region.",
            "Near the 80°S edge of LDEM_80S_80M: horizon rays toward the north (away from the pole) leave the DEM after ~40 km instead of 150 km, so distant terrain in those directions is not included.",
        ],
    },
    {
        "id": "de-gerlache-rim-2",
        "name": "de Gerlache Rim 2",
        "nasaListing": "Artemis III candidate region in NASA's Aug 2022 list and its refined list of nine (Oct 28, 2024)",
        "feature": {"name": "de Gerlache", "type": "Crater", "latDeg": -88.48, "lonDeg": -88.34,
                    "diameterKm": 32.71, "gazetteerId": 1439},
        "rule": "rim",
        "notes": [
            "Reference feature de Gerlache crater: 32.7 km diameter, centred 88.48°S 88.34°W.",
            "NASA has not published coordinates distinguishing 'Rim 1' from 'Rim 2'. Observation point = of 72 rim-crest points (highest point between 0.8 and 1.2 crater radii along radial profiles every 5°), the one with the largest fraction of 2027 hours with the Sun's centre above the LOLA terrain horizon. It is a representative rim location, not necessarily inside the Rim 2 region.",
        ],
    },
]

NASA_REFERENCES = [
    {"title": "NASA Provides Update on Artemis III Moon Landing Regions", "date": "2024-10-28",
     "url": "https://www.nasa.gov/news-release/nasa-provides-update-on-artemis-iii-moon-landing-regions/",
     "regions": ["Peak near Cabeus B", "Haworth", "Malapert Massif", "Mons Mouton Plateau", "Mons Mouton",
                 "Nobile Rim 1", "Nobile Rim 2", "de Gerlache Rim 2", "Slater Plain"]},
    {"title": "NASA Identifies Candidate Regions for Landing Next Americans on Moon (release 22-089)", "date": "2022-08-19",
     "url": "https://www.nasa.gov/news-release/nasa-identifies-candidate-regions-for-landing-next-americans-on-moon/"},
]
NOT_REPRESENTED = {
    "Mons Mouton Plateau": "No published extent; cannot be distinguished from the Mons Mouton point with public data.",
    "Nobile Rim 2": "No published coordinates distinguishing it from Nobile Rim 1.",
    "Slater Plain": "No defensible rule for locating the plain relative to Slater crater (IAU 88.08°S 111.29°E).",
}


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
    return np.where(ok, v, np.nan)


def height_ll(dem, lat, lon):
    x, y = ll_to_xy(lat, lon)
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
    dn = np.fromfile(RAW, dtype="<i2").reshape(N_PIX, N_PIX)
    dem = dn.astype(np.float32) * 0.5
    sm = dem.copy()
    k = np.zeros_like(dem)
    for dr in (-1, 0, 1):
        for dc in (-1, 0, 1):
            k += np.roll(np.roll(dem, dr, 0), dc, 1)
    sm = k / 9.0
    return dem, sm


def candidate_points(dem_s, reg):
    """Candidate observation points for a region (see module docstring)."""
    f = reg["feature"]
    if reg["rule"] == "rim":
        # Rim crest: along each of 72 radial profiles from the crater centre, the
        # highest point between 0.80 and 1.20 crater radii.
        rad = f["diameterKm"] / 2
        az = np.arange(0, 360, 5.0)
        rr = np.linspace(0.80 * rad, 1.20 * rad, 81)
        A, Rr = np.meshgrid(az, rr, indexing="ij")
        la, lo = destination(f["latDeg"], f["lonDeg"], A, Rr)
        h = height_ll(dem_s, la, lo)
        j = np.nanargmax(h, axis=1)
        idx = np.arange(len(az))
        return la[idx, j], lo[idx, j]
    if reg["rule"] == "peak":
        # Highest smoothed point between 0.6 and 1.6 crater radii on a 1 km grid.
        rad = f["diameterKm"] / 2
        g = np.arange(-1.6 * rad, 1.6 * rad + 0.01, 1.0)
        E, N = np.meshgrid(g, g)
        d = np.hypot(E, N)
        keep = (d >= 0.6 * rad) & (d <= 1.6 * rad)
        la, lo = destination(f["latDeg"], f["lonDeg"], np.rad2deg(np.arctan2(E[keep], N[keep])), d[keep])
        h = height_ll(dem_s, la, lo)
        i = int(np.nanargmax(h))
        return np.array([la[i]]), np.array([lo[i]])
    # Mons: 2 km grid within searchKm of the gazetteer centre.
    g = np.arange(-reg["searchKm"], reg["searchKm"] + 0.01, 2.0)
    E, N = np.meshgrid(g, g)
    keep = np.hypot(E, N) <= reg["searchKm"]
    la, lo = destination(f["latDeg"], f["lonDeg"], np.rad2deg(np.arctan2(E[keep], N[keep])), np.hypot(E[keep], N[keep]))
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


def select_point(dem, dem_s, reg, sun):
    """Candidate with the greatest fraction of 2027 hours with the Sun's centre above the terrain horizon."""
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
    print("DEM", dem.shape, float(dem.min()), float(dem.max()))

    # Sanity check of projection orientation: Shackleton (IAU 89.67°S 129.78°E) floor is ~4 km deep.
    sh = float(height_ll(dem, -89.67, 129.78))
    sh_m = float(height_ll(dem, -89.67, -129.78))
    print(f"Shackleton centre height {sh:.0f} m (mirrored lon gives {sh_m:.0f} m)")
    assert sh < -2000, "projection orientation check failed"

    (OUT_DATA / "terrain").mkdir(parents=True, exist_ok=True)
    regions = []
    sun = sun_dirs_2027()
    k = 5
    dem_far = dem[: N_PIX // k * k, : N_PIX // k * k].reshape(N_PIX // k, k, N_PIX // k, k).mean(axis=(1, 3))
    dem_far = np.repeat(np.repeat(dem_far, k, 0), k, 1).astype(np.float32)
    for reg in REGIONS:
        f = reg["feature"]
        if reg["rule"] == "rim":
            floor = float(np.nanmean(height_ll(dem, *destination(f["latDeg"], f["lonDeg"], np.arange(0, 360, 30), f["diameterKm"] * 0.1))))
            print(f"  {f['name']} floor (0.2 R) mean {floor:.0f} m")
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
            "referenceFeature": {**f, "url": GAZ + str(f["gazetteerId"])},
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
        "notRepresented": NOT_REPRESENTED,
        "polarCap": {"texture": "textures/southpole_normal.png", "standard": "textures/polar/nrm_cap_2048.png", "extentKm": 300.0, "size": 4096},
        "regions": regions,
    }
    (OUT_DATA / "sites.json").write_text(json.dumps(out, indent=1))
    print("wrote sites.json")


if __name__ == "__main__":
    main()
