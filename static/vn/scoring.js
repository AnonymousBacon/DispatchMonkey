/* Đúng Giờ — deterministic engine. ALL numbers come from here; no LLM ever
 * writes a number. Pure functions over data.js inputs so node can test them. */

const D = typeof module !== 'undefined' ? require('./data.js')
  : { RATES, RULES, ORIGINS, GATE, ROUTES, ARRIVALS, SCENARIOS, WEIGHTS, LEDGER };

/* Queue wait (minutes) if you reach the gate at minute-of-day `m`.
 * Deterministic backlog model: arrivals vs gate capacity per 15-min slot. */
function queueWaitAt(m, scn) {
  let backlog = 0;
  const slot = Math.max(0, Math.min(95, Math.floor(m / 15)));
  for (let s = 0; s <= slot; s++) {
    backlog = Math.max(0, backlog + D.ARRIVALS[s] * scn.arrivalsFactor - scn.capacityPerSlot);
  }
  const wait = backlog / scn.capacityPerSlot * 15;
  return { mid: Math.round(wait), lo: Math.round(wait * 0.7), hi: Math.round(wait * 1.3) };
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

/* Fleet impact for the dock: idle truck-minutes in the gate queue over the day,
 * as simulated vs. if `adoption` of drivers shift their arrival to the least-loaded
 * 15-min slot within ±`window` slots. Trucks are conserved; only timing moves.
 * shortcut: greedy per-slot shift, no driver-level model — a demo indicator,
 * replace with a proper assignment model if this becomes a headline number. */
function idleImpact(scn, adoption = 0.3, window = 6) {
  const waits = arr => {
    let b = 0;
    return arr.map(a => (b = Math.max(0, b + a * scn.arrivalsFactor - scn.capacityPerSlot)) / scn.capacityPerSlot * 15);
  };
  const idle = arr => { const w = waits(arr); return arr.reduce((t, a, i) => t + a * scn.arrivalsFactor * w[i], 0); };
  const base = D.ARRIVALS.slice(), app = base.slice();
  for (let s = 0; s < base.length; s++) {
    let best = s;
    for (let k = Math.max(0, s - window); k <= Math.min(base.length - 1, s + window); k++) {
      if (app[k] < app[best]) best = k;
    }
    const move = base[s] * adoption;
    app[s] -= move; app[best] += move;
  }
  const toCo2 = min => min / 60 * D.RATES.idleBurnLPerH.v * D.RATES.co2KgPerL.v;
  const baseMin = Math.round(idle(base)), appMin = Math.round(idle(app));
  return { baseMin, appMin, baseCo2: Math.round(toCo2(baseMin)), appCo2: Math.round(toCo2(appMin)),
           trucksBase: base.reduce((a, b) => a + b, 0), trucksApp: app.reduce((a, b) => a + b, 0) };
}

if (typeof module !== 'undefined') module.exports = {
  queueWaitAt, evalOption, scoreOptions, pickCards, clauses, fmtTime, idleImpact,
};
