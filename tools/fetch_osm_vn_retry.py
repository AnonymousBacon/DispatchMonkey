#!/usr/bin/env python3
"""Retry the three Overpass queries that 502'd, with backoff. Merges into geo.json."""
import json, pathlib, sys, time

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from fetch_osm import overpass, centerline

S, W, N, E = 10.66, 106.62, 10.84, 106.87
p = pathlib.Path(__file__).resolve().parent.parent / "static" / "vn" / "geo.json"
g = json.loads(p.read_text())

def tryq(q, attempts=5):
    for i in range(attempts):
        try:
            return overpass(q)
        except Exception as ex:
            print(f"  retry {i+1}: {ex}", flush=True)
            time.sleep(15 * (i + 1))
    return {}

if not g["roads"].get("Nguyễn Văn Linh"):
    q = (f'[out:json][timeout:90];way["highway"~"motorway|trunk|primary|secondary|tertiary"]'
         f'["name"~"Nguyễn Văn Linh"]({S},{W},{N},{E});out geom;')
    ways = tryq(q).get("elements", [])
    if ways:
        g["roads"]["Nguyễn Văn Linh"] = centerline(ways, "lon", bins=70)
    print("NVL:", len(ways), flush=True)

for kind, tag, key in [("school", '"amenity"="school"', "schools"),
                       ("hospital", '"amenity"~"hospital|clinic"', "hospitals")]:
    if g.get(key):
        continue
    q = (f'[out:json][timeout:90];(node[{tag}]({S},{W},{N},{E});way[{tag}]({S},{W},{N},{E}););out center tags;')
    out = []
    for el in tryq(q).get("elements", []):
        lat = el.get("lat") or (el.get("center") or {}).get("lat")
        lon = el.get("lon") or (el.get("center") or {}).get("lon")
        if lat and lon:
            out.append({"n": (el.get("tags") or {}).get("name", kind),
                        "lat": round(lat, 5), "lon": round(lon, 5)})
    g[key] = out
    print(kind, len(out), flush=True)

p.write_text(json.dumps(g, ensure_ascii=False))
print("merged ok")
