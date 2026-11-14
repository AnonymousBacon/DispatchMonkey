/* ============================================================================
   Dispatcher UI. Reads numbers from scoring.js, never computes its own.
   ========================================================================== */

let GEO = null;
let MODE = 'replay';              // 'replay' | 'live'
let SCEN = 'baseline';
let LIVE_EVENTS = [];             // built from the real CHP feed
let SEL = null;                   // selected shipment id
let TRUST = true;                 // trust unconfirmed reports (human oversight)
const W = { ...DEFAULT_WEIGHTS };
const A = ASSUMPTIONS;
const LOG = [];
const APPLIED = {};               // shipment id -> {optionId, truck, note}

const $ = s => document.querySelector(s);
const el = (t, c, h) => { const n = document.createElement(t); if (c) n.className = c; if (h != null) n.innerHTML = h; return n; };
const money = v => (v < 0 ? '-' : '') + '$' + Math.abs(v).toFixed(v < 10 && v !== 0 ? 2 : 0);
const sgn = v => (v > 0 ? '+' : '') + v;
const andList = a => a.length < 2 ? (a[0] ?? '') : a.slice(0, -1).join(', ') + ' and ' + a.at(-1);

/* ---------------------------------------------------------------- events ---- */
function activeEvents() {
  if (MODE === 'live') return LIVE_EVENTS;
  return REPLAY[SCEN].events;
}

/* Current plan for a shipment: whatever the dispatcher applied, else its default. */
function planFor(s) {
  const ap = APPLIED[s.id];
  return { route: ap?.optionId ?? s.route, truck: ap?.truck ?? s.truck };
}

function evaluate(s, events, trust = TRUST) {
  const plan = planFor(s);
  const shim = { ...s, route: plan.route, truck: plan.truck };
  return optionsFor(shim, events, GEO, A, W, trust);
}

/** The receipt for the option currently in force. */
function currentReceipt(s, events) {
  const r = evaluate(s, events);
  const plan = planFor(s);
  return r.receipts.find(x => x.optionId === plan.route)
      || r.receipts.find(x => x.kind === 'stay')
      || r.receipts[0];
}

function riskOf(s, events) {
  const r = currentReceipt(s, events);
  if (!r) return { level: 'ok', label: 'On plan', r: null };
  if (!r.feasible) return { level: 'risk', label: 'Not possible', r };
  if (!r.meetsAppt) return { level: 'risk', label: `Misses window by ${r.lateMin} min`, r };
  const slack = s.apptEnd - r.arrive;
  if (slack < 15) return { level: 'warn', label: `Only ${Math.round(slack)} min spare`, r };
  if (r.needsOk.length) return { level: 'warn', label: 'Unconfirmed report on route', r };
  return { level: 'ok', label: 'On plan', r };
}

/* ------------------------------------------------------------ indicators ---- */
function fleetTotals(events) {
  let atRisk = 0, delay = 0, miles = 0, co2 = 0, schools = 0, unpaid = 0;
  for (const s of SHIPMENTS) {
    if (s.status === 'delivered') continue;
    const r = currentReceipt(s, events);
    if (!r) continue;
    if (!r.feasible || !r.meetsAppt) atRisk++;
    delay += Math.max(0, r.lateMin);
    miles += r.miles;
    co2 += r.co2;
    schools += r.schoolCount;
    unpaid += r.unpaidMin;
  }
  return { atRisk, delay, miles, co2, schools, unpaid };
}

const KPIS = [
  { k: 'atRisk', t: 'Shipments at risk', f: v => v, why: 'Counts shipments whose current plan either cannot be driven or arrives after the appointment window closes.' },
  { k: 'delay',  t: 'Total minutes late', f: v => Math.round(v), why: 'Sum over shipments of max(0, arrival - appointment end). Arrival = departure + travel time.' },
  { k: 'miles',  t: 'Fleet miles planned', f: v => Math.round(v), why: 'Sum of planned route length. Corridor legs measured along real OpenStreetMap centrelines; the hop to each terminal and warehouse is a straight line (SIMULATED).' },
  { k: 'co2',    t: 'Extra CO₂ kg', f: v => Math.round(v), why: 'Extra miles vs the original plan ÷ 6.0 mpg, plus idling at 0.8 gal/h while holding, × 10.18 kg CO₂ per gallon (US EPA).' },
  { k: 'schools',t: 'School passes', f: v => v, why: 'Number of OpenStreetMap school points within 150 m of the planned route lines, summed over the fleet. A pass is proximity, not a measured exposure.' },
  { k: 'unpaid', t: 'Driver unpaid min', f: v => Math.round(v), why: 'Extra minutes beyond the original plan for drivers paid per load, who are not paid for waiting or detours. Hourly drivers appear as company cost instead.' },
];

