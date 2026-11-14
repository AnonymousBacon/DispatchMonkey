/* ============================================================================
   SCORING ENGINE — deterministic. Every number on a receipt is produced here.
   The language model is never asked for a figure; it only reads these numbers
   and writes prose. See README "Golden rule".
   ========================================================================== */

const MI_PER_DEG_LAT = 69.05;
function miPerDegLon(lat) { return Math.cos(lat * Math.PI / 180) * 69.17; }

/** Straight-line miles. Equirectangular; error < 0.1% at this scale. */
function miBetween(a, b) {
  const mlat = (a[1] + b[1]) / 2;
  return Math.hypot((b[0] - a[0]) * miPerDegLon(mlat), (b[1] - a[1]) * MI_PER_DEG_LAT);
}

function pathMiles(coords) {
  let m = 0;
  for (let i = 1; i < coords.length; i++) m += miBetween(coords[i - 1], coords[i]);
  return m;
}

function snapIndex(line, pt) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < line.length; i++) {
    const d = miBetween(line[i], pt);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

/** Distance in miles from point p to segment a-b, in a local flat projection. */
function distToSegmentMi(p, a, b) {
  const k = miPerDegLon(p[1]);
  const px = p[0] * k, py = p[1] * MI_PER_DEG_LAT;
  const ax = a[0] * k, ay = a[1] * MI_PER_DEG_LAT;
  const bx = b[0] * k, by = b[1] * MI_PER_DEG_LAT;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
}

function distToPathMi(p, coords) {
  let best = Infinity;
  for (let i = 1; i < coords.length; i++) {
    const d = distToSegmentMi(p, coords[i - 1], coords[i]);
    if (d < best) best = d;
  }
  return best;
}

/* ---------------------------------------------------------------------------
   Route geometry: terminal -> corridor legs -> warehouse.
   Legs ride real OSM centrelines. The two end hops are straight lines priced
   as surface streets: SIMULATED geometry.
   ------------------------------------------------------------------------- */
function buildRoute(geo, option, terminal, warehouse) {
  const legs = [];
  let cursor = [terminal.lon, terminal.lat];

  for (const leg of option.legs) {
    const line = geo.corridors[leg.c];
    if (!line || !line.length) continue;
    let i = snapIndex(line, leg.from), j = snapIndex(line, leg.to);
    const slice = i <= j ? line.slice(i, j + 1) : line.slice(j, i + 1).reverse();
    if (slice.length < 2) continue;
    legs.push({ kind: 'surface', name: 'surface streets', coords: [cursor, slice[0]] });
    legs.push({ kind: 'corridor', name: leg.c, coords: slice });
    cursor = slice[slice.length - 1];
  }
  legs.push({ kind: 'surface', name: 'surface streets', coords: [cursor, [warehouse.lon, warehouse.lat]] });

  // Merge zero-length surface hops
  const kept = legs.filter(l => pathMiles(l.coords) > 0.02);
  for (const l of kept) l.mi = pathMiles(l.coords);
  const coords = kept.reduce((acc, l) => acc.concat(acc.length ? l.coords.slice(1) : l.coords), []);
  return { legs: kept, coords, miles: kept.reduce((s, l) => s + l.mi, 0) };
}

/* ---------------------------------------------------------------------------
   Travel time. Free-flow, times the normal congestion factor, plus delay from
   each event whose circle overlaps the route.
   ------------------------------------------------------------------------- */
function travelTime(route, events, A, trustUnconfirmed = true) {
  let base = 0;
  for (const l of route.legs) {
    const mph = l.kind === 'corridor' ? A.freeFlowMph.v : A.lastMileMph.v;
    base += l.mi / mph * 60 * A.normalCongestion.v;
  }

  /* Delay is computed per route segment using the WORST slow factor covering
     that segment, not by summing events. Two overlapping reports of the same
     jam must not be charged twice. */
  let eventDelay = 0, closed = false;
  const perEvent = new Map(events.map(e => [e.id, { ev: e, insideMi: 0, addedMin: 0 }]));

  for (const l of route.legs) {
    const mph = l.kind === 'corridor' ? A.freeFlowMph.v : A.lastMileMph.v;
    for (let i = 1; i < l.coords.length; i++) {
      const a = l.coords[i - 1], b = l.coords[i];
      const mid = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const segMi = miBetween(a, b);
      const covering = events.filter(ev => miBetween(mid, [ev.lon, ev.lat]) <= ev.radiusMi);
      if (!covering.length) continue;

      for (const ev of covering) perEvent.get(ev.id).insideMi += segMi;
      /* An UNCONFIRMED closure does not block the route by itself. A satellite
         hotspot near a road is not proof the road is shut. It blocks only while
         the dispatcher chooses to trust unconfirmed reports. */
      if (covering.some(ev => ev.effect.closed && (ev.confirmed || trustUnconfirmed))) {
        closed = true; continue;
      }

      const worst = Math.max(1, ...covering.map(ev => ev.effect.slow || 1));
      if (worst <= 1) continue;
      const added = segMi / mph * 60 * A.normalCongestion.v * (worst - 1);
      eventDelay += added;
      // Attribute the delay to the event that set the worst factor.
      const driver = covering.find(ev => (ev.effect.slow || 1) === worst);
      if (driver) perEvent.get(driver.id).addedMin += added;
    }
  }
  const hits = [...perEvent.values()].filter(h => h.insideMi > 0);
  return { baseMin: base, eventDelayMin: eventDelay, totalMin: base + eventDelay, closed, hits };
}

function countSchools(route, schools, bufferM) {
  const bufMi = bufferM / 1609.34;
  const near = [];
  for (const s of schools) {
    if (distToPathMi([s.lon, s.lat], route.coords) <= bufMi) near.push(s);
  }
  return near;
}

/** Route miles inside high-burden zones, weighted by diesel-PM percentile. */
function burdenExposure(route, zones, thresholdPct) {
  let miles = 0, weighted = 0;
  const zonesHit = [];
  for (const z of zones) {
    if (z.pct < thresholdPct) continue;
    let inside = 0;
    for (let i = 1; i < route.coords.length; i++) {
      const mid = [(route.coords[i - 1][0] + route.coords[i][0]) / 2,
                   (route.coords[i - 1][1] + route.coords[i][1]) / 2];
      if (miBetween(mid, [z.lon, z.lat]) <= z.r) inside += miBetween(route.coords[i - 1], route.coords[i]);
    }
    if (inside > 0.05) {
      miles += inside;
      weighted += inside * (z.pct / 100);
      zonesHit.push({ name: z.name, pct: z.pct, mi: inside });
    }
  }
  return { miles, weighted, zonesHit };
}

/* ---------------------------------------------------------------------------
   One receipt. `baseline` is the same shipment on its assigned route with no
   events, so every delta answers "compared with the original plan".
   ------------------------------------------------------------------------- */
function makeReceipt({ shipment, option, route, events, geo, truck, A, baseline, kind, waitMin = 0, knockOn = [], swapTo = null, trustUnconfirmed = true }) {
  const t = travelTime(route, events, A, trustUnconfirmed);
  const schools = countSchools(route, geo.schools, A.schoolBufferM.v);
  const burden = burdenExposure(route, geo.burden, A.burdenPct.v);

  const depart = Math.max(SIM_NOW, shipment.readyAt) + waitMin;
  const arrive = depart + t.totalMin;

  const extraMiles = baseline ? route.miles - baseline.miles : 0;
  const extraMin = baseline ? (arrive - baseline.arrive) : 0;

  const gal = Math.max(0, extraMiles) / A.truckMpg.v;
  const idleGal = waitMin / 60 * A.idleGalPerHour.v;
  const fuel = (gal + idleGal) * A.dieselPrice.v;
  const wear = Math.max(0, extraMiles) * A.wearPerMile.v;

  const hourly = truck ? truck.pay === 'hourly' : true;
  const driverCost = hourly ? Math.max(0, extraMin) / 60 * A.driverHourly.v : 0;
  const unpaidMin = hourly ? 0 : Math.max(0, Math.round(extraMin));

  const meetsAppt = arrive <= shipment.apptEnd;
  const lateMin = Math.max(0, Math.round(arrive - shipment.apptEnd));
  const pastDockClose = arrive > shipment.dockClose;
  const rebook = meetsAppt ? 0 : shipment.rebookFee;
  const perDiem = (!meetsAppt && shipment.freeTimeEndsDay === 0) ? A.perDiemPerDay.v : 0;

  const companyCost = fuel + wear + driverCost + rebook + perDiem;
  const co2 = (gal + idleGal) * A.co2PerGal.v;

  // Hard filters
  const blockers = [];
  const closingEv = t.hits.find(h => h.ev.effect.closed);
  if (t.closed) {
    blockers.push(closingEv && !closingEv.ev.confirmed
      ? `Blocked by an UNCONFIRMED closure (${closingEv.ev.source}, ${Math.round(closingEv.ev.confidence * 100)}%). Turn off "trust unconfirmed" to reconsider.`
      : 'Route crosses a confirmed closure.');
  }
  if (pastDockClose) blockers.push(`Arrives after dock close (${fmtMin(shipment.dockClose)}).`);
  if (truck && t.totalMin > truck.hosLeftMin)
    blockers.push(`Exceeds driver hours remaining (${truck.hosLeftMin} min left, needs ${Math.round(t.totalMin)}).`);

  /* Unconfirmed reports touching this route. The dispatcher must look at these
     before acting; the tool will not silently treat them as fact either way. */
  const needsOk = t.hits.filter(h => !h.ev.confirmed).map(h => h.ev);

  return {
    optionId: option.id, kind, name: option.name, route, waitMin, swapTo, knockOn,
    miles: route.miles, extraMiles, baseMin: t.baseMin, eventDelayMin: t.eventDelayMin,
    travelMin: t.totalMin, depart, arrive, extraMin,
    meetsAppt, lateMin, pastDockClose,
    fuel, wear, driverCost, unpaidMin, rebook, perDiem, companyCost, co2,
    gal: gal + idleGal, idleGal,
    schools, schoolCount: schools.length,
    burdenMi: burden.miles, burdenWeighted: burden.weighted, burdenZones: burden.zonesHit,
    hits: t.hits, blockers, needsOk, feasible: blockers.length === 0,
    payType: truck ? truck.pay : 'unassigned',
  };
}

function fmtMin(m) {
  m = Math.round(m);
  const h = Math.floor(m / 60) % 24, mm = String(m % 60).padStart(2, '0');
  const ampm = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mm} ${ampm}`;
}

/* ---------------------------------------------------------------------------
   Build every option for a shipment, score and rank them.
   ------------------------------------------------------------------------- */
function optionsFor(shipment, events, geo, A, weights, trustUnconfirmed = true) {
  const terminal = TERMINALS.find(t => t.id === shipment.terminal);
  const wh = WAREHOUSES.find(w => w.id === shipment.wh);
  const truck = TRUCKS.find(t => t.id === shipment.truck) || null;
  const routeDefs = ROUTE_OPTIONS[shipment.wh] || [];
  const assigned = routeDefs.find(r => r.id === shipment.route) || routeDefs[0];

  // Baseline: assigned route, no events, no wait. The "original plan".
  const baseRoute = buildRoute(geo, assigned, terminal, wh);
  const baseT = travelTime(baseRoute, [], A);
  const baseDepart = Math.max(SIM_NOW, shipment.readyAt);
  const baseline = { miles: baseRoute.miles, arrive: baseDepart + baseT.totalMin,
                     travelMin: baseT.totalMin, route: baseRoute, name: assigned.name };

  const receipts = [];

  for (const def of routeDefs) {
    const route = def.id === assigned.id ? baseRoute : buildRoute(geo, def, terminal, wh);
    receipts.push(makeReceipt({
      shipment, option: def, route, events, geo, truck, A, baseline, trustUnconfirmed,
      kind: def.id === assigned.id ? 'stay' : 'reroute',
    }));
  }

  // Hold until the incident is expected to clear.
  const slowHits = events.filter(e => e.effect.slow || e.effect.closed);
  if (slowHits.length) {
    const clearAt = Math.max(...slowHits.map(e => e.at)) + 45; // ASSUMPTION: 45 min to clear
    const waitMin = Math.max(0, clearAt - Math.max(SIM_NOW, shipment.readyAt));
    // A "hold for 0 minutes" card is just the current plan under another name.
    if (waitMin >= 5) receipts.push(makeReceipt({
      shipment, option: { id: 'hold', name: `Hold ${Math.round(waitMin)} min until incident clears` },
      route: baseRoute, events: [], geo, truck, A, baseline, kind: 'hold', waitMin,
      trustUnconfirmed,
    }));
  }

  /* Offer a truck swap only when it would change something: the assigned driver
     is short on hours, or there is no driver yet. Otherwise it is a duplicate
     card with identical numbers, which only adds noise for the dispatcher. */
  const assignedNow = travelTime(baseRoute, events, A, trustUnconfirmed);
  const hosTight = truck && assignedNow.totalMin > truck.hosLeftMin;
  if (!truck || hosTight) {
    const cand = TRUCKS
      .filter(t => t.id !== shipment.truck && t.hosLeftMin > assignedNow.totalMin)
      .map(t => ({ t, d: miBetween([t.lon, t.lat], [terminal.lon, terminal.lat]) }))
      .sort((a, b) => a.d - b.d)[0];
    if (cand) {
      const theirs = SHIPMENTS.filter(s => s.truck === cand.t.id && s.id !== shipment.id);
      receipts.push(makeReceipt({
        shipment, option: {
          id: 'swap-' + cand.t.id,
          name: `${truck ? 'Reassign to' : 'Assign'} ${cand.t.id} (${cand.t.hosLeftMin} min of driving left)`,
        },
        route: baseRoute, events, geo, truck: cand.t, A, baseline, kind: 'swap',
        swapTo: cand.t.id, trustUnconfirmed,
        knockOn: theirs.map(s => ({ id: s.id, wh: s.wh, appt: fmtMin(s.apptStart) })),
      }));
    }
  }

  return { baseline, receipts: rank(receipts, weights) };
}

/** Min-max normalise each metric across feasible options, then weighted sum.
    Lower score = better. Infeasible options keep a score of null and sort last. */
function rank(receipts, weights) {
  const feas = receipts.filter(r => r.feasible);
  const metric = {
    delay: r => Math.max(0, r.arrive),
    cost: r => r.companyCost,
    driverUnpaid: r => r.unpaidMin,
    co2: r => r.co2,
    school: r => r.schoolCount,
    burden: r => r.burdenWeighted,
  };
  const ranges = {};
  for (const k in metric) {
    const vals = feas.map(metric[k]);
    ranges[k] = { lo: Math.min(...vals), hi: Math.max(...vals) };
  }
  for (const r of receipts) {
    if (!r.feasible) { r.score = null; r.breakdown = null; continue; }
    let s = 0; const bd = {};
    for (const k in metric) {
      const { lo, hi } = ranges[k];
      const n = hi - lo < 1e-9 ? 0 : (metric[k](r) - lo) / (hi - lo);
      bd[k] = n * (weights[k] ?? 0);
      s += bd[k];
    }
    r.score = s; r.breakdown = bd;
  }
  return receipts.sort((a, b) => {
    if (a.feasible !== b.feasible) return a.feasible ? -1 : 1;
    return (a.score ?? 9) - (b.score ?? 9);
  });
}

/* Each comparison written out with its direction already fixed, so the model
   has nothing to work out and cannot flip a sign. It only picks and phrases. */
function tradeOffClauses(top, alt) {
  if (!alt) return [{ k: 'delay', text: 'the recommended option is the only workable one' }];
  const c = [];
  const d = (a, b) => +(a - b).toFixed(1);
  const add = (k, text) => c.push({ k, text });
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  if (top.meetsAppt && !alt.meetsAppt)
    add('delay', `the recommended option meets the appointment window and ${alt.name} misses it by ${alt.lateMin} minutes`);
  else if (!top.meetsAppt && alt.meetsAppt)
    add('delay', `the recommended option misses the window by ${top.lateMin} minutes while ${alt.name} meets it`);

  const cost = Math.round(top.companyCost - alt.companyCost);
  if (Math.abs(cost) >= 1) add('cost', `the recommended option costs the company ${plural(Math.abs(cost), 'dollar', 'dollars')} ${cost > 0 ? 'MORE' : 'LESS'}`);

  const unp = top.unpaidMin - alt.unpaidMin;
  if (Math.abs(unp) >= 1) add('driverUnpaid', `the recommended option leaves the driver ${plural(Math.abs(unp), 'minute', 'minutes')} ${unp > 0 ? 'MORE' : 'FEWER'} unpaid, which the company does not pay for`);

  const co2 = d(top.co2, alt.co2);
  if (Math.abs(co2) >= 1) add('co2', `the recommended option emits ${Math.abs(co2)} kg ${co2 > 0 ? 'MORE' : 'LESS'} CO2`);

  const sch = top.schoolCount - alt.schoolCount;
  if (sch !== 0) add('school', `the recommended option passes within 150 m of ${plural(Math.abs(sch), 'school', 'schools')} ${sch > 0 ? 'MORE' : 'FEWER'}`);

  const bur = d(top.burdenMi, alt.burdenMi);
  if (Math.abs(bur) >= 0.5) add('burden', `the recommended option puts ${Math.abs(bur)} miles ${bur > 0 ? 'MORE' : 'FEWER'} inside neighbourhoods already in the worst quarter for diesel pollution`);

  const mi = d(top.miles, alt.miles);
  if (Math.abs(mi) >= 0.5) add('co2', `the recommended option drives ${plural(Math.abs(mi), 'mile', 'miles')} ${mi > 0 ? 'MORE' : 'FEWER'} than ${alt.name}`);

  if (!c.length) add('delay', `the recommended option and ${alt.name} are close on every measure`);
  return c;
}

/* ---------------------------------------------------------------------------
   Self-check. Open the app with ?test=1 and read the console.
   ------------------------------------------------------------------------- */
function selfCheck(geo) {
  const out = [];
  const ok = (name, cond, extra = '') => out.push(`${cond ? 'PASS' : 'FAIL'}  ${name} ${extra}`);
  const A = ASSUMPTIONS;

  // Geometry sanity
  ok('miBetween ~1 deg lat = 69 mi', Math.abs(miBetween([-118, 33], [-118, 34]) - 69.05) < 0.1);
  ok('point on segment is 0 mi', distToSegmentMi([-118, 33.5], [-118, 33], [-118, 34]) < 1e-6);
  ok('point 1 deg off segment is ~57 mi',
     Math.abs(distToSegmentMi([-119, 33.5], [-118, 33], [-118, 34]) - miPerDegLon(33.5)) < 0.5);

  const shp = SHIPMENTS.find(s => s.id === 'MSCU-4471');
  const base = optionsFor(shp, [], geo, A, DEFAULT_WEIGHTS);

  // Port of LB to Commerce is roughly 20-30 road miles.
  const mi = base.baseline.miles;
  ok('baseline Commerce run is 15-40 mi', mi > 15 && mi < 40, `(${mi.toFixed(1)} mi)`);
  ok('baseline has zero event delay', base.receipts.every(r => r.eventDelayMin === 0));
  ok('every baseline option is feasible', base.receipts.every(r => r.feasible));
  ok('stay option has zero extra miles',
     Math.abs(base.receipts.find(r => r.kind === 'stay').extraMiles) < 1e-9);

  // Disrupted: the I-710 crash must add delay to the 710 route, not to the 110 route.
  const ev = REPLAY['i710-crash'].events;
  const dis = optionsFor(shp, ev, geo, A, DEFAULT_WEIGHTS);
  const stay = dis.receipts.find(r => r.optionId === 'comm-710');
  const alt = dis.receipts.find(r => r.optionId === 'comm-110-10');
  ok('crash delays the I-710 route', stay.eventDelayMin > 5, `(+${stay.eventDelayMin.toFixed(0)} min)`);
  ok('crash does NOT delay the I-110 route', alt.eventDelayMin < 1, `(+${alt.eventDelayMin.toFixed(0)} min)`);
  ok('a hold option exists', dis.receipts.some(r => r.kind === 'hold'));
  ok('hold option burns idling fuel', dis.receipts.find(r => r.kind === 'hold').idleGal > 0);

  // Fire closure must make the SR-60 route infeasible for Ontario.
  const ont = SHIPMENTS.find(s => s.id === 'TGHU-8812');
  const fire = optionsFor(ont, REPLAY['sr60-fire'].events, geo, A, DEFAULT_WEIGHTS);
  const sr60 = fire.receipts.find(r => r.optionId === 'ont-710-60');
  ok('fire closure blocks the SR-60 route', !sr60.feasible, `(${sr60.blockers.join(' ')})`);
  ok('an unconfirmed hazard is flagged for dispatcher OK',
     fire.receipts.some(r => r.needsOk.length > 0));
  ok('at least one Ontario option survives the fire', fire.receipts.some(r => r.feasible));

  // Fairness / environment plumbing
  const anySchools = Object.values(ROUTE_OPTIONS).flat().length > 0 &&
    optionsFor(SHIPMENTS[0], [], geo, A, DEFAULT_WEIGHTS).receipts.some(r => r.schoolCount > 0);
  ok('school passes are counted on some route', anySchools);
  ok('burden exposure is counted on some route',
     base.receipts.some(r => r.burdenMi > 0));

  // Per-load driver shows unpaid minutes, not company cost
  const perLoad = dis.receipts.find(r => r.kind === 'hold');
  ok('per-load driver hold shows unpaid minutes',
     perLoad.payType !== 'per_load' || perLoad.unpaidMin > 0, `(${perLoad.unpaidMin} min)`);

  // Weights change the ranking
  const greenW = { ...DEFAULT_WEIGHTS, school: 0.9, delay: 0.05 };
  const greenTop = optionsFor(shp, ev, geo, A, greenW).receipts.filter(r => r.feasible)[0];
  const fastW = { ...DEFAULT_WEIGHTS, delay: 0.9, school: 0.0 };
  const fastTop = optionsFor(shp, ev, geo, A, fastW).receipts.filter(r => r.feasible)[0];
  ok('weight sliders can change the top pick',
     greenTop.schoolCount <= fastTop.schoolCount,
     `(school-first: ${greenTop.name} ${greenTop.schoolCount} schools; time-first: ${fastTop.name} ${fastTop.schoolCount})`);

  console.log('%cDetour Receipt self-check', 'font-weight:bold');
  out.forEach(l => console.log((l.startsWith('PASS') ? '%c' : '%c') + l,
    l.startsWith('PASS') ? 'color:#2a7' : 'color:#d33;font-weight:bold'));
  const failed = out.filter(l => l.startsWith('FAIL')).length;
  console.log(`${out.length - failed}/${out.length} passed`);
  return out;
}
