# DispatchMonkey — Winning Framework (handoff to Fable)

> **To Fable:** this is the full system spec. Don't skim it. Your job is to turn it into a
> **step-by-step build plan**: phased, time-boxed, owned by role, every step with an acceptance
> test and a kill switch. The plan has to end in a working, debugged and rehearsed demo that wins
> the CGU Hacks 2026 GeoAI track. The format of your output is in **§7**. Resolve **§0** before
> anything else.
>
> **What Fable is for: NOT a 2.0 re-ideation.** The idea, scope and key decisions are locked
> (§0 R7). Fable's job is **execution planning + building**: turn this spec into an ordered, time-boxed
> build plan, then drive the build and debugging until the demo runs clean. Fable may **swap tools**
> (APIs, libraries, hosting) whenever something is slow or flaky. It may **not** change the idea, the
> user, the scope or the locked decisions without asking the humans.
>
> **Already done (don't redo):** the anti-herding allocator + rule B + tests (`static/vn/scoring.js`,
> `tools/test_vn.mjs`, 30/30), the driver app (`static/vn/index.html`: live air, rain, tide, gate chart,
> 3 options), the radar proof image (`data/satellite/`).
> **Biggest missing piece:** the **dispatcher screen** (12-truck timeline + Re-plan + KPIs).
>
> Vibe: brutally honest, and no theater. Every number is traceable. Every feature has to earn its
> place by moving a judging criterion or a user's money, time or lungs. If a feature does neither,
> cut it.

---

## The product in one sentence (do not change this)

> **When Cát Lái's gate jams, DispatchMonkey tells a dispatcher when each truck should leave so it
> skips the queue, picks up a container that is actually released, and still hits its warehouse
> window, without just moving the jam to the next hour.**

**"Everyone else reroutes; we retime."** Rerouting moves the exhaust onto another street.
Retiming removes the idling.

The system is three layers stacked on one engine:

```
 ┌───────────── L1  APPROACHES (lenses: what must be true to win) ─────────────┐
 │ Data · Business · Driver/Community · Judging · Efficiency/Scale · Adoption  │
 │ Trust · Demo · Execution · Marginalized · Sponsors · Q&A · Differentiation  │
 └──────────────────────────────┬──────────────────────────────────────────────┘
 ┌───────────── L2  DATA (best source per lens, tagged by truth tier) ─────────┐
 │ REAL-LIVE · REAL-STATIC · PUBLISHED-ESTIMATE · DERIVED · SIMULATED          │
 └──────────────────────────────┬──────────────────────────────────────────────┘
 ┌───────────── ENGINE (deterministic; the AI never makes a number) ───────────┐
 │ Rules Book → Fluid queue (incl. own fleet) → Slot allocator → Evidence      │
 │ ladder → capacity drop → Re-plan                                            │
 └──────────────────────────────┬──────────────────────────────────────────────┘
 ┌───────────── L3  RESULTS (scored, fast, felt by real users) ────────────────┐
 │ Product KPIs (per user) · Normal-vs-Changed table · Win-readiness scorecard │
 └─────────────────────────────────────────────────────────────────────────────┘
```

---

## §0 — HARD RULES (fixed. Don't re-plan around them, don't question them)

Sources: the CGU Hacks 2026 site (research.cgu.edu/hackathon, event-flow page, read 2026-11-14),
the GeoAI Track brief (`GEOAI_TRACK_NEW.docx`) and the team's own instructions.
**The brief is the project-rules document. Where the brief and anything else disagree, the brief wins.**

### R1. Clock (Saturday 2026-11-14, Pacific time)
| Time | Event | What it means for us |
|---|---|---|
| now (≈14:00) | ~4 h of hacking left | Plan in **30-minute blocks**. Nothing that needs days. |
| 16:30 | **Our feature freeze** | Bug fixes, numbers, deck and rehearsal only after this |
| 17:15 / 17:40 | Timed rehearsals 1 and 2 | Each must land at **≤ 6:45** |
| 17:50 | Submit everything | Deck PDF, repo link, backup video |
| **18:00** | **HACKING ENDS** (official) | Hard stop |
| 18:30–20:00 | **Preliminary judging** (official) | Laptop charged, demo pre-loaded on Replay, offline-ready |
| 20:15–21:00 | Prizes and closing | — |