function renderKpis() {
  const now = fleetTotals(activeEvents());
  const norm = fleetTotals([]);
  const box = $('#kpis'); box.innerHTML = '';
  for (const d of KPIS) {
    const nv = now[d.k], bv = norm[d.k], diff = nv - bv;
    const cls = Math.abs(diff) < 0.5 ? 'flat' : (diff > 0 ? 'up' : 'down');
    const n = el('div', 'kpi');
    n.appendChild(el('div', 'k', d.t));
    const v = el('div', 'v', String(d.f(nv)));
    v.className = 'v' + (d.k === 'atRisk' && nv > 0 ? ' up' : '');
    n.appendChild(v);
    n.appendChild(el('div', 'd',
      `normally <b>${d.f(bv)}</b> &middot; <b class="${cls}">${Math.abs(diff) < 0.5 ? 'no change' : sgn(d.f(diff))}</b>`));
    n.dataset.why = d.why;
    n.dataset.src = 'Compares the current situation with the same fleet and no disruption.';
    box.appendChild(n);
  }
}

/* -------------------------------------------------------------- shiplist ---- */
const ORDER = { risk: 0, warn: 1, ok: 2 };

function renderList() {
  const events = activeEvents();
  const rows = SHIPMENTS.map(s => ({ s, risk: riskOf(s, events) }))
    .sort((a, b) => ORDER[a.risk.level] - ORDER[b.risk.level] || a.s.apptEnd - b.s.apptEnd);

  const box = $('#list'); box.innerHTML = '';
  const nRisk = rows.filter(r => r.risk.level === 'risk').length;
  box.appendChild(el('div', 'listhead',
    `${SHIPMENTS.length} shipments &middot; ${nRisk ? `<b style="color:var(--risk)">${nRisk} need attention</b>` : 'all on plan'}`));

  for (const { s, risk } of rows) {
    const wh = WAREHOUSES.find(w => w.id === s.wh);
    const b = el('button', 'ship');
    b.setAttribute('aria-current', String(SEL === s.id));
    const statusChip = { not_ready: ['c-mute', 'Not ready'], ready: ['c-info', 'Ready'],
                         picked_up: ['c-info', 'On the road'], delivered: ['c-ok', 'Delivered'] }[s.status];
    const riskChip = { risk: 'c-risk', warn: 'c-warn', ok: 'c-ok' }[risk.level];
    b.innerHTML =
      `<div class="r1"><span class="id">${s.id}</span>
         <span style="font-size:12px;color:var(--ink3)">${s.truck ? s.truck : 'no driver'}</span></div>
       <div class="r2">${wh.name}<br>appointment ${fmtMin(s.apptStart)}&ndash;${fmtMin(s.apptEnd)}</div>
       <div class="r3">
         <span class="chip ${statusChip[0]}">${statusChip[1]}</span>
         <span class="chip ${riskChip}">${risk.label}</span>
         ${APPLIED[s.id] ? '<span class="chip c-info">Plan changed</span>' : ''}
       </div>`;
    b.onclick = () => { SEL = s.id; render(); };
    box.appendChild(b);
  }
}

/* --------------------------------------------------------------- receipts --- */
function line(label, value, why, src) {
  const n = el('div', 'ln');
  const k = el('span', 'lk');
  k.innerHTML = why ? `<span class="why">${label}</span>` : label;
  if (why) { k.firstChild.dataset.why = why; if (src) k.firstChild.dataset.src = src; }
  n.appendChild(k);
  n.appendChild(el('span', 'lv', value));
  return n;
}

