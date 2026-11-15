/* Unit tests for the vn scoring engine. Run: node tools/test_vn.mjs */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const S = require('../static/vn/scoring.js');
const D = require('../static/vn/data.js');

let pass = 0, fail = 0;
const t = (name, cond) => { cond ? pass++ : (fail++, console.error('FAIL', name)); };

const ctx = {
  nowMin: 6 * 60 + 10, scenario: 'normal', fuelPer100: 35, payType: 'trip',
  hourlyRate: 60000, dieselPrice: D.RATES.dieselVndPerL.v, hoursLeft: 8,
  slotMin: null, registered24: true, poiCount: { 'Nguyễn Thị Định': 6 },
};
const routes = D.ROUTES['hiep-phuoc'];
const opts = [];
for (const r of routes) for (const d of [0, 15, 30, 60, 90]) opts.push(S.evalOption(r, d, ctx));

t('options evaluated', opts.length === 10);
t('all numbers finite', opts.every(o => [o.gateMin, o.costVnd, o.co2Kg, o.fuelL, o.idleMin].every(Number.isFinite)));
t('queue range ordered', opts.every(o => o.queue.lo <= o.queue.mid && o.queue.mid <= o.queue.hi));

// Equal options tie at score 0
const dup = [opts[0], { ...opts[0] }];
const tied = S.scoreOptions(dup, D.WEIGHTS, 1);
t('equal options tie', Math.abs(tied[0].score - tied[1].score) < 1e-9);

// A hard-filtered option never wins
const bad = { ...opts[0], blocked: ['nvl-ban'], costVnd: 0, gateMin: 0, idleMin: 0, co2Kg: 0, exposure: 0 };
const res = S.pickCards([bad, ...opts.slice(1)], D.WEIGHTS, 1);
t('blocked option never wins a card', res.cards.every(([, o]) => o !== bad));
t('blocked option listed as blocked', res.blocked.includes(bad));

// Changing weights changes the winner on a hand-built example
const a = { ...opts[0], gateMin: 100, costVnd: 900000, idleMin: 0, co2Kg: 10, exposure: 0, blocked: [] };
const b = { ...opts[0], gateMin: 200, costVnd: 100000, idleMin: 0, co2Kg: 10, exposure: 0, blocked: [] };
const winTime = S.scoreOptions([a, b], { time: 90, cost: 10, idle: 0, co2: 0, exposure: 0 }, 1)[0];
const winCost = S.scoreOptions([a, b], { time: 10, cost: 90, idle: 0, co2: 0, exposure: 0 }, 1)[0];
t('weights flip the winner', winTime === a && winCost === b);

// Disruption raises the queue
const qn = S.queueWaitAt(9 * 60, D.SCENARIOS.normal);
const qd = S.queueWaitAt(9 * 60, D.SCENARIOS.disrupted);
t('disruption raises 9:00 queue', qd.mid > qn.mid);

// NVL route is hard-filtered by the rules book
const nvl = routes.find(r => r.roads.includes('Nguyễn Văn Linh'));
t('NVL ban blocks the route', S.evalOption(nvl, 0, ctx).blocked.includes('nvl-ban'));

// Before gate opening: waits (idle), not blocked. After 17:00: blocked without 24/24.
const early = S.evalOption(routes[0], 0, { ...ctx, nowMin: 5 * 60, registered24: false });
t('pre-open arrival waits instead of blocked', !early.blocked.includes('port-hours') && early.idleMin >= 60);
const evening = S.evalOption(routes[0], 0, { ...ctx, nowMin: 16 * 60 + 40, registered24: false });
t('evening arrival blocked without 24/24', evening.blocked.includes('port-hours'));

// Leave Later: later departure must not increase idle in the pool's winner
const later = S.pickCards(opts, D.WEIGHTS, 1).cards.find(([k]) => k === 'later')[1];
t('later card minimizes idle', opts.every(o => o.blocked.length || later.idleMin <= o.idleMin));

// ---------------------------------------------------------- anti-herding ----
const N = D.SCENARIOS.normal;
const fleet = k => Array.from({ length: k }, (_, i) =>
  ({ id: `T${i + 1}`, firstSlot: 34 + (i % 3), lastSlot: 46 + (i % 3) })); // ~8:30 → ~11:30 windows

// T-H1: adding our own trucks to a congested block raises that block's wait
const extra8 = new Array(96).fill(0); extra8[36] = 8;
t('T-H1 own trucks raise the queue', S.queueProfile(N, extra8).wait[36] > S.queueProfile(N).wait[36]);
// Herding made visible: naive "quietest block" advice piles a whole fleet into one block
t('T-H1 naive advice herds', Math.max(...S.allocateFleet(fleet(12), N, 'naive').extra) === 12);
t('T-H1 old call unchanged', S.queueWaitAt(9 * 60, N).mid === S.queueWaitAt(9 * 60, N, null).mid);

