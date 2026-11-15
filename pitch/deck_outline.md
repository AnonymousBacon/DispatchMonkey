# Deck outline: for the team to build (9 slides + 3 backups)

Rules: ≤ 9 main slides, the demo carries the talk, big text, one idea per slide.
Every number below is copied from `pitch/tests.md` (engine output on a SIMULATED morning). Put a small
"SIMULATED" or "REAL" tag next to every number on the slides. Rubric points are in brackets.
Time it to `pitch/script.md` (7:00 total, aim for 6:45).

---

**1. Title** [C6]
DispatchMonkey: "on time" for trucks at Cát Lái port, Ho Chi Minh City.
Subtitle: *Everyone else reroutes. We retime.* · GeoAI track, Perspective 2 · team names.

**2. The problem + the user + the decision** [C1, 20 pts]
- ~19,000 trucks/day to one gate (published estimate). They arrive in the same 2–3 hours and idle in line.
- **User:** the trucking dispatcher. **Decision:** *when each truck should leave.*
- Who pays: drivers (per-trip, so waiting is unpaid), companies (diesel), neighbors and a school on Nguyễn Thị Định (exhaust).
- Image: the map with a red queue next to the school.

**3. Why retiming** [C1]
The bottleneck is the gate, not the road. A faster route gets you to the same line sooner.
Amazon-style: dock appointments, where a full slot disappears. We do that for the gate.

**→ LIVE DEMO (≈ 2:30)** [C2, 20 pts]: normal morning → driver reports a jam (UNCONFIRMED) → second
source → CONFIRMED → bridge crash + big ship → Re-plan → approve → the phone shows the new time.

**4. Results: normal vs. disrupted** [C5, 15 pts]
| | Normal | Disrupted, no re-plan | Disrupted + Re-plan |
|---|---|---|---|
| Cost leakage (VND, fleet-morning) | 0 | 1,120,000 | 35,000 |
| Idle truck-minutes at the gate | 0 | 71 | 24 |
| Warehouse windows met | 100% | 83% | 100% |
| Idle minutes next to the school | 0 | 19 | 7 |
| Idle CO₂ (kg) | 0.0 | 9.5 | 3.3 |
Footnote (say it): all SIMULATED; most of the VND saving is two avoided missed appointments (simulated 500,000 ₫ penalty).

**5. How each number is calculated** [C5]
Copy the "How each indicator is calculated" section of `pitch/tests.md`, one line per indicator.
Clearance sensitivity: if the crash clears in 30 min there's nothing to fix; at 90 min re-plan still helps (138 → 92 idle min).

**6. "Doesn't everyone just jam the new time?" (anti-herding)** [C1, C5]
Peak trucks queued at the gate (port-level, SIMULATED):
| Adoption | No app | Naive "best time" app | DispatchMonkey |
|---|---|---|---|
| 10% | 239 | 341 | 56 |
| 60% | 239 | 2,535 | 34 |
One line: we place trucks one at a time, and each one counts toward the line, so the next truck sees it.

**7. People change the plan, not just the slide** [C4, 15 pts]
Fields: logistics + geography (OSM, radar) + labor (driver pay) + public health (school exposure).
Money-only planner vs. DispatchMonkey: worst-off driver's unpaid time 40 → 34 min (total 107 → 84); school exposure 9 → 7 min.
Example: **truck T06's time was set by the driver rule.** The money-only plan made it wait 15 min and leave 25 min late; ours, 7 min.
Worst-off guard: re-plan never leaves the worst-off driver worse off; here 56 → 34 min (incl. time stuck in crash traffic).

**8. Responsible design** [C3, 15 pts]
- **Fairness:** unpaid driver minutes tracked, a 45-min shift-creep cap (0 violations), school exposure counted.
- **Human control:** the dispatcher approves every plan, can override with a reason, and every decision is logged.
- **Honest AI:** the AI reads Vietnamese reports and writes one sentence. It never makes a number. One report = UNCONFIRMED until a second source agrees. Radar sees ships, not trucks, and we don't claim it does.
- Every number is tagged REAL / ESTIMATE / SIMULATED.

**9. Data, limits, what's next** [C6]
- Real: OpenStreetMap, Sentinel-1 radar ship counts (115 passes), live TomTom road speeds (no jam right now: it's Sunday morning in HCMC), weather/tide/air.
- Simulated: the fleet, jobs and gate capacity. No public gate wait-time data exists.
- Next: real gate data from a port operator → train the queue model; pilot with one trucking company; port-level slot booking.

---

**Backup slides (Q&A only):** (a) herding worked example (8:00/8:15/8:30), (b) data-tier table, (c) radar image of Cát Lái (`data/satellite/catlai_s1_vv_2026-11-11.png`).