function renderDrawer() {
  const d = $('#drawer');
  if (!SEL) { d.className = ''; d.innerHTML = ''; return; }
  d.className = 'open';
  const s = SHIPMENTS.find(x => x.id === SEL);
  const wh = WAREHOUSES.find(w => w.id === s.wh);
  const term = TERMINALS.find(t => t.id === s.terminal);
  const events = activeEvents();
  const { baseline, receipts } = evaluate(s, events);
  d.innerHTML = '';

  // header
  const h = el('div', 'dhead');
  h.innerHTML = `<div class="t"><h2>${s.id}</h2>
      <span class="chip c-mute">${s.weightClass}</span>
      <div class="spacer"></div></div>
    <div class="sub">${term.name} &rarr; ${wh.name}<br>
      Appointment ${fmtMin(s.apptStart)}&ndash;${fmtMin(s.apptEnd)} &middot; dock closes ${fmtMin(s.dockClose)}
      &middot; rebooking ${money(s.rebookFee)}<br>
      Container ready ${fmtMin(s.readyAt)} &middot;
      driver ${s.truck ?? 'unassigned'}${s.truck ? ` (paid ${TRUCKS.find(t => t.id === s.truck).pay === 'hourly' ? 'hourly' : 'per load'})` : ''}</div>`;
  const close = el('button', 'ghost', 'Close');
  close.onclick = () => { SEL = null; render(); };
  h.querySelector('.t').appendChild(close);
  d.appendChild(h);

  // weights
  const ws = el('div', 'dsec sliders');
  ws.appendChild(el('div', 'st', 'What matters most to you right now'));
  const wl = { delay: 'Being on time', cost: 'Company cost', driverUnpaid: 'Driver unpaid time',
               co2: 'CO₂', school: 'Passing schools', burden: 'Pollution-burdened areas' };
  for (const k in wl) {
    const lab = el('label');
    lab.innerHTML = `<span>${wl[k]}</span>`;
    const r = el('input'); r.type = 'range'; r.min = 0; r.max = 1; r.step = 0.05; r.value = W[k];
    r.setAttribute('aria-label', wl[k]);
    const n = el('span', 'n', W[k].toFixed(2));
    r.oninput = () => { W[k] = +r.value; n.textContent = W[k].toFixed(2); renderDrawer(); };
    lab.appendChild(r); lab.appendChild(n);
    ws.appendChild(lab);
  }
  d.appendChild(ws);

  // receipts
  const rs = el('div', 'dsec');
  const feas = receipts.filter(r => r.feasible);
  rs.appendChild(el('div', 'st',
    `${receipts.length} possible responses &middot; ${feas.length} workable &middot; ranked by your weights`));

  receipts.forEach((r, i) => {
    const best = r.feasible && r === feas[0];
    const card = el('div', 'rcpt' + (best ? ' best' : '') + (r.feasible ? '' : ' dead'));
    const kindLabel = { stay: 'keep current route', reroute: 'reroute', hold: 'wait', swap: 'change driver' }[r.kind];

    const rh = el('div', 'rh');
    const meets = r.meetsAppt
      ? `<span style="color:var(--ok)">arrives ${fmtMin(r.arrive)} &mdash; meets the ${fmtMin(s.apptEnd)} window</span>`
      : `<span style="color:var(--risk)">arrives ${fmtMin(r.arrive)} &mdash; ${r.lateMin} min after the window closes</span>`;
    rh.innerHTML = `<div class="nm">${r.name} <span class="k">${kindLabel}</span></div><div class="arr">${meets}</div>`;
    card.appendChild(rh);

    const ln = el('div', 'lines');
    ln.appendChild(line('Distance', `${r.miles.toFixed(1)} mi (${sgn(+r.extraMiles.toFixed(1))})`,
      'Measured along real OpenStreetMap motorway centrelines. The hop from the terminal and the hop to the warehouse are straight lines priced at 24 mph &mdash; SIMULATED, not a real street route.',
      'OpenStreetMap (ODbL)'));
    ln.appendChild(line('Driving time', `${Math.round(r.travelMin)} min`,
      `Free-flow at ${A.freeFlowMph.v} mph × ${A.normalCongestion.v} normal congestion = ${Math.round(r.baseMin)} min, plus ${Math.round(r.eventDelayMin)} min from reported incidents on this route.`,
      'Speeds are ASSUMPTIONS, not measured traffic.'));
    if (r.waitMin > 0) ln.appendChild(line('Holding first', `${Math.round(r.waitMin)} min`,
      'Assumes the incident clears 45 minutes after it was reported. That clearance time is a guess, not a Caltrans estimate.', 'ASSUMPTION'));
    ln.appendChild(line('Cost to the company', money(r.companyCost),
      `Fuel ${money(r.fuel)} (${r.gal.toFixed(2)} gal at ${money(A.dieselPrice.v)}/gal, ${A.truckMpg.v} mpg) + tyres and maintenance ${money(r.wear)} at ${money(A.wearPerMile.v)}/mi + driver ${money(r.driverCost)}${r.rebook ? ' + rebooking ' + money(r.rebook) : ''}${r.perDiem ? ' + container per-diem ' + money(r.perDiem) : ''}.`,
      'Rates are assumptions, editable under Assumptions.'));
    ln.appendChild(line('Cost to the driver',
      r.payType === 'per_load'
        ? (r.unpaidMin > 0 ? `${r.unpaidMin} min unpaid` : 'none')
        : `${money(r.driverCost)} paid`,
      r.payType === 'per_load'
        ? 'This driver is paid per load, so extra minutes spent waiting or detouring are unpaid. The company does not see this as a cost, so it is shown separately.'
        : 'This driver is paid hourly, so extra time appears as company cost instead of unpaid time.',
      'Pay type is simulated.'));
    ln.appendChild(line('CO₂', `${sgn(+r.co2.toFixed(1))} kg`,
      `${r.gal.toFixed(2)} extra gallons × ${A.co2PerGal.v} kg/gal.`, 'US EPA diesel emission factor'));
    ln.appendChild(line('Schools within 150 m', String(r.schoolCount),
      r.schoolCount
        ? `Real OpenStreetMap school locations within 150 m of this route: ${r.schools.slice(0, 6).map(x => x.n).join(', ')}${r.schools.length > 6 ? ` and ${r.schools.length - 6} more` : ''}. Proximity only &mdash; this is not a measured exposure, and it does not account for school hours.`
        : 'No mapped schools within 150 m of this route.',
      'OpenStreetMap amenity=school'));
    ln.appendChild(line('Miles in high-burden areas', `${r.burdenMi.toFixed(1)} mi`,
      r.burdenZones.length
        ? `Route miles inside areas at or above the ${A.burdenPct.v}th percentile for diesel PM: ${r.burdenZones.map(z => `${z.name} (${z.pct}th, ${z.mi.toFixed(1)} mi)`).join(', ')}.`
        : 'This route does not pass through the high-burden areas we mapped.',
      'CalEnviroScreen 4.0 diesel PM percentile, city-level APPROXIMATION &mdash; not a tract-level join.'));
    if (r.knockOn.length) ln.appendChild(line('Knock-on effects',
      `${r.knockOn.length} other shipment${r.knockOn.length > 1 ? 's' : ''}`,
      `Taking ${r.swapTo} off its own work affects: ${r.knockOn.map(k => `${k.id} (appointment ${k.appt})`).join(', ')}.`,
      'Simulated assignments.'));
    card.appendChild(ln);

    if (!r.feasible) card.appendChild(el('div', 'rblock', '<b>Ruled out.</b> ' + r.blockers.join(' ')));
    else if (r.needsOk.length) card.appendChild(el('div', 'runconf',
      '<b>Needs your judgement.</b> ' + r.needsOk.map(e =>
        `${e.source} (${Math.round(e.confidence * 100)}% confidence, unconfirmed): ${e.text}`).join(' ')));

    if (best) {
      const note = el('div', 'rnote');
      note.innerHTML = `<span class="star">Ranked first</span> on your current weights. <span id="planner-${i}">${plannerFallback(r, feas, s)}</span>`;
      card.appendChild(note);
    }

    const acts = el('div', 'racts');
    const use = el('button', 'primary', r.feasible ? 'Use this option' : 'Cannot be used');
    use.disabled = !r.feasible;
    use.onclick = () => applyOption(s, r, best);
    acts.appendChild(use);
    const show = el('button', 'secondary', 'Show on map');
    show.onclick = () => { drawRoute(r, true); };
    acts.appendChild(show);
    card.appendChild(acts);

    card.onmouseenter = () => drawRoute(r, false);
    rs.appendChild(card);
  });
  d.appendChild(rs);

  // baseline note
  const bn = el('div', 'dsec');
  bn.innerHTML = `<div class="st">What "extra" is measured against</div>
    <div style="font-size:13px;color:var(--ink2)">The original plan: <b>${baseline.name}</b>,
    ${baseline.miles.toFixed(1)} mi, arriving ${fmtMin(baseline.arrive)} with no disruption.
    Every "+" on a receipt is the difference from that.</div>`;
  d.appendChild(bn);

  askPlanner(s, feas);
}

