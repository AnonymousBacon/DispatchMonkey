#!/usr/bin/env python3
"""Fetch Cát Lái approach roads + schools/hospitals from OSM -> static/vn/geo.json.

Reuses the axis-binning centerline from fetch_osm.py.
shortcut: axis-binning assumes each road is monotone in one axis (true for these
approach roads at demo zoom); upgrade to way-stitching if a looping road is added.
"""
import json, pathlib, sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from fetch_osm import overpass, centerline

OUT = pathlib.Path(__file__).resolve().parent.parent / "static" / "vn"
OUT.mkdir(parents=True, exist_ok=True)

BBOX = (10.66, 106.62, 10.84, 106.87)  # S,W,N,E — east HCMC around Cát Lái
S, W, N, E = BBOX

# display name, OSM name regex, ordering axis
ROADS = [
    ("Nguyễn Thị Định", "Nguyễn Thị Định", "lat"),
    ("Đồng Văn Cống",   "Đồng Văn Cống",   "lat"),
    ("Mai Chí Thọ",     "Mai Chí Thọ",     "lon"),
    ("Võ Chí Công",     "Võ Chí Công",     "lat"),
    ("Cầu Phú Mỹ",      "Cầu Phú Mỹ|Phú Mỹ", "lat"),
    ("Nguyễn Văn Linh", "Nguyễn Văn Linh", "lon"),
    ("Nguyễn Lương Bằng", "Nguyễn Lương Bằng", "lat"),
]

roads = {}
for disp, rx, axis in ROADS:
    q = (f'[out:json][timeout:90];'
         f'way["highway"~"motorway|trunk|primary|secondary|tertiary"]'
         f'["name"~"{rx}"]({S},{W},{N},{E});out geom;')
    try:
        ways = overpass(q).get("elements", [])
    except Exception as ex:
        print(f"  !! {disp}: {ex}", file=sys.stderr)
        continue
    line = centerline(ways, axis, bins=70)
    roads[disp] = line
    print(f"  {disp}: {len(ways)} ways -> {len(line)} pts")

pois = {"school": [], "hospital": []}
for kind, tag in [("school", '"amenity"="school"'), ("hospital", '"amenity"~"hospital|clinic"')]:
    q = (f'[out:json][timeout:90];'
         f'(node[{tag}]({S},{W},{N},{E});way[{tag}]({S},{W},{N},{E}););out center tags;')
    try:
        for el in overpass(q).get("elements", []):
            lat = el.get("lat") or (el.get("center") or {}).get("lat")
            lon = el.get("lon") or (el.get("center") or {}).get("lon")
            if lat and lon:
                pois[kind].append({"n": (el.get("tags") or {}).get("name", kind),
                                   "lat": round(lat, 5), "lon": round(lon, 5)})
    except Exception as ex:
        print(f"  !! {kind}: {ex}", file=sys.stderr)
    print(f"  {kind}: {len(pois[kind])}")

(OUT / "geo.json").write_text(json.dumps(
    {"source": "OpenStreetMap via Overpass", "bbox": BBOX,
     "roads": roads, "schools": pois["school"], "hospitals": pois["hospital"]},
    ensure_ascii=False))
print("wrote", OUT / "geo.json")
