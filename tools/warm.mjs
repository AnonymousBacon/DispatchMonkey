/* Pre-fill the model cache for the demo path, so nothing waits on stage.
   Run with the server up:  node tools/warm.mjs
   It builds the same facts the browser builds, by running the same engine. */
import fs from 'fs';
import vm from 'vm';

const BASE = process.env.BASE || 'http://localhost:8787';
const geo = JSON.parse(fs.readFileSync('archive/la-detour-receipt/geo.json', 'utf8'));
const src = fs.readFileSync('archive/la-detour-receipt/fleet.js', 'utf8') + '\n'
          + fs.readFileSync('archive/la-detour-receipt/scoring.js', 'utf8');
const ctx = { console, geo };
vm.createContext(ctx);
vm.runInContext(src, ctx);

const run = expr => vm.runInContext(expr, ctx);

async function ask(kind, facts) {
  const r = await fetch(`${BASE}/api/explain`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, facts }),
  });
  const j = await r.json().catch(() => ({}));
  return r.ok ? j.text : `(unavailable: ${j.error ?? r.status})`;
}

/* The engine lives inside the vm context, so ask it for plain JSON. */
function factsFor(scenario) {
  return JSON.parse(run(`JSON.stringify((() => {
    const ev = REPLAY[${JSON.stringify(scenario)}].events;
    const W = DEFAULT_WEIGHTS;
    const totals = (events) => {
      let atRisk = 0, delay = 0;
      for (const s of SHIPMENTS) {
        const r = optionsFor(s, events, geo, ASSUMPTIONS, W).receipts
                    .find(x => x.optionId === s.route);
        if (!r) continue;
        if (!r.feasible || !r.meetsAppt) atRisk++;
        delay += Math.max(0, r.lateMin);
      }
      return { atRisk, delay };
    };
    const norm = totals([]), now = totals(ev);
    const affected = SHIPMENTS.filter(s => {
      const r = optionsFor(s, ev, geo, ASSUMPTIONS, W).receipts.find(x => x.optionId === s.route);
      return r && (!r.feasible || !r.meetsAppt);
    }).map(s => s.id);

    const watcher = {
      reports: ev.map(e => ({ source: e.source, confirmed: e.confirmed,
                              confidence: e.confidence, text: e.text })),
      shipmentsAtRiskBefore: norm.atRisk, shipmentsAtRiskNow: now.atRisk,
      affectedShipments: affected, totalMinutesLate: Math.round(now.delay),
    };

    const planners = [];
    for (const s of SHIPMENTS) {
      const feas = optionsFor(s, ev, geo, ASSUMPTIONS, W).receipts.filter(r => r.feasible);
      if (!feas.length) continue;
      const top = feas[0], alt = feas[1];
      const clauses = tradeOffClauses(top, alt)
        .sort((a, b) => (W[b.k] ?? 0) - (W[a.k] ?? 0)).slice(0, 4);
      planners.push({
        shipment: s.id, closes: fmtMin(s.apptEnd), recommended: top.name,
        nextBest: alt ? alt.name : null,
        tradeOffs: clauses.map(x => x.text),
        weights: Object.fromEntries(clauses.map(x => [x.k, W[x.k]])),
      });
    }
    return { watcher, planners, hasEvents: ev.length > 0 };
  })())`));
}

const scenarios = Object.keys(JSON.parse(run('JSON.stringify(REPLAY)')));
let n = 0;
for (const sc of scenarios) {
  const { watcher, planners, hasEvents } = factsFor(sc);
  console.log(`\n== ${sc} ==`);
  if (hasEvents) {
    console.log('  watcher:', await ask('watcher', watcher));
    n++;
  }
  for (const p of planners) {
    console.log(`  ${p.shipment}: ${await ask('planner', p)}`);
    n++;
  }
}
console.log(`\n${n} model replies cached. Re-running the demo is now instant.`);