**Time-zone gift:** 14:00–18:00 in Claremont is **05:00–09:00 in Ho Chi Minh City** (UTC+7).
Hacking time overlaps the build-up of HCMC's morning truck peak, so we can log it **live**.
(Caveat: it's Sunday there, so volumes are below a weekday. Say so.)

### R2. Presentation format (hard-coded)
- **7:00 presentation, including the live demo.** Aim for 6:45. We don't get to overrun.
- **2:00 Q&A.** Every answer is **≤ 20 seconds**: claim, then evidence, then stop (see §6.3).
- The deck must cover the brief's required items, in roughly this order: business problem +
  perspective + user → solution and features → data and GeoAI methods → response to a changing
  condition → indicators → two responsible-design considerations → limitations and improvements.
- A live demo with a **prerecorded backup** (the brief allows "live or prerecorded").

### R3. OFFICIAL judging rubric (received 15:40): THE #1 PRIORITY. Full text: `RUBRIC.md`
> **This replaces the old guessed table below (kept struck-through for history only).** Every build
> step, slide and Q&A answer must name the criterion (C1–C6) it earns. When steps compete, pick the
> one worth more points. There is **no "innovative technology" criterion**.

| # | Criterion | Pts | What judges assess |
|---|---|---|---|
| C1 | Problem Understanding & Decision Support | 20 | Problem, **intended user**, **decision**; helps the user identify a problem and consider a practical response |
| C2 | Prototype Functionality & Response to Change | 20 | Working proof of concept that responds when ≥ 1 condition changes |
| C3 | Ethical AI & Responsible Design | 15 | ≥ 2 considerations incl. fairness/stakeholder or environment (6); assumptions/estimates/uncertainty/limits (4); user can review or question an output (5); don't overstate AI ("imagery ≠ road confirmed blocked") |
| C4 | Transdisciplinary Integration | 15 | ≥ 2 perspectives (5); stakeholder needs: dispatchers, drivers, warehouses, communities (5); **how they influenced the decision** (5) |
| C5 | Scenario Testing & Evidence | 15 | Normal + changed, ≥ 2 indicators, **how calculated** |
| C6 | Presentation & Communication | 15 | Solution, methods, data, results, responsible design, limitations, improvements |

Priority: **C1 + C2 demo path → C5 table → C3 → C4 → C6 → everything else** (radar, forecasts, live APIs).

#### ~~Old guessed rubric (superseded, do not plan to it)~~
| # | Criterion | Weight | Status | What judges look for (from the rubric text we could read) |
|---|---|---|---|---|
| J1 | **Socially Responsible Impact in Innovation** | 20% | verified name | A real problem; it serves people "traditionally forgotten, marginalized, or blocked by this kind of technology" |
| J2 | **Ease of Use, Transparency and Explainability** | 20% | verified name | Clear interface and visuals; users can follow the reasoning behind AI answers, with no unexplainable behavior |
| J3 | **Use of Innovative Technology and Intelligent Adaptation** | 20% | verified name | Original AI design, adaptable to realistic use cases, **correct spatial/contextual analysis for GeoAI** |
| J4 | Safety / trust / responsible AI | 20% | from the kit; exact wording unverified | User safety, uncertainty, oversight (CGU 2025 judges stressed "user safety") |
| J5 | Presentation / storytelling | 20% | from the kit; exact wording unverified | "Strong storytelling" (CGU 2025) |

> The rubric page now returns a 404 to scripts. **Human task (2 min):** open
> `research.cgu.edu/hackathon` → JUDGING RUBRIC in a normal browser, screenshot it, and paste the
> J4/J5 wording here. Until then, plan to the table above.

### R4. Brief requirements (a missing item can disqualify us; tick every one in the plan)
1. Working prototype with a **small synthetic or public dataset** (shipments, locations, routes,
   pickup readiness, truck availability, appointments, conditions, disruptions).
2. Helps a logistics user **see the situation, spot a problem and consider a response.**
3. **At least one condition changes** → the visualization, assessment or recommendation **visibly changes**.
4. **≥ 2 responsible-design considerations**, at least one being *fairness and stakeholder impact*
   or *environmental responsibility*. **We show:** Fairness (primary), Human oversight (primary),
   Environmental, Transparency, Responsible data use (secondary).
5. **Assumptions, estimates, uncertainty and simulated features clearly identified.**
6. **Normal scenario + changed scenario** demonstrated.
7. **≥ 2 indicators**, with **how they were calculated**, and simulated values not presented as measured.
8. Slide deck covering the R2 list.
9. One perspective chosen: **Perspective 2, Delivery Reliability and Capacity Coordination**
   (readiness + truck + travel + warehouse capacity, scheduling conflicts, balancing drivers and warehouses),
   with Perspective 3's cost and sustainability trade-offs layered on top.
10. The brief's own warning: **"a feature detected in imagery does not automatically confirm that a
    road is blocked"**. Our evidence ladder is the direct answer, so say the line on stage.

### R5. Sponsors (2026): use the ones that give us leverage
**Esri** (GeoAI sponsor, a judge pool in 2025) · **Xship+** (shipping/logistics) · **Warehouse+**
(warehousing) · AIsquared · Wethos AI · Lucky's.
→ Two sponsors **are our users' industry**. Speak their language: the warehouse receiving window and
dock capacity are first-class constraints ("Warehouse+ cares about this window").
→ Esri: put at least the queue segments and exposure buffers on **ArcGIS Online** or the
ArcGIS Maps SDK, *if* it costs ≤ 45 min. Otherwise mention ArcGIS Pro for the buffer analysis.

### R6. Decided defaults (don't reopen)
- **Primary user: the dispatcher.** The driver phone page is a 15-second supporting moment.
- **Vietnam / Cát Lái stays.** The brief calls its SoCal scenario "illustrative" and "a starting point".
  Fallback if organizers object: Detour Receipt (LA/LB), already built.
- **No ML forecast.** 4 hours of logs is a live measurement, not a training set.
- **API keys:** a human signs up for a **TomTom** developer key (free, ~5 min) for live flow.
  Claude cannot create accounts. Without a key: OSRM for geometry, and the logger is skipped.

### R7. LOCKED DECISIONS (founder, 14:40). Don't reopen
| Decision | Locked answer |
|---|---|
| ePort | **Dropped entirely.** No ePort slots, no ePort integration. Truck limits come from **container ready time + warehouse receiving window + truck ban + driver hours**. |
| Scope | **Cát Lái only, the truck gate queue only.** Customs, vessels and warehouses beyond the window go on the "next steps" slide. |
| Demo disruption | **Both together:** crash on the Phú Mỹ bridge (roads slow) **+** a big ship unloading (a wave of trucks). |
| "Best time" rule | **Two levels.** (1) **App users come first:** the app optimizes for truckers who have it installed, and non-app trucks are background traffic. (2) **Inside the app, Rule B:** each truck's time = its own wait + the wait it adds to every other app user (fair among users, no herding). **Done:** `slotCost()` + `fleetWaitMin()` in `static/vn/scoring.js`, 33/33 tests pass (T-H4: app users wait least vs. both alternatives). Pitch line: "Install it and you beat the queue. Everyone who installs it shares the good slots fairly." |
| Source of truth | **Two official documents: the brief (`GEOAI_TRACK_NEW.docx`) and the rubric (`GeoAI_Rubric.docx`, see `RUBRIC.md`).** The rubric is the top priority for every decision. The old J1–J5 rows are superseded. |
| Prediction model | **Option 1: satellite ships → surge forecast.** Count ships at Cát Lái in Sentinel-1 radar (years of real history) → predict the truck wave. **No model trained on made-up wait times.** |
| Tools, APIs, services | **Flexible.** Anything unreliable or slow gets dropped and replaced with something faster. The main idea is the only fixed thing. |
| Decision lens | For every logistics decision ask **"How does Amazon solve this, with the environmental angle?"** (see R8). |
| Communication | Explain to the humans as if to a **non-technical founder**: plain words, one decision at a time, a recommendation first. |

### R8. The Amazon lens (use it for every logistics call)
| Our problem | How Amazon solves it | What we copy |
|---|---|---|
| Everyone wants the same time (herding) | Dock appointments at warehouses (Carrier Central); a full slot disappears | Per-15-min capacity cap; a full slot isn't offered |
| Which slot to recommend | Checkout greys out full slots and nudges **Amazon Day** (batch into one van trip, fewer trips) | Rule B: score by total system wait, not just this truck's |
| Disruptions | Re-plans routes centrally, with the human (driver/dispatcher) confirming | One Re-plan button; the dispatcher approves |
| Environment | Shipment Zero / consolidation: fewer trips, less idling | Lead with idle minutes + VND; CO₂ and school exposure as co-benefits |
| Rollout | Proves one thing in one city before scaling | One port, one problem, done deeply |

### R9. Sponsor lens: solve each part the way that sponsor's industry would
Read from their own sites (14:50). Use **their vocabulary** on the matching slide and screen.

| Sponsor | Their logic (what they sell) | How we borrow it | Where it shows |
|---|---|---|---|
| **Esri** (GeoAI track sponsor) | "Science of where": spatial analysis → web map → dashboard; Network Analyst (routing with time windows, service areas); GeoAI deep-learning models (Living Atlas has pretrained imagery models, so **check for a SAR ship-detection model** before writing our own); Survey123 for field reports | Spatial joins + 150 m buffers for exposure; radar ship detection as GeoAI; driver reports as **geo-tagged field reports**; publish the queue segments, exposure buffers and ship counts as **ArcGIS Online hosted layers** if ≤ 45 min | Map, data slide, "GeoAI method" slide |
| **Warehouse.Plus** (fulfillment platform) | "One queue with flags, readiness and complete timelines"; "auto-select the best service that **still meets the delivery promise**"; a **When → If → Then** rules engine; "map every event to surface **bottlenecks, SLA breaches, cost leakage**"; AI agents incl. forecasting | Dispatcher screen = one queue of trucks with **readiness flags** and timelines; allocator = best slot that still meets the **warehouse window (SLA)**; Rules Book shown as When/If/Then; KPIs named **SLA hit rate, cost leakage (idle VND)** | Dispatcher screen, KPI strip |
| **xSHIP** (freight platform) | Instant multi-carrier quotes, real-time tracking, unified billing, **"no hidden fees"** | Every option shows its full cost breakdown (fuel, toll, driver time, penalties), so **no hidden costs**, including the ones nobody bills (driver unpaid time, school exposure) | Option cards, cost tooltip |
| **WethosAI** (models human decisions) | Simulates how people think and decide under pressure | **Driver adoption/compliance simulation:** what if only 30% follow the advice? The adoption slider = a human-behavior model; the dispatcher stays in the loop | Three-curve chart + adoption slider |
| AIsquared, Lucky's | (not researched) | — | — |

---

## §1 — Layer 1: Approaches (the lenses)

Each lens is a set of **questions the product must answer** and **failure conditions** that lose
the competition. Every build step in the plan must name the lens(es) it serves. A step that
serves none gets cut.

### A. Data-driven: "Is any of this real?"
- **Answers:** where each number comes from, how wrong it could be, and what we measured versus assumed.
- **Must have:** a truth tier tag on every on-screen value (§2), a range on every estimate, a
  `METHOD.md` with one paragraph per dataset, and at least one **live measured** signal visible in the demo.
- **Loses if:** the queue, arrivals and capacity are all simulated and nothing on screen was
  measured today. The judge then asks "what did you actually build beyond a queue sim?"
- **Honest stance:** gate-level data doesn't exist publicly. So we **measure a proxy** (approach-road
  speeds, which show jam length) and **simulate the gate**, and label both.

