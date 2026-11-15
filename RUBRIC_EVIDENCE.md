# C1–C6 evidence checklist

Rubric source: **`RUBRIC.md`** in this repo, which records the official
`GeoAI_Rubric.docx` (received 2026-11-14 ~15:40 PT). The `.docx` itself is not
checked in, so `RUBRIC.md` is what this checklist is written against.

On `main`. Run `python3 server.py`, then open `http://localhost:8787`
(dispatcher) and `http://localhost:8787/vn/` (driver phone).

Reproduce everything below with:

```bash
node tools/test_vn.mjs           # 165/165
node tools/test.mjs              #  18/18
python3 tools/test_providers.py  # 123/123  (provider parsing, no key, no network)
python3 tools/test_posts.py      #  22/22
python3 tools/demo_path.py       # DEMO PATH OK   (server must be running)
node tools/kpi_table.mjs         # the C5 tables, regenerated from the engine
python3 tools/test_ships.py      #   5/5  (needs numpy + pillow)
```

### What is live, what is local, what is simulated

Shown in the app itself under **Cài đặt → Nguồn dữ liệu**, one row per source, so a
judge never has to take a number's provenance on trust.

| Source | What it gives | Status here |
|---|---|---|
| NASA GIBS IMERG | 30-min precipitation raster | **Live, key-free.** Observation timestamp read from the WMTS capabilities, not assumed. Verified against the Cát Lái tile `z6/y30/x50` → HTTP 200, 256×256 PNG |
| Open-Meteo | heat index along the route | **Live, key-free** |
| Sentinel-1 / Planetary Computer | 33 vessels detected, 23 circled | **Real, precomputed** into `static/vn/ships_geo.json` |
| OpenStreetMap | roads, schools, clinics | **Real, local** (`static/vn/geo.json`) |
| HCMC DoT notice | Nguyễn Văn Linh lane rule | **Real, sourced** (`data/vn/lane_rules.json`) |
| TomTom Flow / Orbis, VIETMAP Route v4, AISStream, Vietnamese STT | measured speed, incidents, vessel positions, voice captions | **Built and fixture-tested; not live here — no key.** Each endpoint returns a labelled 503 and the UI falls back |
| DispatchMonkey queue model | waits, slots, VND, CO₂ | **Derived** from the inputs above |
| Fleet, jobs, warehouse windows | 12 demo trucks | **Simulated** |

Missing credentials block **live verification only**. Every integration is
implemented, its parsing and decision rules are tested against fixtures, and the
exact variable names are in `.env.example`.

---

## C1 — Problem understanding & decision support (20)

| Claim | Where | How to show it |
|---|---|---|
| The user is a **dispatcher**, the decision is **when each truck leaves and which route it takes** | `/` top line: *"Decision: when should each truck leave the depot?"* | Open `/`; it is the first sentence on the page |
| The driver gets the same decision, simplified | `/vn/` Map tab: one leave time, one gate time, one line on the map | Open `/vn/` |
| The plan is now **departure + route together**, not a time alone | `static/vn/index.html` `routeFeatures()`; the drawn line changes when the plan changes | Switch scenario in Settings → the line recolours and refits |

**Changed this session:** the driver map used to light up whole named roads, so
five disconnected green branches appeared across the city. It now clips each
road at its junctions, flips it into travel order and draws **one line from the
yard to the gate**, with a dot on the yard and a pin on the gate.

---

## C2 — Prototype functionality & response to change (20)

| Condition that changes | What visibly moves |
|---|---|
| Driver posts a crash (Gate slots → Write post) | The report appears in **Driver updates** under the map as `UNVERIFIED`, on every phone |
| A second driver confirms | `CORROBORATED`, counter goes 2/3, progress bar fills |
| A third driver confirms | `CONFIRMED` |
| A driver reports it clear | `EXPIRED` — it stops steering trucks |
| A **confirmed full closure** is posted | The affected route leaves the choice set. Its card turns dashed, struck through, unselectable, and names the rule |
| The closure forces a reroute | The allocator rescores **departure × route pairs**: T08 and T11 move `hp-phumy @ 07:45` → `hp-nvl @ 09:00`. The route could not change without the departure changing with it, because the new road is banned 06–08 |
| A truck has no legal option left | It stays in the plan as a flagged row naming the rule (6 trucks, `lane-rule:nvl-ban`), rather than vanishing |
| **Port view** toggled | The Sentinel-1 scene appears with 23 circled vessels, each anchored to its own lon/lat |
| **Precipitation** toggled | NASA GIBS IMERG loads live, with its observation time, a legend, an opacity slider, and a stale warning past two hours. Rain is never treated as a closure |
| Dispatcher approves the re-plan | `/api/state` rev increments; the phone redraws within ~1.5 s |
| Scenario → *Crash on Phú Mỹ bridge* | Route line recolours (ink → amber → red by stretch), slot bars and KPIs move |
| The driver rotates the map | Bearing survives the 5 s traffic refresh, a 2D/3D switch and a re-fit |

