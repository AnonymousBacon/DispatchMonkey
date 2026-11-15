#!/usr/bin/env python3
"""Real-day inputs for the timelapse: radar ship count (static/vn/ships.json) + hourly rain
(Open-Meteo archive, no key) for a few real weekdays. Writes static/vn/days.json.
Run: python3 tools/fetch_days.py"""
import json, subprocess, sys, datetime as dt
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
from count_ships import count
S = json.loads((ROOT / "static/vn/ships.json").read_text())
DAYS = [("2026-04-02", "Busiest radar day of the year"), ("2026-01-14", "A typical day"), ("2026-08-19", "Busy rainy-season day")]
out = {"median_ships": S["median"], "days": []}
for date, label in DAYS:
    passes = [h for h in S["history"] if h["local"].startswith(date)]
    url = ("https://archive-api.open-meteo.com/v1/archive?latitude=10.76&longitude=106.79"
           f"&start_date={date}&end_date={date}&hourly=precipitation&timezone=Asia%2FBangkok")
    w = json.loads(subprocess.run(["curl", "-s", "-m", "20", url], capture_output=True, check=True).stdout)
    out["days"].append({"date": date, "weekday": dt.date.fromisoformat(date).strftime("%A"), "label": label,
                        "ships": passes[0]["ships"] if passes else None, "radar_pass": passes[0]["local"] if passes else None,
                        "rain_mm": w["hourly"]["precipitation"],
                        "radar_image": f"sat/day_{date}.png", "radar_file": passes[0]["file"] if passes else None,
                        "sources": {"ships": "Sentinel-1 radar count (tools/count_ships.py)", "rain": "Open-Meteo archive (ERA5), hourly, HCMC"}})
for d in out["days"]:   # that morning's radar crop with detected ships boxed (needs data/satellite/history)
    if d["radar_file"] and (ROOT / "data/satellite/history" / d["radar_file"]).exists():
        count(ROOT / "data/satellite/history" / d["radar_file"], overlay=ROOT / "static/vn" / d["radar_image"])
(ROOT / "static/vn/days.json").write_text(json.dumps(out, indent=1))
for d in out["days"]: print(d["date"], d["weekday"], d["ships"], "ships, rain total", round(sum(x or 0 for x in d["rain_mm"]), 1), "mm, wettest hour", max(d["rain_mm"]))
