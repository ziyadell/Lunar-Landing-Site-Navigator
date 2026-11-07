"""
Real star field for Surface View.

1. Downloads the Yale Bright Star Catalogue (5th ed., VizieR V/50), stars with V < 5.5,
   J2000 RA/Dec → public/data/stars.json  [[raDeg, decDeg, vmag, bv], ...]
2. Validates the IAU 2009 Moon rotation model (Archinal et al. 2011, used in the app to
   rotate J2000 star directions into the Moon-fixed frame) against JPL Horizons: the Sun's
   J2000 direction seen from the Moon's centre, rotated with the IAU model, is compared
   with the Horizons sub-solar point stored in ephemeris.json. Result appended to
   public/data/validation.json under "moonOrientation".

Usage:  python preprocess/build_stars.py
"""
from __future__ import annotations

import json
import math
import pathlib
import urllib.parse
import urllib.request
from datetime import datetime, timezone

import numpy as np

ROOT = pathlib.Path(__file__).resolve().parents[1]
DATA = ROOT / "public" / "data"
VIZIER = "http://vizier.cfa.harvard.edu/viz-bin/asu-tsv?-source=V/50/catalog&-out=RAJ2000&-out=DEJ2000&-out=Vmag&-out=B-V&Vmag=%3C5.5&-out.max=20000"


def fetch_stars():
    req = urllib.request.Request(VIZIER, headers={"User-Agent": "lunar-landing-site-navigator"})
    t = urllib.request.urlopen(req, timeout=120).read().decode("latin1")
    out = []
    for line in t.splitlines():
        if not line or line.startswith("#") or line.startswith("RAJ") or line.startswith('"') or line.startswith("-"):
            continue
        c = line.split("\t")
        try:
            h, m, s = (float(x) for x in c[0].split())
            sign = -1 if c[1].strip().startswith("-") else 1
            d, dm, ds = (abs(float(x)) for x in c[1].split())
            v = float(c[2])
        except ValueError:
            continue
        bv = float(c[3]) if c[3].strip() else 0.6
        out.append([round(15 * (h + m / 60 + s / 3600), 4), round(sign * (d + dm / 60 + ds / 3600), 4), v, bv])
    return out


def iau_moon(jd_tdb: float):
    """IAU 2009 Moon orientation: alpha0, delta0, W in degrees."""
    d = jd_tdb - 2451545.0
    T = d / 36525
    E = [0, 125.045 - 0.0529921 * d, 250.089 - 0.1059842 * d, 260.008 + 13.0120009 * d,
         176.625 + 13.3407154 * d, 357.529 + 0.9856003 * d, 311.589 + 26.4057084 * d,
         134.963 + 13.0649930 * d, 276.617 + 0.3287146 * d, 34.226 + 1.7484877 * d,
         15.134 - 0.1589763 * d, 119.743 + 0.0036096 * d, 239.961 + 0.1643573 * d,
         25.053 + 12.9590088 * d]
    s = lambda i: math.sin(math.radians(E[i]))
    c = lambda i: math.cos(math.radians(E[i]))
    a0 = 269.9949 + 0.0031 * T - 3.8787 * s(1) - 0.1204 * s(2) + 0.0700 * s(3) - 0.0172 * s(4) + 0.0072 * s(6) - 0.0052 * s(10) + 0.0043 * s(13)
    d0 = 66.5392 + 0.0130 * T + 1.5419 * c(1) + 0.0239 * c(2) - 0.0278 * c(3) + 0.0068 * c(4) - 0.0029 * c(6) + 0.0009 * c(7) + 0.0008 * c(10) - 0.0009 * c(13)
    W = (38.3213 + 13.17635815 * d - 1.4e-12 * d * d + 3.5610 * s(1) + 0.1208 * s(2) - 0.0642 * s(3) + 0.0158 * s(4)
         + 0.0252 * s(5) - 0.0066 * s(6) - 0.0047 * s(7) - 0.0046 * s(8) + 0.0028 * s(9) + 0.0052 * s(10)
         + 0.0040 * s(11) + 0.0019 * s(12) - 0.0044 * s(13))
    return a0, d0, W


def rz(a):
    a = math.radians(a)
    return np.array([[math.cos(a), math.sin(a), 0], [-math.sin(a), math.cos(a), 0], [0, 0, 1]])


def rx(a):
    a = math.radians(a)
    return np.array([[1, 0, 0], [0, math.cos(a), math.sin(a)], [0, -math.sin(a), math.cos(a)]])


def icrf_to_moon(jd_tdb):
    a0, d0, W = iau_moon(jd_tdb)
    return rz(W) @ rx(90 - d0) @ rz(90 + a0)


def validate():
    p = {"COMMAND": "10", "OBJ_DATA": "NO", "MAKE_EPHEM": "YES", "EPHEM_TYPE": "OBSERVER", "CENTER": "500@301",
         "START_TIME": "2026-08-01", "STOP_TIME": "2028-12-01", "STEP_SIZE": "7d", "QUANTITIES": "1",
         "CSV_FORMAT": "YES", "ANG_FORMAT": "DEG", "TIME_TYPE": "UT"}
    q = {k: f"'{v}'" for k, v in p.items()}
    q["format"] = "text"
    t = urllib.request.urlopen("https://ssd.jpl.nasa.gov/api/horizons.api?" + urllib.parse.urlencode(q), timeout=200).read().decode()
    a, b = t.index("$$SOE") + 5, t.index("$$EOE")
    eph = json.loads((DATA / "ephemeris.json").read_text())
    t0 = datetime.strptime(eph["startUtc"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    errs = []
    for line in t[a:b].strip().splitlines():
        c = [x.strip() for x in line.split(",")]
        ts = datetime.strptime(c[0], "%Y-%b-%d %H:%M").replace(tzinfo=timezone.utc)
        ra, dec = math.radians(float(c[3])), math.radians(float(c[4]))
        v = np.array([math.cos(dec) * math.cos(ra), math.cos(dec) * math.sin(ra), math.sin(dec)])
        jd_utc = ts.timestamp() / 86400 + 2440587.5
        jd_tdb = jd_utc + 69.184 / 86400  # TT-UTC (37 leap s + 32.184 s); TDB≈TT
        m = icrf_to_moon(jd_tdb) @ v
        i = int((ts - t0).total_seconds() // 3600)
        lat, lon = math.radians(eph["subSolarLatDeg"][i]), math.radians(eph["subSolarLonDeg"][i])
        ref = np.array([math.cos(lat) * math.cos(lon), math.cos(lat) * math.sin(lon), math.sin(lat)])
        errs.append(math.degrees(math.acos(min(1, float(m @ ref)))))
    return {"method": "Sun J2000 direction from Moon centre (Horizons quantity 1) rotated with the IAU 2009 Moon model vs Horizons sub-solar point",
            "samples": len(errs), "maxErrDeg": round(max(errs), 4), "meanErrDeg": round(float(np.mean(errs)), 4)}


def main():
    stars = fetch_stars()
    (DATA / "stars.json").write_text(json.dumps({
        "source": "Yale Bright Star Catalogue, 5th rev. ed. (Hoffleit & Warren 1991), VizieR V/50",
        "epoch": "J2000", "limitingMag": 5.5, "columns": ["raDeg", "decDeg", "vmag", "bv"], "stars": stars,
    }, separators=(",", ":")))
    print("stars", len(stars))
    val = validate()
    print(val)
    vp = DATA / "validation.json"
    v = json.loads(vp.read_text())
    v["moonOrientation"] = val
    vp.write_text(json.dumps(v, indent=1))


if __name__ == "__main__":
    main()
