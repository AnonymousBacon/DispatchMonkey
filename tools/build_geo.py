"""Turn raw OSM pulls into one small bundle the browser loads: static/geo.json.

Keeps only schools within SCHOOL_KEEP_MI of a corridor so the demo loads fast.
Community-burden zones are a hand-curated city-level approximation of
CalEnviroScreen 4.0 diesel-PM percentiles -- labelled as such in the UI.
"""
import json, math, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
SCHOOL_KEEP_MI = 1.0

# City-level approximation of CalEnviroScreen 4.0 diesel PM2.5 percentile.
# Source: OEHHA CalEnviroScreen 4.0, read off the published map at city level.
# This is an APPROXIMATION, not a tract-level join. Shown as such in the app.
BURDEN_ZONES = [
    {"name": "Wilmington",       "lat": 33.7866, "lon": -118.2645, "r": 2.0, "pct": 96},
    {"name": "West Long Beach",  "lat": 33.7900, "lon": -118.2130, "r": 1.8, "pct": 93},
    {"name": "Compton",          "lat": 33.8958, "lon": -118.2201, "r": 2.5, "pct": 90},
    {"name": "Commerce",         "lat": 34.0005, "lon": -118.1597, "r": 2.2, "pct": 88},
    {"name": "Carson",           "lat": 33.8317, "lon": -118.2820, "r": 2.2, "pct": 85},
    {"name": "Boyle Heights",    "lat": 34.0300, "lon": -118.2000, "r": 1.8, "pct": 87},
    {"name": "Fontana",          "lat": 34.0922, "lon": -117.4350, "r": 3.0, "pct": 82},
    {"name": "Rialto",           "lat": 34.1064, "lon": -117.3703, "r": 2.5, "pct": 80},
    {"name": "Ontario",          "lat": 34.0633, "lon": -117.6509, "r": 3.0, "pct": 72},
]


def mi(a_lon, a_lat, b_lon, b_lat):
    """Equirectangular approximation -- fine at this latitude and scale."""
    x = (b_lon - a_lon) * math.cos(math.radians((a_lat + b_lat) / 2)) * 69.17
    y = (b_lat - a_lat) * 69.05
    return math.hypot(x, y)


def main():
    cor = json.loads((ROOT / "data" / "corridors.json").read_text())
    schools = json.loads((ROOT / "data" / "schools_all.json").read_text())

    pts = [p for line in cor.values() for p in line]
    keep = []
    for s in schools:
        if any(mi(p[0], p[1], s["lon"], s["lat"]) < SCHOOL_KEEP_MI for p in pts):
            keep.append(s)

    bundle = {
        "corridors": cor,
        "schools": keep,
        "burden": BURDEN_ZONES,
        "sources": {
            "corridors": "OpenStreetMap motorway/trunk ways (ODbL), fetched via Overpass",
            "schools": "OpenStreetMap amenity=school (ODbL)",
            "burden": "CalEnviroScreen 4.0 diesel PM percentile, city-level APPROXIMATION",
        },
    }
    out = ROOT / "static" / "geo.json"
    out.write_text(json.dumps(bundle))
    print(f"corridors {len(cor)}  schools {len(schools)} -> {len(keep)} kept  "
          f"burden {len(BURDEN_ZONES)}  {out.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