/* Deterministic sentence, used immediately and if the model is unavailable. */
function plannerFallback(r, feas, s) {
  const alt = feas[1];
  if (!alt) return 'It is the only workable option.';
  const bits = [];
  if (r.meetsAppt && !alt.meetsAppt) bits.push('it is the only ranked option that still meets the window');
  if (r.schoolCount < alt.schoolCount) bits.push(`it passes ${alt.schoolCount - r.schoolCount} fewer schools than ${alt.name}`);
  if (r.burdenMi < alt.burdenMi - 0.5) bits.push(`it keeps ${(alt.burdenMi - r.burdenMi).toFixed(1)} fewer miles inside high-burden areas`);
  if (r.companyCost > alt.companyCost + 1) bits.push(`it costs ${money(r.companyCost - alt.companyCost)} more than ${alt.name}`);
  if (r.co2 > alt.co2 + 1) bits.push(`it adds ${(r.co2 - alt.co2).toFixed(0)} kg more CO₂`);
  return bits.length ? bits.join('; ') + '.' : `Closest alternative is ${alt.name}.`;
}

/* ------------------------------------------------------- apply / override --- */
function applyOption(s, r, wasTopPick) {
  let reason = null;
  if (!wasTopPick) {
    reason = prompt(`You are picking "${r.name}", which is not the top-ranked option.\n\nWhy? (recorded in the activity log)`);
    if (reason === null) return;
    if (!reason.trim()) { alert('A reason is required when you override the ranking.'); return; }
  }
  APPLIED[s.id] = { optionId: r.optionId, truck: r.swapTo ?? planFor(s).truck, note: reason };
  logIt(wasTopPick ? 'Dispatcher accepted the ranked option' : 'Dispatcher OVERRODE the ranking', {
    shipment: s.id, option: r.name,
    arrives: fmtMin(r.arrive), meetsWindow: r.meetsAppt ? 'yes' : 'no',
    extraMiles: r.extraMiles.toFixed(1), co2: r.co2.toFixed(1) + ' kg',
    schools: r.schoolCount, burdenMi: r.burdenMi.toFixed(1),
    driverUnpaidMin: r.unpaidMin, companyCost: money(r.companyCost),
    reason: reason || '(accepted the top-ranked option)',
  });
  draftMessages(s, r, reason);
  render();
}

