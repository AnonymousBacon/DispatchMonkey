# Đúng Giờ: 7:00 talk + 2:00 Q&A

**Format check.** Spec says 7:00 incl. demo + 2:00 Q&A. Team `CLAUDE.md` says 5:00 hard cap. The brief says
"a 10-minute presentation". **Confirm with the organizers before rehearsal 1.** Blocks marked ✂ are the
cuts that bring this to 5:00.

**Roles.** One person talks (TALKER). One person clicks (DRIVER). The DRIVER never talks; the TALKER never touches the laptop.
**Setup before going on.** `python3 server.py` → `http://localhost:8787/vn/dispatch.html`, reload (resets to step 1),
browser zoom so the map, timeline and KPI strip fit one screen. Backup video open in another tab.
Offline is fine: everything except the satellite photo basemap is local (the map falls back on its own).

| Clock | Say (TALKER) | Click (DRIVER) |
|---|---|---|
| 0:00–0:35 | "Five a.m. in Ho Chi Minh City. A container driver crosses the Phú Mỹ bridge to Cát Lái, Vietnam's biggest container port. Then he sits in the gate queue for two hours, engine running, next to a primary school. He is paid per trip, so those two hours are unpaid." | Title slide |
| 0:35–1:15 | "Our user is the **dispatcher** who plans a fleet's morning. We chose Perspective 2, delivery reliability: the container must be released, the truck must get through the gate, and it must reach the warehouse inside its receiving window. The bottleneck is the gate, not the road. Everyone else reroutes. **We retime.**" | Switch to the app. Point at the map: gate, red queue, bridge, 3 warehouses |
| 1:15–1:35 | "Normal morning. 12 trucks, every warehouse window met. Every number on screen carries a tag: orange is simulated, blue is real, purple is computed by our engine." | Step 1 (already showing). Hover one KPI tag |
| 1:35–2:05 | "06:03. A driver texts in Vietnamese: crash on the bridge. Our intake turns it into a map event, but it stays **UNCONFIRMED**. The plan does not move. The brief itself warns that a detection does not confirm a road is blocked." | → Step 2 |
| 2:05–2:25 | "06:08. A second driver, independent, and the bridge speed drops. Two sources: **CONFIRMED**." | → Step 3 |
| 2:25–2:55 | "Now the engine applies it: gate throughput drops while the crash clears, and a big ship is unloading, so a wave of trucks arrives from 08:00. Our radar count is real: Sentinel-1 sees ships through clouds. Look: two trucks, T09 and T12, will now miss their warehouse windows. Red. And 71 idle truck-minutes." | → Step 4. Point at the red LATE boxes, then the radar layer on the map |
| 2:55–3:30 | "One button. Re-plan re-times only the trucks that have not left. **Both warehouse windows saved. Idling 71 → 24 minutes. Next to schools 19 → 7.** And this sentence: the AI writes words, never numbers. Our number guard rejects any number the engine didn't produce. Nothing is sent until the dispatcher approves." | Click **Re-plan**. Point at moved trucks ("leave +30′"), KPI strip, number guard line. Click **Approve** |
| 3:30–4:15 ✂ | "The question every logistics judge asks: if every truck gets the same 'best time', doesn't the jam just move? Yes. A naive app at 30 % adoption sends everyone to one slot: the queue peaks at **1,218** trucks. Ours adds each truck to the forecast before placing the next, like Amazon greying out a full delivery slot. Peak **34**." | Scroll to the anti-herding chart. Drag slider 10 → 30 → 60 % |
| 4:15–4:45 ✂ | "What's real: roads, schools and clinics from OpenStreetMap; a year of radar passes, 115 of them, counting ships. What's simulated: the fleet and the gate. We tried to forecast ships from radar history. It doesn't beat the simple average yet, so we show the measured count and say so." | Point at the radar panel |
| 4:45–5:45 | "Two responsible-design choices. **Fairness:** we track the worst-off unpaid driver, not the average, and a hard cap means no driver is pushed more than 90 minutes later. The re-plan costs the worst-off driver 3 more minutes; we show that instead of hiding it. **Human oversight:** reports stay unconfirmed until a second source; the dispatcher can trust them early, but it's logged; overrides need a reason. Drivers are IDs, no locations are stored." | Point at K3, the trust toggle, Override button, activity log |
| 5:45–6:20 | "The evidence table. Normal, changed without re-plan, changed with re-plan. 1.1 million đồng of cost leakage down to 28 thousand this morning, mostly two missed dock appointments, and those penalties are simulated. If the crash takes 90 minutes, one truck can't be saved and we show it red." | Slide: `pitch/tests.md` table |
| 6:20–6:45 | "Limits: the gate is simulated because no public gate data exists, it's Sunday morning in Vietnam, and the radar sees ships, never trucks. Next: weeks of live traffic logs, a real dispatcher pilot, and plugging into the port's own booking system. Đúng Giờ: leave on time, skip the queue, don't create the next one." | Limits slide |

**5:00 version.** Cut 3:30–4:15 to one sentence ("and it counts its own trucks, so it never creates the next jam:
backup slide") and cut 4:15–4:45 entirely. That saves ≈ 1:15. Fold the radar point into the 2:25 block.

## Q&A (≤ 20 s each, claim → evidence → stop)
| Question | Answer | Who |
|---|---|---|
| "If everyone uses it, doesn't the jam move?" | "That's herding. We place trucks one at a time and add each to the queue before the next, plus a capacity cap per slot. At 30 % adoption a naive app peaks at 1,218 queued trucks; ours at 34. The chart is on screen." | LEAD |
| "Is any of it real?" | "Roads, schools, clinics: OpenStreetMap. Ships: 115 real Sentinel-1 passes. Fleet, jobs and the gate are simulated, and every number on screen is tagged." | DATA |
| "Doesn't the port have a booking system?" | "Bookings say which window. We say when to leave so you don't idle, and we spread the fleet so we don't make a new jam. Next step is to feed the port's system." | LEAD |
| "Where's the satellite / GeoAI?" | "Radar counts ships through clouds. More ships means a truck wave. We also do 150-metre school buffers on the queue road. Radar can't see trucks, and we don't claim it does." | DATA |
| "Why would a driver wait instead of rushing?" | "Rushing only pays when the queue is unpredictable. We show the wait, and the driver waits at the depot, engine off, not in the queue. And the cap stops anyone being pushed late again and again." | PITCH |
| "12 trucks can't fix a 20,000-truck port." | "Right. The fleet benefit is that our trucks skip the jam. The port benefit needs adoption, which the slider shows and labels simulated." | LEAD |
| "How accurate is it?" | "Not validated: no public gate data exists. Our own forecast didn't beat the average, so we don't use it. The next step is weeks of logs." | DATA |
| "Where's the AI?" | "The intake turns Vietnamese reports into map events, and the radar counter is computer vision on SAR. The AI never makes a number, and a guard enforces that." | LEAD |
| "Could a company use this against drivers?" | "Drivers are IDs, no locations are stored, there's no driver ranking, and the fairness cap protects them." | PITCH |

**Honesty notes for the team (don't overclaim on stage):**
- The Vietnamese intake JSON in the replay is a **cached fixture** written to the agent's schema. No live model ran. Say "our intake format", not "Gemma read this live", unless someone wires it before freeze.
- The second-source speed drop is **simulated** (no TomTom key).
- The VND headline is dominated by a **simulated** 500,000 ₫ missed-appointment penalty.
