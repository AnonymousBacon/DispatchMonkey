"""Fetch real highway centerlines + school points from OpenStreetMap (Overpass).

Run once; output goes to data/. Dual carriageways are collapsed by binning points
along the corridor's dominant axis and averaging the other coordinate.
shortcut: axis-binning assumes each corridor is monotone in one axis (true for all
8 corridors we use); upgrade to proper way-stitching if a non-monotone road is added.
"""
import json, urllib.request, urllib.parse, pathlib, sys

OVERPASS = "https://overpass-api.de/api/interpreter"
OUT = pathlib.Path(__file__).resolve().parent.parent / "data"

# name, osm ref regex, axis to order by ('lat' or 'lon'), bbox (S,W,N,E)
CORRIDORS = [
    ("I-710", "^I 710$",  "lat", (33.74, -118.26, 34.05, -118.10)),
    ("I-110", "^I 110$",  "lat", (33.73, -118.33, 34.06, -118.24)),
    ("I-405", "^I 405$",  "lon", (33.76, -118.42, 34.05, -118.10)),
    ("SR-91", "^CA 91$",  "lon", (33.83, -118.30, 33.92, -117.50)),
    ("I-605", "^I 605$",  "lat", (33.78, -118.15, 34.10, -118.00)),
    ("SR-60", "^CA 60$",  "lon", (33.96, -118.25, 34.08, -117.30)),
    ("I-10",  "^I 10$",   "lon", (34.00, -118.25, 34.14, -117.30)),
    ("I-15",  "^I 15$",   "lat", (33.85, -117.60, 34.15, -117.40)),
]


def overpass(q):
    body = urllib.parse.urlencode({"data": q}).encode()
    req = urllib.request.Request(OVERPASS, data=body,
                                 headers={"User-Agent": "detour-receipt-hackathon/0.1"})
    with urllib.request.urlopen(req, timeout=180) as r:
        return json.load(r)


def centerline(ways, axis, bins=90):
    """Collapse many overlapping way geometries into one ordered polyline."""
    pts = [(p["lat"], p["lon"]) for w in ways for p in w.get("geometry") or []]
    if not pts:
        return []
    key = (lambda p: p[0]) if axis == "lat" else (lambda p: p[1])
    lo, hi = min(map(key, pts)), max(map(key, pts))
    if hi - lo < 1e-9:
        return []
    buckets = {}
    for p in pts:
        i = min(bins - 1, int((key(p) - lo) / (hi - lo) * bins))
        buckets.setdefault(i, []).append(p)
    line = []
    for i in sorted(buckets):
        b = buckets[i]
        line.append([round(sum(x[1] for x in b) / len(b), 5),   # lon
                     round(sum(x[0] for x in b) / len(b), 5)])  # lat
    return line


def main():
    corridors = {}
    for name, ref, axis, (s, w, n, e) in CORRIDORS:
        q = (f'[out:json][timeout:120];'
             f'way["highway"~"motorway|trunk"]["ref"~"{ref}"]({s},{w},{n},{e});'
             f'out geom;')
        try:
            data = overpass(q)
        except Exception as ex:
            print(f"  !! {name}: {ex}", file=sys.stderr)
            continue
        line = centerline(data.get("elements", []), axis)
        corridors[name] = line
        print(f"  {name}: {len(data.get('elements', []))} ways -> {len(line)} pts")

    (OUT / "corridors.json").write_text(json.dumps(corridors))

    # schools across the whole study area
    q = ('[out:json][timeout:120];'
         '(node["amenity"="school"](33.70,-118.40,34.15,-117.35);'
         ' way["amenity"="school"](33.70,-118.40,34.15,-117.35););'
         'out center tags;')
    schools = []
    try:
        for el in overpass(q).get("elements", []):
            lat = el.get("lat") or (el.get("center") or {}).get("lat")
            lon = el.get("lon") or (el.get("center") or {}).get("lon")
            if lat and lon:
                schools.append({"n": (el.get("tags") or {}).get("name", "School"),
                                "lat": round(lat, 5), "lon": round(lon, 5)})
    except Exception as ex:
        print(f"  !! schools: {ex}", file=sys.stderr)
    (OUT / "schools_all.json").write_text(json.dumps(schools))
    print(f"  schools: {len(schools)}")


if __name__ == "__main__":
    main()
