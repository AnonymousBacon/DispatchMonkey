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

console.log(`${pass}/${pass + fail} PASS`);
process.exit(fail ? 1 : 0);