/* Messenger: drafts only. Nothing leaves the building without Approve. */
function draftMessages(s, r, reason) {
  const wh = WAREHOUSES.find(w => w.id === s.wh);
  const toDriver = `${planFor(s).truck ?? 'Driver'}: take ${r.name} for ${s.id}. `
    + `Estimated arrival ${fmtMin(r.arrive)} at ${wh.name}. `
    + (r.waitMin > 0 ? `Hold ${Math.round(r.waitMin)} min before leaving. ` : '')
    + `Estimated, not guaranteed — call if conditions differ.`;
  /* The reason is the disruption that triggered the review, not this route's own
     incidents — a good reroute has none, which read as "Reason: plan change". */
  const sources = [...new Set(activeEvents().map(e => e.source))];
  const toWh = `${wh.name}: container ${s.id} now expected ${fmtMin(r.arrive)}`
    + (r.meetsAppt ? `, within the ${fmtMin(s.apptStart)}–${fmtMin(s.apptEnd)} window.`
                   : `, which is ${r.lateMin} min after your window closes. Requesting a rebook (fee ${money(s.rebookFee)}).`)
    + (sources.length ? ` Reason: ${andList(sources)} reported a problem on the original route.` : '')
    + (r.needsOk.length ? ' Note: that report is unconfirmed.' : '');

  const m = $('#modal'); $('#modalTitle').textContent = 'Messages to send — review before anything goes out';
  $('#modalBody').innerHTML = `
    <p style="color:var(--ink2);margin:0 0 14px">Nothing has been sent. These are drafts written from the numbers on the receipt you chose.</p>
    <div class="st" style="font-size:11px;text-transform:uppercase;letter-spacing:.7px;color:var(--ink3);margin-bottom:6px">To the driver</div>
    <textarea id="mDriver" style="width:100%;min-height:76px;background:var(--panel2);color:var(--ink);border:1px solid var(--line);border-radius:10px;padding:10px;font:inherit;font-size:13px">${toDriver}</textarea>
    <div class="st" style="font-size:11px;text-transform:uppercase;letter-spacing:.7px;color:var(--ink3);margin:16px 0 6px">To the warehouse</div>
    <textarea id="mWh" style="width:100%;min-height:92px;background:var(--panel2);color:var(--ink);border:1px solid var(--line);border-radius:10px;padding:10px;font:inherit;font-size:13px">${toWh}</textarea>
    <div style="display:flex;gap:9px;margin-top:18px">
      <button class="primary" id="mSend" style="flex:0 0 auto;padding:0 20px">Send both messages</button>
      <button class="secondary" id="mSkip">Don't send anything</button>
    </div>`;
  m.showModal();
  $('#mSend').onclick = () => {
    logIt('Dispatcher approved and sent the update', {
      shipment: s.id, toDriver: $('#mDriver').value, toWarehouse: $('#mWh').value,
      note: 'Prototype: messages are recorded in this log, not delivered anywhere.',
    });
    m.close(); render();
  };
  $('#mSkip').onclick = () => { logIt('Dispatcher chose not to send a message', { shipment: s.id }); m.close(); };
}

/* ------------------------------------------------------------------- log ---- */
function logIt(what, detail) {
  LOG.unshift({ at: new Date().toLocaleTimeString(), what, detail });
}

function showLog() {
  $('#modalTitle').textContent = 'Activity log';
  const body = LOG.length ? LOG.map(e => `<li>
      <div class="ts">${e.at}</div>
      <div style="margin:3px 0 5px"><b>${e.what}</b></div>
      <table>${Object.entries(e.detail).map(([k, v]) =>
        `<tr><th style="width:150px">${k.replace(/([A-Z])/g, ' $1').toLowerCase()}</th><td>${v}</td></tr>`).join('')}</table>
    </li>`).join('') : '<li style="color:var(--ink3)">Nothing yet. Pick an option on a shipment and it will be recorded here.</li>';
  $('#modalBody').innerHTML = `<p style="color:var(--ink2);margin:0 0 12px">Every machine output and every human decision, with the numbers that were on screen at the time.</p><ul class="log">${body}</ul>`;
  $('#modal').showModal();
}

