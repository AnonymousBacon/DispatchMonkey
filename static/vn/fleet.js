/* DispatchMonkey — dispatcher engine: one fleet-day at Cát Lái.
 * Pure functions on top of scoring.js (queueProfile + allocateFleet 'aware').
 * The fleet, jobs and windows are SIMULATED (the field names are real);
 * every KPI carries its formula + truth tier. No LLM ever writes a number. */

const FD = typeof module !== 'undefined' ? require('./data.js')
  : { RATES, ROUTES, ORIGINS, ARRIVALS, SCENARIOS };
const FS = typeof module !== 'undefined' ? require('./scoring.js')
  : { queueProfile, allocateFleet, fmtTime, fleetWaitMin };

const SERVICE_MIN = 30;            // pick-up time inside the terminal (ESTIMATE)
const CREEP_CAP_MIN = 45;          // shift-creep cap: never push a driver > 45 min later than planned
const MOVE_PENALTY_MIN = 5;        // re-plan stability (minutes a move must save)
const DOCK_BUFFER_MIN = 10;        // plan to reach the dock ≥ 10 min before the window closes
const DOCK_MISS_VND = 500000;
/* Stakeholder policy. FULL = what DispatchMonkey uses. MONEY = a money-only planner (no driver cap,
 * no community cost) used only to SHOW how the driver and community rules changed decisions. */
const POLICY_FULL = { creepCap: CREEP_CAP_MIN, community: 2 };
// Per-trip driver minute = fuel only; hourly = fuel + wage. Weight = their ratio (≈0.57 at 26,820 ₫/L, 60,000 ₫/h).
const _fuelPerMin = FD.RATES.idleBurnLPerH.v / 60 * FD.RATES.dieselVndPerL.v, _wagePerMin = FD.RATES.driverVndPerH.v / 60;
const POLICY_MONEY = { creepCap: Infinity, community: 0, moneyTripWeight: _fuelPerMin / (_fuelPerMin + _wagePerMin) };
const bellAt = m => (m >= 6.5 * 60 && m < 8 * 60) || (m >= 16 * 60 && m < 17.5 * 60) ? 3 : 1;      // missed warehouse appointment: rebook + detention (SIMULATED)

/* Warehouses = the three industrial parks in data.js (receiving docks there). */
const WAREHOUSES = {
  'hiep-phuoc': { name: 'Kho KCN Hiệp Phước', short: 'Hiệp Phước' },
  'song-than': { name: 'Kho KCN Sóng Thần', short: 'Sóng Thần' },
  'long-hau': { name: 'Kho KCN Long Hậu', short: 'Long Hậu' },
};

/* 12 trucks. Each starts empty at the depot next to its warehouse, drives to the
 * gate, picks up an import container, drives back inside the receiving window.
 * Times are minutes after midnight, HCMC. All SIMULATED. */
const h = (H, M = 0) => H * 60 + M;
const FLEET = [
  // id,  warehouse,   shift start, planned depart, container ready, customs, window open-close, pay
  { id: 'T01', wh: 'song-than',  shift: h(5, 30), planned: h(6, 0),  ready: h(6, 0),  customs: 'green',  win: [h(9), h(11)],      pay: 'trip' },
  { id: 'T02', wh: 'song-than',  shift: h(5, 30), planned: h(6, 15), ready: h(6, 30), customs: 'green',  win: [h(9), h(12)],      pay: 'hourly' },
  { id: 'T03', wh: 'hiep-phuoc', shift: h(5, 45), planned: h(6, 30), ready: h(7, 0),  customs: 'green',  win: [h(9, 30), h(11, 30)], pay: 'trip' },
  { id: 'T04', wh: 'hiep-phuoc', shift: h(6, 0),  planned: h(6, 45), ready: h(7, 0),  customs: 'yellow', win: [h(10), h(13)],     pay: 'trip' },
  { id: 'T05', wh: 'long-hau',   shift: h(6, 0),  planned: h(7, 0),  ready: h(7, 0),  customs: 'green',  win: [h(10), h(12)],     pay: 'hourly' },
  { id: 'T06', wh: 'long-hau',   shift: h(6, 15), planned: h(7, 0),  ready: h(7, 0),  customs: 'green',  win: [h(9, 30), h(11)],  pay: 'trip' },
  { id: 'T07', wh: 'song-than',  shift: h(6, 0),  planned: h(7, 15), ready: h(6, 30), customs: 'green',  win: [h(9), h(13)],      pay: 'trip' },
  { id: 'T08', wh: 'hiep-phuoc', shift: h(6, 15), planned: h(7, 30), ready: h(6, 45), customs: 'green',  win: [h(9), h(13)],      pay: 'hourly' },
  { id: 'T09', wh: 'long-hau',   shift: h(6, 15), planned: h(7, 30), ready: h(6, 30), customs: 'green',  win: [h(9), h(9, 50)],  pay: 'trip' },
  { id: 'T10', wh: 'song-than',  shift: h(6, 15), planned: h(7, 45), ready: h(6, 30), customs: 'green',  win: [h(9), h(14)],      pay: 'trip' },
  { id: 'T11', wh: 'hiep-phuoc', shift: h(6, 30), planned: h(8, 0),  ready: h(7, 0),  customs: 'green',  win: [h(10), h(14)],     pay: 'hourly' },
  { id: 'T12', wh: 'long-hau',   shift: h(6, 30), planned: h(8, 0),  ready: h(6, 45), customs: 'green',  win: [h(9), h(9, 50)],  pay: 'trip' },
];

/* The changed scenario (locked: BOTH together). Crash on cầu Phú Mỹ slows the
 * bridge routes and blocks one approach lane; a big ship unloading sends a wave
 * of trucks. Severity numbers are ESTIMATES, labeled as such on screen. */
const EVENT = {
  crashFrom: h(6, 0), clearanceMin: 60,       // crash 06:00, clears after 60 min (sensitivity 30/60/90)
  confirmDelayMin: 10,                        // report → second source → CONFIRMED (replay); re-plan happens then
  crashCapFactor: 0.6,                        // gate throughput while the approach lane is blocked (ESTIMATE)
  bridgeSpeedFactor: 0.55,                    // speed on bridge routes during the crash (ESTIMATE)
  // The crash site only. bridgeSpeedFactor is a hard 45 % cut, which is what a
  // blocked lane on the bridge deck does; the approach roads in
  // SCENARIOS.disrupted.slowRoads are affected far less than that, and applying
  // the bridge factor to them pushed every truck clear of the congested blocks
  // and flattened the queue the whole demo turns on.
  slowRoads: ['Cầu Phú Mỹ'],
  surgeFrom: h(8, 0), surgeTo: h(11, 0),      // truck wave after the ship berths
  surgeFactor: 1.4,                           // +40 % arrivals (ESTIMATE: ships × moves/ship, see ships.json)
};

