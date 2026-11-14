# Test evidence: Normal vs. Changed (rubric C5 Scenario Testing & Evidence; C4 stakeholder section below)

Generated from the real engine: `node tools/kpi_table.mjs` (14 Nov 2026). Re-run it after any change; do not hand-edit numbers.

**Scenarios.** *Normal*: DispatchMonkey plan for 12 trucks on a normal morning. *Changed*: crash on cầu Phú Mỹ at 06:00
(gate-approach throughput ×0.6 until it clears, bridge routes at 55 % speed) **and** a big ship unloading
(arrivals +40 %, 08:00–11:00). Confirmed at 06:10. "No re-plan" = every truck still leaves at its old time.
"Re-plan" = one press; trucks already on the road (T01, T02) are not moved.

**Truth tiers.** Fleet, jobs, container-ready times and warehouse windows: SIMULATED. Gate arrivals curve: SIMULATED,
scaled to the published ≈19k trucks/day (ESTIMATE). Crash severity, surge size, pick-up time: ESTIMATE.
Diesel price: Petrolimex 11/2026 (published). Roads, schools, clinics: REAL (OpenStreetMap).
**No value below was measured in the real world.** They are engine outputs on a simulated morning.

| Indicator | Normal | Changed (crash + vessel surge), no re-plan | Changed + DispatchMonkey re-plan |
|---|---|---|---|
| K1 cost leakage, VND / fleet-morning | 0 | 1,120,000 | 35,000 |
| K2 idle truck-minutes at the gate | 0 | 71 | 24 |
| K3 driver unpaid min (max one per-trip driver) | 0 | 15 | 18 |
| K6 warehouse-window hit rate | 100% | 83% (late: T09, T12) | 100% |
| K8 school-exposure idle min | 0 | 19 | 7 |
| K10 idle CO₂ kg | 0.0 | 9.5 | 3.3 |

Clearance sensitivity (crash clears after 30 / 60 / 90 min):

| Clearance | K2 idle min, no re-plan → re-plan | K1 VND, no re-plan → re-plan | Late trucks, no re-plan → re-plan |
|---|---|---|---|
| 30 min | 0 → 0 | 0 → 0 | 0 → 0 |
| 60 min | 71 → 24 | 1,120,000 → 35,000 | 2 → 0 |
| 90 min | 138 → 92 | 1,240,000 → 648,000 | 2 → 1 |

For reference, today's habit (everyone leaves at the planned time, no app) in the changed scenario: K2 190 idle min, K1 1,311,000 VND, K3 max 63 min, K6 83%.
Shift-creep violations (K4): normal 0, no re-plan 0, re-plan 0. Re-plan latency: 2.7 ms.

Anti-herding (port level, SIMULATED), peak trucks queued at the gate:

| Adoption | No app (today) | Naive "best time" app | DispatchMonkey |
|---|---|---|---|
| 10% | 239 | 341 | 56 |
| 30% | 239 | 1218 | 34 |
| 60% | 239 | 2535 | 34 |


Stakeholders → decision (re-planned morning): DispatchMonkey vs a money-only planner

| Indicator | Money-only planner | DispatchMonkey |
|---|---|---|
| K3 worst-off unpaid driver, min | 40 | 18 |
| K3 total unpaid driver min | 73 | 50 |
| K2 idle truck-min | 32 | 24 |
| K8 school-exposure min | 9 | 7 |
| K1 VND | 46,000 | 35,000 |

Trucks whose time changed because of the driver rule: T06 (money-only: wait 15 min, leave 25 min late; ours: wait 7 min).


## How each indicator is calculated
- **K1 cost leakage (VND)** = Σ idle fuel (wait h × 3 L/h × 26,820 ₫/L, MoIT/MoF retail price 12/11/2026) + Σ paid wait for hourly drivers (60,000 ₫/h)
  + 500,000 ₫ per missed warehouse appointment (SIMULATED rebook + detention). Most of the Changed→Re-plan saving
  is the two missed appointments, so it rests on a simulated penalty. Say so.
- **K2 idle truck-minutes** = Σ gate-queue wait of our trucks. Queue: Q[t+1] = max(0, Q[t] + A_bg[t]·surge + A_fleet[t] − C[t]),
  wait = Q / C × 15 min, C = 210 trucks / 15 min. A_fleet includes our own trucks (anti-herding).
- **K3 unpaid minutes** = for per-trip drivers: queue wait + minutes pushed later than planned. Max over drivers.
  *Honest trade-off:* re-plan raises the worst-off driver from 15 to 18 min (some wait at the depot instead
  of the queue), still far below the 63 min of today's habit. Shift-creep cap (45 min, the spec default) is never broken (K4 = 0).
- **K6 warehouse-window hit rate** = % trucks at the dock before the receiving window closes
  (gate + wait + 30 min pick-up + drive back). Planner keeps a 10-min dock buffer.
- **K8 school-exposure idle min** = Σ wait × 24 % (share of Nguyễn Thị Định within 150 m of a school/clinic, from OSM)
  × 3 during school-bell hours.
- **K10 idle CO₂** = idle h × 3 L/h × 2.68 kg/L.

## Reading the sensitivity row
At 30-min clearance the crash is over before our trucks reach the bridge, so nothing changes and nothing needs re-planning.
At 90 min, re-plan still helps (138 → 92 idle min) but one truck (window closes 09:50) cannot make it any more.
The screen shows that truck as red; the dispatcher must call the warehouse. We do not hide infeasible jobs.

## Other checks
- `node tools/test_vn.mjs` 50/50 · `node tools/test.mjs` 18/18 · `python3 tools/test_ships.py` 5/5.
- Re-plan latency 2.7 ms for 12 trucks (target < 500 ms).
- Radar ship counter: 115 Sentinel-1 passes (Nov 2025 – Nov 2026), 12–48 ships on open water per pass, median 29.
  The next-pass forecast does **not** beat "use the median" (backtest error 4.0 vs 3.9 ships), so the demo uses the
  measured count only and the forecast stays a "next step".

## Stakeholders changed the decision (rubric C4)
Same allocator, same morning, two objectives. **Money-only** counts what the company pays: a per-trip driver's
waiting costs only fuel (3 L/h × 26,820 ₫/L ≈ 1,341 ₫/min) while an hourly driver's costs fuel + wage (≈ 2,341 ₫/min),
so per-trip minutes count ≈ 0.57; no shift-creep cap; no community cost. **DispatchMonkey** counts every driver's minute the
same, enforces the 45-min shift-creep cap and adds a school-exposure cost (×3 at school-bell times).
Result: the money-only plan sends unpaid driver T06 into a 15-min queue and makes them leave 25 min late;
the worst-off unpaid driver goes from 18 to 40 min. Honest note: the money-only plan is also not cheaper here
(46,000 vs 35,000 ₫), because a greedy planner that ignores some waiting misplaces later trucks. We do not claim
fairness is always free; on this morning it cost nothing.
The community cost and the driver cap did not change any truck on this morning (no truck came near the cap and
bell-time queues were short). They stay in the objective and are listed per truck on screen.
