/* Đúng Giờ — dispatcher engine: one fleet-day at Cát Lái.
 * Pure functions on top of scoring.js (queueProfile + allocateFleet 'aware').
 * The fleet, jobs and windows are SIMULATED (the field names are real);
 * every KPI carries its formula + truth tier. No LLM ever writes a number. */

const FD = typeof module !== 'undefined' ? require('./data.js')
  : { RATES, ROUTES, ORIGINS, ARRIVALS, SCENARIOS };
const FS = typeof module !== 'undefined' ? require('./scoring.js')
  : { queueProfile, allocateFleet, fmtTime, fleetWaitMin };

const SERVICE_MIN = 30;            // pick-up time inside the terminal (ESTIMATE)
const CREEP_CAP_MIN = 90;          // shift-creep cap: never push a driver > 90 min later than planned
                                   // (spec default 45 is too tight to dodge a 3-hour ship wave; a parameter)
const MOVE_PENALTY_MIN = 5;        // re-plan stability (minutes a move must save)
const DOCK_BUFFER_MIN = 10;        // plan to reach the dock ≥ 10 min before the window closes
const DOCK_MISS_VND = 500000;      // missed warehouse appointment: rebook + detention (SIMULATED)

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

/* Drive time for a truck's default route, slowed if the drive overlaps the crash. */
function routeOf(tr) { return FD.ROUTES[tr.wh][0]; }
function driveMin(tr, startMin, scn) {
  const r = routeOf(tr);
  const ev = scn.ev;
  if (scn.kind === 'changed' && r.roads.includes('Cầu Phú Mỹ')
      && startMin < ev.crashFrom + ev.clearanceMin && startMin + r.baseMin > ev.crashFrom) {
    return Math.round(r.baseMin / ev.bridgeSpeedFactor);
  }
  return r.baseMin;
}

/* Rules Book → feasible gate blocks per truck (spec §3.1).
 * first: container released (ready time, customs not red) and the driver's shift has started.
 * last:  expected gate wait + pick-up + drive back still inside the receiving window,
 *        and departure no more than CREEP_CAP_MIN later than the driver's plan. */
function feasibleWindow(tr, scn, nowMin = 0) {
  const bg = FS.queueProfile(scn);
  const out = { firstSlot: null, lastSlot: null, heldBy: null };
  if (tr.customs === 'red') return { ...out, heldBy: 'customs-red' };
  const startMin = Math.max(tr.shift, nowMin);          // cannot leave before the shift, or in the past
  // Earliest gate arrival: leaving later can arrive EARLIER if it skips the crash, so try departures.
  let earliest = Infinity;
  for (let d = startMin; d <= startMin + 120; d += 5) earliest = Math.min(earliest, d + driveMin(tr, d, scn));
  const firstGate = Math.max(tr.ready, earliest);
  const first = Math.ceil(firstGate / 15);        // first whole 15-min block the truck can reach
  let last = null, heldBy = null;
  for (let s = first; s < 96; s++) {
    const m = s * 15;
    const dep = m - driveMin(tr, m - routeOf(tr).baseMin, scn);
    const back = m + bg.wait[s] + SERVICE_MIN + driveMin(tr, m + bg.wait[s] + SERVICE_MIN, scn);
    if (dep - tr.planned > CREEP_CAP_MIN) { heldBy = heldBy || 'shift-creep'; break; }
    if (back > tr.win[1] - DOCK_BUFFER_MIN) { heldBy = heldBy || 'warehouse-window'; break; }
    last = s;
  }
  if (last == null) return { firstSlot: first, lastSlot: first, heldBy: heldBy || 'none-feasible', infeasible: true };
  return { firstSlot: first, lastSlot: last, heldBy };
}

/* Evaluate fixed assignments {id → slot} under a scenario. Our own trucks are in
 * the queue (extra[]), so this sees the fleet's effect on itself. */
