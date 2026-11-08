"""Regenerate tests/fixtures/horizons-topocentric.json: JPL Horizons topocentric apparent
azimuth/elevation (quantity 4, airless) of the Sun (10) and Earth (399) from three LunaNav
observation points, at a few epochs. Used by tests/science.test.ts (no network needed there).

    python tests/fixtures/fetch_horizons_fixture.py
"""
import json, pathlib, urllib.parse, urllib.request

ROOT = pathlib.Path(__file__).resolve().parents[2]
sites = {r['id']: r for r in json.load(open(ROOT / 'public/data/sites.json', encoding='utf8'))['regions']}
IDS = ['malapert-massif', 'haworth', 'de-gerlache-rim-2']
TIMES = ['2027-01-04 12:00', '2027-01-19 12:00', '2027-06-15 06:30', '2028-03-01 18:15']
out = {'source': 'NASA/JPL Horizons API, observer table, QUANTITIES=4, APPARENT=AIRLESS, CENTER=coord@301',
       'note': 'Observer height = LOLA elevation + 2 m above the 1737.4 km sphere, as in the app.', 'rows': []}
for sid in IDS:
    p = sites[sid]['observationPoint']
    alt_km = (p['elevationM'] + p.get('observerHeightM', 2.0)) / 1000
    for body in ('10', '399'):
        q = {'format': 'json', 'COMMAND': f"'{body}'", 'EPHEM_TYPE': 'OBSERVER', 'CENTER': "'coord@301'",
             'COORD_TYPE': 'GEODETIC', 'SITE_COORD': f"'{p['lonDeg']},{p['latDeg']},{alt_km}'",
             'TLIST': ' '.join(f"'{t}'" for t in TIMES), 'TIME_TYPE': 'UT', 'QUANTITIES': "'4'",
             'ANG_FORMAT': 'DEG', 'APPARENT': 'AIRLESS', 'CSV_FORMAT': 'YES', 'OBJ_DATA': 'NO'}
        url = 'https://ssd.jpl.nasa.gov/api/horizons.api?' + urllib.parse.urlencode(q)
        res = json.load(urllib.request.urlopen(url, timeout=60))['result']
        block = res.split('$$SOE')[1].split('$$EOE')[0].strip().splitlines()
        for line, t in zip(block, TIMES):
            cols = [c.strip() for c in line.split(',')]
            az, el = float(cols[-3]), float(cols[-2])
            out['rows'].append({'site': sid, 'body': 'sun' if body == '10' else 'earth', 'utc': t.replace(' ', 'T') + ':00Z', 'azDeg': az, 'elDeg': el})
json.dump(out, open(pathlib.Path(__file__).with_name('horizons-topocentric.json'), 'w'), indent=1)
print(len(out['rows']), 'rows')