### B. Business-facing (dispatcher and fleet owner): "Does it make me money?"
- **Answers:** how many hours, how much VND and how many extra trips per truck-day each plan wins or loses.
- **Must have:** a money headline first (VND per fleet-day, scaled per year and labeled
  as an estimate), plus a plan for the whole fleet on one screen (a Gantt of 12 trucks), plus one
  **Re-plan** button, plus warehouse-window conflicts shown in red and resolved.
- **Loses if:** the headline is "6 kg CO₂ saved." That's too small and isn't money. Five cards and five
  sliders also lose: judges read it as a dashboard tour.

### C. Driver- and community-facing: "Who pays for the plan?"
- **Answers:** a per-trip driver's unpaid minutes, whether a driver's day keeps getting pushed later
  (shift creep), and how many idle minutes land next to schools, hospitals and homes (with the school bell multiplier).
- **Must have:** a shift-creep cap as a **hard constraint** in the allocator, exposure as a **cost the
  solver minimizes** (not a separate screen), and a driver phone view: status buttons ("in queue",
  "through gate") plus a Vietnamese report box.
- **Loses if:** fairness is a decorative "ledger" screen that never changes a decision.

### D. CGU judging: "Does each criterion get a moment?"
Map every rubric row to a **visible demo moment** and to **one sentence** the presenter says.

| Criterion (§0 R3) | Demo moment | The sentence |
|---|---|---|
| J1 Socially Responsible Impact | Per-trip driver unpaid hours + idle minutes next to schools, before → after | "Per-trip drivers aren't paid to wait. Nobody bills for that time, so we put it on screen." |
| J2 Ease of Use / Transparency / Explainability | One screen, one button (Re-plan); click any number → formula + source + truth tier; the AI sentence is built from engine numbers | "The AI never makes a number, and the server rejects any reply that tries." |
| J3 Innovative Tech / Intelligent Adaptation / correct spatial analysis | Anti-herding allocator (§3A); evidence ladder → capacity drop → re-plan; OSM 150 m buffers; measured approach-road speeds | "If every app says leave at 8:20, the queue moves to 8:20. Ours sees that." |
| J4 Safety / trust | "Unconfirmed" labels, the trust-unconfirmed switch, nothing sent without a tap, overrides logged with a reason, no PII | "A photo is evidence, not confirmation. That's the brief's own warning, built in." |
| J5 Presentation | 30-second cầu Phú Mỹ story, a map a stranger can read, one big number, never crashes (replay) | — |

Also the brief's **hard requirements**. Tick every one of §0 R4.

### J. Marginalized-stakeholder angle (CGU's "Ethical AI" theme, J1's exact wording)
Most teams will say "saves time and CO₂." J1 asks who is **"traditionally forgotten"**. Name them
explicitly on one slide:
- **Per-trip drivers**: unpaid queue time, invisible in every company KPI.
- **Roadside residents and schoolchildren on Nguyễn Thị Định**: they absorb the idling and have no say.
- **Small trucking firms**: no port-level optimization tools, unlike the big logistics players.
And the guardrail: **the tool must not be used to penalize drivers** (no tracking stored, no
driver ranking). Say this proactively.

### K. Sponsor/industry leverage
Xship+ (shipping) and Warehouse+ (warehousing) are sponsors, so judges from logistics may be
in the room. Use their vocabulary: *drayage, turn time, dock appointment, receiving window,
detention*. Show the **warehouse side** of the trade-off (one truck retimed → a dock window is
protected or broken). Esri: real spatial analysis (buffers, network distance, live segment speeds),
ideally on ArcGIS.

### L. Q&A defense (2 minutes = ~5 questions)
Most teams lose Q&A on "is it real?" and "what if everyone uses it?". Pre-write the answers (§6.3).
Have **one backup slide per hard question** ready to flash: the herding chart, the data-tier table,
the formula sheet.

### M. Differentiation vs. other teams
The typical GeoAI entry = a map + a route + a chatbot. Our three things nobody else will have:
1. **Retiming, not rerouting** (a different decision, not a better route).
2. **Anti-herding** (we model our own effect on the system, see §3A).
3. **Measured live data from this morning in HCMC** (thanks to the time zone, §0 R1).

### E. Product efficiency and scalability: "Does it hold up at 20,000 trucks a day?"
- **Answers:** how long re-planning takes, how it scales from 12 trucks to 500 to a port-wide
  system, and what happens when one API dies.