function evaluate(slots, scn, prevSlots, fixedDepart) {
  const extra = new Array(96).fill(0);
  for (const tr of FLEET) extra[slots[tr.id]] += 1;
  const prof = FS.queueProfile(scn, extra);
  const R = FD.RATES;
  const rows = FLEET.map(tr => {
    const s = slots[tr.id];
    let gate = s * 15, drive = routeOf(tr).baseMin, depart = gate - drive;
    // Latest departure that still reaches the gate by the block start (crash-aware drive time).
    for (let d = gate - routeOf(tr).baseMin; d >= gate - 3 * routeOf(tr).baseMin; d -= 1) {
      if (d + driveMin(tr, d, scn) <= gate) { depart = d; drive = gate - d; break; }
    }
    if (fixedDepart && fixedDepart[tr.id] != null) {      // the stale plan: truck leaves when it was told to
      depart = fixedDepart[tr.id]; drive = driveMin(tr, depart, scn); gate = depart + drive;
    }
    const wait = prof.wait[s];
    const out = gate + wait + SERVICE_MIN;
    const back = driveMin(tr, out, scn);
    const whArrive = out + back;
    const idleL = wait / 60 * R.idleBurnLPerH.v;
    const bell = (gate >= h(6, 30) && gate < h(8)) || (gate >= h(16) && gate < h(17, 30)) ? 3 : 1;
    const late = whArrive > tr.win[1];
    const creep = Math.max(0, depart - tr.planned);
    return {
      id: tr.id, wh: tr.wh, pay: tr.pay, slot: s, depart, gate, wait, gateOut: out, whArrive,
      drive, back, win: tr.win, ready: tr.ready, customs: tr.customs, planned: tr.planned,
      readyOnArrival: gate >= tr.ready, late, creep, creepViolation: creep > CREEP_CAP_MIN,
      fuelVnd: idleL * R.dieselVndPerL.v,
      wageVnd: tr.pay === 'hourly' ? wait / 60 * R.driverVndPerH.v : 0,
      penaltyVnd: late ? DOCK_MISS_VND : 0,
      unpaidMin: tr.pay === 'trip' ? wait + creep : 0,
      co2Kg: idleL * R.co2KgPerL.v,
      bell,
      moved: prevSlots ? prevSlots[tr.id] !== s : false,
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
    K7_wasted: r.filter(x => !x.readyOnArrival).length,
    K8_schoolMin: Math.round(sum(x => x.wait * schoolShare * x.bell)),
    K10_co2Kg: +sum(x => x.co2Kg).toFixed(1),
    K11_peak: Math.max(...ev.extra),
    K13_churn: r.filter(x => x.moved).length,
  };
}

/* The three plans the dispatcher sees.
 *  habit:  everyone leaves at the planned time (gate block = planned + drive)
 *  plan:   Đúng Giờ, allocateFleet(..., 'aware') inside each truck's feasible window
 *  replan: same allocator on the changed scenario, preferring to keep previous blocks */
function habitSlots(scn) {
  const o = {};
  for (const tr of FLEET) o[tr.id] = Math.ceil((tr.planned + driveMin(tr, tr.planned, scn)) / 15);
  return o;
}
function planSlots(scn, prevSlots, nowMin = 0, departed = {}) {
  const trucks = FLEET.map(tr => {
    if (departed[tr.id] != null) {                       // already on the road: keep it
      const s = departed[tr.id];
      return { id: tr.id, firstSlot: s, lastSlot: s, heldBy: 'already-departed', prevSlot: s };
    }
    const w = feasibleWindow(tr, scn, nowMin);
    const pref = Math.floor((tr.planned + driveMin(tr, tr.planned, scn)) / 15);
    const t = { id: tr.id, firstSlot: w.firstSlot, lastSlot: w.lastSlot, heldBy: w.heldBy,
                prefSlot: Math.min(w.lastSlot, Math.max(w.firstSlot, pref)) };
    // Keeping the old block costs nothing extra (stability), but only if it is still feasible:
    // it must lie inside [firstSlot, lastSlot], which already checks the warehouse window.
    if (prevSlots) { t.prevSlot = prevSlots[tr.id]; t.movePenaltyMin = scn.ev?.movePenaltyMin ?? MOVE_PENALTY_MIN; }
    return t;
  });
  const res = FS.allocateFleet(trucks, scn, 'aware');
  const o = {};
  for (const a of res.assignments) o[a.id] = a.slot;
  const held = {};
  for (const t of trucks) held[t.id] = t.heldBy;
  return { slots: o, held };
}

/* The whole demo in one call: normal plan, changed without re-plan, changed + re-plan. */
function runDay(opts = {}, schoolShare = 0.3) {
  const normal = dayScenario('normal');
  const changed = dayScenario('changed', opts);
  const t0 = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const p = planSlots(normal);
  const planN = evaluate(p.slots, normal);
  // Changed, no re-plan: every truck still leaves at its old departure time.
  const departs = {}, staleSlots = {};
  for (const x of planN.rows) {
    departs[x.id] = x.depart;
    staleSlots[x.id] = Math.floor((x.depart + driveMin(FLEET.find(t => t.id === x.id), x.depart, changed)) / 15);
  }
  const stale = evaluate(staleSlots, changed, null, departs);
  // Re-plan at the moment the event is CONFIRMED. Trucks already on the road keep their slot.
  const nowMin = changed.ev.crashFrom + changed.ev.confirmDelayMin;
  const departed = {};
  for (const x of planN.rows) if (x.depart < nowMin) departed[x.id] = staleSlots[x.id];
  const r = planSlots(changed, staleSlots, nowMin, departed);
  const fixed = {};
  for (const id in departed) fixed[id] = departs[id];
  const re = evaluate(r.slots, changed, staleSlots, fixed);
  const latencyMs = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - t0;
  return {
    normal: { ev: planN, k: kpis(planN, schoolShare), held: p.held },
    stale: { ev: stale, k: kpis(stale, schoolShare) },
    replan: { ev: re, k: kpis(re, schoolShare), held: r.held },
    habitNormal: kpis(evaluate(habitSlots(normal), normal), schoolShare),
    habitChanged: kpis(evaluate(habitSlots(changed), changed), schoolShare),
    latencyMs, scn: { normal, changed }, nowMin, departed,
  };
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
 *   aware: Đúng Giờ incremental assignment (each truck sees the ones before it)
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
  FLEET, WAREHOUSES, EVENT, SERVICE_MIN, DOCK_BUFFER_MIN, CREEP_CAP_MIN, MOVE_PENALTY_MIN, DOCK_MISS_VND,
  dayScenario, driveMin, feasibleWindow, evaluate, kpis, habitSlots, planSlots, runDay,
  exposureShare, herdingCurves, routeOf,
};
