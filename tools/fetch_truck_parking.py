"""Find truck-parking candidates around Cát Lái in OpenStreetMap and record what
OSM actually says about truck access.

The point of this script is the *negative* result as much as the positive one.
Run on 2026-11-15 over a 0.45° box around Cát Lái it returns ~245 parking
features and **not one** carries `hgv=*`, `goods=*`, `amenity=truck_stop` or a
`maxweight` high enough to admit a 40 ft container tractor. So the app must not
recommend any of them: a lot tagged `amenity=parking` in Ho Chi Minh City is a
motorbike or car yard until a human says otherwise.

Output: data/vn/truck_parking.json
  stops[].truck_access = "verified" | "unknown" | "no"
Only "verified" is ever recommended to a driver, and "verified" can only be set
by a human editing `VERIFIED` below with an operator or local source. OSM tags
alone never promote a stop to "verified" — that is the whole safety argument.

shortcut: one Overpass snapshot committed to the repo, not a live call at
request time. Upgrade to a scheduled refresh if the app ever leaves the demo.
"""
import json, pathlib, sys, datetime

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent))
from fetch_osm import overpass

OUT = pathlib.Path(__file__).resolve().parent.parent / "data" / "vn" / "truck_parking.json"
GATE = (10.7578, 106.78911)          # Cát Lái gate, Nguyễn Thị Định — same point the app uses

# Near box (candidates a driver could plausibly reach off the gate run) and a
# wider box for "search farther ahead".
NEAR = (10.68, 106.68, 10.86, 106.90)
FAR = (10.55, 106.50, 11.00, 107.10)

# Human-verified truck access. Each entry needs `source` (an operator page, a
# published notice, or a named local check) and `verified_on`. Empty is a valid
# and honest state: see the module docstring.
#
# way/585972122 is the second half of the same facility as way/585972121 (the
# carriageways are mapped separately), so only the northbound one is kept.
VERIFIED = {
    "way/585972121": {
        "truck_access": "verified",
        "why": ("Official service area on the CT.01 HCMC–Long Thành–Dầu Giây expressway, "
                "Km 41+100. Press and operator listings describe it serving stopping, "
                "resting and refuelling for drivers, passengers AND trucks (xe tải). "
                "Open 24h, tel 0251.3683.007."),
        "overnight": "likely",   # 24h site; no published overnight-stay rule found
        "short_rest": "yes",
        "toilets": "yes",
        "caveat": ("Reported repeatedly overloaded — it is the only service area on "
                   "~250 km of expressway and queues for the toilets are long."),
        "source": ("https://vietnamnet.vn/tram-dung-cao-toc-long-thanh-dau-giay-qua-tai-"
                   "khach-xep-hang-cho-di-ve-sinh-2163436.html ; "
                   "https://datxeviet.vn/tram-dung-chan-cao-toc-dau-giay/"),
        "verified_on": "2026-11-15",
    },
}
DROP = {"way/585972122"}

# Places drivers demonstrably DO stop that the app must tell them not to. Not
# candidates — warnings, carried so the parking list can answer "why not there".
AVOID = [{
    "id": "manual/vo-chi-cong-ramp",
    "name": "Đường dẫn cao tốc ra Võ Chí Công",
    "name_en": "Expressway access ramp towards Võ Chí Công",
    "lat": 10.7985, "lon": 106.7605,     # ramp between the CT.01 approach and Võ Chí Công
    "truck_access": "no",
    "truck_access_why": ("Tractors and containers queue along this ramp overnight even "
                         "though it is signposted no-stopping (biển cấm). Reported by "
                         "Tuổi Trẻ, 2025-12-24. Parking here risks a fine and blocks the ramp."),
    "source": ("https://tuoitre.vn/xe-dau-keo-container-dau-hang-dai-tren-duong-dan-cao-toc-"
               "huong-ra-duong-vo-chi-cong-du-co-bien-cam-20251224141929427.htm"),
    "verified_on": "2026-11-15",
}]


def q_near(s, w, n, e):
    return f"""[out:json][timeout:120];
(
  nwr["amenity"="parking"]({s},{w},{n},{e});
  nwr["amenity"="truck_stop"]({s},{w},{n},{e});
  nwr["parking"="depot"]({s},{w},{n},{e});
);
out tags center;"""