- **Must have:** re-plan in **< 500 ms** for 12 trucks (target < 2 s for 500), pure-function engine
  with node tests, provider abstraction (HERE | TomTom | Google | OSRM behind one interface),
  cached responses, and a fully offline replay.
- **Scale story (slide, not code):** fleet tool → many fleets → port-level slot coordinator
  (a port appointment system). The adoption slider is the evidence.
- **Loses if:** the brag is "MILP optimizer". At 12 trucks × 16 buckets a greedy search gives the
  same answer. The depth is in **what** the allocator accounts for, not the solver.

### F. Adoption and game theory: "Why would anyone follow this, and what if everyone does?"
- **Answers:** herding (everyone shifts to the same "best" time), first-come-first-served
  incentives (leaving later feels like losing your place), and the container not being released yet anyway.
- **Must have:**
  1. The allocator adds its own trucks to arrivals `A_t` while it assigns them.
  2. A three-curve chart: everyone at 6:30 vs. everyone at the single "best" time (the peak moves)
     vs. a coordinated stagger (the peak flattens).
  3. An adoption slider at 10/30/60%, labeled SIMULATED.
  4. Container release as a constraint (customs channel green/yellow/red, delivery order released, ready time).
- **Honest claim:** 12 trucks don't shrink a 20k/day port queue. **Fleet benefit** (your trucks
  skip the jam) is the claim. **Port benefit** shows only through the adoption slider.

### G. Trust and responsible design: "Can a human question it?"
- Pick **at least two** to show deeply and name them on a slide: **Fairness and stakeholder impact**
  (required category) plus **Human oversight**. Show Transparency and Responsible data use as well.
- **Must have:** evidence ladder (unconfirmed → confirmed only with a second, independent source),
  trust-unconfirmed toggle, override-with-reason, activity log, driver IDs not names, no stored
  location history.
- **Reuse:** Detour Receipt already has a formula tooltip on every number, an activity log,
  override reasons, a trust-unconfirmed switch and `check_no_invented_numbers()` in `server.py`.
  **Port these. Don't rebuild them.**

### H. Demo reliability: "Can it crash on stage?"
- **Must have:** a replay mode with every AI output cached, zero network dependency on the demo path
  (vendored libraries, cached tiles or a graceful no-tiles state), a "re-run live" button as optional
  flair, a backup video, and a reload that resets state.
- **Loses if:** live Vietnamese voice goes through local Gemma on stage. Pre-record it and cache the result.

### I. Execution: "Can four people ship this by the deadline?"
- **Must have:** the kit's role split (LEAD/DATA/FRONTEND/PITCH) and contract-first JSON, ship every
  30 minutes, a feature freeze, two timed rehearsals.
- **Loses if:** the team builds the dispatcher Gantt *and* rewrites the VN page *and* trains a model.
  One demo path.

---

## §2 — Layer 2: Data (the best source per lens)

### 2.0 VERIFIED AVAILABLE (tested 14:35 PT). Build on these first
| Source | What it gives us | Key? | Status | Use for |
|---|---|---|---|---|
| **Sentinel-1 radar** (Planetary Computer `sentinel-1-rtc`, data API bbox crop) | Ships at the Cát Lái berths and at anchor, through clouds, ~daily, archive since 2017 | no | ✅ image fetched, ships visible | "Big ship" surge signal + the trained forecast (§3.6) |
| **Sentinel-2 optical** (Planetary Computer `sentinel-2-l2a`) | Photo-style image every 2–5 days ~10:10 local, often cloudy | no | ✅ (latest clear-ish pass: Nov 9, 19% cloud) | Pretty "what the port looks like" layer only |
| **Open-Meteo forecast + archive** | Hourly rain now, plus history back to 1940 | no | ✅ | Rain → slower roads; history = features for the model |
| **Open-Meteo marine** | Sea level / tide near the port | no | ✅ (already on the site) | Tidal-flooding risk on low streets |
| **Open-Meteo air quality** | PM2.5 now + history | no | ✅ | Exposure multiplier, "air right now" chip |
| **OSRM public router** | Road routes + free-flow drive times | no | ✅ | Route lines and baseline times (no live traffic) |
| **OpenStreetMap / Overpass** | Roads, schools, hospitals, homes | no | ✅ (already cached in `static/vn/geo.json`) | Exposure buffers, map |
| **aisstream.io** | Live ship positions (AIS) worldwide | free key (human signs up) | site up, coverage in HCMC **unverified** | Optional: live ship arrivals. Drop if HCMC coverage is thin |
| TomTom / HERE traffic | Live road speeds | free key (human) | not tested | Optional queue proxy. **Drop if no key by 15:00** |
| SNP / port websites | Vessel schedules | — | ⚠️ returns a JS stub, not scrapeable fast | **Dropped** |
| vinamarine.gov.vn | Port statistics | — | ❌ unreachable | **Dropped** |

**Model that IS trainable today (Option 1):** target = ships at berth (from radar, real labels,
hundreds of passes) ← features = day of week, month, rain (Open-Meteo archive), tide, ships at anchor
on the previous pass. Output = ships at berth tomorrow → × trucks per ship (labeled estimate) → truck
wave → the queue model. Backtest on held-out months and show the error honestly. Gradient boosting or
even linear is fine. **If the archive pull is slow, train on the last 6–12 months only.**

### Truth tiers (every value carries exactly one, and the UI shows it)
| Tier | Meaning | UI tag |
|---|---|---|
| `REAL-LIVE` | Fetched today from a public API, with a timestamp | green "LIVE hh:mm" |
| `REAL-STATIC` | Real public dataset (map, POIs, rules) with a source and date | blue "SOURCE · date" |
| `PUBLISHED-ESTIMATE` | A number from a report or official rate | grey "EST · source" |
| `DERIVED` | Computed by our engine from the tiers above | formula tooltip |
| `SIMULATED` | Invented for the demo (fleet, jobs, gate capacity curve) | orange "SIMULATED" |

### Source catalog by lens

