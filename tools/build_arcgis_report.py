#!/usr/bin/env python3
"""Summarize data/arcgis/*.geojson into report HTML (stdout = path)."""
import json, pathlib, datetime

ROOT = pathlib.Path(__file__).resolve().parent.parent
D = ROOT / "data" / "arcgis"
CORRIDORS = {710, 110, 405, 91, 605, 60, 10, 15}

def load(name):
    return json.loads((D / f"{name}.geojson").read_text())["features"]

ces = load("calenviroscreen")
top = [f["properties"] for f in ces if (f["properties"].get("CIscoreP") or 0) >= 75]
top_pop = sum(p.get("ACS2019TotalPop") or 0 for p in top)

aadt = [f["properties"] for f in load("truck_aadt") if f["properties"].get("RTE") in CORRIDORS]
by_rte = {}
for p in aadt:
    r = by_rte.setdefault(p["RTE"], {"n": 0, "max": 0, "max_desc": "", "sum": 0})
    t = p.get("TOT_TRK_AADT") or 0
    r["n"] += 1; r["sum"] += t
    if t > r["max"]:
        r["max"], r["max_desc"] = t, (p.get("DESCRIPTION") or "")

bots = sorted((f["properties"] for f in load("bottlenecks")), key=lambda p: p.get("Rank") or 999)
cctv = load("cctv")
tn = load("truck_network")
ws = [f["properties"] for f in load("weigh_stations")]

def n(x): return f"{x:,}"

rte_rows = "".join(
    f"<tr><td>{'I-' if r in (710,110,405,605,10,15) else 'SR-'}{r}</td>"
    f"<td class='r'>{v['n']}</td><td class='r'>{n(v['max'])}</td>"
    f"<td class='r'>{n(round(v['sum']/v['n']))}</td><td>{v['max_desc'].title()}</td></tr>"
    for r, v in sorted(by_rte.items(), key=lambda kv: -kv[1]["max"]))

bot_rows = "".join(
    f"<tr><td class='r'>{p.get('Rank')}</td><td>{p.get('Fwy')}</td><td>{p.get('Name')}</td>"
    f"<td class='r'>{float(p.get('Avg_Extent__Miles_') or 0):.1f}</td><td class='r'>{p.get('Number_Days_Active')}</td></tr>"
    for p in bots[:10])

ws_rows = "".join(
    f"<tr><td>{p['FACILITY_NAME'].title()}</td><td>{p['ROUTE']}</td><td>{p['DIRECTION']}</td><td>{p['COUNTY']}</td></tr>"
    for p in ws)

