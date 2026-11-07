"""Region thumbnails for the region picker.

Each thumbnail is the central 240 x 240 px of the region's existing LROC WAC
South Pole Summer Mosaic window (100 m/px, built by build_polar_products.py),
so it covers 24 x 24 km centred on the observation point at native resolution.
Nothing is resampled, sharpened or retouched; only a crop is written.
Image up = polar-stereographic +y (toward 0 deg longitude, the Earth-facing side).

Usage: python preprocess/build_thumbnails.py
"""
import json
import math
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PUB = ROOT / "public"
SIZE = 240  # px = 24 km at 100 m/px

def main() -> None:
    sites = json.loads((PUB / "data" / "sites.json").read_text(encoding="utf-8"))
    out_dir = PUB / "textures" / "polar" / "thumbs"
    out_dir.mkdir(parents=True, exist_ok=True)
    for r in sites["regions"]:
        d = r["detail"]
        img = Image.open(PUB / d["imagery"]).convert("L")
        n = img.width
        km_per_px = 2 * d["halfExtentKm"] / n
        # Observation point position inside the window (it is the window centre to 0.1 km).
        op = r["observationPoint"]

        R = 1737.4  # LOLA reference sphere, km
        la, lo = math.radians(op["latDeg"]), math.radians(op["lonDeg"])
        rho = 2 * R * math.tan(math.pi / 4 + la / 2)
        x, y = rho * math.sin(lo), rho * math.cos(lo)
        cx = (x - d["centerKm"][0]) / km_per_px + n / 2
        cy = n / 2 - (y - d["centerKm"][1]) / km_per_px
        x0, y0 = round(cx - SIZE / 2), round(cy - SIZE / 2)
        crop = img.crop((x0, y0, x0 + SIZE, y0 + SIZE))
        crop.save(out_dir / f"{r['id']}.jpg", quality=88, optimize=True)
        print(r["id"], "offset px", round(cx - n / 2, 2), round(cy - n / 2, 2))

if __name__ == "__main__":
    main()
