# C1–C6 evidence checklist

Rubric source: **`RUBRIC.md`** in this repo, which records the official
`GeoAI_Rubric.docx` (received 2026-11-14 ~15:40 PT). The `.docx` itself is not
checked in, so `RUBRIC.md` is what this checklist is written against.

Commit: `19abdc6` on `main`. Run `python3 server.py`, then open
`http://localhost:8787` (dispatcher) and `http://localhost:8787/vn/` (phone).

Reproduce everything below with:

```bash
node tools/test_vn.mjs       # 125/125
node tools/test.mjs          #  18/18
python3 tools/test_posts.py  #  22/22
python3 tools/demo_path.py   # DEMO PATH OK   (server must be running)
node tools/kpi_table.mjs     # the C5 table, regenerated from the engine
python3 tools/test_ships.py  #   5/5  (needs numpy + pillow)
```

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

**Test counts, before → after this session:** `test_vn.mjs` 62 → **125**;
`test.mjs` 18 (unchanged); **new** `test_posts.py` 22; **new** `demo_path.py`;
`test_ships.py` 5/5 once `numpy`/`pillow` are installed.

New regression checks: the drawn route for all six origin/route pairs (starts at
the yard, ends at the gate, every road in travel order, no mis-stitched jump,
length within half a route of the stated km), the weather maths (checkpoint
spread, passing times, gate timed to the end of the queue, heat bands, Limited
AC never warns *later*, grid-cell dedupe, missing readings return `unknown`
rather than a number), and the full evidence ladder including expiry, clearing,
questions never climbing it, input guards and the privacy rules.

---

## C6 — Presentation & communication (15)

`pitch/script.md`, `pitch/deck_outline.md`, `SLIDES.md`, `DEMO.md`.
Limitations to state out loud are in the next section.

---

## Limitations, stated plainly

**Not built, because the key does not exist in this repo** (no `.env`, no
environment variable, verified):

- **VIETMAP Route v4** truck profile with decoded geometry and maneuver-level
  turn-by-turn. The route line is stitched from the checked-in **OpenStreetMap**
  geometry instead. It follows real road shape but has no ramps, no lane
  guidance and no provider maneuvers.
- **TomTom Orbis Incident Details.** The existing `/api/flow` TomTom integration
  is untouched and still returns 503 without `TOMTOM_KEY`; the UI falls back as
  before.
- **AISStream** live vessel layer.
- **Server-side Vietnamese transcription** (Chirp 3 / OpenAI). Voice records and
  plays back; the driver writes the caption. No benchmark on Southern
  Vietnamese, cab noise or local place names was run, so no claim is made.

**Built but limited:**

- Lane-level guidance (Article 13 / HCMC notices / OSM truck tags) is **not**
  shown. Nothing in the repo verifies direction, vehicle class and effective
  times per segment, so the app gives turn-level guidance only. Showing
  unverified lane advice to a truck driver is the wrong kind of wrong.
- Route weather is live Open-Meteo but the displayed cells are ~1 km; two
  checkpoints 3 km apart can share one.
- NASA GIBS IMERG precipitation layer: not added.
- Port view satellite/radar toggle with circled ships: the radar overlay and
  `ships.json` are on the map as before; the dedicated phone **Port view** with
  a toggle and aligned circles is not built.

**Not verified, because the hardware was not available:**

- iPhone Safari and Android Chrome on a physical device. Rotation, GPS, camera
  and microphone were exercised in desktop Chrome at 414×896 and through
  scripted checks; `getUserMedia` needs HTTPS or localhost, so the Cloudflare
  tunnel URL is the right place to test on a real phone.
- Real GPS movement, so the sustained off-route rule (3 consecutive fixes
  >120 m, accuracy ≤60 m) has not been exercised against a real missed turn.
