/* Prints the §4.2 Normal-vs-Changed table from the real engine. Run: node tools/kpi_table.mjs */
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const F = require('../static/vn/fleet.js');
const G = require('../static/vn/geo.json');

const share = F.exposureShare(G.roads['Nguyễn Thị Định'], [...G.schools, ...G.hospitals]);
const d = F.runDay({}, share);
const v = n => n.toLocaleString('en-US');
const rows = [
  ['K1 cost leakage, VND / fleet-morning', k => v(k.K1_vnd)],
  ['K2 idle truck-minutes at the gate', k => k.K2_idleMin],
  ['K3 driver unpaid min (max one per-trip driver)', k => k.K3_unpaidMaxMin],
  ['K6 warehouse-window hit rate', k => k.K6_whHitPct + '%' + (k.K6_late.length ? ` (late: ${k.K6_late.join(', ')})` : '')],
  ['K8 school-exposure idle min', k => k.K8_schoolMin],
  ['K10 idle CO₂ kg', k => k.K10_co2Kg.toFixed(1)],
];
let out = '| Indicator | Normal | Changed (crash + vessel surge), no re-plan | Changed + Đúng Giờ re-plan |\n|---|---|---|---|\n';
for (const [name, f] of rows) out += `| ${name} | ${f(d.normal.k)} | ${f(d.stale.k)} | ${f(d.replan.k)} |\n`;
out += '\nClearance sensitivity (crash clears after 30 / 60 / 90 min):\n\n| Clearance | K2 idle min, no re-plan → re-plan | K1 VND, no re-plan → re-plan | Late trucks, no re-plan → re-plan |\n|---|---|---|---|\n';
for (const c of [30, 60, 90]) {
  const x = F.runDay({ clearanceMin: c }, share);
  out += `| ${c} min | ${x.stale.k.K2_idleMin} → ${x.replan.k.K2_idleMin} | ${v(x.stale.k.K1_vnd)} → ${v(x.replan.k.K1_vnd)} | ${x.stale.k.K6_late.length} → ${x.replan.k.K6_late.length} |\n`;
}
out += `\nFor reference, today's habit (everyone leaves at the planned time, no app) in the changed scenario: K2 ${d.habitChanged.K2_idleMin} idle min, K1 ${v(d.habitChanged.K1_vnd)} VND, K3 max ${d.habitChanged.K3_unpaidMaxMin} min, K6 ${d.habitChanged.K6_whHitPct}%.\n`;
out += `Shift-creep violations (K4): normal ${d.normal.k.K4_creep}, no re-plan ${d.stale.k.K4_creep}, re-plan ${d.replan.k.K4_creep}. Re-plan latency: ${d.latencyMs.toFixed(1)} ms.\n`;
out += '\nAnti-herding (port level, SIMULATED), peak trucks queued at the gate:\n\n| Adoption | No app (today) | Naive "best time" app | Đúng Giờ |\n|---|---|---|---|\n';
for (const a of [0.1, 0.3, 0.6]) { const c = F.herdingCurves(a); out += `| ${a * 100}% | ${c.peak.today} | ${c.peak.naive} | ${c.peak.aware} |\n`; }
console.log(out);

// C4: stakeholder rules vs a money-only planner (same allocator, same morning, different objective)
const cmp = F.compareMoneyOnly({}, share);
let s4 = '\nStakeholders → decision (re-planned morning): Đúng Giờ vs a money-only planner\n\n| Indicator | Money-only planner | Đúng Giờ |\n|---|---|---|\n';
for (const [n, k] of [['K3 worst-off unpaid driver, min', 'K3_unpaidMaxMin'], ['K3 total unpaid driver min', 'K3_unpaidMin'], ['K2 idle truck-min', 'K2_idleMin'], ['K8 school-exposure min', 'K8_schoolMin'], ['K1 VND', 'K1_vnd']])
  s4 += `| ${n} | ${v(cmp.money[k])} | ${v(cmp.ours[k])} |\n`;
s4 += `\nTrucks whose time changed because of the driver rule: ${cmp.diffs.map(d => `${d.id} (money-only: wait ${Math.round(d.money.wait)} min, leave ${Math.round(d.money.creep)} min late; ours: wait ${Math.round(d.ours.wait)} min)`).join('; ')}.\n`;
console.log(s4);
