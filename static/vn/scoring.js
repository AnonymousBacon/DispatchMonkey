/* Đúng Giờ — deterministic engine. ALL numbers come from here; no LLM ever
 * writes a number. Pure functions over data.js inputs so node can test them. */

const D = typeof module !== 'undefined' ? require('./data.js')
  : { RATES, RULES, ORIGINS, GATE, ROUTES, ARRIVALS, SCENARIOS, WEIGHTS, LEDGER };

/* Queue wait (minutes) if you reach the gate at minute-of-day `m`.
 * Deterministic backlog model: arrivals vs gate capacity per 15-min slot. */
function queueWaitAt(m, scn, extra) {
  const slot = Math.max(0, Math.min(95, Math.floor(m / 15)));
  const wait = queueProfile(scn, extra).wait[slot];
  return { mid: Math.round(wait), lo: Math.round(wait * 0.7), hi: Math.round(wait * 1.3) };
}

/* ---------------------------------------------------------- anti-herding ----
 * The fluid queue for a whole day, including OUR OWN trucks:
 *   Q[t] = max(0, Q[t-1] + A_bg[t] + extra[t] − C)      wait[t] = Q[t] / C × 15
 * `extra[t]` = trucks we have already assigned to 15-min block t. Leaving it out
 * is what causes herding: the advice cannot see its own effect. */
function queueProfile(scn, extra) {
  // Optional per-block overrides (time-limited events): scn.capBySlot[s] = gate
  // capacity in block s, scn.arrFactorBySlot[s] = arrivals multiplier (ship surge),
  // scn.bgShareBySlot[s] = share of background trucks still in A_bg (adoption model).
  const arrivals = new Array(96), backlog = new Array(96), wait = new Array(96);
  let q = 0;
  for (let s = 0; s < 96; s++) {
    const C = scn.capBySlot ? scn.capBySlot[s] : scn.capacityPerSlot;
    const f = scn.arrFactorBySlot ? scn.arrFactorBySlot[s] : scn.arrivalsFactor;
    const share = scn.bgShareBySlot ? scn.bgShareBySlot[s] : 1;
    arrivals[s] = D.ARRIVALS[s] * f * share + (extra ? extra[s] || 0 : 0);
    q = Math.max(0, q + arrivals[s] - C);
    backlog[s] = q;
    wait[s] = q / C * 15;
  }
  return { arrivals, backlog, wait, peak: Math.max(...backlog), extra: extra ? [...extra] : null };
}

/* Σ minutes waited by OUR app users only (trucks in `extra`). */
function fleetWaitMin(profile) {
  if (!profile.extra) return 0;
  let sum = 0;
  for (let s = 0; s < 96; s++) sum += profile.extra[s] * profile.wait[s];
  return sum;
}

/* Σ over the day of (trucks arriving in block × minutes they wait). */
function totalWaitMin(profile) {
  let sum = 0;
  for (let s = 0; s < 96; s++) sum += profile.arrivals[s] * profile.wait[s];
  return sum;
}

/* Cost of putting one more truck in block t, given the queue before and after.
 * `before` and `after` are queueProfile() results (after = before + 1 truck at t).
 * Lower is better. The allocator picks the block with the lowest cost. */
function slotCost(before, after, t, truck) {
  // Two levels (founder decision):
  //  1. App users come first: we only count waiting by trucks that use the app,
  //     so app users always beat the crowd (non-app trucks are the background).
  //  2. Inside the app it's Rule B, "best for everyone in the app": this truck's
  //     own wait PLUS the extra minutes it adds to every app truck already placed.
  //     Like Amazon greying out full delivery slots instead of handing each
  //     customer the slot that is best for them alone.
  // Tiny tie-break → earlier block (shorter day for the driver).
  // Stability on re-plan: moving a truck off its previous block costs
  // `truck.movePenaltyMin` minutes, so the dispatcher is not hit with 12 changes
  // for a 2-minute gain (spec §3.3).
  const move = truck.prevSlot != null && t !== truck.prevSlot ? (truck.movePenaltyMin ?? 10) : 0;
  // Tie-break: stay near the driver's preferred block (prefSlot), else earlier block.
  const tie = truck.prefSlot != null ? Math.abs(t - truck.prefSlot) : t - truck.firstSlot;
  return fleetWaitMin(after) - fleetWaitMin(before) + move + tie * 0.01;
}