for (const k of [12, 100, 400]) {
  const same = S.allocateFleet(fleet(k), N, 'same');
  const naive = S.allocateFleet(fleet(k), N, 'naive');
  const aware = S.allocateFleet(fleet(k), N, 'aware');
  // T-H2: aware never stacks more of our trucks in one block than naive does
  t(`T-H2 aware spreads (k=${k})`, Math.max(...aware.extra) <= Math.max(...naive.extra));
  // every truck lands inside its window
  t(`T-H2 windows respected (k=${k})`, aware.assignments.every(a => {
    const tr = fleet(k).find(x => x.id === a.id); return a.slot >= tr.firstSlot && a.slot <= tr.lastSlot; }));
  // T-H3: three curves. Aware has the lowest port-wide waiting and peak
  t(`T-H3 aware ≤ naive total wait (k=${k})`, S.totalWaitMin(aware.profile) <= S.totalWaitMin(naive.profile) + 1e-6);
  t(`T-H3 aware ≤ same total wait (k=${k})`, S.totalWaitMin(aware.profile) <= S.totalWaitMin(same.profile) + 1e-6);
  t(`T-H3 aware peak ≤ naive peak (k=${k})`, aware.profile.peak <= naive.profile.peak + 1e-6);
  // App users first: app trucks wait less with the allocator than with either alternative
  t(`T-H4 app users wait least (k=${k})`, aware.fleetWaitMin <= Math.min(naive.fleetWaitMin, same.fleetWaitMin) + 1e-6);
  if (process.env.VERBOSE) console.log(k, 'peak same/naive/aware',
    [same, naive, aware].map(r => Math.round(r.profile.peak)),
    'fleet wait min', [same, naive, aware].map(r => Math.round(r.fleetWaitMin)),
    'max per block', [same, naive, aware].map(r => Math.max(...r.extra)));
}

// ---------------------------------------------------------- dispatcher fleet-day (fleet.js)
const F = require('../static/vn/fleet.js');
const G = require('../static/vn/geo.json');
const share = F.exposureShare(G.roads['Nguyễn Thị Định'], [...G.schools, ...G.hospitals]);
t('F exposure share is a fraction from OSM', share > 0 && share < 1);
const day = F.runDay({}, share);
t('F stale plan shows a warehouse conflict (red)', day.stale.k.K6_late.length >= 1);
t('F re-plan resolves every warehouse conflict', day.replan.k.K6_late.length === 0);
t('F re-plan idle ≤ stale idle', day.replan.k.K2_idleMin <= day.stale.k.K2_idleMin);
t('F re-plan VND ≤ stale VND', day.replan.k.K1_vnd <= day.stale.k.K1_vnd);
t('F no shift-creep violations', [day.normal, day.stale, day.replan].every(p => p.k.K4_creep === 0));
t('F no truck reaches the gate before its container is ready', day.replan.k.K7_wasted === 0 && day.normal.k.K7_wasted === 0);
t('F no re-planned departure in the past', day.replan.ev.rows.every(r => day.departed[r.id] != null || r.depart >= day.nowMin));
t('F trucks already on the road keep their slot', Object.keys(day.departed).every(id =>
  day.replan.ev.rows.find(r => r.id === id).slot === day.departed[id]));