/* Build a queueProfile-compatible scenario. kind: 'normal' | 'changed'. */
function dayScenario(kind, opts = {}) {
  const base = FD.SCENARIOS.normal;
  const ev = { ...EVENT, ...opts };
  const capBySlot = new Array(96).fill(base.capacityPerSlot);
  const arrFactorBySlot = new Array(96).fill(1);
  if (kind === 'changed') {
    for (let s = 0; s < 96; s++) {
      const m = s * 15;
      if (m >= ev.crashFrom && m < ev.crashFrom + ev.clearanceMin) capBySlot[s] = Math.round(base.capacityPerSlot * ev.crashCapFactor);
      if (m >= ev.surgeFrom && m < ev.surgeTo) arrFactorBySlot[s] = ev.surgeFactor;
    }
  }
  return { kind, capacityPerSlot: base.capacityPerSlot, arrivalsFactor: 1, capBySlot, arrFactorBySlot, ev };
}

/* ------------------------------------------------- routes as a decision ----
 * The route is a variable, not a constant. routeOf(tr) still answers "the default
 * route" for callers that only want a baseline (the dispatcher map, the habit
 * plan); everything in the planner takes the route explicitly. */
function routesFor(tr) { return FD.ROUTES[tr.wh] || []; }
function routeOf(tr, routeId) {
  const rs = routesFor(tr);
  return (routeId && rs.find(r => r.id === routeId)) || rs[0];
}

/* A route leaves the truck's choice set entirely when a Rules Book ban or a
 * CONFIRMED closure covers one of its roads. An unverified driver report never
 * does: it changes travel time, not legality. */
function routeBlockedBy(route, closedRoads, fromMin, toMin) {
  const out = [];
  for (const rule of (FD.RULES || [])) {
    if (!rule.blocksRoads || !rule.blocksRoads.some(r => route.roads.includes(r))) continue;
    // A time-windowed ban is judged over the minutes the truck is actually on the
    // road. With no window given, treat it as all day.
    if (rule.hours && fromMin != null && !FS.ruleBitesDuring(rule, fromMin, toMin)) continue;
    out.push(rule.id);
  }
  for (const r of (closedRoads || [])) if (route.roads.includes(r)) out.push('closure:' + r);
  return out;
}
/* Is this ban absolute, or only in certain hours? A time-windowed ban does not
 * remove a route from the choice set — it removes the departures that would run
 * into the window, which pairOptions checks per candidate. */
const isAbsolute = id => {
  const rule = (FD.RULES || []).find(x => x.id === id);
  return !rule || !rule.hours;
};
function eligibleRoutes(tr, closedRoads) {
  return routesFor(tr).filter(r =>
    !routeBlockedBy(r, closedRoads).some(isAbsolute));
}

/* Drive time on a given route, slowed while the drive overlaps the incident. */
function driveMin(tr, startMin, scn, route) {
  const r = route || routeOf(tr);
  const ev = scn.ev;
  const slowed = (ev.slowRoads || ['Cầu Phú Mỹ']).some(x => r.roads.includes(x));
  if (scn.kind === 'changed' && slowed
      && startMin < ev.crashFrom + ev.clearanceMin && startMin + r.baseMin > ev.crashFrom) {
    return Math.round(r.baseMin / ev.bridgeSpeedFactor);
  }
  return r.baseMin;
}

/* Latest departure on `route` that still reaches the gate by the start of block s. */
function departFor(tr, s, scn, route) {
  const r = route || routeOf(tr);
  const gate = s * 15, base = r.baseMin;
  for (let d = gate - base; d >= gate - 3 * base; d -= 1) {
    if (d + driveMin(tr, d, scn, r) <= gate) return d;
  }
  return gate - base;
}

/* Rules Book → feasible gate blocks for one truck ON ONE ROUTE (spec §3.1).
 * first: container released (ready time, customs not red) and the driver's shift has started.
 * last:  expected gate wait + pick-up + drive back still inside the receiving window,
 *        and departure no more than CREEP_CAP_MIN later than the driver's plan. */
function feasibleWindow(tr, scn, nowMin = 0, policy = POLICY_FULL, route) {
  const r = route || routeOf(tr);
  const bg = FS.queueProfile(scn);
  const out = { firstSlot: null, lastSlot: null, heldBy: null };
  if (tr.customs === 'red') return { ...out, heldBy: 'customs-red' };
  const startMin = Math.max(tr.shift, nowMin);          // cannot leave before the shift, or in the past
  // Earliest gate arrival: leaving later can arrive EARLIER if it skips the crash, so try departures.
  let earliest = Infinity;
  for (let d = startMin; d <= startMin + 120; d += 5) earliest = Math.min(earliest, d + driveMin(tr, d, scn, r));
  const firstGate = Math.max(tr.ready, earliest);
  const first = Math.ceil(firstGate / 15);        // first whole 15-min block the truck can reach
  let last = null, heldBy = null;
  for (let s = first; s < 96; s++) {
    const m = s * 15;
    const dep = m - driveMin(tr, m - r.baseMin, scn, r);
    const back = m + bg.wait[s] + SERVICE_MIN + driveMin(tr, m + bg.wait[s] + SERVICE_MIN, scn, r);
    if (dep - tr.planned > policy.creepCap) { heldBy = heldBy || 'shift-creep'; break; }
    if (back > tr.win[1] - DOCK_BUFFER_MIN) { heldBy = heldBy || 'warehouse-window'; break; }
    last = s;
  }
  if (last == null) return { firstSlot: first, lastSlot: first, heldBy: heldBy || 'none-feasible', infeasible: true };
  return { firstSlot: first, lastSlot: last, heldBy };
}

/* ------------------------------------- (departure × route) pair candidates ----
 * Scoring a pair means weighing time against money against emissions, and the
 * driver-side scorer in scoring.js already does exactly that with the weights
 * published in data.js (WEIGHTS). The dispatcher reuses them, so a driver and a
 * dispatcher are never optimising different things:
 *   time  → when the container actually reaches the dock
 *   cost  → toll + diesel over the route's own distance, both ways
 *   co2   → driving emissions
 *   idle / exposure → left to slotCost and extraCost, which see the whole fleet
 * Each criterion is normalised across THIS truck's own pairs, so nothing has to
 * be converted with an invented carbon price or money-per-minute rate.
 *
 * Two mistakes this deliberately avoids. Pricing driving diesel in "minutes of
 * idling" makes a 3 km detour worth ~40 min of queueing and the queue term stops
 * mattering at all. And charging that same diesel again as CO₂ prices one
 * physical fact twice: the kg are proportional to the litres. */
