"""
Validate the app's topocentric Sun/Earth geometry against JPL Horizons.

The app derives azimuth/elevation from the hourly sub-solar / sub-Earth table
(ephemeris.json) by vector geometry. Here we ask Horizons directly for the
topocentric apparent Az/El (quantity 4) of the Sun (10) and Earth (399) as seen
from each observation point (CENTER = coord@301, GEODETIC site coordinates), and
report the differences.

Output: public/data/validation.json  (shown in the app's Data Sources panel)
Usage : python preprocess/validate_ephemeris.py
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
API = "https://ssd.jpl.nasa.gov/api/horizons.api"
R_KM = 1737.4
START, STOP, STEP = "2027-01-01 00:00", "2027-02-28 00:00", "6h"


def horizons_azel(body: str, lat: float, lon: float, alt_km: float):
    p = {
        "COMMAND": body, "OBJ_DATA": "NO", "MAKE_EPHEM": "YES", "EPHEM_TYPE": "OBSERVER",
        "CENTER": "coord@301", "COORD_TYPE": "GEODETIC", "SITE_COORD": f"{lon:.5f},{lat:.5f},{alt_km:.4f}",
        "START_TIME": START, "STOP_TIME": STOP, "STEP_SIZE": STEP, "QUANTITIES": "4",
        "CSV_FORMAT": "YES", "ANG_FORMAT": "DEG", "APPARENT": "AIRLESS",
    }
    q = {k: f"'{v}'" for k, v in p.items()}
    q["format"] = "text"
    with urllib.request.urlopen(API + "?" + urllib.parse.urlencode(q), timeout=300) as r:
        t = r.read().decode()
    a, b = t.index("$$SOE") + 5, t.index("$$EOE")
    out = []
    for line in t[a:b].strip().splitlines():
        c = [x.strip() for x in line.split(",")]
        ts = datetime.strptime(c[0], "%Y-%b-%d %H:%M").replace(tzinfo=timezone.utc)
        out.append((ts, float(c[3]), float(c[4])))
    return out


def unit(lat, lon):
    la, lo = np.deg2rad(lat), np.deg2rad(lon)
    return np.array([np.cos(la) * np.cos(lo), np.cos(la) * np.sin(lo), np.sin(la)])


def app_method(eph, t0, ts, lat, lon, alt_km, body):
    i = int((ts - t0).total_seconds() // 3600)
    if body == "sun":
        d = unit(eph["subSolarLatDeg"][i], eph["subSolarLonDeg"][i])
        v = d
    else:
        d = unit(eph["subEarthLatDeg"][i], eph["subEarthLonDeg"][i])
        v = d * eph["earthRangeKm"][i] - unit(lat, lon) * (R_KM + alt_km)
    up = unit(lat, lon)
    east = np.array([-math.sin(math.radians(lon)), math.cos(math.radians(lon)), 0])
    north = np.cross(up, east)
    v = v / np.linalg.norm(v)
    el = math.degrees(math.asin(v @ up))
    az = math.degrees(math.atan2(v @ east, v @ north)) % 360
    return az, el


def main():
    eph = json.loads((DATA / "ephemeris.json").read_text())
    sites = json.loads((DATA / "sites.json").read_text())
    t0 = datetime.strptime(eph["startUtc"], "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=timezone.utc)
    results = []
    for reg in sites["regions"]:
        p = reg["observationPoint"]
        alt = (p["elevationM"] + p["observerHeightM"]) / 1000
        row = {"id": reg["id"]}
        for body, code in (("sun", "10"), ("earth", "399")):
            ref = horizons_azel(code, p["latDeg"], p["lonDeg"], alt)
            daz, delv = [], []
            for ts, az, el in ref:
                a, e = app_method(eph, t0, ts, p["latDeg"], p["lonDeg"], alt, body)
                daz.append(abs((a - az + 180) % 360 - 180) * math.cos(math.radians(el)))
                delv.append(abs(e - el))
            row[body] = {"samples": len(ref), "maxElevErrDeg": round(max(delv), 4),
                         "meanElevErrDeg": round(float(np.mean(delv)), 4),
                         "maxAzErrDeg": round(max(daz), 4)}
        print(row)
        results.append(row)
    out = {
        "method": "Horizons topocentric apparent Az/El (quantity 4, CENTER=coord@301, airless) vs app vector method from hourly sub-point table",
        "period": f"{START} to {STOP} UTC, step {STEP}",
        "note": "Azimuth error is scaled by cos(elevation) (great-circle error on the sky).",
        "retrievedUtc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "sites": results,
    }
    old = DATA / "validation.json"
    if old.exists():  # keep sections written by other scripts (build_stars.py: moonOrientation)
        prev = json.loads(old.read_text())
        for k, v in prev.items():
            out.setdefault(k, v)
    (DATA / "validation.json").write_text(json.dumps(out, indent=1))


if __name__ == "__main__":
    main()