t('F re-plan < 500 ms', day.latencyMs < 500);
t('F every KPI finite', Object.values(day.replan.k).every(v => Array.isArray(v) || Number.isFinite(v)));
for (const c of [30, 60, 90]) {
  const d = F.runDay({ clearanceMin: c }, share);
  t(`F clearance ${c}: re-plan never worse`, d.replan.k.K2_idleMin <= d.stale.k.K2_idleMin && d.replan.k.K1_vnd <= d.stale.k.K1_vnd);
}
// Every browser script must at least parse and load (a stray quote once blanked the whole website)
const { REPLAY } = require('../static/vn/replay.js');
t('replay.js loads with 5 steps', Array.isArray(REPLAY) && REPLAY.length === 5);
// Protect the worst-off driver: re-plan never leaves the worst-off per-trip driver worse off (any clearance)
for (const c of [30, 60, 90]) {
  const d = F.runDay({ clearanceMin: c }, share);
  t(`worst-off unpaid driver not worse after re-plan (clearance ${c})`, d.replan.k.K3_unpaidMaxMin <= d.stale.k.K3_unpaidMaxMin);
}
t('unpaid minutes include time stuck in incident traffic', day.stale.ev.rows.some(r => r.stuckMin > 0 && r.unpaidMin >= r.wait + r.stuckMin));
// Question this: alternatives for a re-planned truck; the chosen block is never beaten on fleet idle by a feasible one
const alt = F.alternatives(day, 'replan', 'T06', share);
t('alternatives listed for T06 incl. the chosen block', alt.options.length > 3 && alt.options.some(o => o.chosen));
t('no feasible alternative beats the chosen block on fleet idle AND worst-off driver', alt.options.filter(o => !o.chosen && o.feasible).every(o => o.dIdle >= 0 || o.dUnpaidMax > 0));
t('departed trucks are locked', !!F.alternatives(day, 'replan', 'T01', share).locked);
// Timelapse of real days: inputs drive the outputs in the right direction
const DAYS = require('../static/vn/days.json');
const TL = DAYS.days.map(d => F.timelapseDay(d, DAYS.median_ships, 0.3));
const busy = TL.find(x => x.day.ships === Math.max(...DAYS.days.map(d => d.ships))), typ = TL.find(x => x.day.ships === DAYS.median_ships);
t('timelapse: busier radar day → more gate waiting', busy.port.tot.todayH > typ.port.tot.todayH);
t('timelapse: app adoption never increases port waiting', TL.every(x => x.port.tot.appH <= x.port.tot.todayH));
t('timelapse: rain ≥2 mm cuts gate capacity in those hours only', TL.every(x => x.scn.rainSlots.every(s => (x.day.rain_mm[Math.floor(s / 4)] || 0) >= 2)));
t('timelapse: fleet plan beats the habit on idle every day', TL.every(x => x.fleet.plan.k.K2_idleMin <= x.fleet.habit.k.K2_idleMin));
// C4: the driver rule visibly changes at least one truck vs a money-only planner
const cmp = F.compareMoneyOnly({}, share);
t('C4 money-only planner changes ≥1 truck', cmp.diffs.length >= 1);
t('C4 worst-off unpaid driver better with DispatchMonkey', cmp.ours.K3_unpaidMaxMin < cmp.money.K3_unpaidMaxMin);
t('C4 whyTruck names warehouse + driver + environment for every truck', day.replan.ev.rows.every(r => {
  const l = F.whyTruck(r, day.replan.held[r.id], null, share).map(w => w.lens); return ['warehouse', 'driver', 'environment'].every(x => l.includes(x)); }));
t('shift-creep cap is the spec default 45', F.CREEP_CAP_MIN === 45);
// T-H3 port level: naive "best time" advice makes the peak worse; capacity-aware keeps it flatter than today
for (const a of [0.1, 0.3, 0.6]) {
  const c = F.herdingCurves(a);
  t(`T-H3 port peak naive > today > aware at ${a * 100}%`, c.peak.naive > c.peak.today && c.peak.today > c.peak.aware);
}

/* ---- drawn route geometry -------------------------------------------------
 * routeFeatures() lives in index.html (it needs the page's geo/originId), so we
 * lift the block between its two markers and run it here against the real data.
 * This is the regression guard for the old bug where whole named roads lit up
 * instead of one line from the yard to the gate. */