function showAssumptions() {
  $('#modalTitle').textContent = 'Assumptions, sources and what is simulated';
  const rows = Object.entries(A).map(([k, a]) => `<tr>
      <th style="width:190px">${a.label}</th>
      <td class="n"><input type="number" step="0.01" value="${a.v}" data-k="${k}"
        style="width:92px;min-height:34px;text-align:right"> ${a.unit}</td>
      <td style="color:var(--ink2)">${a.src}</td></tr>`).join('');
  $('#modalBody').innerHTML = `
    <p style="margin:0 0 14px;color:var(--ink2)">Change any rate and every receipt recalculates. Nothing here is measured from this fleet; they are published averages or stated guesses.</p>
    <table><tr><th>Rate</th><th class="n">Value</th><th>Where it comes from</th></tr>${rows}</table>
    <h3 style="margin:22px 0 8px;font-size:14px">What is real and what is invented</h3>
    <table>
      <tr><th style="width:190px">Real</th><td>Motorway centrelines and school locations (OpenStreetMap, ODbL). Terminal and warehouse coordinates. Live CHP incident feed in Live mode. Replayed incidents are modelled on real past events.</td></tr>
      <tr><th>Approximated</th><td>Pollution burden: CalEnviroScreen 4.0 diesel PM percentiles applied as circles around city centres, not joined to census tracts. Overstates or understates any given block.</td></tr>
      <tr><th>Simulated</th><td>All containers, trucks, drivers, hours-of-service, pay types, warehouse appointments, rebooking fees, and the surface-street hops at each end of a route. No public live container-level data exists.</td></tr>
      <tr><th>Estimated</th><td>All travel times, delays, costs and CO&#8322;. A camera or satellite hotspot near a road is evidence, never confirmation that the road is shut.</td></tr>
    </table>`;
  $('#modalBody').querySelectorAll('input[data-k]').forEach(i => {
    i.onchange = () => { A[i.dataset.k].v = +i.value; logIt('Dispatcher changed an assumption', { rate: A[i.dataset.k].label, newValue: i.value }); render(); };
  });
  $('#modal').showModal();
}

/* ------------------------------------------------------------------ map ---- */
let map, layers = {};

function initMap() {
  map = L.map('map', { zoomControl: true, attributionControl: true })
    .setView([33.92, -117.95], 10);
  /* Esri's dark canvas: free, no API key, no watermark. CARTO's tiles now
     require a key and stamp "API KEY REQUIRED" across the map. */
  const esri = 'https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_';
  L.tileLayer(esri + 'Base/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 16,
    attribution: 'Basemap &copy; Esri, HERE, Garmin, &copy; OpenStreetMap contributors '
               + '&middot; roads &amp; schools from OpenStreetMap (ODbL)',
  }).addTo(map);
  L.tileLayer(esri + 'Reference/MapServer/tile/{z}/{y}/{x}', { maxZoom: 16, opacity: .85 }).addTo(map);
  for (const k of ['corridors', 'burden', 'schools', 'nodes', 'routes', 'events', 'trucks']) {
    layers[k] = L.layerGroup().addTo(map);
  }

  for (const [name, line] of Object.entries(GEO.corridors)) {
    L.polyline(line.map(p => [p[1], p[0]]), { color: '#3a4557', weight: 3, opacity: .85 })
      .bindPopup(`<b>${name}</b><br>Real OpenStreetMap centreline`).addTo(layers.corridors);
  }
  for (const z of GEO.burden) {
    L.circle([z.lat, z.lon], { radius: z.r * 1609.34, color: '#f0883e', weight: 1, fillOpacity: .10, dashArray: '4 4' })
      .bindPopup(`<b>${z.name}</b><br>Diesel PM ${z.pct}th percentile<br><i>CalEnviroScreen 4.0, city-level approximation</i>`)
      .addTo(layers.burden);
  }
  for (const s of GEO.schools) {
    L.circleMarker([s.lat, s.lon], { radius: 2.5, color: '#fbbf24', weight: 1, fillOpacity: .7 })
      .bindPopup(`<b>${s.n}</b><br>OpenStreetMap school`).addTo(layers.schools);
  }
  layers.schools.remove();

  for (const t of TERMINALS) {
    L.circleMarker([t.lat, t.lon], { radius: 6, color: '#60a5fa', fillColor: '#60a5fa', fillOpacity: .9, weight: 2 })
      .bindPopup(`<b>${t.name}</b><br>Port terminal (real location)`).addTo(layers.nodes);
  }
  for (const w of WAREHOUSES) {
    L.marker([w.lat, w.lon], { icon: L.divIcon({ className: '', iconSize: [13, 13],
      html: '<div style="width:13px;height:13px;background:#c4b5fd;border:2px solid #11151c;border-radius:3px"></div>' }) })
      .bindPopup(`<b>${w.name}</b><br>Fictional operator at a real industrial site<br>${w.city}`)
      .addTo(layers.nodes);
  }

  $('#lSchools').onchange = e => e.target.checked ? layers.schools.addTo(map) : layers.schools.remove();
  $('#lBurden').onchange = e => e.target.checked ? layers.burden.addTo(map) : layers.burden.remove();
  $('#lTrust').onchange = e => {
    TRUST = e.target.checked;
    logIt('Dispatcher changed how unconfirmed reports are treated',
      { trustUnconfirmed: TRUST ? 'yes — unconfirmed closures block a route' : 'no — unconfirmed closures are shown but do not block a route' });
    render();
  };
}

