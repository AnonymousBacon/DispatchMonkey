#!/usr/bin/env python3
"""Pull Sentinel-1 RTC (radar) crops of Cát Lái port from Microsoft Planetary Computer.
No key. One PNG per pass into data/satellite/history/<date>_<item>.png.
Run: python3 tools/fetch_s1_history.py [months]   (default 12)"""
import json, sys, subprocess, datetime as dt
from pathlib import Path
OUT = Path(__file__).resolve().parent.parent / "data/satellite/history"
OUT.mkdir(parents=True, exist_ok=True)
BBOX = [106.76, 10.73, 106.84, 10.80]
months = int(sys.argv[1]) if len(sys.argv) > 1 else 12
end = dt.date(2026, 11, 14); start = end - dt.timedelta(days=30 * months)
STAC = "https://planetarycomputer.microsoft.com/api/stac/v1/search"
items, body = [], {"collections": ["sentinel-1-rtc"], "bbox": BBOX,
        "datetime": f"{start}T00:00:00Z/{end}T23:59:59Z", "limit": 200}
url = STAC
while url:
    # curl, not urllib: curl uses the OS trust store (works behind proxies)
    page = json.loads(subprocess.run(["curl", "-s", "-m", "60", "-X", "POST", "-H", "Content-Type: application/json",
                       "-d", json.dumps(body), url], capture_output=True, check=True).stdout)
    items += [{"id": f["id"], "dt": f["properties"]["datetime"]} for f in page["features"]]
    nxt = [l for l in page.get("links", []) if l.get("rel") == "next"]
    url = None
    if nxt: body = nxt[0].get("body", body); url = nxt[0]["href"]
(OUT / "items.json").write_text(json.dumps(items, indent=1))
print(len(items), "passes", flush=True)
for it in items:
    f = OUT / f"{it['dt'][:10]}_{it['id']}.png"
    if f.exists(): continue
    u = (f"https://planetarycomputer.microsoft.com/api/data/v1/item/bbox/{','.join(map(str,BBOX))}.png"
         f"?collection=sentinel-1-rtc&item={it['id']}&assets=vv&rescale=0,0.4")
    try:
        subprocess.run(["curl", "-s", "-f", "-m", "90", "-o", str(f), u], check=True); print("ok", f.name, flush=True)
    except Exception as e:
        print("fail", it["id"], e, flush=True)
