#!/usr/bin/env python3
"""Technical test: pull everything we need from public ArcGIS/Esri REST services.

No API key. Saves raw GeoJSON per dataset to data/arcgis/ and prints a summary line
per dataset: name | count | sample fields. Corridor bbox = ports to Inland Empire.
"""
import json, pathlib, urllib.parse, urllib.request

BBOX = (-118.35, 33.70, -117.25, 34.15)  # lon/lat envelope over our 8 corridors
OUT = pathlib.Path(__file__).resolve().parent.parent / "data" / "arcgis"
OUT.mkdir(parents=True, exist_ok=True)

SERVICES = {
    "calenviroscreen": (
        "https://services1.arcgis.com/PCHfdHz4GlDNAhBb/arcgis/rest/services/"
        "CalEnviroScreen_4_0_Results_/FeatureServer/0", "*"),
    "truck_aadt": (
        "https://caltrans-gis.dot.ca.gov/arcgis/rest/services/CHhighway/"
        "Truck_Volumes_AADT/FeatureServer/0", "*"),
    "bottlenecks": (
        "https://caltrans-gis.dot.ca.gov/arcgis/rest/services/CHhighway/"
        "Bottlenecks/FeatureServer/0", "*"),
    "cctv": (
        "https://caltrans-gis.dot.ca.gov/arcgis/rest/services/CHhighway/"
        "CCTV/FeatureServer/0", "*"),
    "truck_network": (
        "https://caltrans-gis.dot.ca.gov/arcgis/rest/services/CHhighway/"
        "Truck_Network/FeatureServer/0", "*"),
    "rest_areas": (
        "https://caltrans-gis.dot.ca.gov/arcgis/rest/services/CHhighway/"
        "Rest_Areas/FeatureServer/0", "*"),
    "weigh_stations": (
        "https://caltrans-gis.dot.ca.gov/arcgis/rest/services/CHhighway/"
        "Vehicle_Enforcement_Facilities/FeatureServer/0", "*"),
}

def query(layer_url, out_fields):
    feats, offset = [], 0
    while True:
        params = urllib.parse.urlencode({
            "geometry": ",".join(map(str, BBOX)),
            "geometryType": "esriGeometryEnvelope", "inSR": 4326,
            "spatialRel": "esriSpatialRelIntersects", "outFields": out_fields,
            "outSR": 4326, "f": "geojson", "resultOffset": offset,
            "where": "1=1",
        })
        with urllib.request.urlopen(f"{layer_url}/query?{params}", timeout=60) as r:
            d = json.load(r)
        if "error" in d:
            raise RuntimeError(d["error"])
        feats += d.get("features", [])
        if not d.get("properties", {}).get("exceededTransferLimit") and not d.get("exceededTransferLimit"):
            break
        offset = len(feats)
    return feats

for name, (url, fields) in SERVICES.items():
    try:
        feats = query(url, fields)
        (OUT / f"{name}.geojson").write_text(json.dumps(
            {"type": "FeatureCollection", "features": feats}))
        keys = list(feats[0]["properties"].keys())[:12] if feats else []
        print(f"OK {name} | {len(feats)} features | {keys}")
    except Exception as e:
        print(f"FAIL {name} | {e}")