const PAIR_W = { time: FD.WEIGHTS.time, cost: FD.WEIGHTS.cost, co2: FD.WEIGHTS.co2 };
// How many minutes of fleet queueing the ROUTE choice is allowed to be worth.
// Deliberately the only knob: at 0 the route never changes at all, and the larger
// it is the more readily the planner spends queue minutes to save kilometres.
const PAIR_SCALE_MIN = 6;
const DRIVE_L_PER_100KM = 35;      // laden container tractor, ESTIMATE (same default as the phone)
const VND_PER_IDLE_MIN = tr =>
  FD.RATES.idleBurnLPerH.v / 60 * FD.RATES.dieselVndPerL.v
  + (tr.pay === 'hourly' ? FD.RATES.driverVndPerH.v / 60 : 0);

/* Every legal (departure, route) pair for one truck, each already costed for
 * everything that differs BY PAIR. The queue cost is deliberately NOT in here:
 * it depends on which pairs the other trucks take, and allocateFleet adds it. */
function pairOptions(tr, scn, nowMin = 0, policy = POLICY_FULL, closedRoads = []) {
  const bg = FS.queueProfile(scn);
  const vndPerMin = VND_PER_IDLE_MIN(tr);
  const routes = eligibleRoutes(tr, closedRoads);
  const out = [], fallback = [], blocked = [];
  let heldBy = null;
  if (!routes.length) heldBy = 'all-routes-blocked';
  if (tr.customs === 'red') return { candidates: [], heldBy: 'customs-red' };

  for (const r of routes) {
    const w = feasibleWindow(tr, scn, nowMin, policy, r);
    if (w.infeasible) heldBy = heldBy || w.heldBy;
    // An infeasible route is still walked, a couple of hours deep, so the
    // fallback bucket has something in it. Otherwise a truck that fits nowhere
    // reaches allocateFleet with no candidate at all and lands on gate block 0
    // with no route — a midnight slot that is not a plan.
    const hi = w.infeasible ? Math.min(95, w.firstSlot + 8) : w.lastSlot;
    for (let s = w.firstSlot; s <= hi; s++) {
      const gate = s * 15;
      const depart = departFor(tr, s, scn, r);
      const drive = gate - depart;
      if (depart < Math.max(tr.shift, nowMin)) continue;     // cannot leave in the past
      if (gate < tr.ready) continue;                         // container not released yet
      if (s > 95) continue;
      const creep = Math.max(0, depart - tr.planned);
      if (creep > policy.creepCap) continue;                 // driver protection
      // Time-windowed bans are a property of the PAIR, not the route: leaving at
      // 05:30 on Nguyễn Văn Linh is legal, leaving at 06:30 is not.
      const bans = routeBlockedBy(r, closedRoads, depart, gate);
      // Round trip with the queue the background already implies at that block.
      const wait = bg.wait[s];
      const out_ = gate + wait + SERVICE_MIN;
      const back = driveMin(tr, out_, scn, r);
      const whArrive = out_ + back;

      // Route-specific money: toll + diesel burnt driving its own distance, both ways.
      const tollVnd = r.toll ? FD.RATES[r.toll].v : 0;
      const driveL = r.km * 2 * DRIVE_L_PER_100KM / 100;
      const driveFuelVnd = driveL * FD.RATES.dieselVndPerL.v;
      const driveCo2Kg = driveL * FD.RATES.co2KgPerL.v;
      // Dock-miss risk, in minutes: how little slack is left once the queue has
      // had its say. Added outside the weighted score because missing the window
      // is a hard failure, not one criterion traded against others.
      const slack = tr.win[1] - whArrive;
      const riskMin = slack < DOCK_BUFFER_MIN * 2
        ? DOCK_MISS_VND / vndPerMin * (1 - slack / (DOCK_BUFFER_MIN * 2)) : 0;

      const cand = {
        slot: s, routeId: r.id, departMin: depart, driveMin: drive, backMin: back,
        creepMin: creep, whArriveMin: whArrive, slackMin: slack,
        tollVnd, driveFuelVnd, driveCo2Kg, riskMin,
        costVnd: tollVnd + driveFuelVnd,
      };
      // A pair that breaks a rule is kept aside, not thrown away: if NOTHING is
      // legal the dispatcher needs the least-bad row and the name of the rule in
      // the way, not a hole in the plan.
      if (bans.length) {
        // NOT heldBy yet: a banned pair only matters if no legal pair survives,
        // and saying "held by the lane rule" while a legal option exists would
        // put a rule in the dispatcher's way that is not actually binding.
        blocked.push({ ...cand, infeasible: true, brokenRule: bans[0] });
        continue;
      }
      if (whArrive > tr.win[1] - DOCK_BUFFER_MIN) {
        cand.infeasible = true;
        cand.lateBy = Math.round(whArrive - tr.win[1]);
        fallback.push(cand);
        continue;
      }
      out.push(cand);
    }
  }
  if (!out.length) {
    // Nothing legal today. Missing the dock window by a few minutes is a smaller
    // problem than driving a banned road, so a window-miss is offered first; a
    // rule-breaking pair is only ever surfaced as a flagged row the dispatcher
    // has to look at, never as a plan. Either way the row carries a real slot, a
    // real route and the name of what is in the way.
    const pool = fallback.length ? fallback : blocked;
    if (!fallback.length && blocked.length) heldBy = 'lane-rule:' + blocked[0].brokenRule;
    if (!pool.length) {
      const r0 = (routes[0] || routeOf(tr));
      const slot = Math.max(0, Math.ceil(Math.max(tr.ready, tr.shift + r0.baseMin) / 15));
      return { candidates: [{ slot, routeId: r0.id, departMin: slot * 15 - r0.baseMin,
                              driveMin: r0.baseMin, backMin: r0.baseMin, creepMin: 0,
                              whArriveMin: slot * 15, slackMin: 0, tollVnd: 0, driveFuelVnd: 0,
                              driveCo2Kg: 0, riskMin: 0, costVnd: 0, penaltyMin: 0,
                              infeasible: true, why: { infeasible: true, reason: heldBy } }],
               heldBy: heldBy || 'none-feasible', infeasible: true };
    }
    pool.sort((a, b) => a.whArriveMin - b.whArriveMin);
    const c = pool[0];
    return { candidates: [{ ...c, penaltyMin: 0,
               why: { infeasible: true, reason: heldBy, lateBy: c.lateBy ?? null,
                      brokenRule: c.brokenRule ?? null, routeId: c.routeId } }],
             heldBy: heldBy || 'warehouse-window', infeasible: true };
  }

  // Normalise each criterion 0 (best) .. 1 (worst) over this truck's own pairs,
  // with a dead-band so a difference smaller than the band scores as a tie — the
  // same rule scoring.js uses for the driver's cards.
  //
  // Every criterion here is ROUTE-dependent only: minutes on the road, diesel
  // and toll over the route's own distance, and the CO2 of that diesel. Scoring
  // ARRIVAL time here instead was a mistake: it made the pair term fight the
  // departure decision, and it suppressed the very behaviour the money-only
  // comparison exists to expose (a money planner parking an unpaid driver in a
  // queue). Departure choice belongs to slotCost — the queue, the stability
  // penalty and the stakeholder costs — and stays there.
  const crit = [['time', c => c.driveMin + c.backMin, 3], ['cost', c => c.costVnd, 20000],
                ['co2', c => c.driveCo2Kg, 2]];
  for (const c of out) { c.parts = {}; c.score = 0; }
  for (const [k, get, band] of crit) {
    const vals = out.map(get);
    const lo = Math.min(...vals), hi = Math.max(...vals);
    for (const c of out) {
      const n = (hi - lo) <= band ? 0 : (get(c) - lo) / (hi - lo);
      c.parts[k] = n * PAIR_W[k];
      c.score += c.parts[k];
    }
  }
  const wSum = PAIR_W.time + PAIR_W.cost + PAIR_W.co2;
  const scale = policy.pairScaleMin ?? PAIR_SCALE_MIN;
  for (const c of out) {
    // riskMin stays outside the weighted score: missing the dock window is a
    // 500,000 ₫ failure, not one criterion traded off against the others.
    c.penaltyMin = c.score / wSum * scale + c.riskMin;
    c.why = { driveMin: c.driveMin + c.backMin, creepMin: c.creepMin,
              costVnd: Math.round(c.costVnd), driveCo2Kg: +c.driveCo2Kg.toFixed(1),
              riskMin: Math.round(c.riskMin),
              parts: { time: +c.parts.time.toFixed(1), cost: +c.parts.cost.toFixed(1),
                       co2: +c.parts.co2.toFixed(1) } };
  }
  // Best-looking pair first, so 'same'/'naive' have a sensible default and the
  // tie-break inside slotCost is not the thing deciding the route.
  out.sort((a, b) => a.penaltyMin - b.penaltyMin || a.slot - b.slot);
  return { candidates: out, heldBy };
}

