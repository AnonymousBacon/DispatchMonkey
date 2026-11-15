> **Stale — this is the old Los Angeles "Detour Receipt" outline.** The deck we present is
> `static/slides/index.html` (open `/slides/` on the server, or the file directly); its outline is
> `pitch/deck_outline.md` and its run of show is `pitch/script.md`.

# Slide outline — 10 minutes

Follows the brief's required order. Keep it to these 9; the demo carries the weight.
Screenshots to grab: normal view, crash view with receipts open, the amber "Needs your
judgement" strip, the activity log.

---

**1. Title**
Detour Receipt — port-to-warehouse decision support.
Team names. GeoAI Track, Perspective 3.

**2. The problem and the user**
Dispatcher moving containers, Ports of LA/Long Beach → Carson, Commerce, Ontario, Fontana,
Rialto. Four things must line up: container ready, truck free, roads clear, dock appointment.
One change breaks several loads at once, and the dispatcher cannot see which.

**3. Why not just a routing app**

| Google Maps | Detour Receipt |
|---|---|
| Routes one vehicle | Juggles 10 shipments and 6 trucks |
| No cargo or appointment | Knows readiness, windows, dock close, driver hours |
| Fastest = best | Weighs delay, cost, driver unpaid time, CO₂, schools, community burden |
| Incidents are facts | Evidence with a source and a confidence |
| No decision, no message | Dispatcher picks, overrides are logged, update is drafted |

**4. The receipt** — screenshot, full card
One card per option, itemised, every line hoverable for its formula and source.
The one-liner: *not "here is the best route", but "here is what each option costs, and who pays".*

**5. Data and method**
Real: OSM motorway centrelines (8 corridors), 954 OSM school points, live CHP feed.
Approximated: CalEnviroScreen 4.0 diesel-PM percentiles, city-level circles.
Simulated: containers, trucks, drivers, appointments — no public live container data exists.
Method: route geometry along real centrelines → spatial buffers for schools and burden zones →
deterministic cost/emissions model → weighted ranking the dispatcher controls.

**6. The golden rule** — the slide judges will remember
The model never produces a number. The engine computes every figure and writes each comparison
out with its direction fixed; the model only chooses which two matter and phrases them. The
server rejects any reply containing a figure not in the supplied data.
Say the real story: an earlier version let the model compute differences, and it reported a route
*avoiding* 4 schools when it passed 4 more. That bug is why the design changed.

**7. Normal vs changed** — the two-column numbers

| Indicator | Normal | After the I-710 crash |
|---|---:|---:|
| Shipments at risk | 1 | 3 |
| Total minutes late | 0 | 10 |
| Driver unpaid minutes | 0 | 108 |

Then the choice for MSCU-4471: keep the 710 and miss the window for $120, or reroute for $12 —
at 11 more miles, 18 kg more CO₂, 6 schools instead of 2, but **half** the mileage through
pollution-burdened neighbourhoods. The fair choice and the green choice disagree, and the tool
shows that rather than hiding it.

**8. Responsible design** — two required, five shown
Fairness (schools, burden miles, driver unpaid time) · Environment (miles, CO₂, idling) ·
Transparency (formula and source on every number) · Human oversight (nothing applied or sent
without a click; overrides need a written reason; the "trust unconfirmed reports" switch) ·
Responsible data use (driver numbers not names, opt-in location deleted after delivery).

**9. Limits and next**
Eight corridors. End hops are straight lines. Burden zones are circles, not tracts. Incident
severity is our estimate, applied uniformly in a circle. The 45-minute clearance assumption is
invented.
Next: real TMS integration, port turn-time data, tract-level CalEnviroScreen join, and designing
the driver page with actual drivers.