| Lens | Need | Best source | Tier | Access / cost | Fallback |
|---|---|---|---|---|---|
| A, C | Road network, schools, kindergartens, hospitals, residential land use | **OpenStreetMap via Overpass** (`tools/fetch_osm_vn.py` exists) | REAL-STATIC | free, no key | cached `static/vn/geo.json` |
| C | Residents near the queue (population) | **Kontur Population H3** (HDX) or **WorldPop 100 m** | REAL-STATIC | free download | count of OSM residential polygons |
| A, H | **Measured queue proxy**: speeds on the last 2–3 km to the gate (Nguyễn Thị Định, Đồng Văn Cống, Phú Mỹ bridge approach) | **HERE Traffic Flow v7** or **TomTom Traffic Flow Segment** (free tier ≈2,500 req/day) | REAL-LIVE | key needed | Google Routes duration-in-traffic ÷ free-flow ratio |
| A, B | Live travel times, origin → gate | **Google Routes API** (numbers only, never draw its lines), **HERE Routing**, **OSRM** (geometry, free-flow) | REAL-LIVE / REAL-STATIC | keys for Google/HERE; OSRM public demo is free | OSRM + historical speed factor |
| A | Uncertainty on **road** time | Spread across the 3 providers, logged every 15 min **starting now** | DERIVED | cron | label "road-time range only" |
| F, B | Vessel arrivals (surge driver) | **SNP / Saigon Newport** published vessel schedule or berth plan (verify the URL works) | REAL-STATIC | scrape or manual copy | SIMULATED surge, labeled |
| A, F | Daily truck volume 16–22k | News and SNP reports (cite 2+) | PUBLISHED-ESTIMATE | manual | — |
| A, F | Gate capacity per 15 min | Derived: published daily volume ÷ operating hours × lanes; **show the formula** | DERIVED → SIMULATED curve | — | — |
| D, G | Truck ban 6:00–22:00 and exempt corridors | **QĐ 23/2018/QĐ-UBND** plus later amendments (Rules Book) | REAL-STATIC (dated) | manual | "dated, re-verify" tag |
| D | Port hours | SNP tariff (dated) | REAL-STATIC (dated) | manual | — |
| B | Diesel price | **Petrolimex** regional price (already in `data.js`) | PUBLISHED-ESTIMATE | manual | — |
| B, C | Driver pay, wage rates | Vietnamese job listings / union figures | PUBLISHED-ESTIMATE | manual | SIMULATED, labeled |
| C | Air quality near the queue | **WAQI** (key), **OpenAQ v3**, US Consulate HCMC station | REAL-LIVE | free key | skip the AQI multiplier |
| C, G | Rain / flood (the brief names flooding) | **Open-Meteo** precipitation (no key) plus known flood-prone streets | REAL-LIVE | free | — |
| C, G | Driver reports (Vietnamese text/voice), photos | SIMULATED feed plus **one real quote** collected over Zalo | SIMULATED + 1 REAL | — | — |
| D, E | Esri sponsor credibility | **ArcGIS Online** hosted layers (OSM POIs, queue segments) or ArcGIS Maps SDK | — | free dev account | MapLibre (already in VN page) |
| B, F | Fleet, jobs, warehouse windows, container release status | **SIMULATED**, but the **fields are real** (customs channel, D/O release, ready time) | SIMULATED | — | — |

### Data rules
1. **The logger starts NOW (see §3.7).** Every 15 min: flow speeds on the gate approach
   and ETAs from the keyed providers → append to `data/logs/*.jsonl`. Data you didn't log can't be recovered.
2. **Same-day event:** the logs power a **"Measured today" panel**: proxy queue length (jammed
   km ÷ ~20 m per truck) with a timestamp, next to the simulated queue. Label it a proxy (mixed traffic).
   **No ML forecast.** With 36 hours or less of logs, a model is overfitting theater.
3. **Forecast model = "next steps" slide only.** It needs weeks of logs, and we have hours.
4. **Sentinel-2 / optical imagery: cut.** At 10 m a truck is 1–2 pixels, it passes about every 5 days at
   10:30, and wet-season clouds cover HCMC. If the brief's "imagery" hook is wanted, use a
   **driver photo** through the verifier agent ("likely queue, unconfirmed"). That fits the brief's own
   warning that imagery isn't proof.
5. **Google ToS:** use Google's numbers only. Draw lines from OSRM, HERE or OSM.
6. **No personal data:** driver IDs, never names or phones. No stored location history.

---

## §3 — The engine (what turns data into decisions)

All of it is pure, deterministic and covered by node tests. It extends `static/vn/scoring.js`.

### 3A — ⚠️ THE HERDING PROBLEM (top risk; solve it with known methods, don't invent)

**The problem in one line:** if you tell every truck "8:20 is the quiet time," every truck goes
at 8:20 and 8:20 becomes the new peak. Any advice that ignores its own effect destroys itself.
A judge who knows logistics will ask this in the first 30 seconds of Q&A. **Today the code has
the bug:** `queueWaitAt()` in `static/vn/scoring.js` counts only background arrivals, never the
trucks we're advising.

**This is a solved problem in several fields. Name the lineage on the backup slide:**

| Field | Name of the problem | Standard fix | What we take |
|---|---|---|---|
| Distributed systems | **Thundering herd** (all clients retry at once) | Jitter, token buckets, admission control | Spread with a capacity counter per slot |
| Load balancing | Placing jobs on servers | **Join-the-shortest-queue + "power of two choices"** (Mitzenmacher): pick 2 random candidates and take the less loaded. Max load drops from ~log n/log log n to ~log log n | The multi-fleet fallback when there's no central booking |
| Transport economics | **Selfish routing / Wardrop equilibrium / price of anarchy** | **System-optimal assignment by marginal cost** (charge each user the delay it adds for everyone else) | The allocator's objective uses *marginal* wait, not own wait |
| Traffic engineering | **Incremental assignment** | Load demand in small increments and recompute costs after each one | Assign trucks one at a time, updating the queue after each |
| Port operations | **Truck Appointment Systems (TAS)** and peak spreading. Real examples: Port of LA/Long Beach **PierPASS OffPeak** (a fee for daytime gate moves, a decade-plus in use) and terminal appointment systems | Capacity-capped time-slot reservations | Per-slot capacity cap + `/claim` (already in the kit's contract) |

**The fix, exactly (three layers, the first two are code):**

1. **Within our fleet: incremental, capacity-aware assignment** (lines of code, not a research project).
   ```
   load[t] = background_forecast[t]                 # trucks expected per 15-min block
   for truck in trucks sorted by tightest window first:
       for each feasible block t (Rules Book passed):
           marginal[t] = wait_if_added(load, t) − wait(load)   # own wait + delay added to everyone after
       pick t* = argmin(marginal[t] + λ·exposure + μ·lateness_risk)
       load[t*] += 1                                   # ← THE FIX: the next truck sees this truck
   then 1–2 rounds of pairwise swaps to clean up
   ```
   The single line `load[t*] += 1` is the difference between "an app that causes herding" and "an
   app that prevents it."

2. **Across fleets (if many companies use it): share a capacity counter.** A slot has a cap
   (gate capacity minus the background forecast). `/claim` decrements it. A full slot isn't offered.
   That's a reservation system. If coordination isn't possible, recommend using
   **power-of-two-choices**: the app gives each truck the less loaded of 2 sampled good slots,
   plus ±5 min jitter. The fleet then never shows up as one spike.

3. **Policy story (slide only):** at scale, this belongs **inside the port's own booking** (a
   TAS). We're the planning layer a port-level coordinator would use. The adoption slider shows
   why: at 10/30/60% adoption, naive "best time" advice makes peaks *worse*, while capacity-aware
   allocation keeps them flat.