/* Evaluate fixed assignments {id → slot} under a scenario. Our own trucks are in
 * the queue (extra[]), so this sees the fleet's effect on itself. */
function evaluate(slots, scn, prevSlots, fixedDepart, routes, prevRoutes) {
  const extra = new Array(96).fill(0);
  for (const tr of FLEET) extra[slots[tr.id]] += 1;
  const prof = FS.queueProfile(scn, extra);
  const R = FD.RATES;
  const rows = FLEET.map(tr => {
    const s = slots[tr.id];
    const r = routeOf(tr, routes && routes[tr.id]);      // the route the planner chose
    let gate = s * 15, depart = departFor(tr, s, scn, r), drive = gate - depart;
    if (fixedDepart && fixedDepart[tr.id] != null) {      // the stale plan: truck leaves when it was told to
      depart = fixedDepart[tr.id]; drive = driveMin(tr, depart, scn, r); gate = depart + drive;
    }
    const wait = prof.wait[s];
    const out = gate + wait + SERVICE_MIN;
    const back = driveMin(tr, out, scn, r);
    const whArrive = out + back;
    const idleL = wait / 60 * R.idleBurnLPerH.v;
    const bell = (gate >= h(6, 30) && gate < h(8)) || (gate >= h(16) && gate < h(17, 30)) ? 3 : 1;
    const late = whArrive > tr.win[1];
    const creep = Math.max(0, depart - tr.planned);
    // Route-specific driving cost. Kept in its own fields so the long-standing
    // idle-only K1/K10 figures keep meaning exactly what they always meant, and
    // the all-in totals (K1_vndAll / K10_co2AllKg) are stated separately.
    const driveL = r.km * 2 * DRIVE_L_PER_100KM / 100;
    return {
      id: tr.id, wh: tr.wh, pay: tr.pay, slot: s, depart, gate, wait, gateOut: out, whArrive,
      drive, back, win: tr.win, ready: tr.ready, customs: tr.customs, planned: tr.planned,
      routeId: r.id, routeKm: r.km, routeBaseMin: r.baseMin,
      readyOnArrival: gate >= tr.ready, late, creep, creepViolation: creep > CREEP_CAP_MIN,
      fuelVnd: idleL * R.dieselVndPerL.v,
      wageVnd: tr.pay === 'hourly' ? wait / 60 * R.driverVndPerH.v : 0,
      penaltyVnd: late ? DOCK_MISS_VND : 0,
      tollVnd: r.toll ? R[r.toll].v : 0,
      driveFuelVnd: driveL * R.dieselVndPerL.v,
      driveCo2Kg: driveL * R.co2KgPerL.v,
      // Unpaid (per-trip drivers): queue + pushed later than planned + extra minutes stuck in incident traffic.
      stuckMin: Math.max(0, drive - r.baseMin) + Math.max(0, back - r.baseMin),
      unpaidMin: tr.pay === 'trip' ? wait + creep + Math.max(0, drive - r.baseMin) + Math.max(0, back - r.baseMin) : 0,
      co2Kg: idleL * R.co2KgPerL.v,
      bell,
      moved: prevSlots ? prevSlots[tr.id] !== s : false,
      rerouted: prevRoutes ? prevRoutes[tr.id] !== r.id : false,
    };
  });
  return { rows, profile: prof, extra };
}

/* KPIs (spec §4.1). schoolShare = share of the queue road within 150 m of a
 * school or clinic (DERIVED from OSM, see exposureShare). */