function drawRoute(r, fit) {
  layers.routes.clearLayers();
  for (const leg of r.route.legs) {
    L.polyline(leg.coords.map(p => [p[1], p[0]]), {
      color: r.feasible ? (r.meetsAppt ? '#4ade80' : '#fbbf24') : '#ff6b6b',
      weight: leg.kind === 'corridor' ? 5 : 3,
      opacity: .95, dashArray: leg.kind === 'corridor' ? null : '5 5',
    }).bindPopup(`<b>${r.name}</b><br>${leg.name}${leg.kind === 'surface' ? ' <i>(simulated straight line)</i>' : ''}<br>${leg.mi.toFixed(1)} mi`)
      .addTo(layers.routes);
  }
  if (fit) map.fitBounds(L.polyline(r.route.coords.map(p => [p[1], p[0]])).getBounds(), { padding: [40, 40] });
}

function renderMap() {
  layers.events.clearLayers();
  layers.trucks.clearLayers();

  for (const ev of activeEvents()) {
    const col = ev.effect.closed ? '#ff6b6b' : (ev.confirmed ? '#f97316' : '#fbbf24');
    L.circle([ev.lat, ev.lon], {
      radius: ev.radiusMi * 1609.34, color: col, weight: 2, fillOpacity: .13,
      dashArray: ev.confirmed ? null : '6 5',
    }).bindPopup(
      `<b>${ev.text}</b><br>
       Source: ${ev.source}<br>
       ${ev.confirmed ? '<span style="color:#4ade80">Confirmed by an official source</span>'
                      : `<span style="color:#fbbf24">UNCONFIRMED &middot; ${Math.round(ev.confidence * 100)}% confidence</span>`}<br>
       <i>${ev.evidence}</i>`).addTo(layers.events);
  }

  for (const t of TRUCKS) {
    const low = t.hosLeftMin < 120;
    L.circleMarker([t.lat, t.lon], { radius: 5, color: low ? '#fbbf24' : '#e8edf3', fillOpacity: .9, weight: 2 })
      .bindPopup(`<b>${t.id}</b> <i>(simulated)</i><br>${t.hosLeftMin} min of driving hours left<br>Paid ${t.pay === 'hourly' ? 'hourly' : 'per load'}<br>No name or phone number is stored.`)
      .addTo(layers.trucks);
  }

  if (SEL) {
    const s = SHIPMENTS.find(x => x.id === SEL);
    const r = currentReceipt(s, activeEvents());
    if (r) drawRoute(r, false);
  } else {
    layers.routes.clearLayers();
    for (const s of SHIPMENTS) {
      if (s.status === 'not_ready') continue;
      const r = currentReceipt(s, activeEvents());
      if (!r) continue;
      L.polyline(r.route.coords.map(p => [p[1], p[0]]), {
        color: !r.feasible ? '#ff6b6b' : (!r.meetsAppt ? '#ff6b6b' : (s.apptEnd - r.arrive < 15 ? '#fbbf24' : '#4ade80')),
        weight: 3.5, opacity: .8,
      }).bindPopup(`<b>${s.id}</b><br>${r.name}<br>arrives ${fmtMin(r.arrive)}`).addTo(layers.routes);
    }
  }
}

/* ------------------------------------------------------- what changed bar --- */
function renderChanged() {
  const evs = activeEvents();
  const bar = $('#changed');
  if (!evs.length) { bar.className = ''; return; }
  bar.className = 'on';
  const now = fleetTotals(evs), norm = fleetTotals([]);
  const affected = SHIPMENTS.filter(s => {
    const r = currentReceipt(s, evs);
    return r && (!r.feasible || !r.meetsAppt);
  }).map(s => s.id);
  $('#changedText').innerHTML =
    `<b>${evs.length} report${evs.length > 1 ? 's' : ''} on your corridors.</b> `
    + evs.map(e => `${e.source}${e.confirmed ? '' : ' (unconfirmed)'}: ${e.text}`).join(' &nbsp;&middot;&nbsp; ')
    + `<br><span style="color:var(--ink2)">Shipments at risk went from ${norm.atRisk} to ${now.atRisk}`
    + (affected.length ? `: <b>${affected.join(', ')}</b>` : '')
    + `. <span id="watcher"></span></span>`;
  askWatcher(evs, norm, now, affected);
}

/* -------------------------------------------------------------- the model --- */
let watcherKey = '', plannerKey = '';

async function llm(kind, facts) {
  const res = await fetch('/api/explain', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, facts }),
  });
  if (!res.ok) throw new Error('model unavailable');
  return (await res.json()).text;
}

async function askWatcher(evs, norm, now, affected) {
  const key = JSON.stringify([evs.map(e => e.id), now.atRisk, TRUST]);
  if (key === watcherKey) return;
  watcherKey = key;
  const facts = {
    reports: evs.map(e => ({ source: e.source, confirmed: e.confirmed, confidence: e.confidence, text: e.text })),
    shipmentsAtRiskBefore: norm.atRisk, shipmentsAtRiskNow: now.atRisk,
    affectedShipments: affected, totalMinutesLate: Math.round(now.delay),
  };
  try {
    const t = await llm('watcher', facts);
    const slot = $('#watcher');
    if (slot) slot.innerHTML = `<b style="color:var(--ink)">Watcher:</b> ${t}`;
    logIt('Watcher (language model) summarised the situation', { model: 'see server log', input: JSON.stringify(facts), output: t });
  } catch { /* the deterministic sentence above already says what changed */ }
}

