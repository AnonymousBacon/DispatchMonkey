# Detour Receipt

**Google Maps answers "how does this truck get there fastest?" Detour Receipt answers "which of
my shipments are in trouble, what are my options, and who pays for each one?"**

GeoAI Track — Port-to-Warehouse Visibility and Decision Support.
Perspective **3** (Resilience, Cost and Sustainability), with capacity coordination from
Perspective 2.

---

## Run it

```bash
cd detour-receipt
python3 server.py
# open http://localhost:8787
```

Nothing to install. No API key. No account. Leaflet is vendored locally, so the map works even
if the venue wifi is bad (only the basemap tiles need the network).

Before presenting, warm the model cache so nothing waits on stage:

```bash
node tools/warm.mjs      # ~3 min, with the server running
```

Self-check the maths: open `http://localhost:8787/?test=1` and read the console, or run
`node tools/test.mjs`. 18 assertions.

---

## What is real, what is approximated, what is invented

This matters more than the features. Say it on stage before anyone asks.

| | What | Source |
|---|---|---|
| **Real** | Motorway centrelines for I-710, I-110, I-405, I-605, SR-91, SR-60, I-10, I-15 | OpenStreetMap (ODbL), via Overpass |
| **Real** | 954 school locations within 1 mile of those corridors | OpenStreetMap `amenity=school` |
| **Real** | Port terminal and warehouse-site coordinates | Public locations; the *operators* are fictional |
| **Real** | Live incident feed in Live mode | `media.chp.ca.gov/sa_xml/sa.xml`, unedited |
| **Approximated** | Community pollution burden | CalEnviroScreen 4.0 diesel-PM percentiles applied as circles around 9 city centres — **not** a census-tract join |
| **Simulated** | Containers, trucks, drivers, hours-of-service, pay types, appointments, rebooking fees | Invented. No public live container-level data exists |
| **Simulated** | The hop from terminal to motorway and motorway to warehouse | Straight lines priced at 24 mph, not real street routes |
| **Estimated** | Every travel time, delay, cost and CO₂ figure | Published rates × our assumptions. Editable in the app |

The backup radius and slowdown factor applied to any incident — live or replayed — are **our
estimates**. CHP says what happened and where. It does not say how far the queue stretches.

---

## The golden rule

**The language model never produces a number.**

Every figure comes from `static/scoring.js`. The model is given numbers that are already
computed, plus comparisons already written out in words with their direction fixed
(`"...costs the company 108 dollars LESS"`), and its only job is to choose which two matter most
and phrase them.

This is enforced, not just intended: `check_no_invented_numbers()` in `server.py` rejects any
reply containing a figure that is not in the facts we supplied, and the UI falls back to its own
deterministic sentence. Earlier drafts let the model compute differences, and it twice reversed a
direction — saying a route *avoided* 4 schools when it passed 4 more. That is why the clause
construction moved into the engine.

---

## Responsible design

The brief requires two. The prototype demonstrates five.

1. **Fairness and stakeholder impact** — every receipt shows schools passed within 150 m, miles
   driven through neighbourhoods already in the worst quarter for diesel pollution, and **driver
   unpaid minutes** shown separately from company cost, because a per-load driver is not paid for
   waiting or detouring.
2. **Environmental responsibility** — extra miles, CO₂, and idling fuel on a "hold" option.
3. **Transparency** — every number on screen has a tooltip with its formula and source. Every
   rate is editable and labelled with where it came from. Every model output is logged with its
   exact inputs.
4. **Human oversight** — nothing is applied or sent without a click. Choosing anything other than
   the top-ranked option requires a written reason, which is logged. The **"Trust unconfirmed
   reports"** switch lets the dispatcher decide whether a satellite fire perimeter is allowed to
   rule a road out — in both positions the tool says what it is doing.
5. **Responsible data use** — drivers are identified by number only. No names, no phone numbers,
   no continuous tracking. Location is opt-in, for the active job, deleted after delivery. Every
   event carries a source and a confidence, and unconfirmed ones are never silently promoted.

---

## Indicators used to compare scenarios

Shown side by side as **"now"** versus **"normally"** across the top at all times.

| Indicator | How it is calculated |
|---|---|
| Shipments at risk | Count whose current plan is undrivable or arrives after the window closes |
| Total minutes late | Σ max(0, arrival − appointment end) |
| Fleet miles planned | Σ planned route length along OSM centrelines + simulated end hops |
| Extra CO₂ kg | extra miles ÷ 6.0 mpg (+ idling at 0.8 gal/h) × 10.18 kg/gal (US EPA) |
| School passes | Σ OSM school points within 150 m of planned route lines |
| Driver unpaid min | Σ extra minutes for per-load drivers, who are not paid for them |

---

## Files

| File | What it is | Who should edit it |
|---|---|---|
| `static/fleet.js` | All synthetic data: shipments, trucks, warehouses, route options, replay scenarios, assumptions | **Start here.** Safe to add to |
| `static/scoring.js` | The engine. Geometry, formulas, option generation, ranking, self-check | Careful — tests cover it |
| `static/app.js` | Dispatcher UI, map, receipts, decisions, log | |
| `static/index.html` | Layout and styling | |
| `static/driver.html` | Driver phone check-in page | Free to extend |
| `server.py` | Static files + CHP proxy + model endpoint + number guard | |
| `tools/fetch_osm.py` | One-off: pull corridors and schools from Overpass | Already run |
| `tools/build_geo.py` | One-off: build `static/geo.json` | Re-run after editing burden zones |
| `tools/warm.mjs` | Pre-fill the model cache before presenting | Run before the demo |
| `tools/test.mjs` | Run the 18 engine assertions in node | Run after editing scoring |

### Adding a shipment or route

Everything is in `static/fleet.js`. A route option is a list of legs; each leg names a corridor
and two points, which snap to the nearest vertex on the real OSM centreline:

```js
{ id: 'ont-91-15', name: 'SR-91 East then I-15 North',
  legs: [{ c: 'I-710', from: [-118.202, 33.760], to: [-118.199, 33.872] },
         { c: 'SR-91', from: [-118.199, 33.872], to: [-117.569, 33.877] },
         { c: 'I-15',  from: [-117.569, 33.877], to: [-117.540, 34.045] }] }
```

Coordinates are `[lon, lat]`. Approximate is fine — snapping handles it.

---

## Known limits

- Eight corridors only. A route that would realistically use another road cannot be expressed.
- The end hops are straight lines, so short runs (Carson) are the least realistic.
- Burden zones are circles, not tracts. A route can be scored as burdened when it skirts the edge.
- Incident severity is a guess applied uniformly in a circle; real queues are directional and
  one-sided.
- The 45-minute "incident clears" assumption behind every hold option is invented.
- `tools/warm.mjs` and the live feed both need the network. The replayed scenarios do not.