**Worked example (put it on the backup slide):** gate capacity 60 trucks / 15 min. Background
forecast: 8:00 → 55, 8:15 → 50, 8:30 → 58. Spare capacity: 5 / 10 / 2. We have 12 trucks.
- **Naive** ("8:15 is quietest, everyone go"): 8:15 gets 62 > 60, so the queue forms at 8:15.
  If 100 fleets do this, that's 1,250 trucks against a capacity of 60.
- **Incremental:** truck 1 → 8:15 (spare 10→9) … after 5 trucks, 8:00 and 8:15 tie at 5 spare →
  they alternate. Final: **8:00 gets 4, 8:15 gets 8, nobody over capacity, ~zero added queue.**

**Proof it works (required tests, node):**
- T-H1: assigning 8 trucks to one block raises that block's predicted wait (monotonic).
- T-H2: the allocator never pushes a block above its cap while a feasible alternative exists.
- T-H3: the three-curve chart. Peak(everyone at 6:30) > Peak(everyone at one best time, shifted)
  > Peak(capacity-aware stagger), at every adoption level in {10, 30, 60}%.

### 3.1 Rules Book → feasible window per truck
For each truck *i*: `depart_i ∈ [earliest_i, latest_i]` such that
- the container is **released** at gate arrival (`ready_time`, customs channel ≠ red, D/O released),
- the gate arrival is inside the port hours (and after the container's **ready time**),
- the route doesn't break the **truck ban** at the times it's driven (or uses an exempt corridor),
- the warehouse arrival is inside the **receiving window**,
- drive + queue + delay ≤ the driver's **remaining hours**,
- the push later than the driver's original plan is ≤ the **shift-creep cap** (default 45 min).

Anything infeasible is greyed out with the **rule ID, its source and its date**.

### 3.2 Fluid queue that includes our own fleet (the anti-herding core)
```
Q[t+1] = max(0, Q[t] + A_bg[t]·k_surge + A_fleet[t] − C[t])
wait[t] ≈ Q[t] / C[t] × 15 min
```
- `A_bg` is the background arrivals (SIMULATED curve, scaled to the PUBLISHED-ESTIMATE daily volume).
- `A_fleet[t]` is **our assigned trucks**. It's updated as the allocator assigns each one. That's the fix for the herding hole: the current `queueWaitAt()` ignores it.
- `C[t]` is the gate capacity. A **confirmed** incident lowers it.
- **Range:** run the queue under capacity −15%/+15% and clearance at 30/60/90 min → P10/P50/P90.
  Replace the current arbitrary ±30%.
- Also fix the current cost: `queueWaitAt` recomputes from slot 0 on every call. Precompute the
  queue once per plan pass.

### 3.3 Arrival-slot allocator
- **Objective (minimize):** Σ idle_min + λ_exp · Σ exposure_weighted_idle + λ_late · Σ window_risk
  + λ_cost · Σ VND, with these hard constraints: §3.1 plus a per-driver shift-creep cap.
- **Method:** a greedy pass ordered by tightest window first, re-evaluating the queue after each
  assignment, then 1–2 rounds of pairwise-swap local search. It's deterministic, explainable and runs in milliseconds.
- **Output per truck:** depart time, gate ETA (P10–P90), queue (P10–P90), idle min, VND, kg CO₂,
  exposure, binding constraint ("held by: warehouse window closes 11:00"), and the *changed vs. previous plan* flag.
- **One dispatcher control:** a priority toggle (Money / Balanced / Community). No five sliders.
- **Stability:** re-plan prefers to keep previous assignments (a penalty for moving a truck) so the dispatcher isn't hit with 12 changes for a 2-minute gain.

### 3.4 Evidence ladder → capacity → re-plan
`report (Vietnamese text/voice) → Intake agent → structured event (place, type, trucks waiting)`
→ `UNCONFIRMED` → **second independent source** (another driver, *or* a measured HERE/TomTom speed
drop on that segment) → `CONFIRMED` → `C[t]` reduced by the event's severity estimate (labeled
ESTIMATE) → the **Re-plan** button pulses → the Gantt restaggers.
The trust-unconfirmed toggle lets the dispatcher apply an unconfirmed event anyway. The app then says it's doing that, and logs it.

### 3.5 AI (Gemma 4 local, every output cached)
| Agent | Input → Output | Guardrail |
|---|---|---|
| Intake | Vietnamese text/voice → `{place, type, trucks_waiting, confidence}` | schema-validated JSON; place snapped to OSM |
| Verifier | photo → `{label: "likely queue", status: "unconfirmed"}` | can never set CONFIRMED by itself |
| Planner | engine numbers + pre-written comparison clauses → one sentence | `check_no_invented_numbers()` from `server.py`; deterministic fallback sentence |

### 3.6 Satellite ship counter → truck-surge forecast (the "big ship" disruption, from real data)
- **Source (verified working 14:35):** Microsoft Planetary Computer, collection `sentinel-1-rtc`
  (radar, sees through clouds, ~daily passes over Cát Lái at ~05:36 and ~18:02 local), no key.
  A crop of the port: `GET https://planetarycomputer.microsoft.com/api/data/v1/item/bbox/106.76,10.73,106.84,10.80.png?collection=sentinel-1-rtc&item=<ID>&assets=vv&rescale=0,0.4`.
  Sample saved at `data/satellite/catlai_s1_vv_2026-11-11.png`: terminal blocks and ships are clearly visible.
- **Method (classic, explainable):** water mask (dark pixels) → bright blobs on water = ships
  (threshold/CFAR + minimum size) → count ships **alongside the Cát Lái berths** vs. **at anchor**.
  Run it over the archive (2017→today) to build a real history of berth occupancy.
- **Forecast:** ships at berth now → expected truck wave in the next 6–24 h (each ship ≈ N container
  moves; N is a PUBLISHED-ESTIMATE or ASSUMED, so label it). This scales `A_bg` in the queue model.
- **Honest label:** "Ships measured from space (REAL, pass time shown). Trucks per ship = estimate."
  Radar is not real-time (latest pass is hours to days old). Show the pass timestamp.
- **Kill switch:** if the counter isn't reliable by 16:00, show the radar image + a hand-checked
  count for 3 dates as evidence, and keep the simulated surge.