import fs from 'node:fs';
const html = fs.readFileSync(new URL('../static/vn/index.html', import.meta.url), 'utf8');
const from = html.indexOf('const d2 = (a, b)'), to = html.indexOf('function paintRoads()');
t('route geometry block found in index.html', from > 0 && to > from);
const dataSrc = fs.readFileSync(new URL('../static/vn/data.js', import.meta.url), 'utf8')
  .replace(/if \(typeof module[\s\S]*$/, '');
const geoJ = require('../static/vn/geo.json');
const buildRoute = new Function('geo', 'roads', 'oid',
  `${dataSrc} let routeRoads = roads, originId = oid; ${html.slice(from, to)} return routeFeatures;`);

const metres = (a, b) => Math.hypot((a[0] - b[0]) * 109200, (a[1] - b[1]) * 111320);
const ROUTE_FEATS = {};
for (const [oid, routes] of Object.entries(D.ROUTES)) {
  const yard = D.ORIGINS.find(x => x.id === oid);
  for (const r of routes) {
    const feats = buildRoute(geoJ, r.roads, oid)();
    ROUTE_FEATS[`${oid}/${r.id}`] = feats;
    const pts = feats.flatMap(f => f.geometry.coordinates);
    const tag = `${oid}/${r.id}`;
    t(`${tag}: one line is drawn`, feats.length >= 2 && pts.length > 20);
    t(`${tag}: starts at the yard`, metres(pts[0], [yard.lon, yard.lat]) < 1);
    t(`${tag}: ends at the gate`, metres(pts.at(-1), [D.GATE.lon, D.GATE.lat]) < 1);
    t(`${tag}: every road runs in travel order`, feats.every(f => {
      const c = f.geometry.coordinates;
      return metres(c[0], [D.GATE.lon, D.GATE.lat]) >= metres(c.at(-1), [D.GATE.lon, D.GATE.lat]) - 50;
    }));
    // The Thủ Thiêm tunnel is outside the OSM extract, so one hand-off is a
    // 2.3 km straight line across the river. Anything wider means a mis-stitch.
    for (let i = 0; i + 1 < feats.length; i++)
      t(`${tag}: ${feats[i].properties.name} → ${feats[i + 1].properties.name} joins up`,
        metres(feats[i].geometry.coordinates.at(-1), feats[i + 1].geometry.coordinates[0]) < 2500);
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += metres(pts[i], pts[i - 1]);
    t(`${tag}: drawn length within half a route of the stated ${r.km} km`,
      len / 1000 > r.km * 0.5 && len / 1000 < r.km * 1.6);
  }
}

/* ---- route weather --------------------------------------------------------
 * Pure functions only. No network here: the live Open-Meteo call is exercised
 * in the browser, this guards the maths and the honesty rules around it. */
const W = require('../static/vn/weather.js');
const feats = ROUTE_FEATS['hiep-phuoc/hp-phumy'];
const cps = W.routeCheckpoints(feats, D.GATE, 5);
t('W five checkpoints, gate last', cps.length === 5 && cps.at(-1).label === 'gate');
t('W gate checkpoint sits on the real gate',
  metres([cps.at(-1).lon, cps.at(-1).lat], [D.GATE.lon, D.GATE.lat]) < 1);
t('W first checkpoint is the yard', cps[0].label === 'origin');
t('W checkpoints are spread along the route', (() => {
  let min = Infinity;
  for (let i = 1; i < cps.length; i++) min = Math.min(min, metres([cps[i].lon, cps[i].lat], [cps[i-1].lon, cps[i-1].lat]));
  return min > 500;                                   // no two checkpoints on top of each other
})());

// Passing times rise along the route and the gate uses the END of the queue,
// because that is how long the driver really sits in the heat.
const times = W.passingTimes(cps, 6 * 60 + 10, 7 * 60 + 30, 7 * 60 + 55);
t('W passing times increase', times.every((m, i) => i === 0 || m >= times[i - 1]));
t('W first passing time is the departure', times[0] === 6 * 60 + 10);
t('W gate passing time is the end of the queue, not the arrival', times.at(-1) === 7 * 60 + 55);

t('W heat bands follow the NWS heat-index steps',
  W.heatBand(28) === 'ok' && W.heatBand(33) === 'caution'
  && W.heatBand(40) === 'warn' && W.heatBand(42) === 'bad');
t('W limited AC warns one band earlier, never later',
  W.heatBand(30, true) === 'caution' && W.heatBand(30, false) === 'ok'
  && [25, 30, 33, 36, 40, 43].every(v =>
    ['ok','caution','warn','bad'].indexOf(W.heatBand(v, true))
    >= ['ok','caution','warn','bad'].indexOf(W.heatBand(v, false))));
t('W a missing reading is "unknown", never a guessed number', W.heatBand(NaN) === 'unknown');

// Open-Meteo snaps checkpoints onto a ~1 km grid; identical cells must be
// counted once so the UI cannot imply five independent readings.
const cellPts = [
  { cellLat: 10.65, cellLon: 106.76, tempC: 26, rh: 90, apparentC: 33 },
  { cellLat: 10.65, cellLon: 106.76, tempC: 26, rh: 90, apparentC: 33 },
  { cellLat: 10.79, cellLon: 106.79, tempC: 27, rh: 88, apparentC: 35 },
];
t('W duplicate grid cells collapse', W.dedupeCells(cellPts).length === 2);
const sum = W.summarise(cellPts, false);
t('W summary reports cells and points separately', sum.cells === 2 && sum.points === 3);
t('W summary picks the hottest point', sum.worst.apparentC === 35 && sum.band === 'caution');
t('W summary ignores points with no reading',
  W.summarise([...cellPts, { cellLat: 1, cellLon: 1, tempC: NaN, rh: NaN, apparentC: NaN }], false).points === 3);
t('W summarise returns null rather than zeroes when nothing is readable',
  W.summarise([{ cellLat: 1, cellLon: 1, tempC: NaN, rh: NaN, apparentC: NaN }], false) === null);

const hours = ['2026-11-15T00:00', '2026-11-15T01:00', '2026-11-15T07:00'];
t('W hour lookup finds the passing hour', W.hourIndex(hours, '2026-11-15', 7 * 60 + 42) === 2);
t('W hour lookup returns null outside the series', W.hourIndex(hours, '2026-11-16', 7 * 60) === null);

console.log(`${pass}/${pass + fail} PASS`);
process.exit(fail ? 1 : 0);