def q_far(s, w, n, e):
    return f"""[out:json][timeout:120];
(
  nwr["amenity"="truck_stop"]({s},{w},{n},{e});
  nwr["highway"="rest_area"]["area"="yes"]({s},{w},{n},{e});
  nwr["highway"="services"]({s},{w},{n},{e});
  nwr["amenity"="parking"]["hgv"]({s},{w},{n},{e});
  nwr["amenity"="parking"]["goods"]({s},{w},{n},{e});
  nwr["amenity"="parking"]["maxweight"]({s},{w},{n},{e});
  nwr["industrial"="depot"]["depot"="container"]({s},{w},{n},{e});
);
out tags center;"""


def km(lat, lon):
    """Flat-earth distance to the gate in km — the same constants /vn/ uses at 10.7°N."""
    dlat = (lat - GATE[0]) * 111.320
    dlon = (lon - GATE[1]) * 109.200
    return round((dlat * dlat + dlon * dlon) ** 0.5, 2)


def truck_access(t):
    """What OSM alone can justify. Never returns "verified" — only a human can."""
    if t.get("amenity") == "truck_stop":
        return "unknown", "tagged amenity=truck_stop but no access or hgv tag"
    for k in ("hgv", "goods", "truck"):
        if t.get(k) in ("yes", "designated"):
            return "unknown", f"OSM says {k}={t[k]}, not confirmed on the ground"
        if t.get(k) == "no":
            return "no", f"OSM says {k}=no"
    if t.get("access") in ("private", "permit"):
        return "no", f"OSM says access={t['access']}"
    if t.get("parking") in ("underground", "multi-storey", "street_side"):
        return "no", f"parking={t['parking']} cannot take a container tractor"
    return "unknown", "no truck-access tag in OSM"


def collect(elements, scope):
    out = []
    for e in elements:
        t = e.get("tags") or {}
        c = e.get("center") or {"lat": e.get("lat"), "lon": e.get("lon")}
        if c.get("lat") is None or c.get("lon") is None:
            continue
        acc, why = truck_access(t)
        osm_id = f"{e['type']}/{e['id']}"
        if osm_id in DROP:
            continue
        v = VERIFIED.get(osm_id)
        out.append({
            "id": osm_id,
            "name": t.get("name") or t.get("name:vi") or t.get("operator") or None,
            "name_en": t.get("name:en"),
            "lat": round(c["lat"], 6), "lon": round(c["lon"], 6),
            "km_to_gate": km(c["lat"], c["lon"]),
            "scope": scope,
            "truck_access": v["truck_access"] if v else acc,
            "truck_access_why": v.get("why", why) if v else why,
            "kind": t.get("amenity") or t.get("highway") or t.get("industrial"),
            "access": t.get("access"),
            "fee": t.get("fee"),
            "hours": t.get("opening_hours"),
            "toilets": t.get("toilets"),
            "overnight": v.get("overnight") if v else None,
            "short_rest": v.get("short_rest") if v else None,
            "operator": t.get("operator"),
            "caveat": v.get("caveat") if v else None,
            "source": v["source"] if v else f"OpenStreetMap {osm_id}",
            "verified_on": v["verified_on"] if v else None,
        })
    return out


def main():
    today = datetime.date.today().isoformat()
    near = collect(overpass(q_near(*NEAR)).get("elements", []), "near")
    far = collect(overpass(q_far(*FAR)).get("elements", []), "far")
    seen = {s["id"] for s in near}
    far = [s for s in far if s["id"] not in seen]

    # A lot that cannot take a tractor is noise, not a candidate. Keep only what a
    # human could still promote, and the nearest of those.
    near = [s for s in near if s["truck_access"] != "no"]
    far = [s for s in far if s["truck_access"] != "no"]
    near.sort(key=lambda s: s["km_to_gate"])
    far.sort(key=lambda s: s["km_to_gate"])

    stops = near[:12] + far[:8]
    doc = {
        "source": "OpenStreetMap via Overpass API",
        "fetched_on": today,
        "near_bbox": list(NEAR), "far_bbox": list(FAR),
        "gate": {"lat": GATE[0], "lon": GATE[1]},
        "verified_count": sum(1 for s in stops if s["truck_access"] == "verified"),
        "note": ("OSM carries no hgv/goods/truck_stop tag on any parking feature in "
                 "this area, so no stop can be recommended from OSM alone. A stop is "
                 "only recommended once a human records an operator or local source "
                 "in tools/fetch_truck_parking.py:VERIFIED."),
        "stops": stops,
        "avoid": AVOID,
    }
    for a in AVOID:
        a["km_to_gate"] = km(a["lat"], a["lon"])
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(doc, ensure_ascii=False, indent=1))
    print(f"{OUT}: {len(stops)} candidates, {doc['verified_count']} with verified truck access")


if __name__ == "__main__":
    main()