function kpis(ev, schoolShare) {
  const r = ev.rows, n = r.length;
  const sum = f => r.reduce((a, x) => a + f(x), 0);
  const vnd = sum(x => x.fuelVnd + x.wageVnd + x.penaltyVnd);
  return {
    K1_vnd: Math.round(vnd / 1000) * 1000,
    K2_idleMin: Math.round(sum(x => x.wait)),
    K3_unpaidMin: Math.round(sum(x => x.unpaidMin)),
    K3_unpaidMaxMin: Math.round(Math.max(...r.map(x => x.unpaidMin))),
    K4_creep: r.filter(x => x.creepViolation).length,
    K5_readyPct: Math.round(100 * r.filter(x => x.readyOnArrival).length / n),
    K6_whHitPct: Math.round(100 * r.filter(x => !x.late).length / n),
    K6_late: r.filter(x => x.late).map(x => x.id),
    K6_lateN: r.filter(x => x.late).length,
    K7_wasted: r.filter(x => !x.readyOnArrival).length,
    K8_schoolMin: Math.round(sum(x => x.wait * schoolShare * x.bell)),
    K10_co2Kg: +sum(x => x.co2Kg).toFixed(1),
    K11_peak: Math.max(...ev.extra),
    K13_churn: r.filter(x => x.moved).length,
    // Route-dependent totals. K1_vnd and K10_co2Kg are the idle-only figures the
    // comparison table has always used; these add the driving the chosen route
    // actually costs, which is what makes a longer detour visible.
    K1_vndAll: Math.round(sum(x => x.fuelVnd + x.wageVnd + x.penaltyVnd
                                 + x.tollVnd + x.driveFuelVnd) / 1000) * 1000,
    K10_co2AllKg: +sum(x => x.co2Kg + x.driveCo2Kg).toFixed(1),
    K12_km: +sum(x => x.routeKm * 2).toFixed(1),
    K14_reroute: r.filter(x => x.rerouted).length,
  };
}

/* The three plans the dispatcher sees.
 *  habit:  everyone leaves at the planned time (gate block = planned + drive)
 *  plan:   DispatchMonkey, allocateFleet(..., 'aware') inside each truck's feasible window
 *  replan: same allocator on the changed scenario, preferring to keep previous blocks */
function habitSlots(scn) {
  const o = {};
  for (const tr of FLEET) o[tr.id] = Math.ceil((tr.planned + driveMin(tr, tr.planned, scn)) / 15);
  return o;
}
/* Stakeholder costs that are the same shape whichever candidate is picked:
 * community exposure, and the money-only planner's discount on per-trip minutes. */
function stakeholderCost(tr, policy, share) {
  // Community: idle minutes on the stretch of queue road next to schools/clinics cost extra,
  // ×3 in school-bell hours (K8). Weighted by policy.community (0 = money-only).
  // Money-only: a per-trip driver's waiting costs the company only fuel, an hourly driver's costs
  // fuel + wage, so a money planner counts per-trip minutes at moneyTripWeight (≈0.5) of hourly.
  const tripDiscount = policy.moneyTripWeight != null && tr.pay === 'trip' ? (1 - policy.moneyTripWeight) : 0;
  // (Tried: also charging stuck-in-traffic + pushed-later minutes here. It raised fleet idling 24 → 32
  // and did not help the worst-off driver, so the worst-off guard in runDay does that job instead.)
  if (!policy.community && !tripDiscount) return null;
  return (s, after) =>
    (policy.community || 0) * after.wait[s] * share * bellAt(s * 15) - tripDiscount * after.wait[s];
}

/* DispatchMonkey's planner: every truck is scored over its (departure × route)
 * PAIRS at once. Changing only the line on the map after the time is already
 * fixed is not enough — a longer route that dodges the incident can be the right
 * answer precisely because it lets the truck leave at a different time, and that
 * trade is invisible if the time is decided first. planTimeFirst below keeps the
 * old behaviour so the two can be compared on stage and in the tests. */
function planSlots(scn, prevSlots, nowMin = 0, departed = {}, policy = POLICY_FULL,
                   share = 0.243, closedRoads = []) {
  const held = {}, pairs = {};
  const trucks = FLEET.map(tr => {
    if (departed[tr.id] != null) {                       // already on the road: keep it
      const s = departed[tr.id];
      held[tr.id] = 'already-departed';
      return { id: tr.id, firstSlot: s, lastSlot: s, prevSlot: s,
               candidates: [{ slot: s, routeId: (prevSlots && prevSlots.routes || {})[tr.id] || null,
                              penaltyMin: 0 }] };
    }
    const p = pairOptions(tr, scn, nowMin, policy, closedRoads);
    held[tr.id] = p.heldBy;
    pairs[tr.id] = p.candidates;
    const slots = p.candidates.map(c => c.slot);
    const firstSlot = slots.length ? Math.min(...slots) : 0;
    const lastSlot = slots.length ? Math.max(...slots) : 0;
    const pref = Math.floor((tr.planned + driveMin(tr, tr.planned, scn)) / 15);
    const t = { id: tr.id, firstSlot, lastSlot, candidates: p.candidates,
                prefSlot: Math.min(lastSlot, Math.max(firstSlot, pref)) };
    const extraCost = stakeholderCost(tr, policy, share);
    if (extraCost) t.extraCost = extraCost;
    // Keeping the old block costs nothing extra (stability), but only if it is
    // still among this truck's legal pairs.
    if (prevSlots) { t.prevSlot = prevSlots[tr.id]; t.movePenaltyMin = scn.ev?.movePenaltyMin ?? MOVE_PENALTY_MIN; }
    return t;
  });
  const res = FS.allocateFleet(trucks, scn, 'aware');
  const o = {}, routes = {}, why = {};
  for (const a of res.assignments) {
    o[a.id] = a.slot;
    routes[a.id] = a.routeId;
    why[a.id] = a.why;
  }
  return { slots: o, routes, held, why, pairs,
           pairCount: Object.values(pairs).reduce((n, c) => n + c.length, 0) };
}

/* The baseline this replaced: decide the departure on the truck's DEFAULT route,
 * then at most redraw the line. Kept so "evaluating routes jointly changed the
 * answer" is a measurable claim and not an assertion. */
function planTimeFirst(scn, prevSlots, nowMin = 0, departed = {}, policy = POLICY_FULL, share = 0.243) {
  const trucks = FLEET.map(tr => {
    if (departed[tr.id] != null) {
      const s = departed[tr.id];
      return { id: tr.id, firstSlot: s, lastSlot: s, heldBy: 'already-departed', prevSlot: s };
    }
    const w = feasibleWindow(tr, scn, nowMin, policy);
    const pref = Math.floor((tr.planned + driveMin(tr, tr.planned, scn)) / 15);
    const t = { id: tr.id, firstSlot: w.firstSlot, lastSlot: w.lastSlot, heldBy: w.heldBy,
                prefSlot: Math.min(w.lastSlot, Math.max(w.firstSlot, pref)) };
    const extraCost = stakeholderCost(tr, policy, share);
    if (extraCost) t.extraCost = extraCost;
    if (prevSlots) { t.prevSlot = prevSlots[tr.id]; t.movePenaltyMin = scn.ev?.movePenaltyMin ?? MOVE_PENALTY_MIN; }
    return t;
  });
  const res = FS.allocateFleet(trucks, scn, 'aware');
  const o = {}, routes = {}, held = {};
  for (const a of res.assignments) { o[a.id] = a.slot; routes[a.id] = routeOf(FLEET.find(t => t.id === a.id)).id; }
  for (const t of trucks) held[t.id] = t.heldBy;
  return { slots: o, routes, held };
}