### 3.7 The traffic logger (what it is)
A ~40-line script (`tools/logger.py`, run every 15 min) that asks TomTom (and Google/HERE if keyed):
*"How fast is traffic on these 3–4 road segments approaching the Cát Lái gate right now?"* and
*"How long does origin → gate take right now?"* Each answer is appended with a timestamp to
`data/logs/flow.jsonl`. **Why:** it's the only *measured* signal about the jam we can get. Slow
segment length ÷ ~20 m per truck ≈ trucks queued (a **proxy**, because cars are mixed in). Started at
14:00 PT, it captures 05:00→09:00 HCMC, which is the morning build-up. On stage: a small "Measured
this morning, HCMC" chart next to the simulated queue, clearly labeled. **Skip it if no key exists by
14:45.** Nothing else depends on it.

---

## §4 — Layer 3: Results (criteria scoring)

Two scoreboards. **Product KPIs** are what users feel. The **Win-readiness scorecard** is how
we grade our own build before judges do.

### 4.1 Product KPIs
Every KPI has a formula, a unit, a tier and the stakeholder it reflects on. They're computed live, shown as
**Normal vs. Changed** and **Before re-plan vs. After re-plan**, and update in < 500 ms.

| # | KPI | Formula | Who feels it | Good direction |
|---|---|---|---|---|
| K1 | **VND saved per fleet-day** (headline) | Σ(fuel L × diesel VND) + Σ(paid driver hours × wage) + Σ penalties, baseline − plan | Fleet owner | ↑ |
| K2 | Idle truck-minutes | Σ queue wait with the engine on | Fleet, driver, community | ↓ |
| K3 | Driver unpaid minutes (per-trip drivers) + **max for any one driver** | Σ (queue + imposed delay) for per-trip drivers | Driver | ↓, and the max ≤ cap |
| K4 | Shift-creep violations | # drivers pushed > cap | Driver | must be 0 |
| K5 | Ready-on-arrival rate | % trucks arriving after their container's ready time | Fleet, port | ↑ |
| K6 | Warehouse-window hit rate | % arriving inside the receiving window | Warehouse partner | ↑ |
| K7 | Wasted trips avoided | # trucks that would arrive before container release | Fleet | ↓ to 0 |
| K8 | **School-exposure idle minutes** | Σ idle min within 150 m of school/hospital × 3 during bell hours (6:30–8:00, 16:00–17:30) | Children, residents | ↓ |
| K9 | Residents exposed | population (Kontur/WorldPop) within 150 m of the queue × idle hours | Community | ↓ |
| K10 | Idle CO₂ kg | idle h × 3 L/h × 2.68 | Environment | ↓ (co-benefit, never the headline) |
| K11 | Fleet peak contribution | max trucks of ours in any 15-min block | Port (herding) | ↓ |
| K12 | Port queue peak at X% adoption | the fluid queue's max under the adoption slider (SIMULATED) | City | ↓ |
| K13 | Plan churn | # trucks reassigned on re-plan | Dispatcher sanity | ↓ |
| K14 | Decision latency | event confirmed → new plan on screen | Dispatcher | < 2 s |
| K15 | Provenance coverage | % on-screen numbers carrying a tier + source | Judges / trust | **= 100%** |

