"""
Fetch Sun and Earth geometry for the Moon from NASA/JPL Horizons.

Output: public/data/ephemeris.json

For every hourly UTC epoch we store, in the Moon's body-fixed frame used by
Horizons (IAU Moon / Mean-Earth-polar-axis, east-positive longitude):
  * sub-solar point   (Horizons quantity 15: SunSub-LON / SunSub-LAT)
  * sub-Earth point   (Horizons quantity 14 with the observer at Earth's
                       geocenter: ObsSub-LON / ObsSub-LAT)
  * Earth-Moon range  (Horizons quantity 20: delta, light-time aberrated)

From these the app computes topocentric Sun/Earth azimuth and elevation for any
surface location by vector geometry. `validate_ephemeris.py` compares that
method against Horizons' own topocentric Az/El for each observation point.

Usage:  python preprocess/fetch_ephemeris.py
Needs:  Python 3.9+, internet access to ssd.jpl.nasa.gov (no API key).
"""
from __future__ import annotations

import json
import pathlib
import urllib.parse
import urllib.request
from datetime import datetime, timezone

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "data" / "ephemeris.json"

START = "2026-07-01 00:00"
STOP = "2028-12-31 23:00"
STEP = "1h"
AU_KM = 149_597_870.700

API = "https://ssd.jpl.nasa.gov/api/horizons.api"


def horizons(params: dict[str, str]) -> str:
    q = {k: f"'{v}'" for k, v in params.items()}
    q["format"] = "text"
    url = API + "?" + urllib.parse.urlencode(q)
    with urllib.request.urlopen(url, timeout=300) as r:
        return r.read().decode("utf-8")


def rows(text: str) -> list[list[str]]:
    a = text.index("$$SOE") + len("$$SOE")
    b = text.index("$$EOE")
    out = []
    for line in text[a:b].strip().splitlines():
        out.append([c.strip() for c in line.split(",")])
    return out


def parse_time(s: str) -> datetime:
    return datetime.strptime(s, "%Y-%b-%d %H:%M").replace(tzinfo=timezone.utc)


def main() -> None:
    text = horizons(
        {
            "COMMAND": "301",
            "OBJ_DATA": "NO",
            "MAKE_EPHEM": "YES",
            "EPHEM_TYPE": "OBSERVER",
            "CENTER": "500@399",
            "START_TIME": START,
            "STOP_TIME": STOP,
            "STEP_SIZE": STEP,
            "QUANTITIES": "14,15,20",
            "CSV_FORMAT": "YES",
            "ANG_FORMAT": "DEG",
        }
    )
    data = rows(text)
    # columns: time, solar-presence, lunar-presence, ObsSubLON, ObsSubLAT,
    #          SunSubLON, SunSubLAT, delta(au), deldot
    t0 = parse_time(data[0][0])
    e_lon, e_lat, s_lon, s_lat, dist = [], [], [], [], []
    for i, r in enumerate(data):
        t = parse_time(r[0])
        assert (t - t0).total_seconds() == i * 3600, f"non-uniform step at {r[0]}"
        e_lon.append(round(float(r[3]), 5))
        e_lat.append(round(float(r[4]), 5))
        s_lon.append(round(float(r[5]), 5))
        s_lat.append(round(float(r[6]), 5))
        dist.append(round(float(r[7]) * AU_KM, 1))

    eph_line = next((l for l in text.splitlines() if "Target body name" in l), "")
    out = {
        "source": "NASA/JPL Horizons System (ssd.jpl.nasa.gov), observer table",
        "query": {
            "target": "301 (Moon)",
            "observer": "500@399 (Earth geocenter)",
            "quantities": "14 (sub-observer point), 15 (sub-solar point), 20 (range)",
            "start": START,
            "stop": STOP,
            "step": STEP,
        },
        "targetLine": eph_line.strip(),
        "frame": "Moon body-fixed (Horizons IAU/ME), planetodetic latitude, east-positive longitude",
        "timeScale": "UTC",
        "retrievedUtc": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "startUtc": t0.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "stepSeconds": 3600,
        "count": len(data),
        "subEarthLonDeg": e_lon,
        "subEarthLatDeg": e_lat,
        "subSolarLonDeg": s_lon,
        "subSolarLatDeg": s_lat,
        "earthRangeKm": dist,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, separators=(",", ":")))
    print(f"wrote {OUT} ({len(data)} epochs, {OUT.stat().st_size/1e6:.2f} MB)")


if __name__ == "__main__":
    main()