/* Where scoring the pairs together changed the answer. Used by the tests, the
 * evidence table and the dispatcher's "why" line. */
function jointVsTimeFirst(scn, nowMin = 0, policy = POLICY_FULL, share = 0.243, closedRoads = []) {
  const joint = planSlots(scn, null, nowMin, {}, policy, share, closedRoads);
  const seq = planTimeFirst(scn, null, nowMin, {}, policy, share);
  const changed = [];
  for (const tr of FLEET) {
    const dSlot = joint.slots[tr.id] !== seq.slots[tr.id];
    const dRoute = joint.routes[tr.id] !== seq.routes[tr.id];
    if (dSlot || dRoute) {
      changed.push({
        id: tr.id,
        departureChanged: dSlot, routeChanged: dRoute,
        jointSlot: joint.slots[tr.id], timeFirstSlot: seq.slots[tr.id],
        jointGate: FS.fmtTime(joint.slots[tr.id] * 15),
        timeFirstGate: FS.fmtTime(seq.slots[tr.id] * 15),
        jointRoute: joint.routes[tr.id], timeFirstRoute: seq.routes[tr.id],
      });
    }
  }
  return { joint, seq, changed };
}

/* The whole demo in one call: normal plan, changed without re-plan, changed + re-plan. */
function runDay(opts = {}, schoolShare = 0.3, policy = POLICY_FULL) {
  const normal = dayScenario('normal');
  const changed = dayScenario('changed', opts);
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const closed = opts.closedRoads || [];
  const p = planSlots(normal, null, 0, {}, policy, schoolShare, closed);
  const planN = evaluate(p.slots, normal, null, null, p.routes);
  // Changed, no re-plan: every truck still leaves at its old departure time, on
  // the route it was already given.
  const departs = {}, staleSlots = {};
  for (const x of planN.rows) {
    departs[x.id] = x.depart;
    const tr = FLEET.find(t => t.id === x.id);
    staleSlots[x.id] = Math.floor((x.depart + driveMin(tr, x.depart, changed, routeOf(tr, p.routes[x.id]))) / 15);
  }
  const stale = evaluate(staleSlots, changed, null, departs, p.routes);
  // Re-plan at the moment the event is CONFIRMED. Trucks already on the road keep their slot.
  const nowMin = changed.ev.crashFrom + changed.ev.confirmDelayMin;
  const departed = {};
  for (const x of planN.rows) if (x.depart < nowMin) departed[x.id] = staleSlots[x.id];
  const r = planSlots(changed, { ...staleSlots, routes: p.routes }, nowMin, departed,
                      policy, schoolShare, closed);
  const fixed = {};
  for (const id in departed) fixed[id] = departs[id];
  let re = evaluate(r.slots, changed, staleSlots, fixed, r.routes, p.routes);
  // Protect the worst-off driver: a re-plan may never leave the worst-off per-trip driver worse off
  // than the old plan. If it would, put that driver back on their old time and re-check.
  const staleMax = Math.max(0, ...stale.rows.map(x => x.unpaidMin));
  const protectedIds = [];
  for (let guard = 0; guard < FLEET.length; guard++) {
    const worst = re.rows.filter(x => x.pay === 'trip').sort((a, b) => b.unpaidMin - a.unpaidMin)[0];
    if (!worst || worst.unpaidMin <= staleMax + 1e-9 || protectedIds.includes(worst.id)) break;
    protectedIds.push(worst.id);
    r.slots[worst.id] = staleSlots[worst.id];
    fixed[worst.id] = departs[worst.id];
    r.held[worst.id] = 'protect-worst-off';
    r.routes[worst.id] = p.routes[worst.id];       // put the old route back too
    re = evaluate(r.slots, changed, staleSlots, fixed, r.routes, p.routes);
  }
  const latencyMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
  return {
    normal: { ev: planN, k: kpis(planN, schoolShare), held: p.held, routes: p.routes, why: p.why },
    stale: { ev: stale, k: kpis(stale, schoolShare), routes: p.routes },
    replan: { ev: re, k: kpis(re, schoolShare), held: r.held, routes: r.routes, why: r.why },
    habitNormal: kpis(evaluate(habitSlots(normal), normal), schoolShare),
    habitChanged: kpis(evaluate(habitSlots(changed), changed), schoolShare),
    pairsConsidered: p.pairCount,
    latencyMs, scn: { normal, changed }, nowMin, departed, protectedIds,
  };
}

/* ------------------------------------------- stakeholders → decision (C4) ----
 * Same morning planned twice: DispatchMonkey (every driver's minute counts the same, driver cap,
 * community cost) vs a money-only planner (per-trip waiting costs only fuel, no cap, no
 * community cost). Differences = where a stakeholder rule changed a truck's time. */
function compareMoneyOnly(opts = {}, share = 0.243) {
  const ours = runDay(opts, share, POLICY_FULL), money = runDay(opts, share, POLICY_MONEY);
  const diffs = [];
  for (const r of ours.replan.ev.rows) {
    const m = money.replan.ev.rows.find(x => x.id === r.id);
    if (Math.abs(m.depart - r.depart) >= 5 && (m.unpaidMin > r.unpaidMin || m.wait > r.wait)) diffs.push({ id: r.id, pay: r.pay, ours: r, money: m });
  }
  return { ours: ours.replan.k, money: money.replan.k, diffs };
}

/* Why this truck has this time: one line per perspective. Engine numbers only. */
function whyTruck(r, held, diff, schoolShare = 0.243) {
  const out = [];
  if (held === 'already-departed') out.push({ lens: 'dispatcher', text: 'Already on the road at re-plan time: not moved.' });
  const slack = Math.round(r.win[1] - r.whArrive);
  out.push({ lens: 'warehouse', text: r.late
    ? `Misses the dock window by ${Math.round(r.whArrive - r.win[1])} min (closes ${FS.fmtTime(r.win[1])}).`
    : `Reaches the dock ${slack} min before the window closes at ${FS.fmtTime(r.win[1])}${held === 'warehouse-window' ? ' (this window is what limits its time)' : ''}.` });
  out.push({ lens: 'driver', text: diff
    ? `A money-only planner would make this ${r.pay === 'trip' ? 'unpaid per-trip' : 'hourly'} driver wait ${Math.round(diff.money.wait)} min in the queue and leave ${Math.round(diff.money.creep)} min late; we keep it to ${Math.round(r.wait)} min.`
    : `${r.pay === 'trip' ? 'Per-trip (unpaid while waiting)' : 'Hourly'}: ${Math.round(r.wait)} min queue, ${Math.round(r.creep)} min later than planned (cap ${CREEP_CAP_MIN}).` });
  if (r.bell > 1 && r.wait > 0) out.push({ lens: 'community', text: `Gate at ${FS.fmtTime(r.gate)} is school-bell time: its ${Math.round(r.wait)} idle min next to schools count ×3.` });
  out.push({ lens: 'environment', text: `${r.co2Kg.toFixed(1)} kg idle CO₂.` });
  return out;
}