`python3 tools/demo_path.py` walks the whole chain through the real endpoints
and prints `DEMO PATH OK`.

---

## C3 — Ethical AI & responsible design (15)

**Two or more distinct considerations (6 pts).**

1. *Fairness between drivers and communities* — pre-existing: worst-off unpaid
   driver guard, 45-minute shift-creep cap, school/clinic exposure minutes.
   New: **one phone is one source**. The driver who files a report cannot
   confirm it, and no phone can confirm twice. Both rules are enforced on the
   server, not in the UI (`tools/test_posts.py`).
2. *Privacy* — a driver is a random per-phone id, never a login or a name.
   Posts carry a road name and a direction, **never coordinates**. Photos are
   redrawn through a canvas, which drops EXIF including any GPS tag. The
   confirmer list never leaves the server. All four are asserted in tests.

**Assumptions, estimates, uncertainty, limits (4 pts).**

- Route weather says *"OUTDOOR model estimate, not a cabin temperature.
  5 checkpoints fall in 4 grid cells — not lane-level."* The cell count is
  computed from what Open-Meteo echoed back, not asserted.
- **Limited AC** moves the NWS heat-index threshold one band earlier and the
  setting says so: *"We cannot measure your cab — we only lower the warning
  threshold."* No cab-temperature model is invented.
- The Thủ Thiêm tunnel is missing from the OSM extract, so one route hand-off
  draws as a 2.3 km straight line. Flagged in a `shortcut:` comment and bounded
  by a test.

**The user can review or question an output (5 pts).** Pre-existing:
question-this card, alternatives, override-with-reason, dispatcher approval.
New: every driver report carries **I see it too / It is clear now / Reply**, and
a confirmed driver report still only produces an advisory — authoritative or
dispatcher sign-off is required before a full closure removes a road.

**No overstating what a model can determine.** A photo is badged *"Captured in
app"*, never *verified*; the code comment says why (a browser camera can be fed
a virtual device). Voice clips are **not** auto-transcribed — no Vietnamese
speech provider is wired up, so the driver types the caption themselves.

---

## C4 — Transdisciplinary integration (15)

| Field | In the prototype |
|---|---|
| Transport / queueing | Gate-capacity-aware allocation, anti-herding curves |
| Occupational heat physiology | NWS heat-index bands on apparent temperature, applied at the time the truck actually reaches each point |
| Atmospheric science | Open-Meteo forecast, grid-cell honesty |
| Remote sensing | Sentinel-1 radar ship count |
| Labour economics | Unpaid driver minutes, per-trip vs hourly pay |
| Public health | School/clinic exposure minutes beside the queue |

**Perspectives that change the decision, not just a list:**

- *Driver* — `node tools/kpi_table.mjs` names the truck (**T06**) whose time
  differs from the money-only answer because of the driver rule: money-only
  makes it wait 15 min and leave 25 min late; DispatchMonkey waits 7 min.
- *Driver, heat* — the gate checkpoint is timed to the **end of the queue**, not
  arrival, so a long wait shows as the hottest part of the trip. With Limited AC
  set, the same forecast warns a band earlier and a dispatcher can compare
  departure windows on that basis.
- *Community* — school-exposure minutes are an allocator input, and the
  money-only comparison shows 9 → 7 min.

---

## C5 — Scenario testing & evidence (15)

`pitch/tests.md` holds the Normal / Changed-without-re-plan / Changed-with-re-plan
table with ≥ 2 indicators and the formula and data tier for each. Regenerate with
`node tools/kpi_table.mjs` — do not hand-edit it.

Money-only vs stakeholder-aware (same command, re-planned morning):

| Indicator | Money-only planner | DispatchMonkey |
|---|---:|---:|
| K3 worst-off unpaid driver, min | 40 | 34 |
| K3 total unpaid driver min | 107 | 84 |
| K2 idle truck-min | 32 | 24 |
| K8 school-exposure min | 9 | 7 |
| K1 VND | 46,000 | 35,000 |