/* Assign each truck a gate-arrival block inside its window.
 * trucks: [{ id, firstSlot, lastSlot }]  (15-min block indices, inclusive)
 * strategy:
 *   'same'  — everyone shows up at their earliest block (today's behaviour)
 *   'naive' — everyone gets the block that looks quietest in the background
 *             forecast, which ignores our own trucks (what most apps do → herding)
 *   'aware' — one truck at a time, each sees the trucks already assigned
 *             (incremental / capacity-aware assignment, the fix) */
function allocateFleet(trucks, scn, strategy = 'aware') {
  const extra = new Array(96).fill(0);
  const base = queueProfile(scn);
  const order = [...trucks].sort((a, b) =>
    (a.lastSlot - a.firstSlot) - (b.lastSlot - b.firstSlot) || a.firstSlot - b.firstSlot);
  const out = [];
  for (const tr of order) {
    let pick = tr.firstSlot;
    if (strategy === 'naive') {
      for (let t = tr.firstSlot; t <= tr.lastSlot; t++) if (base.wait[t] < base.wait[pick]) pick = t;
    } else if (strategy === 'aware') {
      const before = queueProfile(scn, extra);
      let best = Infinity;
      for (let t = tr.firstSlot; t <= tr.lastSlot; t++) {
        extra[t] += 1;
        const c = slotCost(before, queueProfile(scn, extra), t, tr);
        extra[t] -= 1;
        if (c < best - 1e-9) { best = c; pick = t; }
      }
    }
    extra[pick] += 1;                       // ← the fix: later trucks see this one
    out.push({ id: tr.id, slot: pick, gateTime: fmtTime(pick * 15) });
  }
  const profile = queueProfile(scn, extra);
  for (const a of out) a.waitMin = Math.round(profile.wait[a.slot]);
  return { assignments: out, extra, profile,
           fleetWaitMin: out.reduce((s, a) => s + profile.wait[a.slot], 0) };
}