async function askPlanner(s, feas) {
  if (!feas.length) return;
  const top = feas[0], alt = feas[1];
  const key = JSON.stringify([s.id, top.optionId, alt?.optionId, JSON.stringify(W), TRUST]);
  if (key === plannerKey) return;
  plannerKey = key;
  // Only the clauses the dispatcher's weights say matter, to keep the prompt short.
  const clauses = tradeOffClauses(top, alt)
    .sort((a, b) => (W[b.k] ?? 0) - (W[a.k] ?? 0)).slice(0, 4);
  const facts = {
    shipment: s.id, closes: fmtMin(s.apptEnd), recommended: top.name,
    nextBest: alt ? alt.name : null,
    tradeOffs: clauses.map(x => x.text),
    weights: Object.fromEntries(clauses.map(x => [x.k, W[x.k]])),
  };
  try {
    const t = await llm('planner', facts);
    const slot = document.querySelector('[id^="planner-"]');
    if (slot) slot.textContent = t;
    logIt('Planner (language model) explained the ranking', { shipment: s.id, input: JSON.stringify(facts), output: t });
  } catch { /* plannerFallback is already on screen */ }
}

/* -------------------------------------------------------------- live feed --- */
async function loadLive() {
  $('#changedText').textContent = 'Fetching the live CHP incident feed…';
  $('#changed').className = 'on';
  try {
    const res = await fetch('/api/chp');
    const j = await res.json();
    LIVE_EVENTS = j.events;
    logIt('Watcher polled the live CHP feed', {
      incidentsStatewide: j.total, nearOurCorridors: j.events.length,
      note: 'Real, unedited California Highway Patrol incident feed. Severity and backup radius are our ESTIMATES, not CHP data.',
    });
    if (!LIVE_EVENTS.length) {
      $('#changedText').innerHTML = `<b>Live feed is quiet.</b> ${j.total} incidents statewide right now, none within ${j.radiusMi} miles of our corridors. `
        + `That is the normal case and the reason the demo uses Replay.`;
      renderKpis(); renderList(); renderMap();
      return;
    }
  } catch (e) {
    $('#changedText').innerHTML = `<b>Could not reach the live feed.</b> Staying on replayed data. (${e.message})`;
    LIVE_EVENTS = [];
  }
  render();
}

/* ------------------------------------------------------------------ boot ---- */
function render() { renderKpis(); renderChanged(); renderList(); renderDrawer(); renderMap(); }

function initTooltip() {
  const tip = $('#tip');
  document.addEventListener('mouseover', e => {
    const t = e.target.closest('[data-why]');
    if (!t) { tip.style.display = 'none'; return; }
    tip.innerHTML = `<span class="f">${t.dataset.why}</span>` + (t.dataset.src ? `<span class="s">${t.dataset.src}</span>` : '');
    tip.style.display = 'block';
    const r = t.getBoundingClientRect();
    tip.style.left = Math.min(r.left, innerWidth - 330) + 'px';
    tip.style.top = (r.bottom + 8 + tip.offsetHeight > innerHeight ? r.top - tip.offsetHeight - 8 : r.bottom + 8) + 'px';
  });
  document.addEventListener('mouseout', e => { if (e.target.closest('[data-why]')) tip.style.display = 'none'; });
}

async function boot() {
  GEO = await (await fetch('geo.json')).json();

  const sel = $('#scenario');
  for (const [k, v] of Object.entries(REPLAY)) {
    const o = document.createElement('option'); o.value = k; o.textContent = v.label; sel.appendChild(o);
  }
  sel.onchange = () => {
    SCEN = sel.value; MODE = 'replay'; setMode();
    logIt('Dispatcher loaded a replayed situation', { scenario: REPLAY[SCEN].label, events: REPLAY[SCEN].events.length });
    render();
  };
  $('#mReplay').onclick = () => { MODE = 'replay'; setMode(); render(); };
  $('#mLive').onclick = () => { MODE = 'live'; setMode(); loadLive(); };
  $('#btnLog').onclick = showLog;
  $('#btnAssume').onclick = showAssumptions;

  initMap(); initTooltip();
  logIt('Session started', { mode: 'replay', scenario: REPLAY[SCEN].label,
    note: 'Shipments, trucks and appointments are simulated. Roads and schools are real OpenStreetMap data.' });
  render();

  if (new URLSearchParams(location.search).get('test') === '1') selfCheck(GEO);
}

function setMode() {
  $('#mReplay').setAttribute('aria-pressed', String(MODE === 'replay'));
  $('#mLive').setAttribute('aria-pressed', String(MODE === 'live'));
  $('#scenario').disabled = MODE === 'live';
}

boot();