**Headline rule:** money first (K1), then K2 and K8 together ("540 → 85 idle minutes, 60 of them next to a
school"), then K10. **Never invent a composite "score" as the headline.** Judges distrust
made-up indices. The allocator's objective is internal.

**Fast-acting:** every KPI is a pure function of the plan, recomputed on every change. Deltas
show with direction arrows and colors. Each KPI chip opens its formula, its inputs and their tiers.

### 4.2 Required Normal-vs-Changed table (the brief's "test evidence")
Produce `pitch/tests.md` with **these exact rows** and real computed numbers from the engine:

| Indicator | Normal | Changed (crash + vessel surge), no re-plan | Changed + DispatchMonkey re-plan |
|---|---|---|---|
| K1 VND/fleet-day | | | |
| K2 Idle truck-min | | | |
| K3 Driver unpaid min (max one driver) | | | |
| K6 Warehouse hit rate | | | |
| K8 School-exposure min | | | |
| K10 Idle CO₂ kg | | | |

Plus a **clearance-sensitivity row**: the K1/K2 saving if the crash clears in 30 / 60 / 90 min.

### 4.3 Win-readiness scorecard (grade our own build; target ≥ 4/5 on every row before freeze)
| Criterion | 0 | 3 | 5 (what "done" means, testably) |
|---|---|---|---|
| Social impact | none shown | CO₂ only | K1 + K3 + K8 shown before/after with one human quote |
| Explainability | numbers with no source | some tooltips | **10 random on-screen numbers** each open formula + source + tier in 1 click; AI sentence passes the number guard |
| Innovative tech | single-truck ETA | fleet allocator | allocator counts its own fleet, three-curve chart proves anti-herding, evidence ladder drives capacity → re-plan |
| Safety/trust | — | labels present | unconfirmed ≠ confirmed shown on stage; override-with-reason logged; no PII stored; replay never touches the network |
| Presentation | overruns | on time | story → map → one big number → re-plan → fairness → limits, **≤ 6:45 in 2 timed rehearsals, and Q&A answers ≤ 20 s** |
| Brief compliance | missing items | most | every hard requirement in §1.D checked off with where it appears |
| Reliability | crashes | works on the dev laptop | works from a **clean clone** on a second laptop, offline, plus a backup video |
| Tests | none | some | node tests: queue math, allocator feasibility, herding (assigning 8 trucks to one slot raises its wait), no-invented-numbers guard |

---

## §5 — Keep / Cut / Add (ground truth from the current repo)

**Keep and reuse (already built):**
- `static/vn/data.js` Rules Book with source, date and confidence; RATES with tags; the Cát Lái OSM geo.
- `static/vn/scoring.js` fuel/CO₂/VND/exposure math and the bell multiplier.
- `static/vn/index.html` driver page (vi/en, MapLibre, congestion chart). It becomes the **driver
  moment**, not the main demo.
- From Detour Receipt (`static/scoring.js`, `app.js`, `server.py`): formula tooltips, activity log,
  override reason, trust-unconfirmed switch, `check_no_invented_numbers()`, model cache, `tools/warm.mjs`, test harness.

**Cut or demote:**
- The 5 cards and 5 weight sliders as the main UI → a Gantt plus one priority toggle (cards can stay on the driver page).
- The Fairness Ledger screen → becomes the exposure cost plus the shift-creep constraint.
- An "accuracy: not enough data" panel → the "Measured today" proxy panel instead.
- Sentinel-2, the MILP brag, gradient boosting on < 1 week of logs, live voice on stage, Google polylines.
- On-stage slides for formulas, LA/LB config and the 5-agent architecture → appendix.

**Add (in priority order):**
1. `A_fleet` in the queue, plus the allocator (§3.2–3.3), plus tests.
2. Dispatcher page: OSM map (port, gate, bridge, 3 warehouses, a red queue blob) + a 12-truck Gantt
   before/after + **Re-plan** + red warehouse conflict → resolved.
3. Container release fields as constraints.
4. Replay scenario timeline: normal → report → unconfirmed → proxy agrees → confirmed → capacity
   drop → re-plan. Every AI output cached.
5. KPI strip (§4.1) with normal/changed toggles and the clearance band.
6. Three-curve chart plus the adoption slider.
7. Logger cron plus the "Measured today" panel.
8. One real driver/dispatcher quote. A clearly legal demo departure (exempt corridor shown with its source date, or a time outside the ban).

---

## §6 — Demo spine (hard-coded: 7:00 presentation + 2:00 Q&A)

### 6.1 The 7 minutes (target 6:45; each block maps to a rubric row)
| Clock | Block | Rubric | On screen |
|---|---|---|---|
| 0:00–0:35 | **Story:** one driver, cầu Phú Mỹ, 2 h unpaid in the queue next to a school | J5, J1 | Photo or the opening map |
| 0:35–1:15 | **Problem + user + perspective:** dispatcher, Perspective 2; the bottleneck is the gate, not the road. "Everyone reroutes; we retime." | J1, R4.9 | Map: port, gate, bridge, 3 warehouses, red queue blob |
| 1:15–1:35 | **Normal scenario:** the 12-truck Gantt, all green, KPI strip | R4.6 | Gantt + KPIs |
| 1:35–3:30 | **Changed scenario (live):** Vietnamese report → "likely queue, UNCONFIRMED" → measured speed drop agrees → CONFIRMED → capacity drops → **Re-plan** → restagger, one warehouse conflict resolved → big number (VND + idle minutes near the school) | J3, J2, J4, R4.3 | Replay |
| 3:30–4:15 | **Anti-herding:** three-curve chart + adoption slider. "If every app says 8:20, 8:20 jams. Ours counts its own trucks." | J3 | Chart |
| 4:15–4:45 | **Data + methods:** truth tiers; measured this morning in HCMC vs. simulated | J2, R4.5 | Data-tier strip + logger chart |
| 4:45–5:45 | **Responsible design:** Fairness (unpaid driver minutes, school exposure, shift-creep cap) + Human oversight (nothing sent without a tap, override-with-reason, trust-unconfirmed switch). The driver phone (10 s). | J1, J4, R4.4 | Live clicks |
| 5:45–6:20 | **Indicators table:** Normal vs. Changed vs. Re-planned, with "how calculated" | R4.7 | §4.2 table |
| 6:20–6:45 | **Limits + next:** simulated gate, proxy not a count, Sunday volumes; next = port appointment-system integration, weeks of logs → forecast | R4.5 | One slide |

Rules: **one presenter drives the demo, one talks.** No scrolling hunts, so every click is rehearsed.
If the replay stalls, keep talking and switch to the backup video at the same timestamp.

### 6.2 The deck (≤ 9 slides; the demo is the centerpiece)
Title · Problem/user · Map · (demo) · Anti-herding · Data and methods · Responsible design · Indicators · Limits.
**Backup slides (Q&A only):** herding lineage + worked example (§3A) · data-tier table · formula
sheet · satellite ship counter (§3.6) · scale path.

### 6.3 The 2-minute Q&A: pre-written, ≤ 20 s each
| Likely question | Answer (claim → evidence) |
|---|---|
| "If everyone follows it, doesn't the jam just move?" | "That's herding. We assign trucks one at a time and add each one to the forecast, which is incremental assignment, and slots have a capacity cap like a port appointment system. Backup slide: the three curves." |
| "Is any of this real?" | "Roads, schools and rules are real OSM and official sources. Approach-road speeds were measured this morning in HCMC. Fleet and gate capacity are simulated and labeled on every number." |
| "Doesn't the port already have a booking system?" | "Bookings say *which* window. We say *when to leave* so you don't idle, and we spread the fleet so we don't create a new jam. Amazon books dock slots the same way." |
| "Where's the satellite?" | "Radar counts ships at the berths, through clouds. A big ship means a truck wave 6–24 h later, and that feeds the forecast. It can't see trucks, and we don't claim it does." |
| "Why would a driver wait instead of rushing?" | "First-come-first-served makes rushing rational only when the queue is unpredictable. A range on the wait removes the hedge. And the shift-creep cap means nobody gets pushed late repeatedly." |
| "12 trucks can't change a 20k-truck port." | "Right. The fleet benefit is that *our* trucks skip the jam. The port benefit needs adoption, which the slider shows and labels as simulated." |
| "How accurate is it?" | "We haven't validated against gate data, because none is public. The proxy is measured, the ranges are scenario bands, and the next step is weeks of logs." |
| "Where's the AI?" | "Intake turns Vietnamese reports into map events. The verifier labels photos but can't confirm alone. The planner writes one sentence from engine numbers, with a server-side number guard." |
| "Could a company use this against drivers?" | "No tracking is stored, drivers are IDs, and there's no driver ranking. The fairness constraint protects drivers." |

---

## §7 — What Fable must produce

Write `BUILD_PLAN.md` with the following:

1. **§0 rules echoed back** as a checklist (R1 clock, R2 format, R3 rubric, R4 requirements), each mapped to the steps that satisfy it.
2. **Phases with real clock times** (start ≈14:15 PT, freeze 16:30, end 18:00) working back from the freeze. The herding fix (§3A) and its tests T-H1..3 come **first** in P1: P0 setup and logger, P1 engine plus tests,
   P2 dispatcher UI on sample JSON, P3 integration plus replay, P4 KPIs/charts, P5 freeze → debug
   → clean-clone test → backup video → rehearsals → submit.
3. **Per step:** ID · owner role (LEAD/DATA/FRONTEND/PITCH) · lens(es) served · files touched (only
   that role's folder, contract-first) · acceptance test (a command or a click path with the expected
   result) · time box · **kill switch** (what we drop if it slips).
4. **Contract updates**: new JSON shapes for `/plan`, `/replan`, `/kpis`, `/events`, with sample
   files, before anyone builds against them.
5. **A test list**: node tests named for §4.3, plus a manual demo checklist.
6. **A debug protocol**: a clean-clone run on a second laptop, offline run (Wi-Fi off), a reload
   mid-demo, every replay step clicked 3 times, a console free of errors.
7. **A risk register**: top 8 risks, each with a likelihood, impact and pre-decided fallback.
8. **The Normal-vs-Changed table filled in** from actual engine output (§4.2), as the
   last step before the deck.
9. **Q&A drill**: refine §6.3 against what was actually built, ≤ 20 s per answer, and assign who answers which question.
10. **A rehearsal script** timed to §6.1 (7:00 + 2:00 Q&A), with the click list for the demo driver.

**Rules for the plan:** one demo path. Nothing new after the freeze. Every step names its lens. Anything
that doesn't move a §4.3 row toward 5 gets cut. Be brutal with the clock.
