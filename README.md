# DispatchMonkey: getting trucks to Cát Lái port on time

> **When Cát Lái's gate jams, DispatchMonkey tells a dispatcher *when* each truck should leave, so it skips
> the queue, picks up a container that is actually ready, and still hits its warehouse window,
> without just moving the jam to the next hour.**
>
> *Everyone else reroutes. We retime.*

CGU Hacks 2026 · GeoAI track (Port-to-Warehouse Visibility and Decision Support) · Perspective 2:
Delivery Reliability and Capacity Coordination, with Perspective 3's cost and sustainability trade-offs on top.

| Surface | Who | URL (local) |
|---|---|---|
| **Website: dispatcher** | The person at a trucking company who assigns trucks to jobs | `http://localhost:8787/` |
| **Phone: driver app** | The truck driver (Vietnamese / English) | `http://localhost:8787/vn/` |

---

## Contents
1. [The problem](#1-the-problem)
2. [The idea](#2-the-idea)
3. [Run it](#3-run-it)
4. [Demo walkthrough](#4-demo-walkthrough)
5. [What's on each screen](#5-whats-on-each-screen)
6. [How it works: the engine](#6-how-it-works-the-engine)
7. [The herding problem and how we solve it](#7-the-herding-problem-and-how-we-solve-it)
8. [Where AI is used (and where it is not)](#8-where-ai-is-used-and-where-it-is-not)
9. [Data: what's real, what's estimated, what's simulated](#9-data-whats-real-whats-estimated-whats-simulated)
10. [Satellite radar ship counter](#10-satellite-radar-ship-counter)
11. [Live traffic](#11-live-traffic)
12. [Indicators and results](#12-indicators-and-results)
13. [Responsible design](#13-responsible-design)
14. [How this maps to the judging rubric](#14-how-this-maps-to-the-judging-rubric)
15. [Architecture and files](#15-architecture-and-files)
16. [Server API](#16-server-api)
17. [Tests](#17-tests)
18. [Limitations and known issues](#18-limitations-and-known-issues)
19. [What's next](#19-whats-next)
20. [Team workflow](#20-team-workflow)
21. [Credits and licenses](#21-credits-and-licenses)

---

## 1. The problem

Cát Lái, in Thủ Đức, Ho Chi Minh City, is Vietnam's busiest container terminal. Public reports put the
traffic at **16,000–22,000 trucks a day** through one gate complex (we use ≈19,000, an ESTIMATE).

Moving a container from the port to an inland warehouse needs four things to line up: the container is
**ready** (released by customs and the terminal), a **truck** is free, the **roads** are passable, and the
**warehouse** has a receiving window open. Most trucks arrive in the same 2–3 morning hours, so they queue
on the approach roads (Nguyễn Thị Định, Đồng Văn Cống, the Phú Mỹ bridge) with engines running.

Who pays for that queue:

| Who | Cost |
|---|---|
| **Drivers** | Many are paid per trip, so waiting time is **unpaid**. It appears in no company report. |
| **Trucking companies** | Idling diesel (≈3 L/h per truck, an assumption), missed warehouse appointments, fewer trips per day |
| **Warehouses** | Trucks arriving late or bunched up, wasted dock time |
| **Neighbours** | Exhaust and noise next to homes, clinics and a school on the queue road |

Navigation apps can't fix this: they answer *which way*, but the bottleneck is the **gate**, not the road.
A faster route only gets you to the same queue sooner.

## 2. The idea

**Retime, don't reroute.** DispatchMonkey chooses *when* each truck leaves so it arrives when the gate queue is
short. Rerouting moves exhaust onto another street; retiming removes idling.

Three design decisions make it work:

1. **Anti-herding.** If an app tells everyone "8:15 is quiet", everyone goes at 8:15 and 8:15 jams. DispatchMonkey
   places trucks **one at a time and counts its own trucks in the queue**, so the advice never creates a new
   peak. See [section 7](#7-the-herding-problem-and-how-we-solve-it).
2. **App users first, fair inside the app.** The plan optimizes for trucks that use the app (non-app trucks are
   background traffic), and among app users each truck's time is scored by *its own wait plus the wait it adds
   to every other app user* ("rule B"). Install it and you beat the queue; everyone who installs it shares the
   good slots fairly.
3. **The human decides.** The dispatcher reviews, questions and approves every plan. Nothing is sent to a
   driver without a tap.

Decision lens used throughout: *"How does Amazon solve this, with the environmental angle?"* Amazon's dock
appointments make a full slot disappear; its checkout greys out full delivery slots and nudges consolidated
"Amazon Day" delivery. DispatchMonkey does the same for a port gate.

## 3. Run it

Requirements: Python 3.9+ (no packages for the server), Node 18+ (tests only). Python `numpy` + `Pillow` only
if you re-run the satellite ship counter.

```bash
cd TruckTrack
```
```bash
python3 server.py
```
Then open `http://localhost:8787/` (dispatcher) and `http://localhost:8787/vn/` (driver phone).

**Optional live data:** create `TruckTrack/.env` (it's gitignored; never commit it):
```
TOMTOM_KEY=your-tomtom-key
AISSTREAM_KEY=your-aisstream-key
```
Without keys everything still works; the live-traffic chip just says it's unavailable.

**Share it publicly** (for phones or judges): run a Cloudflare quick tunnel on the same laptop as the server.
```bash
cloudflared tunnel --url http://localhost:8787
```
It prints a random `https://….trycloudflare.com` address. The link works only while that laptop is awake, and
the address changes every time the tunnel restarts.

**Reset the demo:** press **Reset demo** on the website (resets the phone too).

## 4. Demo walkthrough

The website has a 5-step replay (◀ / **Next ▶**, or the arrow keys). The phone follows along live.

| Step | Clock (HCMC) | What happens | What changes on screen |
|---|---|---|---|
| 1 | 05:45 | **Normal morning.** 12 trucks planned. | All windows met, 0 idle minutes |
| 2 | 06:03 | **Driver report: UNCONFIRMED.** One driver texts (Vietnamese, Zalo) that there's a crash on the Phú Mỹ bridge. | A pin on the map, evidence ladder at "unconfirmed". **The plan does not change.** One report is evidence, not proof. |
| 3 | 06:08 | **Second, independent source.** Another driver reports the same jam and the bridge speed drops. | Evidence ladder → CONFIRMED |
| 4 | 06:10 | **Capacity drops + ship wave.** The crash cuts gate-approach throughput (×0.6 for 60 min, ESTIMATE); radar shows a big ship, so a truck wave of +40% hits 08:00–11:00 (ESTIMATE). | KPIs jump: cost leakage 1,120,000 ₫, 71 idle min, 2 trucks late (red) |
| 5 | 06:10 | **Re-plan, dispatcher approves.** The allocator re-times trucks that haven't left. | Bars shift; 35,000 ₫, 24 idle min, all windows met. After **Approve**, the driver's phone shows the new time. |

A driver can also start the disruption from the phone with **⚠ Report a jam**; the website jumps to "unconfirmed".

## 5. What's on each screen

### Website (dispatcher), `static/vn/dispatch.html`
| Section | What it does |
|---|---|
| Header | Who it's for (dispatcher, Cát Lái gate), link to the driver phone, sync status, **Reset demo** |
| Replay steps + narration | Drives the demo from normal → disruption → re-plan; each step explains itself in one line |
| **6 KPI cards** | Cost leakage (₫), idle truck-minutes, worst-off per-trip driver's unpaid minutes, warehouse-window hit rate, idle minutes next to schools/clinics, idle CO₂. Change vs the previous step is shown. Hover or click any card for its formula, inputs and truth tier. |
| **Map** | Esri satellite basemap (or no basemap offline), Sentinel-1 radar overlay with detected ships boxed, the gate, 3 warehouses, schools/clinics within 150 m of the queue road, the queue drawn with a length proportional to the wait, the incident pin |
| **12-truck timeline** | Each truck: drive → gate queue (engine on) → pick-up (30 min, EST) → drive → warehouse window; ◆ = container ready; the faint bar is the old plan |
| **Why each truck's time** | Stakeholder tags per truck (warehouse window, driver, community, environment, dispatcher). Hover for the numbers. Shows which person's need set that truck's time. |
| **Evidence ladder** | report → UNCONFIRMED → second independent source → CONFIRMED → capacity change. "Trust unconfirmed reports" switch: the dispatcher may act early, and it's logged. |
| **Recommendation** | One plain sentence about the plan. The engine writes every number; the number guard is shown. |
| **Re-plan / Approve & send / Override a truck…** | Human control. Overrides need a reason. |
| **Activity log** | Every machine output and human decision. No names, no locations stored. |
| **Ships at berth from space** | Latest radar count, the 12-month history, and the forecast with its honest backtest |
| **Anti-herding chart + adoption slider** | Port-level queue under three policies at 10–60% adoption (SIMULATED) |
| **Truth-tier legend** | LIVE · REAL · EST · DERIVED · SIM |

Every element with an explanation uses one tooltip: hover to see it, click to pin it (works on touch), Esc to close.

### Phone (driver), `static/vn/index.html`
| Section | What it does |
|---|---|
| **Dispatcher plan card** (for the chosen truck, e.g. T09) | The time the dispatcher approved, gate time, gate wait, warehouse arrival vs closing time; alerts when an incident makes the old plan late; "new plan waiting for approval"; "NEW TIME" after approval |
| Driver protection line | "Nobody is pushed more than 45 min later than planned. You: …" |
| App-users-first line | Explains the allocation rule in one sentence |
| **⚠ Report a jam** | Sends a report to the dispatcher (shows as UNCONFIRMED) |
| Own-trip planner (folded) | "Not on a fleet job? Plan your own trip ▸": best departure for a solo trip, with full cost breakdown (fuel, toll, driver time, penalties, unpaid minutes) and "Why this time?" |
| **Gate slots** tab | How busy each 30-minute block is; full slots are shown as taken |
| **Settings** tab | Language (Tiếng Việt / English), truck, scenario, pay type, rules book (each rule with source + date), fairness ledger |
| Live conditions | Air quality, rain, tide (Open-Meteo) |
| Map | MapLibre 3D map; labels follow the app language |

## 6. How it works: the engine

All numbers come from deterministic, tested JavaScript: `static/vn/scoring.js` (queue + allocator) and
`static/vn/fleet.js` (the fleet-day). They run in the browser and in Node for tests. **No language model
produces any number.**

### 6.1 Rules: what's allowed
Before a time is considered, each truck's feasible window is computed (`feasibleWindow` in `fleet.js`):
- not before the **container is ready** (and customs not red),
- arrive at the warehouse inside the **receiving window**, with a 10-min dock buffer,
- **shift-creep cap**: never more than **45 min later** than the driver's original plan,
- port hours, the inner-city heavy-truck ban 06:00–22:00 (QĐ 23/2018/QĐ-UBND, dated, re-verify), driver hours.

The Rules Book (`data.js` → `RULES`) shows each rule with its **source, date checked and confidence**.

### 6.2 Queue model (fluid queue, 15-minute blocks)
```
Q[t+1] = max(0, Q[t] + A_bg[t]·k_surge + A_fleet[t] − C[t])
wait[t] = Q[t] / C[t] × 15 min
```
- `A_bg`: background arrivals, a SIMULATED day curve scaled to ≈19k trucks/day (`data.js` → `ARRIVALS`)
- `A_fleet`: **our own assigned trucks**, the anti-herding term
- `C`: gate capacity, 210 trucks / 15 min normally (DERIVED), lower after a confirmed incident
- Ranges are shown wherever a wait is an estimate.

`queueProfile(scn, extra)` computes the whole day at once; `queueWaitAt(m, scn, extra)` reads one block.

### 6.3 Allocator (`allocateFleet` in `scoring.js`)
```
for each truck, tightest window first:
    for each feasible 15-min block t:
        cost[t] = (app users' total wait if this truck goes at t) − (app users' total wait now)
                  + tiny tie-break toward the earlier block
    pick the cheapest t
    load[t] += 1          ← the next truck sees this one
```
Strategies (used for comparisons): `'same'` (everyone leaves when planned, today's habit), `'naive'` (everyone
gets the block that looks quietest ignoring our own trucks, typical app behaviour), and `'aware'` (DispatchMonkey).

### 6.4 Fleet-day planner (`fleet.js`)
- **12 SIMULATED trucks** (T01–T12), 3 warehouses (industrial parks Hiệp Phước, Sóng Thần, Long Hậu), each with
  shift start, planned departure, container ready time, customs channel, receiving window and pay type (per-trip/hourly).
- `planSlots` adds stakeholder costs on top of the queue: **community** (idle minutes near schools/clinics, ×3 at
  school-bell times 06:30–08:00 and 16:00–17:30), the **driver** creep cap, and **re-plan stability** (a move must
  save ≥ 5 min, so the dispatcher isn't flooded with tiny changes). Trucks already on the road are not moved.
- `runDay` produces Normal, Changed-no-re-plan ("stale") and Changed-re-plan evaluations; `kpis` computes the indicators.
- `compareMoneyOnly` re-plans with a **money-only policy** (no creep cap, no community cost) to show how the
  driver and community rules changed decisions.
- `whyTruck` writes the per-truck stakeholder explanation; `herdingCurves` produces the anti-herding chart.

### 6.5 The disruption (`EVENT` in `fleet.js`, all ESTIMATES)
Crash on the Phú Mỹ bridge at 06:00, clears after 60 min (sensitivity 30/60/90), gate-approach throughput ×0.6,
bridge-route speed ×0.55; a big ship's truck wave of +40% from 08:00 to 11:00.

## 7. The herding problem and how we solve it

**Problem:** advice that ignores its own effect destroys itself. Tell everyone the same "best time" and it
becomes the new peak.

**This is a well-known problem; we use known fixes:**

| Field | Name | Standard fix | What we use |
|---|---|---|---|
| Distributed systems | Thundering herd | Spread requests, capacity counters | Per-block load counter |
| Load balancing | Join-the-shortest-queue, power of two choices | Account for load as you assign | Incremental assignment |
| Transport economics | Selfish routing, price of anarchy | System-optimal (marginal-cost) assignment | Rule B among app users |
| Traffic engineering | Incremental assignment | Load demand step by step, recompute costs | One truck at a time |
| Port operations | Truck appointment systems; LA/Long Beach PierPASS OffPeak | Capacity-capped time slots | Full slots disappear (Amazon-style) |

**Worked example.** Gate capacity 60 / 15 min. Background: 8:00 → 55, 8:15 → 50, 8:30 → 58 (spare 5/10/2).
12 trucks. Naive: all 12 at 8:15 → 62 > 60, so a queue forms (and with 100 fleets doing this, 1,250 trucks
against 60). Incremental: 4 at 8:00, 8 at 8:15, nobody over capacity.

**Evidence** (port-level, SIMULATED, peak trucks queued at the gate, from `pitch/tests.md`):

| Adoption | No app (today) | Naive "best time" app | DispatchMonkey |
|---|---|---|---|
| 10% | 239 | 341 | 56 |
| 30% | 239 | 1,218 | 34 |
| 60% | 239 | 2,535 | 34 |

A naive app makes the port **worse** than no app at all; capacity-aware allocation flattens the peak. Tests
T-H1…T-H4 in `tools/test_vn.mjs` prove the ordering.

## 8. Where AI is used (and where it is not)

**The golden rule: the AI never produces a number.** Every figure comes from the engine.

| Job | How | Guardrail |
|---|---|---|
| **Intake**: driver's Vietnamese text → structured event (place, type, lanes blocked, direction, confidence) | Shown in the replay as a **cached fixture** written to the intake schema (not a live model call on stage) | Place snapped to OSM; the engine reads only `lanes_blocked` to pick a severity row |
| **Verifier**: a report (or photo) is labeled, never confirmed alone | Evidence ladder | CONFIRMED needs **two independent sources** (a second driver, or a measured speed drop) |
| **Planner sentence**: one-line explanation | Template sentence on stage; `server.py` `/api/explain` can ask a model for prose | `check_no_invented_numbers()` rejects any reply containing a figure not in the supplied data; the UI falls back to its own sentence |
| **Ship detection** in radar | Classic image processing, not a neural network ([section 10](#10-satellite-radar-ship-counter)) | "Radar sees ships, never trucks" is stated on screen |
| **Ship forecast** | Linear model on radar history | Shown with its backtest; **it does not beat the baseline yet, so the demo uses the measured count** |

This follows the brief's warning: *a feature detected in imagery does not by itself confirm that a road is blocked.*

## 9. Data: what's real, what's estimated, what's simulated

Every on-screen number carries one **truth tier**:

| Tier | Meaning |
|---|---|
| **LIVE** | Fetched today from a public API, with a timestamp |
| **REAL** | Real public dataset, with source and date |
| **EST** | A published rate or our estimate |
| **DERIVED** | Computed by the engine from the tiers above |
| **SIM** | Invented for the demo (field names are real) |

| Data | Tier | Source |
|---|---|---|
| Roads, schools, clinics, homes near the queue road | REAL | OpenStreetMap via Overpass (`tools/fetch_osm_vn.py` → `static/vn/geo.json`) |
| Ships near Cát Lái, 115 passes over 12 months | REAL | Sentinel-1 RTC radar, Microsoft Planetary Computer |
| Gate-approach road speeds | LIVE | TomTom Traffic Flow Segment v4 (key in `.env`), logged to `data/logs/flow.jsonl` |
| Air quality, rain, tide | LIVE | Open-Meteo (air-quality, forecast, marine APIs) |
| Satellite basemap | REAL | Esri World Imagery |
| Diesel price, 26,820 ₫/L | EST (official) | Retail price set by the Ministries of Industry and Trade and of Finance, effective 15:00 on 12 Nov 2026 (reported by Dân Trí). Grade not stated in the report. |
| Truck ban, port hours | REAL (dated) | QĐ 23/2018/QĐ-UBND; SNP tariff 01/04/2021 (re-verify) |
| ≈19,000 trucks/day | EST | Public reports (16–22k) |
| Idle burn 3 L/h, CO₂ 2.68 kg/L, driver wage, tolls, trucks per ship, crash severity, surge | EST | Assumptions and published factors, labeled |
| Gate capacity 210 / 15 min | DERIVED | From the published daily volume |
| The 12 trucks, their jobs, ready times, warehouse windows, the background arrival curve | SIM | Invented. No public container-level or gate wait-time data exists |

The team's research pack is in `data/Vietnam_Port_Congestion_Data_Pack/` (sources and evidence, illustrative
scenarios, empty collection templates for future real observations, metric definitions).

## 10. Satellite radar ship counter

**Why radar:** satellites can't see trucks (a truck is 1–2 pixels at 10 m), but **ships** are clear, and radar
sees through HCMC's clouds. A big ship at berth means a truck wave 6–24 hours later.

**Pipeline:**
1. `tools/fetch_s1_history.py [months]`: STAC search of `sentinel-1-rtc` over bbox `106.76,10.73,106.84,10.80`,
   then one PNG crop per pass (VV band) into `data/satellite/history/`. No key needed.
2. `tools/count_ships.py`: classic, explainable detection (no deep learning):
   - water mask = 25×25 neighbourhood mostly dark (< 60),
   - ship pixels = very bright (≥ 230) on water,
   - ships = bright blobs ≥ 10 px, pieces within 3 px merged.
   Writes `static/vn/ships.json` (history, latest, forecast) and `static/vn/sat/latest_overlay.png` (ships boxed).
3. **Forecast**: `next = 23.0 + 0.23 × previous pass`, trained on 85 passes, tested on 29 later ones. Mean error
   4.0 ships vs 3.9 for "just use the median". **It doesn't beat the baseline**, and the app says so.

Latest pass: 2026-11-11, 18:02 HCMC, **33 ships** on open water (median 29, range 12–48). Ships tight against the
quay blend into the terminal and are missed, which is stated on screen.

## 11. Live traffic

`GET /api/flow` asks TomTom for current vs free-flow speed at three points: the Phú Mỹ bridge, Nguyễn Thị Định
(gate approach) and Đồng Văn Cống. It's cached 60 s and appended to `data/logs/flow.jsonl`, so the history of
the morning builds up. The key never leaves the server (errors never echo the URL).

Note: during hacking hours (Saturday afternoon in California = Sunday morning in HCMC) the live speeds show
**no jam**. That's real; the replay's crash is SIMULATED, and the narration says so.

## 12. Indicators and results

Generated from the engine by `node tools/kpi_table.mjs`; full table and method in `pitch/tests.md`.
**All values are engine outputs on a SIMULATED morning, not real-world measurements.**

| Indicator | Normal | Changed, no re-plan | Changed + DispatchMonkey re-plan |
|---|---|---|---|
| K1 cost leakage, ₫ / fleet-morning | 0 | 1,120,000 | 35,000 |
| K2 idle truck-minutes at the gate | 0 | 71 | 24 |
| K3 unpaid minutes, worst-off per-trip driver | 0 | 56 | 34 |
| K6 warehouse-window hit rate | 100% | 83% (T09, T12 late) | 100% |
| K8 idle minutes next to schools/clinics | 0 | 19 | 7 |
| K10 idle CO₂, kg | 0.0 | 9.5 | 3.3 |

How they're calculated:
- **K1** = Σ idle fuel (wait h × 3 L/h × diesel ₫/L) + Σ paid wait for hourly drivers (60,000 ₫/h) + 500,000 ₫ per
  missed warehouse appointment (SIMULATED rebook + detention). **Most of the saving is the two avoided missed
  appointments**, so it rests on a simulated penalty.
- **K2** = Σ over our 12 trucks of gate-queue wait (from the queue model).
- **K3** = max over per-trip drivers of (queue wait + pushed later + minutes stuck in incident traffic). A guard stops
  re-plan from ever leaving the worst-off driver worse off; here 56 → 34 min.
- **K6** = share of trucks reaching the dock inside the receiving window.
- **K8** = idle minutes on the queue road × share of it within 150 m of a school/clinic (OSM) × 3 at bell times.
- **K10** = idle hours × 3 L/h × 2.68 kg CO₂/L.

**Clearance sensitivity:** if the crash clears in 30 min there's nothing to fix; at 60 min re-plan saves 47 idle
minutes; at 90 min it still helps (138 → 92).

**Stakeholders change decisions** (money-only planner vs DispatchMonkey): worst-off driver's unpaid time 40 → 34 min;
total unpaid 107 → 84 min; school exposure 9 → 7 min. Truck **T06's** time was set by the driver rule.

Today's habit (everyone leaves as planned) in the changed scenario: 190 idle minutes, 1,311,000 ₫, worst driver 63 min.
Shift-creep violations: 0 in every scenario. Re-plan latency ≈ 3 ms.

## 13. Responsible design

| Consideration | How it shows in the prototype |
|---|---|
| **Fairness and stakeholder impact** (required) | Driver unpaid minutes tracked (per-trip drivers aren't paid to wait); 45-min shift-creep cap (0 violations); school/clinic exposure costed, ×3 at bell times; per-truck stakeholder tags; money-only comparison |
| **Environmental responsibility** | Idle fuel and CO₂; retiming removes idling instead of moving it to another street |
| **Human oversight** | Dispatcher approves every plan; override-with-reason; trust-unconfirmed switch; nothing sent without a tap; activity log |
| **Transparency** | Every number: formula + inputs + truth tier, one hover away; rules with sources and dates; honest forecast backtest |
| **Responsible data use** | Drivers are IDs, not names; no location history stored; shared state is in memory only; API keys never committed |
| **Not overstating AI** | One report = UNCONFIRMED; radar sees ships not trucks; the model never writes numbers; cached fixtures labeled as such |

Misuse risk: a company could try to use driver data against drivers. Mitigation: no tracking is stored, there's no
driver ranking, and the fairness rules protect drivers by design.

## 14. How this maps to the judging rubric

Full rubric and self-check: [`RUBRIC.md`](RUBRIC.md).

| Criterion | Pts | Where we earn it |
|---|---|---|
| C1 Problem understanding and decision support | 20 | User = dispatcher; decision = when each truck leaves; red conflict → Re-plan → approve |
| C2 Prototype functionality and response to change | 20 | Replay: crash + ship wave → timeline restaggers, KPIs move, phone updates |
| C3 Ethical AI and responsible design | 15 | Section 13; evidence ladder; number guard; honest limits |
| C4 Transdisciplinary integration | 15 | Logistics + geography + labour + public health; stakeholder tags; money-only comparison (T06) |
| C5 Scenario testing and evidence | 15 | Normal vs changed vs re-planned, 6 indicators, each with its calculation (section 12) |
| C6 Presentation and communication | 15 | 7:00 talk + 2:00 Q&A (`pitch/script.md`, `pitch/deck_outline.md`) |

## 15. Architecture and files

```
 Driver phone (/vn/)            Dispatcher website (/)
   index.html                     dispatch.html
        │   both load: data.js · scoring.js · fleet.js · replay.js · geo.json · ships.json
        └──────────────┬──────────────┘
                       ▼
                server.py  (port 8787)
                ├─ serves static/           (/ = dispatch.html with <base href="/vn/">)
                ├─ /api/state  shared demo state (in memory)
                ├─ /api/flow   live TomTom speeds (key from .env) → data/logs/flow.jsonl
                └─ /api/explain  optional model prose, number-guarded and cached
```

| Path | What it is |
|---|---|
| `server.py` | Static server + shared state + live traffic + guarded explanations |
| `static/vn/dispatch.html` | Dispatcher website |
| `static/vn/index.html` | Driver phone app (vi/en) |
| `static/vn/data.js` | Rates, Rules Book, origins, gate, routes, arrival curve, scenarios, fairness ledger. **Edit numbers here.** |
| `static/vn/scoring.js` | Queue model, anti-herding allocator, per-option evaluation (fuel, CO₂, cost, exposure, rule filters) |
| `static/vn/fleet.js` | 12-truck fleet-day, disruption, stakeholder policies, KPIs, "why" text, herding curves |
| `static/vn/replay.js` | The 5 demo steps with cached driver reports and intake output |
| `static/vn/geo.json` | OSM roads and points of interest for HCMC |
| `static/vn/ships.json`, `static/vn/sat/` | Radar ship history, forecast, overlay images |
| `static/vendor/` | Vendored Leaflet (the website map works without a CDN) |
| `tools/fetch_osm_vn.py`, `tools/fetch_osm_vn_retry.py` | Pull OSM roads/POIs |
| `tools/fetch_s1_history.py`, `tools/count_ships.py` | Radar download and ship counting |
| `tools/kpi_table.mjs` | Regenerates the results table |
| `tools/test_vn.mjs`, `tools/test_ships.py`, `tools/test.mjs` | Tests |
| `data/` | Research pack, satellite images, traffic logs, ArcGIS source data from the earlier LA prototype |
| `pitch/` | `script.md` (7-min talk + Q&A), `tests.md` (evidence), `deck_outline.md` |
| `RUBRIC.md` | Official rubric, priorities, self-check |
| `BUILD_PLAN.md`, `FRAMEWORK_FOR_FABLE.md` | How the build was planned |
| `archive/la-detour-receipt/` | Earlier prototype (Ports of LA/Long Beach "Detour Receipt"), kept for reference |
| `dunggio-kit/`, `contract/`, `roles/`, `status/`, `scripts/` | Team coordination kit |

## 16. Server API

| Method | Path | Returns |
|---|---|---|
| GET | `/` | Dispatcher website |
| GET | `/vn/` | Driver phone app |
| GET | `/api/state` | `{step, approved, trust, reports, rev, updated}`: shared demo state |
| POST | `/api/state` | Patch any of `step` (0–4), `approved`, `trust`, `reports`; returns the new state |
| GET | `/api/flow` | Live TomTom speeds for 3 segments (`kmh`, `freeKmh`, `ratio`, `closed`), or 503 without a key |
| POST | `/api/explain` | Optional model prose from supplied facts; rejected if it contains a number not in the facts |
| GET | `/api/chp` | Legacy: California Highway Patrol feed for the archived LA prototype |

Responses are sent with `Cache-Control: no-store`, so edits show on reload.

## 17. Tests

```bash
node tools/test_vn.mjs
```
```bash
python3 tools/test_ships.py
```
```bash
node tools/test.mjs
```
- `test_vn.mjs` (55): option evaluation, rule filters, scoring, queue model, **anti-herding T-H1…T-H4** (own trucks
  raise the queue, naive advice herds, aware ≤ naive and ≤ habit, app users wait least), fleet feasibility,
  shift-creep cap, re-plan beats no re-plan, latency, and that `replay.js` parses.
- `test_ships.py` (5): ship counter on the sample image.
- `test.mjs` (18): the archived LA engine.

Manual pre-demo check: run the replay 3×, reload mid-replay, open the console (0 errors), try English and
Vietnamese on the phone, press Report a jam and Approve once.

## 18. Limitations and known issues

- **The fleet, jobs, windows and gate capacity are simulated.** No public gate wait-time or container-level data exists for Cát Lái.
- The queue model is a deterministic fluid queue; real queues are random and lane-specific.
- The crash severity, clearance time, surge size and trucks-per-ship are estimates.
- Most of the money saved comes from a simulated missed-appointment penalty.
- The worst-off driver (T03) still loses 34 unpaid minutes: they are stuck either in crash traffic or at the depot.
- The radar forecast does not beat a median baseline yet; radar is hours to days old, not real-time; ships against the quay are missed.
- Live speeds show no jam during hacking hours (Sunday morning in HCMC).
- Diesel is the national retail price of 12 Nov 2026 (26,820 ₫/L); the report doesn't state the grade, and
  prices change every few days. Update `RATES.dieselVndPerL` in `data.js`, then re-run `node tools/kpi_table.mjs`.
- The phone's map needs internet (CDN + map tiles); the dispatcher website has an offline basemap option.
- The public tunnel link is temporary and tied to one laptop.
- Some rule sources are dated and marked "re-verify".

## 19. What's next

1. Real gate data from a terminal operator → replace the simulated arrival curve and train a real queue forecast.
2. Pilot with one trucking company (one depot, 10–20 trucks) for two weeks; measure idle minutes and missed appointments.
3. Weeks of logged live speeds → an honest queue-length proxy and forecast with ranges.
4. Live ship positions (AIS) to time the truck wave from actual berthing.
5. Port-level slot coordination: the allocator is what a terminal appointment system should run.
6. Design the driver app with actual drivers; Zalo integration for reports.

## 20. Team workflow

- Read `CLAUDE.md` (shared brief, rubric, ownership) and `RUBRIC.md` first.
- Edit numbers in `static/vn/data.js`, not in the engine.
- After any change: run the tests, then **open the website and look at it** before calling it done (a single bad
  character in a JS file can blank the page).
- Keys only in `.env`. Never commit it.
- Re-generate evidence after engine changes: `node tools/kpi_table.mjs`.

## 21. Credits and licenses

- Map data © OpenStreetMap contributors (ODbL).
- Contains modified Copernicus Sentinel data 2025–2026, processed via Microsoft Planetary Computer.
- Satellite imagery © Esri, Maxar, Earthstar Geographics.
- Basemap for the phone: OpenFreeMap / OpenMapTiles.
- Live traffic: TomTom Traffic Flow API. Weather, tide and air quality: Open-Meteo.
- Leaflet (BSD-2), MapLibre GL JS (BSD-3).
- Built at CGU Hacks 2026 with Claude Code.