function fmtTime(m) {
  m = Math.round(m) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/* Evaluate one (route, departure delay) pair. ctx:
 * { nowMin, scenario, fuelPer100, payType ('trip'|'hourly'), hourlyRate,
 *   dieselPrice, hoursLeft, slotMin|null, registered24, poiCount: {road: n} } */
function evalOption(route, depDelayMin, ctx) {
  const scn = D.SCENARIOS[ctx.scenario];
  const R = D.RATES;
  const affected = (scn.slowRoads || []).filter(r => route.roads.includes(r)).length;
  const share = affected / route.roads.length;
  const driveMin = route.baseMin * (1 + share * (1 / scn.speedFactor - 1));
  const departMin = ctx.nowMin + depDelayMin;
  const reachGateMin = departMin + driveMin;
  // Before 7:30 without 24/24 registration the truck queues until the gate opens.
  let waitOpen = 0;
  if (!ctx.registered24 && (reachGateMin % 1440) < 7.5 * 60) {
    waitOpen = 7.5 * 60 - (reachGateMin % 1440);
  }
  const q = queueWaitAt(reachGateMin + waitOpen, scn);
  const gateMin = reachGateMin + waitOpen + q.mid;

  const idleMin = q.mid + waitOpen;            // engine-on queue idling (not origin wait)
  const fuelL = route.km * ctx.fuelPer100 / 100 + idleMin / 60 * R.idleBurnLPerH.v;
  const co2Kg = fuelL * R.co2KgPerL.v;
  const tollVnd = route.toll ? R[route.toll].v : 0;
  const totalMin = driveMin + idleMin + depDelayMin;
  const missedSlot = ctx.slotMin != null && gateMin > ctx.slotMin;
  const penaltyVnd = missedSlot ? R.rebookVnd.v : 0;
  const driverVnd = ctx.payType === 'hourly' ? totalMin / 60 * ctx.hourlyRate : 0;
  const unpaidMin = ctx.payType === 'trip' ? Math.round(idleMin + depDelayMin) : 0;
  const costVnd = Math.round(fuelL * ctx.dieselPrice + tollVnd + penaltyVnd + driverVnd);

  // Exposure: idle minutes next to schools/hospitals on the queue road.
  const pois = (ctx.poiCount || {})[route.queueRoad] ?? 1;
  const gateH = (gateMin % 1440) / 60;
  const bell = (gateH >= 6.5 && gateH < 8) || (gateH >= 16 && gateH < 17.5) ? 3 : 1;
  const exposure = Math.round(idleMin * Math.min(pois, 10) / 10 * bell * (ctx.aqiUnhealthy ? 1.5 : 1));

  // Hard filters, each with a reason key.
  const blocked = [];
  for (const rule of D.RULES) {
    if (rule.blocksRoads && rule.blocksRoads.some(r => route.roads.includes(r))) {
      blocked.push(rule.id);
    }
  }
  const gh = (gateMin % 1440) / 60;
  if (!ctx.registered24 && gh > 17) blocked.push('port-hours');
  if (missedSlot) blocked.push('eport-slot');
  if (ctx.hoursLeft != null && (driveMin + idleMin) > ctx.hoursLeft * 60) blocked.push('driver-hours');

  return {
    route, depDelayMin, departMin, driveMin: Math.round(driveMin),
    gateMin, gateTime: fmtTime(gateMin), departTime: fmtTime(departMin),
    queue: { lo: q.lo + Math.round(waitOpen), mid: q.mid + Math.round(waitOpen), hi: q.hi + Math.round(waitOpen) },
    waitOpenMin: Math.round(waitOpen), idleMin: Math.round(idleMin), km: route.km,
    fuelL: +fuelL.toFixed(1), co2Kg: +co2Kg.toFixed(1), costVnd, tollVnd,
    penaltyVnd, unpaidMin, exposure, blocked, missedSlot,
  };
}

/* Normalize 0(best)..1(worst) with a dead-band, then weighted sum. */
function scoreOptions(opts, weights, ledgerMult) {
  const ok = opts.filter(o => !o.blocked.length);
  if (!ok.length) return;
  const metrics = [
    ['time', o => o.gateMin, 3],
    ['cost', o => o.costVnd, 10000],
    ['idle', o => o.idleMin, 3],
    ['co2', o => o.co2Kg, 1],
    ['exposure', o => o.exposure * (ledgerMult || 1), 1],
  ];
  for (const o of ok) o.score = 0;
  for (const [key, get, band] of metrics) {
    const vals = ok.map(get);
    const lo = Math.min(...vals), hi = Math.max(...vals);
    for (const o of ok) {
      const n = (hi - lo) <= band ? 0 : (get(o) - lo) / (hi - lo);
      o.parts = o.parts || {};
      o.parts[key] = n * weights[key];
      o.score += o.parts[key];
    }
  }
  // tie-break: fewer idle minutes, then fewer km
  ok.sort((a, b) => a.score - b.score || a.idleMin - b.idleMin || a.km - b.km);
  return ok;
}

/* Pick the five cards from the evaluated pool. */
function pickCards(opts, weights, ledgerMult) {
  const ok = opts.filter(o => !o.blocked.length);
  if (!ok.length) return { cards: [], blocked: opts };
  const by = f => [...ok].sort((a, b) => f(a) - f(b) || a.idleMin - b.idleMin)[0];
  const ranked = scoreOptions(opts, weights, ledgerMult);
  const cards = [
    ['fastest', by(o => o.gateMin)],
    ['cheapest', by(o => o.costVnd)],
    ['cleanest', by(o => o.co2Kg * 1000 + o.exposure)],
    ['later', by(o => o.idleMin * 10000 - o.depDelayMin)],
    ['best', ranked[0]],
  ];
  return { cards, blocked: opts.filter(o => o.blocked.length) };
}

/* Engine-written comparison clauses (fixed direction, no LLM). vs = baseline option. */
function clauses(o, vs, lang) {
  const c = [];
  const d = (a, b) => Math.round(a - b);
  const vi = lang !== 'en';
  if (d(o.idleMin, vs.idleMin) < 0) c.push(vi
    ? `tránh ${-d(o.idleMin, vs.idleMin)} phút nổ máy chờ`
    : `avoids ${-d(o.idleMin, vs.idleMin)} min of engine-on queueing`);
  if (d(o.co2Kg, vs.co2Kg) < 0) c.push(vi
    ? `giảm ${(vs.co2Kg - o.co2Kg).toFixed(1)} kg CO₂`
    : `cuts ${(vs.co2Kg - o.co2Kg).toFixed(1)} kg CO₂`);
  if (d(o.costVnd, vs.costVnd) < 0) c.push(vi
    ? `tiết kiệm ${(vs.costVnd - o.costVnd).toLocaleString('vi')} đ`
    : `saves ${(vs.costVnd - o.costVnd).toLocaleString('en')} VND`);
  if (d(o.gateMin, vs.gateMin) > 0) c.push(vi
    ? `vào cổng trễ hơn ${d(o.gateMin, vs.gateMin)} phút`
    : `enters the gate ${d(o.gateMin, vs.gateMin)} min later`);
  return c.join(', ');
}

if (typeof module !== 'undefined') module.exports = {
  queueWaitAt, evalOption, scoreOptions, pickCards, clauses, fmtTime,
  queueProfile, totalWaitMin, fleetWaitMin, slotCost, allocateFleet,
};