/* ----------------------------------------- question a truck's time (C3) ----
 * For one truck in a plan: every block it could take, what that would do to it and to the
 * fleet, and why the planner did not pick it. Engine numbers only. */
function planContext(day, planName) {
  const P = planName === 'normal' ? day.normal : planName === 'stale' ? day.stale : day.replan;
  const scn = planName === 'normal' ? day.scn.normal : day.scn.changed;
  const slots = {}, fixed = {};
  for (const r of P.ev.rows) slots[r.id] = r.slot;
  if (planName === 'stale') for (const r of P.ev.rows) fixed[r.id] = r.depart;
  if (planName === 'replan') for (const id in day.departed) fixed[id] = P.ev.rows.find(r => r.id === id).depart;
  return { P, scn, slots, fixed };
}
function evalWith(day, planName, overrides, share = 0.243) {
  const { scn, slots, fixed } = planContext(day, planName);
  const sl = { ...slots, ...overrides }, fx = { ...fixed };
  for (const id in overrides) delete fx[id];
  const ev = evaluate(sl, scn, null, fx);
  return { ev, k: kpis(ev, share) };
}
function alternatives(day, planName, id, share = 0.243) {
  const { P, scn } = planContext(day, planName);
  const cur = P.ev.rows.find(r => r.id === id), tr = FLEET.find(t => t.id === id);
  if (planName === 'replan' && day.departed[id] != null) return { locked: 'Already on the road when the plan changed.', options: [] };
  if (planName === 'stale') return { locked: 'This is the old plan: re-plan first, then question it.', options: [] };
  const base = P.k, nowMin = planName === 'replan' ? day.nowMin : 0;
  const options = [];
  for (let s = cur.slot - 4; s <= cur.slot + 6; s++) {
    if (s === cur.slot) { options.push({ slot: s, chosen: true, row: cur, dIdle: 0, dVnd: 0, why: 'Chosen: lowest total waiting for the app fleet within every rule.' }); continue; }
    const res = evalWith(day, planName, { [id]: s }, share);
    const row = res.ev.rows.find(r => r.id === id);
    const reasons = [];
    if (row.depart < Math.max(tr.shift, nowMin)) reasons.push(row.depart < tr.shift ? 'before the driver\'s shift starts' : 'departure already in the past');
    if (row.gate < tr.ready) reasons.push('container not released yet');
    if (row.late) reasons.push(`misses the warehouse window by ${Math.round(row.whArrive - row.win[1])} min`);
    if (row.creep > CREEP_CAP_MIN) reasons.push(`pushes the driver ${Math.round(row.creep)} min late (cap ${CREEP_CAP_MIN})`);
    const dIdle = res.k.K2_idleMin - base.K2_idleMin, dVnd = res.k.K1_vnd - base.K1_vnd;
    if (!reasons.length) reasons.push(dIdle > 0 ? `${dIdle} more idle truck-minutes for the fleet` : dIdle < 0 ? `${-dIdle} fewer idle minutes but ${row.unpaidMin > cur.unpaidMin ? 'more unpaid driver time' : 'breaks the 10-min dock buffer or stability rule'}` : 'no better: same waiting, moves the truck for nothing');
    options.push({ slot: s, chosen: false, row, dIdle, dVnd, dUnpaidMax: res.k.K3_unpaidMaxMin - base.K3_unpaidMaxMin,
                   feasible: !(row.late || row.creep > CREEP_CAP_MIN || row.gate < tr.ready || row.depart < Math.max(tr.shift, nowMin)), why: reasons.join('; ') });
  }
  return { options };
}

/* ------------------------------------------------ a real day, timelapse ----
 * One real weekday at Cát Lái, fast-forwarded. Inputs (REAL): that morning's radar ship count
 * and that day's hourly rain. Assumptions (ESTIMATE, labeled on screen):
 *  - truck arrivals 07:00–17:00 scale with ships vs the median: 1 + SHIP_ELASTICITY·(ships/median − 1)
 *  - an hour with ≥ 2 mm of rain cuts gate throughput to RAIN_CAP_FACTOR
 *  - `adoption` of trucks use an app; each can be retimed up to ±RETIME_SLOTS blocks (±2 h)
 * Background arrivals curve and gate capacity stay SIMULATED (no public gate data). */