**Test counts:** `test_vn.mjs` **165**; `test.mjs` 18; **new**
`test_providers.py` **123**; `test_posts.py` 22; `demo_path.py` DEMO PATH OK;
`test_ships.py` 5/5 once `numpy`/`pillow` are installed.

New regression checks: the drawn route for all six origin/route pairs (starts at
the yard, ends at the gate, every road in travel order, no mis-stitched jump,
length within half a route of the stated km), the weather maths (checkpoint
spread, passing times, gate timed to the end of the queue, heat bands, Limited
AC never warns *later*, grid-cell dedupe, missing readings return `unknown`
rather than a number), and the full evidence ladder including expiry, clearing,
questions never climbing it, input guards and the privacy rules.

**Added this session:** the joint allocator (pairs outnumber trucks; every truck
gets a route; no gate block is ever midnight; a confirmed closure removes a route
and an unverified report does not), the regression case below, the time-windowed
lane rule (bites at 06:30, does not bite at 05:00 or 09:00, bites again at 11:30
and 17:30), the lane-rule evidence file (every applied rule names an issuer, a
date and a URL; unverified segments produce no prompt), and 123 provider checks
covering request shape, parsing and the closure-vs-advisory decision.

---

### Joint departure × route allocation (new)

`node tools/kpi_table.mjs` ends with the table below, regenerated from the engine:

| Truck | Time-first planner | Scoring the pairs together | What changed |
|---|---|---|---|
| T08 | hp-phumy @ 07:45 | hp-nvl @ 09:00 | route + departure |
| T11 | hp-phumy @ 07:45 | hp-nvl @ 09:00 | route + departure |

