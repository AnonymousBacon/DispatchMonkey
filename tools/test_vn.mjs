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

console.log(`${pass}/${pass + fail} PASS`);
process.exit(fail ? 1 : 0);