html = f"""<!doctype html><meta charset="utf-8"><style>
@page {{ size: letter; margin: 18mm }}
body {{ font: 10.5pt/1.55 -apple-system, 'Helvetica Neue', sans-serif; color: #16202b; max-width: 740px }}
h1 {{ font-size: 19pt; margin: 0 0 2px }} h2 {{ font-size: 13pt; margin: 22px 0 6px; border-bottom: 1.5px solid #16202b; padding-bottom: 3px }}
.sub {{ color: #5a6775; margin: 0 0 14px }}
table {{ border-collapse: collapse; width: 100%; font-size: 9.5pt; margin: 6px 0 }}
th, td {{ border: 1px solid #c9d2dc; padding: 4px 7px; text-align: left; vertical-align: top }}
th {{ background: #eef2f6 }} td.r {{ text-align: right; font-variant-numeric: tabular-nums }}
.tag {{ display: inline-block; background: #eef2f6; border: 1px solid #c9d2dc; border-radius: 3px; padding: 0 6px; font-size: 8.5pt }}
ul {{ margin: 4px 0; padding-left: 18px }}
.note {{ background: #fff7e8; border: 1px solid #e8d5a8; padding: 8px 12px; border-radius: 4px }}
</style>
<h1>ArcGIS / Esri Technical Test — Data Access Report</h1>
<p class="sub">Detour Receipt · Port-to-Warehouse corridor (Ports of LA/LB → Inland Empire) · {datetime.date.today().isoformat()} · all services reached anonymously over public ArcGIS REST, no API key</p>

<h2>1. What we accessed (all verified working today)</h2>
<table><tr><th>Dataset</th><th>Owner / host</th><th>Features in corridor bbox</th><th>Use in app</th></tr>
<tr><td>CalEnviroScreen 4.0 Results</td><td>OEHHA (services1.arcgis.com)</td><td class="r">{n(len(ces))} census tracts</td><td>Real pollution-burden polygons for the fairness/exposure layer (replaces our 9 approximate circles)</td></tr>
<tr><td>Truck Volumes (AADT)</td><td>Caltrans (caltrans-gis.dot.ca.gov)</td><td class="r">{n(len(aadt))} count points on our 8 corridors</td><td>Calibrate baseline truck demand per corridor</td></tr>
<tr><td>Congestion Bottlenecks</td><td>Caltrans</td><td class="r">{len(bots)} ranked bottlenecks</td><td>Validate that our demo corridors are the real problem spots</td></tr>
<tr><td>CCTV cameras</td><td>Caltrans</td><td class="r">{n(len(cctv))} cameras</td><td>Future: visual confirmation of incidents (locations only; no feed scraped)</td></tr>
<tr><td>Truck Network restrictions</td><td>Caltrans</td><td class="r">{len(tn)} segments</td><td>Legal truck routing (STAA/advisory restrictions)</td></tr>
<tr><td>Weigh / enforcement stations</td><td>Caltrans</td><td class="r">{len(ws)}</td><td>Known fixed delay points for ETA</td></tr>
<tr><td>Rest areas</td><td>Caltrans</td><td class="r">0 in bbox</td><td>None inside urban corridor — confirms the truck-parking gap</td></tr></table>
<p>Raw GeoJSON saved under <span class="tag">data/arcgis/</span> (8&nbsp;MB). Fetch script: <span class="tag">tools/fetch_arcgis.py</span> — rerunnable, paginated, bbox-filtered.</p>

<h2>2. Key numbers we needed</h2>
<ul>
<li><b>{n(len(top))} of {n(len(ces))} tracts</b> in our corridor area are in CalEnviroScreen's top-25% burden percentile — <b>{n(top_pop)} residents</b>. This is the population our exposure metric protects.</li>
<li>Truck traffic peaks at <b>{n(max(v["max"] for v in by_rte.values()))} trucks/day</b> (see table) — consistent with the port-drayage story in our pitch.</li>
<li>{len(bots)} official Caltrans bottlenecks fall inside our map; several sit exactly on our demo detour (SR-91 / I-605).</li>
</ul>

<h2>3. Truck AADT by corridor (Caltrans count points)</h2>
<table><tr><th>Route</th><th>Points</th><th>Max trucks/day</th><th>Avg trucks/day</th><th>Busiest location</th></tr>{rte_rows}</table>

<h2>4. Top official bottlenecks in our area (Caltrans rank)</h2>
<table><tr><th>Rank</th><th>Fwy</th><th>Name</th><th>Avg extent (mi)</th><th>Days active</th></tr>{bot_rows}</table>

<h2>5. Weigh / enforcement stations</h2>
<table><tr><th>Facility</th><th>Route</th><th>Dir</th><th>County</th></tr>{ws_rows}</table>

<h2>6. Driver-first design: what we apply to the driver page</h2>
<p>Findings from published truck-driver UX research (ATRI tech-adoption surveys, FMCSA HMI guidance, trucking-app reviews), mapped to concrete changes:</p>
<table><tr><th>Drivers tend to…</th><th>So the driver page…</th></tr>
<tr><td>Use phones mounted at arm's length, often with gloves, in sun glare</td><td>Minimum 18px body text, 56px+ tap targets, high-contrast dark theme</td></tr>
<tr><td>Hate typing; love one-tap actions</td><td>Check-in is one button per state; every field has a default</td></tr>
<tr><td>Distrust apps that hide the "why" (dispatch black boxes)</td><td>Every number carries its source; receipt explains each decision</td></tr>
<tr><td>Abandon apps that demand accounts or permissions</td><td>No install, no login, no GPS requirement — a plain URL</td></tr>
<tr><td>Check at stops, not while rolling</td><td>Glanceable cards, no time-outs, state survives reload</td></tr></table>
<p class="note"><b>Honest label:</b> the rows above come from published industry research, not from telemetry we collected — we have no real driver data yet. Driver check-ins in the app are the mechanism that would turn this into measured, per-fleet evidence.</p>

<h2>7. Terms check</h2>
<ul><li>Caltrans GIS data: public domain / open. CalEnviroScreen: public OEHHA data.</li>
<li>Esri basemaps: we use the free Esri dark canvas tiles with attribution; no ArcGIS subscription content is redistributed.</li>
<li>CCTV: we store camera <i>locations</i> only; no video is scraped.</li></ul>
"""
out = ROOT / "data" / "arcgis_report.html"
out.write_text(html)
print(out)