const SHIP_ELASTICITY = 0.6, RAIN_CAP_FACTOR = 0.85, RETIME_SLOTS = 8;
function realDayScenario(day, median) {
  const sc = dayScenario('normal');
  const ratio = day.ships && median ? day.ships / median : 1;
  const f = 1 + SHIP_ELASTICITY * (ratio - 1);
  for (let s = 0; s < 96; s++) {
    if (s >= 28 && s < 68) sc.arrFactorBySlot[s] = f;
    const mm = (day.rain_mm || [])[Math.floor(s / 4)] || 0;
    if (mm >= 2) sc.capBySlot[s] = Math.round(sc.capacityPerSlot * RAIN_CAP_FACTOR);
  }
  sc.kind = 'normal'; sc.shipFactor = f; sc.rainSlots = sc.capBySlot.map((c, s) => c < sc.capacityPerSlot ? s : -1).filter(x => x >= 0);
  return sc;
}
function portDay(scn, adoption = 0.3, opts = {}) {
  const from = opts.from ?? 20, to = opts.to ?? 79, batch = opts.batch ?? 10;
  const share = new Array(96).fill(1);
  for (let s = from; s <= to; s++) share[s] = 1 - adoption;
  const scnApp = { ...scn, bgShareBySlot: share };
  const today = FS.queueProfile(scn);
  const batches = [];
  for (let s = from; s <= to; s++) {
    const n = Math.round(FD.ARRIVALS[s] * (scn.arrFactorBySlot ? scn.arrFactorBySlot[s] : 1) * adoption / batch);
    for (let i = 0; i < n; i++) batches.push(s);
  }
  const extra = new Array(96).fill(0);
  for (const s0 of batches) {
    const before = FS.fleetWaitMin(FS.queueProfile(scnApp, extra));
    let best = Infinity, pick = s0;
    for (let s = Math.max(from, s0 - RETIME_SLOTS); s <= Math.min(to, s0 + RETIME_SLOTS); s++) {
      extra[s] += batch;
      const c = FS.fleetWaitMin(FS.queueProfile(scnApp, extra)) - before + Math.abs(s - s0) * 0.01;
      extra[s] -= batch;
      if (c < best - 1e-9) { best = c; pick = s; }
    }
    extra[pick] += batch;
  }
  const app = FS.queueProfile(scnApp, extra);
  const hours = p => { let w = 0; for (let k = 0; k < 96; k++) w += p.arrivals[k] * p.wait[k]; return w / 60; };
  const R = FD.RATES, co2t = h => h * R.idleBurnLPerH.v * R.co2KgPerL.v / 1000;
  return { today, app, extra, adoption,
    tot: { todayH: Math.round(hours(today)), appH: Math.round(hours(app)), todayCo2t: +co2t(hours(today)).toFixed(1), appCo2t: +co2t(hours(app)).toFixed(1),
           peakToday: Math.round(Math.max(...today.backlog)), peakApp: Math.round(Math.max(...app.backlog)),
           trucks: Math.round(today.arrivals.slice(from, to + 1).reduce((a, b) => a + b, 0)) } };
}
function timelapseDay(day, median, adoption = 0.3) {
  const scn = realDayScenario(day, median);
  const habit = evaluate(habitSlots(scn), scn), plan = evaluate(planSlots(scn).slots, scn);
  return { day, scn, port: portDay(scn, adoption), fleet: { habit: { ev: habit, k: kpis(habit, 0.243) }, plan: { ev: plan, k: kpis(plan, 0.243) } } };
}

/* Share of a road polyline within `m` metres of any POI (schools + clinics). DERIVED from OSM. */
function exposureShare(line, pois, m = 150) {
  const d = (a, b) => Math.hypot((a[0] - b[0]) * Math.cos(10.76 * Math.PI / 180) * 111320, (a[1] - b[1]) * 110570);
  let near = 0, total = 0;
  for (let i = 0; i < line.length - 1; i++) {
    const seg = d(line[i], line[i + 1]);
    total += seg;
    const mid = [(line[i][0] + line[i + 1][0]) / 2, (line[i][1] + line[i + 1][1]) / 2];
    if (pois.some(p => d(mid, [p.lon, p.lat]) < m)) near += seg;
  }
  return total ? near / total : 0;
}

/* ---------------------------------------------- anti-herding, port level ----
 * Adoption a ∈ [0,1] of the morning trucks (06:00–12:00) use an app. They leave
 * the background A_bg and are placed by one of three rules:
 *   today: nobody moves (the app-users arrive when they always did)
 *   naive: every app user is sent to the block that LOOKS quietest (ignores itself)
 *   aware: DispatchMonkey incremental assignment (each truck sees the ones before it)
 * Returns the backlog (trucks queued) per 15-min block. All SIMULATED. */
function herdingCurves(adoption, opts = {}) {
  const from = opts.from ?? 24, to = opts.to ?? 47, batch = opts.batch ?? 10;
  const base = FD.SCENARIOS.normal;
  const shareArr = new Array(96).fill(1);
  for (let s = from; s <= to; s++) shareArr[s] = 1 - adoption;
  const scnApp = { capacityPerSlot: base.capacityPerSlot, arrivalsFactor: 1, bgShareBySlot: shareArr };
  let N = 0;
  for (let s = from; s <= to; s++) N += FD.ARRIVALS[s] * adoption;
  const nBatches = Math.round(N / batch);
  const today = FS.queueProfile({ capacityPerSlot: base.capacityPerSlot, arrivalsFactor: 1 });
  // naive: the quietest block in the forecast that ignores app users
  const bgOnly = FS.queueProfile(scnApp);
  let q = from;
  for (let s = from; s <= to; s++) if (bgOnly.wait[s] < bgOnly.wait[q] || (bgOnly.wait[s] === bgOnly.wait[q] && FD.ARRIVALS[s] < FD.ARRIVALS[q])) q = s;
  const naiveExtra = new Array(96).fill(0); naiveExtra[q] = nBatches * batch;
  const naive = FS.queueProfile(scnApp, naiveExtra);
  // aware: incremental, in batches of `batch` trucks (same rule as allocateFleet, faster)
  const extra = new Array(96).fill(0);
  for (let i = 0; i < nBatches; i++) {
    let best = Infinity, pick = from;
    const before = FS.fleetWaitMin(FS.queueProfile(scnApp, extra));
    for (let s = from; s <= to; s++) {
      extra[s] += batch;
      const c = FS.fleetWaitMin(FS.queueProfile(scnApp, extra)) - before;
      extra[s] -= batch;
      if (c < best - 1e-9) { best = c; pick = s; }
    }
    extra[pick] += batch;
  }
  const aware = FS.queueProfile(scnApp, extra);
  const peak = p => Math.round(Math.max(...p.backlog));
  const avgWait = p => { let w = 0, a = 0; for (let s = 0; s < 96; s++) { w += p.arrivals[s] * p.wait[s]; a += p.arrivals[s]; } return w / a; };
  return {
    adoption, appTrucks: nBatches * batch, naiveSlot: q,
    today: today.backlog, naive: naive.backlog, aware: aware.backlog,
    peak: { today: peak(today), naive: peak(naive), aware: peak(aware) },
    avgWaitMin: { today: +avgWait(today).toFixed(1), naive: +avgWait(naive).toFixed(1), aware: +avgWait(aware).toFixed(1) },
  };
}

if (typeof module !== 'undefined') module.exports = {
  FLEET, WAREHOUSES, EVENT, timelapseDay, realDayScenario, portDay, SHIP_ELASTICITY, RAIN_CAP_FACTOR, compareMoneyOnly, whyTruck, alternatives, evalWith, planContext, POLICY_FULL, POLICY_MONEY, bellAt, SERVICE_MIN, DOCK_BUFFER_MIN, CREEP_CAP_MIN, MOVE_PENALTY_MIN, DOCK_MISS_VND,
  dayScenario, driveMin, feasibleWindow, evaluate, kpis, habitSlots, planSlots, runDay,
  exposureShare, herdingCurves, routeOf, routesFor, eligibleRoutes, routeBlockedBy,
  pairOptions, planTimeFirst, jointVsTimeFirst, departFor, FLEET, EVENT,
  POLICY_FULL, POLICY_MONEY, CREEP_CAP_MIN,
};
