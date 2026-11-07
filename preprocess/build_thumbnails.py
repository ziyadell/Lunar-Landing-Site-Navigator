"""Region imagery for the region picker.

1. Region thumbnails: each shows NASA's region outline area (digitised box, see
   register_nasa_regions.py) plus a 2 km margin, cut from the region's LROC WAC South
   Pole Summer Mosaic window (100 m/px, built by build_polar_products.py) and box-
   downsampled to 240 x 240 px when the region is larger than 24 km. No sharpening or
   retouching. The crop centre and half-width are written to sites.json so the app can
   mark the observation point on the image exactly.
2. Locator map: the south-polar cap (WAC cap texture, 293 m/px) cropped to the area
   that holds all nine regions, at 0.5 km/px. Extent written to sites.json.

Image up = polar-stereographic +y (toward 0 deg longitude, the Earth-facing side).

Usage: python preprocess/build_thumbnails.py   (after process_dem.py and build_polar_products.py)
"""
import json
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
PUB = ROOT / "public"
SIZE = 240
MARGIN_KM = 2.0
LOCATOR = {"xKm": [-205.0, 185.0], "yKm": [-80.0, 190.0], "kmPerPx": 0.5}


def main() -> None:
    path = PUB / "data" / "sites.json"
    sites = json.loads(path.read_text(encoding="utf-8"))
    out_dir = PUB / "textures" / "polar" / "thumbs"
    out_dir.mkdir(parents=True, exist_ok=True)
    nasa = json.loads((ROOT / "preprocess" / "nasa_regions.json").read_text())["regions"]
    for r in sites["regions"]:
        d = r["detail"]
        img = Image.open(PUB / d["imagery"]).convert("L")
        n = img.width
        km_per_px = 2 * d["halfExtentKm"] / n
        b = nasa[r["id"]]
        cxk, cyk = b["centreKm"]
        half = max(12.0, max(b["sizeKm"]) / 2 + MARGIN_KM)
        px = (cxk - d["centerKm"][0]) / km_per_px + n / 2
        py = n / 2 - (cyk - d["centerKm"][1]) / km_per_px
        hp = half / km_per_px
        box = (round(px - hp), round(py - hp), round(px + hp), round(py + hp))
        assert box[0] >= 0 and box[1] >= 0 and box[2] <= n and box[3] <= n, (r["id"], box)
        crop = img.crop(box)
        if crop.width != SIZE:
            crop = crop.resize((SIZE, SIZE), Image.BOX)
        crop.save(out_dir / f"{r['id']}.jpg", quality=88, optimize=True)
        real_half = (box[2] - box[0]) / 2 * km_per_px
        real_cx = d["centerKm"][0] + ((box[0] + box[2]) / 2 - n / 2) * km_per_px
        real_cy = d["centerKm"][1] - ((box[1] + box[3]) / 2 - n / 2) * km_per_px
        r["thumb"] = {"file": f"textures/polar/thumbs/{r['id']}.jpg", "centerKm": [round(real_cx, 3), round(real_cy, 3)],
                      "halfExtentKm": round(real_half, 3)}
        print(r["id"], "thumb half-width km", round(real_half, 2))

    cap = Image.open(PUB / sites["polarImagery"]["cap"]["high"]).convert("L")
    ext = sites["polarImagery"]["cap"]["extentKm"]
    s = cap.width / (2 * ext)  # px per km
    (x0, x1), (y0, y1) = LOCATOR["xKm"], LOCATOR["yKm"]
    crop = cap.crop((round((x0 + ext) * s), round((ext - y1) * s), round((x1 + ext) * s), round((ext - y0) * s)))
    w = round((x1 - x0) / LOCATOR["kmPerPx"])
    h = round((y1 - y0) / LOCATOR["kmPerPx"])
    crop.resize((w, h), Image.BOX).save(PUB / "textures" / "polar" / "locator.jpg", quality=86, optimize=True)
    sites["locator"] = {"file": "textures/polar/locator.jpg", "xKm": LOCATOR["xKm"], "yKm": LOCATOR["yKm"],
                        "source": "LROC WAC South Pole Summer Mosaic (cap texture), 0.5 km/px"}
    print("locator", w, h)
    path.write_text(json.dumps(sites, indent=1), encoding="utf-8")


if __name__ == "__main__":
    main()