107 (departure × truck-eligible route) pairs are scored for the 12-truck morning,
against 12 route-fixed slot searches before. How it is calculated: route-dependent
criteria (drive time, toll + diesel over the route's own distance, driving CO₂) are
normalised across each truck's own pairs and weighed with the **published**
`WEIGHTS` from `data.js` — the same weights the driver's cards use — so no carbon
price and no money-per-minute rate is invented. The queue, the re-plan stability
penalty and the stakeholder costs stay in `slotCost`, where they can see the whole
fleet. Guarded by `test_vn.mjs`: joint planning never makes fleet idling or the
worst-off driver worse than time-first, like-for-like.

---

## C6 — Presentation & communication (15)

`pitch/script.md`, `pitch/deck_outline.md`, `SLIDES.md`, `DEMO.md`.
Limitations to state out loud are in the next section.

---

## Limitations, stated plainly

### Verified live, on this machine, this session

- **NASA GIBS IMERG precipitation.** Key-free WMTS. The observation timestamp is
  read out of the capabilities document (`2026-11-14T19:30:00Z` at the time of
  writing) rather than assumed, and the Cát Lái tile
  `GoogleMapsCompatible_Level6/6/30/50.png` returns HTTP 200 and a 256×256 PNG.
  The layer is flagged stale past two hours — it was 5 h old when checked, and the
  app said so.
- **Open-Meteo** route weather.
- **Port view**: the radar scene plus 23 circled vessels. Circles are MapLibre
  markers anchored to lon/lat, verified to track the basemap through pan, zoom,
  rotate and pitch and to return to the same pixel when the camera returns.
- The whole **demo path** end to end through the real endpoints
  (`tools/demo_path.py` → DEMO PATH OK), including the confirmed closure and the
  joint re-plan.
- The **four panels** at 1440×900 and at 390×844, with the drawer, the scrim, the
  rail-as-handle behaviour, and the map keeping its bearing, zoom and pitch across
  every section switch. **Chrome via Playwright — this is emulation, not a device.**

### Built and fixture-tested, but NOT live here — the key does not exist in this repo

Verified absent: no `.env`, no matching environment variable. Each endpoint returns
a labelled 503 naming the provider and whether a key is configured, and the UI
falls back. `tools/test_providers.py` (123 checks) covers request shape, response
parsing and the decision rules for all four, with no key and no network.

| Provider | Variable | What is untested without it |
|---|---|---|
| VIETMAP Route v4 | `VIETMAP_KEY` | Whether the live truck/container profile returns geometry that actually reaches the gate. `parse_vietmap_route` refuses to call a route navigable unless the provider's own geometry ends within 250 m of the gate, so the fallback is a labelled **preview**, never turn-by-turn |
| TomTom Orbis Incident Details | `TOMTOM_KEY` entitled for Orbis | Real incident payloads. Opposite-direction, cleared, future and stale responses are covered by fixtures |
| AISStream | `AISSTREAM_KEY` + `pip install websockets` | A real socket. Reconnect/backoff, last-seen ageing and the cached-snapshot path are covered; status reports `live` / `cached` / `no-key` / `no-client` honestly |
| Vietnamese speech-to-text | `GOOGLE_STT_KEY` or `OPENAI_API_KEY` | **No real speech was tested.** Mỹ Thủy and Phú Mỹ are sent as recognition hints and asserted present in the request, and the parsers are tested on transcripts containing them, but no audio was ever transcribed. No accuracy claim is made for Southern Vietnamese, cab noise or local place names. The clip always stays playable and the driver always writes or confirms the caption |

### Built, with limits worth saying out loud

- **Lane guidance is one segment, not a network.** The Nguyễn Văn Linh rule is
  sourced to the HCMC DoT notice effective 2020-05-09 (Thanh Niên, Pháp Luật
  TP.HCM): trucks over 2.5 t, mixed-use carriageway, Huỳnh Tấn Phát → QL1,
  06–08 / 11–13 / 17–19. **Whether the main carriageway is exempt is not stated in
  any source we could reach**, so the planner conservatively restricts the whole
  road in those windows. Six further segments — Mai Chí Thọ's corridor hours,
  Đồng Văn Cống, the Mỹ Thủy lane assignment, Võ Chí Công, cầu Phú Mỹ and the
  general inner-city ban — are listed in `data/vn/lane_rules.json` under
  `needs_evidence` with what is missing and how to get it. They produce **no
  prompt at all**; the app gives turn-level guidance there. The decisive document,
  Quyết định 23/2018/QĐ-UBND, is paywalled and one secondary summary of it
  (Mai Chí Thọ heavy trucks 09:00–16:00) is not corroborated — applying it would
  make every route in this demo illegal before 09:00, which is far too large a
  consequence for a single unverified source.
- **Vessel circles: 23 of 33.** `ships.json` records only counts, and the Sentinel-1
  scenes are not in the repo, so `tools/ship_boxes.py` recovers the detections from
  the committed overlay's drawn rectangles. Boxes that touch merge into one
  component. The UI quotes the detector's 33 as "detected" and the 23 as "circled",
  and says a circle may cover more than one vessel.
- **The route line still has the Thủ Thiêm gap.** `geo.json` has no tunnel way, so
  Nguyễn Văn Linh → Mai Chí Thọ draws as a 2.3 km straight line. This now matters
  more than it did: the NVL route is the one the allocator reroutes onto when the
  bridge closes. A VIETMAP key would replace that stitch with provider geometry.
- **One tuning constant.** `PAIR_SCALE_MIN = 6` sets how many minutes of fleet
  queueing the route choice may be worth. At 0 the route never changes; well above
  it the planner chases kilometres and fleet idling rises. It was chosen on the
  12-truck day and is not derived from anything.
- **Route weather** cells are ~1 km; two checkpoints 3 km apart can share one. The
  app shows the checkpoint and cell counts rather than implying lane-level data.
- **`K1_vnd` and `K10_co2Kg` remain idle-only**, as they always were. Driving fuel,
  toll and driving CO₂ are reported separately as `K1_vndAll` / `K10_co2AllKg` so
  no published figure silently changed meaning.

### Not verified, because the hardware was not available

- **iPhone Safari and Android Chrome on a physical device.** Everything above was
  checked in desktop Chrome driven by Playwright, including at a 390×844 viewport.
  That is **emulation**: it does not test real touch, real rotation, the real
  camera or the real microphone. `getUserMedia` needs HTTPS or localhost, so a
  device test has to go through the Cloudflare tunnel URL.
- **Real GPS movement**, so the sustained off-route rule (3 consecutive fixes
  >120 m, accuracy ≤60 m) has never run against a real missed turn.
- **Real recorded speech**, as above.

### Still needed to close the gaps

1. `VIETMAP_KEY`, and a `TOMTOM_KEY` entitled for Orbis Maps.
2. `AISSTREAM_KEY` plus `pip install websockets`.
3. `GOOGLE_STT_KEY` (or `OPENAI_API_KEY`) **and a recorded Vietnamese cab clip
   naming Mỹ Thủy and Phú Mỹ**, to make any transcription claim at all.
4. The text of Quyết định 23/2018/QĐ-UBND and its annex, to settle the six
   unsourced segments.
5. One iPhone and one Android handset on the tunnel URL.
6. The Sentinel-1 scenes in `data/satellite/history/`, so `count_ships.py` can
   emit detection boxes directly instead of recovering them from the overlay.
