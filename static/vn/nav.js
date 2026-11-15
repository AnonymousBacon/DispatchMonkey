/* DispatchMonkey — /vn/ camera, street-level navigation, truck parking.
 *
 * Loaded as a plain script before the inline script in index.html, so it shares
 * the same global scope: `map`, `routeFeats`, `best`, `T`, `STR`, `toast`, `fmt`,
 * `d2` and friends all come from there and are only touched inside functions,
 * i.e. after the inline script has run.
 *
 * Three jobs, in the order the driver meets them:
 *  1. Rotation the driver can actually reach — drag, ctrl-drag, twist, and three
 *     buttons. 2D/3D moves pitch and never touches bearing.
 *  2. Route overview vs navigation. Overview frames the whole line; navigation
 *     drops to street level, follows the truck and names the next turn. Manual
 *     pan or rotate pauses following rather than fighting the driver for the
 *     camera; a Resume button gives it back.
 *  3. Truck parking and rest stops, with the verification rule that a lot is
 *     never recommended unless a human confirmed a truck can get in.
 *
 * No number here is invented. Speeds and ETAs come from the engine's own
 * `driveMin`/`km` for the chosen option; distances are measured off the same
 * OSM geometry the route is drawn from. The replay is a time-compressed walk
 * along that geometry and says so on screen.
 */

/* Flat-earth metres at 10.7°N — the same constants d2() in index.html uses, so
 * navigation distances and the off-route check cannot disagree. */
const M_LON = 109200, M_LAT = 111320;
const mDist = (a, b) => Math.sqrt(d2(a, b));
const bearingTo = (a, b) => (Math.atan2((b[0] - a[0]) * M_LON, (b[1] - a[1]) * M_LAT) * 180 / Math.PI + 360) % 360;
/* shortest signed turn from bearing a to bearing b, -180..180 */
const turnDelta = (a, b) => ((b - a + 540) % 360) - 180;

const NAV = {
  on: false, follow: true, headingUp: true,
  path: [], names: [], cum: [], man: [],   // polyline, road name per vertex, cumulative metres, maneuvers
  i: 0, travelled: 0,                      // progress: nearest vertex, metres from the start
  pos: null, heading: null, posTier: 'none', // 'gps' | 'replay' | 'none'
  replay: null, replayT: 0,
  marker: null, pausedAt: 0,
};
/* One display choice, not a measurement: the replay walks the engine's own
 * drive time this many times faster so a turn is visible inside a 7-minute talk. */
const REPLAY_X = 8;

/* ---------------- geometry: one line, with maneuvers ----------------------- */

function navBuildPath() {
  const path = [], names = [];
  for (const f of routeFeats) {
    for (const p of f.geometry.coordinates) {
      const last = path[path.length - 1];
      if (last && last[0] === p[0] && last[1] === p[1]) continue;   // seam between two roads
      path.push(p); names.push(f.properties.name);
    }
  }
  const cum = [0];
  for (let i = 1; i < path.length; i++) cum[i] = cum[i - 1] + mDist(path[i - 1], path[i]);
  NAV.path = path; NAV.names = names; NAV.cum = cum;
  // A single segment this long is not road geometry, it is a straight line
  // standing in for one: geo.json has no Thủ Thiêm tunnel, so the Nguyễn Văn Linh
  // → Mai Chí Thọ hand-off is one ~2.3 km chord across the river. Guidance along
  // such a stretch would be invented, so the route is badged a preview instead.
  NAV.approxM = 0;
  for (let i = 1; i < path.length; i++) {
    const seg = cum[i] - cum[i - 1];
    if (seg > 600) NAV.approxM += seg;
  }
  NAV.man = navManeuvers();
  if (NAV.i >= path.length) NAV.i = 0;
}

/* A maneuver is where the road name changes. The turn comes from the bearing
 * either side of the junction, measured over ~40 m so one noisy shape point
 * cannot invent a turn. Verified OSM geometry only — there is no routing API
 * behind this, so we never claim a lane or an exit number. */
function navManeuvers() {
  const { path, names, cum } = NAV, out = [];
  const back = (i) => { let j = i; while (j > 0 && cum[i] - cum[j] < 40) j--; return j; };
  const fwd = (i) => { let j = i; while (j < path.length - 1 && cum[j] - cum[i] < 40) j++; return j; };
  for (let i = 1; i < path.length; i++) {
    if (names[i] === names[i - 1]) continue;
    const a = back(i - 1), b = fwd(i);
    if (a === i - 1 && b === i) continue;
    const d = turnDelta(bearingTo(path[a], path[i]), bearingTo(path[i], path[b]));
    out.push({ i, at: cum[i], road: names[i], turn: navTurnKind(d), deg: Math.round(d) });
  }
  out.push({ i: path.length - 1, at: cum[path.length - 1], road: null, turn: 'arrive', deg: 0 });
  return out;
}

/* A road NAME change is not a U-turn. When the bearing either side of the
 * junction reverses, the cause is almost always our own stitching: junction()
 * cuts each road at the nearest pair of shape points, and where two corridors
 * run alongside each other that cut can double the line back. Claiming "U-turn"
 * off that would be inventing a maneuver, so an extreme angle at a name change
 * is reported as "unknown" — follow the road, we will not name the turn. */
function navTurnKind(d) {
  const a = Math.abs(d);
  if (a > 135) return 'unknown';
  if (a < 20) return 'straight';
  const side = d > 0 ? 'right' : 'left';
  return (a < 50 ? 'slight-' : a > 110 ? 'sharp-' : '') + side;
}

/* Project the fix onto the line to get progress. Searched forward from the last
 * known vertex with a bounded look-back, so a route that doubles back on itself
 * cannot snap the driver to the wrong pass. */
function navSnap(pos) {
  const { path, cum } = NAV;
  if (path.length < 2) return null;
  const from = Math.max(0, NAV.i - 8), to = Math.min(path.length - 1, NAV.i + 120);
  let bi = from, bd = Infinity, bt = 0;
  for (let i = from; i < to; i++) {
    const a = path[i], b = path[i + 1];
    const ax = (b[0] - a[0]) * M_LON, ay = (b[1] - a[1]) * M_LAT;
    const px = (pos[0] - a[0]) * M_LON, py = (pos[1] - a[1]) * M_LAT;
    const len2 = ax * ax + ay * ay;
    const t = len2 ? Math.max(0, Math.min(1, (px * ax + py * ay) / len2)) : 0;
    const dx = px - t * ax, dy = py - t * ay, d = dx * dx + dy * dy;
    if (d < bd) { bd = d; bi = i; bt = t; }
  }
  const seg = cum[bi + 1] - cum[bi];
  return { i: bi, travelled: cum[bi] + bt * seg, off: Math.sqrt(bd),
           bearing: bearingTo(path[bi], path[bi + 1]) };
}

/* The next maneuver ahead of where the driver is now. */
function navNext() {
  return NAV.man.find(m => m.at > NAV.travelled + 5) || NAV.man[NAV.man.length - 1] || null;
}

/* Average speed for the remaining leg, straight off the engine's answer for the
 * option the driver chose. No speed constant lives in this file. */
function navKmh() {
  if (!best || !best.driveMin || !best.km) return null;
  return best.km / (best.driveMin / 60);
}

function navRemainingM() {
  const total = NAV.cum[NAV.cum.length - 1] || 0;
  return Math.max(0, total - NAV.travelled);
}

/* ETA = now + remaining distance at the engine's average speed for this option.
 * It is an estimate off a simulated plan, and the HUD badges it as one. */
function navEta() {
  const kmh = navKmh();
  if (!kmh) return null;
  const mins = (navRemainingM() / 1000) / kmh * 60;
  const nowMin = hm($('#demoTime').value || '06:10') + (NAV.replay ? NAV.replayT / 60 : 0);
  return { mins: Math.round(mins), at: fmt(nowMin + mins) };
}

/* ---------------- camera ---------------------------------------------------- */

/* Where the truck should sit on screen. Padding shrinks the camera's usable box,
 * so a large top pad puts the truck low and leaves the road ahead and the next
 * turn in view. On a phone the bottom bar and the sheet eat the lower edge. */
function navPadding() {
  const h = map.getContainer().clientHeight;
  // The HUD covers the top of the map, so the usable box starts below it.
  const hud = $('#navHud').hidden ? 0 : $('#navHud').getBoundingClientRect().height;
  return { top: Math.round(h * 0.42) + hud, bottom: 24, left: navLeftPad(), right: 24 };
}
/* On a phone the chrome is above and below the map, so only the desktop rail and
 * panel steal horizontal room. */
function navLeftPad() {
  if (isPhone()) return 16;
  return Math.round($('#rail').getBoundingClientRect().width
                  + $('#panel').getBoundingClientRect().width + 24);
}

function navCamera(opts = {}) {
  if (!NAV.on || !NAV.follow || !NAV.pos) return;
  const snapB = NAV.heading != null ? NAV.heading : (navSnap(NAV.pos) || {}).bearing;
  map.easeTo({
    center: NAV.pos,
    zoom: Math.max(map.getZoom(), 16.4),
    pitch: $('#btn3d').getAttribute('aria-pressed') === 'true' ? 58 : 0,
    bearing: NAV.headingUp && snapB != null ? snapB : 0,
    padding: navPadding(),
    duration: opts.snap ? 0 : 900,
    easing: t => t,                 // linear: a follow camera must not ease-out into a stutter
  });
}

/* Manual pan, zoom or rotate hands the camera back to the driver. We only react
 * to gestures with an originalEvent — our own easeTo fires the same events. */
function navWatchManual() {
  for (const ev of ['dragstart', 'rotatestart', 'pitchstart', 'zoomstart']) {
    map.on(ev, e => {
      if (!NAV.on || !NAV.follow || !e.originalEvent) return;
      navSetFollow(false);
    });
  }
}

function navSetFollow(on) {
  NAV.follow = on;
  NAV.pausedAt = on ? 0 : Date.now();
  navRenderHud();
  if (on) navCamera();
}

/* ---------------- rotation controls ---------------------------------------- */

function navRotate(delta) {
  if (NAV.on && NAV.follow) navSetFollow(false);   // turning the map is exploring
  map.easeTo({ bearing: map.getBearing() + delta, duration: 300 });
}
function navNorthUp() {
  NAV.headingUp = false;
  map.easeTo({ bearing: 0, duration: 400 });
  navRenderHud();
}

/* ---------------- start / stop ---------------------------------------------- */

function navOverview() {
  if (NAV.on) navEnd();
  fitRoute();
}

function navStart() {
  navBuildPath();
  if (NAV.path.length < 2) { toast(T('navNoGeom')); return; }
  NAV.on = true; NAV.follow = true; NAV.headingUp = true;
  document.body.classList.add('navigating');
  if (isPhone()) setDrawer(false);                 // the road and the next turn come first
  // Prefer a real fix; otherwise start the labelled replay so the view is never empty.
  if (gps.coords) { navSetPos(gps.coords, gps.heading, 'gps'); }
  else { navReplayStart(); }
  navCamera({ snap: true });
  navRenderHud();
}

function navEnd() {
  NAV.on = false;
  navReplayStop();
  document.body.classList.remove('navigating');
  if (NAV.marker) { NAV.marker.remove(); NAV.marker = null; }
  navRenderHud();
}

/* ---------------- position in, HUD out ------------------------------------- */

function navSetPos(pos, heading, tier) {
  NAV.pos = pos; NAV.posTier = tier;
  const s = navSnap(pos);
  if (s) {
    NAV.i = s.i; NAV.travelled = s.travelled;
    // A reliable GPS heading is heading-up; otherwise face the road we are on.
    NAV.heading = Number.isFinite(heading) ? heading : s.bearing;
  } else if (Number.isFinite(heading)) NAV.heading = heading;
  navMarker();
  navCamera();
  navRenderHud();
}

function navMarker() {
  if (!NAV.on || !NAV.pos) return;
  if (!NAV.marker) {
    const el = document.createElement('div');
    el.className = 'truck';
    el.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22"><path d="M12 2l7 18-7-4-7 4 7-18z" fill="#fff"/></svg>';
    NAV.marker = new maplibregl.Marker({ element: el, rotationAlignment: 'map' }).setLngLat(NAV.pos).addTo(map);
  } else NAV.marker.setLngLat(NAV.pos);
  NAV.marker.setRotation(NAV.heading || 0);
}

/* GPS freshness. A fix nobody has refreshed for half a minute is not a position
 * a driver should steer by, and the HUD must say which it is showing. */
function navFixState() {
  if (gps.err) return gps.err === 'denied' ? 'denied' : 'unavailable';
  if (NAV.posTier === 'replay') return 'replay';
  if (!gps.coords) return 'none';
  const age = (Date.now() - gps.at) / 1000;
  if (age > 30) return 'stale';
  if (gps.accuracy > 25) return 'coarse';
  return 'live';
}

const NAV_ARROW = {
  'straight': 'M12 21V5M12 5l-5 5M12 5l5 5',
  'left': 'M19 20V11a4 4 0 00-4-4H6M6 7l5-5M6 7l5 5',
  'right': 'M5 20v-9a4 4 0 014-4h9M18 7l-5-5M18 7l-5 5',
  'slight-left': 'M17 21v-7a6 6 0 00-2-4.4L9 5M9 5h5M9 5v5',
  'slight-right': 'M7 21v-7a6 6 0 012-4.4L15 5M15 5h-5M15 5v5',
  'sharp-left': 'M19 21v-8a5 5 0 00-5-5H8M8 8l4-4M8 8l4 4',
  'sharp-right': 'M5 21v-8a5 5 0 015-5h6M16 8l-4-4M16 8l-4 4',
  // no arrow we could draw would be honest about a turn we cannot name
  'unknown': 'M12 3v13M12 20v1M9 13l3 3 3-3',
  'arrive': 'M12 21s7-7.6 7-12a7 7 0 10-14 0c0 4.4 7 12 7 12z',
};

function navRenderHud() {
  const hud = $('#navHud');
  if (!hud) return;
  hud.hidden = !NAV.on;
  $('#navBar').hidden = !NAV.on;
  // the Start/End label has to flip even on the way out of navigation
  $('#btnStartNav').innerHTML = `<span>${NAV.on ? T('endNav') : T('startNav')}</span>`;
  if (!NAV.on) return;

  const m = navNext(), eta = navEta(), fix = navFixState();
  const dist = m ? Math.max(0, Math.round(m.at - NAV.travelled)) : 0;
  const distTxt = dist >= 1000 ? (dist / 1000).toFixed(dist < 10000 ? 1 : 0) + ' km' : dist + ' m';
  const road = m && m.road ? m.road : T('navGate');
  $('#navTurn').innerHTML =
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1"
      stroke-linecap="round" stroke-linejoin="round"><path d="${NAV_ARROW[m ? m.turn : 'straight']}"/></svg>`;
  $('#navDist').textContent = distTxt;
  $('#navRoad').textContent = !m || m.turn === 'arrive' ? T('navArrive')
    : m.turn === 'unknown' ? T('navFollow').replace('{road}', road)
    : T('navThen').replace('{road}', road);
  $('#navEta').innerHTML = eta
    ? `<b>${eta.at}</b><span>${T('navEtaLab').replace('{n}', eta.mins)}</span>`
    : `<b>—</b><span>${T('navEtaNone')}</span>`;

  // One line that says exactly which position the view is following, plus a
  // preview badge when part of the line is a straight-line stand-in.
  const fixCls = fix === 'live' ? 'ok' : ['denied', 'unavailable', 'none'].includes(fix) ? 'bad' : 'warn';
  const approx = NAV.approxM > 0;
  $('#navFix').className = 'navFix ' + (approx ? 'bad' : fixCls);
  $('#navFix').textContent = approx
    ? `${T('navPreview')} (${(NAV.approxM / 1000).toFixed(1)} km) · ${T('fix_' + fix)}`
    : T('fix_' + fix);

  $('#navResume').hidden = NAV.follow;
  // Only offered while the replay is driving: on a real fix there is nothing to
  // skip, and nothing in the app may move a real truck's position.
  $('#navSkip').hidden = NAV.posTier !== 'replay';
  $('#navHeadingUp').setAttribute('aria-pressed', String(NAV.headingUp));
  $('#navHeadingUp').textContent = NAV.headingUp ? T('navHeadingUp') : T('navNorthUp');
}

/* Heading-up only when the fix is good enough to trust a heading; otherwise the
 * driver gets north-up and a label saying why. */
function navToggleHeading() {
  NAV.headingUp = !NAV.headingUp;
  if (NAV.headingUp && ['denied', 'unavailable', 'none'].includes(navFixState())) {
    NAV.headingUp = false; toast(T('navNoHeading'));
  }
  if (!NAV.follow) navSetFollow(true); else navCamera();
  navRenderHud();
}

/* ---------------- the replay (clearly labelled, no network) ----------------- */

function navReplayStart() {
  navReplayStop();
  navBuildPath();
  const kmh = navKmh();
  if (!kmh || NAV.path.length < 2) { toast(T('navNoGeom')); return; }
  NAV.travelled = 0; NAV.i = 0; NAV.replayT = 0;
  const mPerSec = kmh * 1000 / 3600 * REPLAY_X;
  NAV.replay = setInterval(() => {
    NAV.replayT += 1;
    NAV.travelled = Math.min(NAV.cum[NAV.cum.length - 1], NAV.travelled + mPerSec);
    const p = navPointAt(NAV.travelled);
    if (!p) return;
    navSetPos(p.pos, p.bearing, 'replay');
    if (NAV.travelled >= NAV.cum[NAV.cum.length - 1] - 1) { navReplayStop(); toast(T('navArrive')); }
  }, 1000);
  const p0 = navPointAt(0);
  if (p0) navSetPos(p0.pos, p0.bearing, 'replay');
}
/* Jump the replay to 250 m before the next maneuver. The first turn on the
 * Hiệp Phước plan is 7.7 km in, which at any believable speed is longer than the
 * whole talk. Replay-only: it moves a simulated position, never a real one. */
function navSkipToTurn() {
  if (NAV.posTier !== 'replay') return;
  const m = navNext();
  if (!m) return;
  NAV.travelled = Math.max(0, m.at - 250);
  NAV.i = 0;                                   // let navSnap re-find us on the line
  const p = navPointAt(NAV.travelled);
  if (p) { navSetFollow(true); navSetPos(p.pos, p.bearing, 'replay'); }
}

function navReplayStop() {
  if (NAV.replay) clearInterval(NAV.replay);
  NAV.replay = null;
  if (NAV.posTier === 'replay') NAV.posTier = 'none';
}

/* Interpolate a position `m` metres along the stitched line. */
function navPointAt(m) {
  const { path, cum } = NAV;
  if (path.length < 2) return null;
  let i = 0;
  while (i < path.length - 2 && cum[i + 1] < m) i++;
  const seg = cum[i + 1] - cum[i] || 1;
  const t = Math.max(0, Math.min(1, (m - cum[i]) / seg));
  const a = path[i], b = path[i + 1];
  return { pos: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], bearing: bearingTo(a, b) };
}

/* ---------------- truck parking + rest stops -------------------------------- */

const PARK = {
  doc: null, scope: 'near', open: false, err: null,
  rest: null,                 // { stop, detourMin, restMin } — the driver's own plan
};

async function parkLoad() {
  if (PARK.doc || PARK.err === 'loading') return PARK.doc;
  PARK.err = 'loading';
  try {
    PARK.doc = await (await fetch('/api/truck-parking')).json();
    PARK.err = null;
  } catch { PARK.err = 'offline'; }
  parkRender();
  return PARK.doc;
}

/* Rank by what it costs the driver: time to reach the lot plus the extra time it
 * adds to the gate run. Both measured off the same geometry and the engine's
 * speed for this option — nothing here is tuned. */
function parkRanked() {
  const doc = PARK.doc;
  if (!doc) return [];
  const kmh = navKmh() || 0;
  const from = NAV.pos || (gps.coords || (() => {
    const o = ORIGINS.find(x => x.id === originId);
    return o ? [o.lon, o.lat] : null;
  })());
  const gate = [GATE.lon, GATE.lat];
  const direct = from ? mDist(from, gate) : 0;
  const rows = doc.stops
    .filter(s => s.scope === PARK.scope || (PARK.scope === 'far' && s.scope === 'near'))
    .map(s => {
      const at = [s.lon, s.lat];
      const legOut = from ? mDist(from, at) : 0;
      const legOn = mDist(at, gate);
      const detourM = Math.max(0, legOut + legOn - direct);
      return {
        ...s,
        toStopMin: kmh ? Math.round(legOut / 1000 / kmh * 60) : null,
        detourMin: kmh ? Math.round(detourM / 1000 / kmh * 60) : null,
        detourKm: +(detourM / 1000).toFixed(1),
      };
    });
  // Eligible = a human confirmed a truck can get in. Everything else is listed
  // separately as excluded, with the reason, so the driver can question it.
  const eligible = rows.filter(r => r.truck_access === 'verified')
    .sort((a, b) => (a.toStopMin ?? 1e9) - (b.toStopMin ?? 1e9) || a.detourKm - b.detourKm);
  const excluded = rows.filter(r => r.truck_access !== 'verified')
    .sort((a, b) => a.km_to_gate - b.km_to_gate);
  return [eligible, excluded];
}

function parkRender() {
  const box = $('#parkBox');
  if (!box) return;
  if (!PARK.open) {
    box.innerHTML = `<button class="ghost" id="parkOpen" type="button">${T('parkOpen')}</button>`;
    $('#parkOpen').onclick = () => { PARK.open = true; parkRender(); parkLoad(); };
    return;
  }
  if (!PARK.doc) {
    box.innerHTML = `<div class="kicker">${T('parkTitle')}</div>
      <div class="note">${PARK.err === 'offline' ? T('parkOffline') : T('parkLoading')}</div>`;
    return;
  }
  const [eligible, excluded] = parkRanked();
  const avoid = PARK.doc.avoid || [];
  const yn = v => v === 'yes' ? T('ynYes') : v === 'no' ? T('ynNo') : v === 'likely' ? T('ynLikely') : T('ynUnknown');

  const card = s => `<div class="pk">
    <div class="pkHead">
      <span class="pkName">${esc(s.name || s.name_en || T('parkUnnamed'))}
        <small>${s.km_to_gate} km ${T('parkToGate')}${s.toStopMin != null ? ` · ${T('parkReach').replace('{n}', s.toStopMin)}` : ''}</small></span>
      <span class="rank ok">${T('parkVerified')}</span>
    </div>
    <div class="pkFacts">
      <span>${T('parkDetour')}: <b>${s.detourMin != null ? '+' + s.detourMin + '′' : '—'}</b> (${s.detourKm} km)</span>
      <span>${T('parkHours')}: <b>${s.hours || T('parkHours247')}</b></span>
      <span>${T('parkFee')}: <b>${s.fee === 'yes' ? T('ynYes') : s.fee === 'no' ? T('ynNo') : T('ynUnknown')}</b></span>
      <span>${T('parkToilets')}: <b>${yn(s.toilets)}</b></span>
      <span>${T('parkRestShort')}: <b>${yn(s.short_rest)}</b></span>
      <span>${T('parkOvernight')}: <b>${yn(s.overnight)}</b></span>
    </div>
    ${s.caveat ? `<div class="pkWarn">${esc(s.caveat)}</div>` : ''}
    <div class="pkSrc">${T('parkSrc')}: ${parkSrcLinks(s.source)} · ${T('parkVerifiedOn')} ${s.verified_on || '—'}</div>
    <div class="pActs">
      <button type="button" class="yes" data-rest="${esc(s.id)}">${T('parkAddRest')}</button>
      <button type="button" data-report="${esc(s.id)}" data-kind="full">${T('park_full')}</button>
      <button type="button" data-report="${esc(s.id)}" data-kind="closed">${T('park_closed')}</button>
      <button type="button" data-report="${esc(s.id)}" data-kind="inaccessible">${T('park_inaccessible')}</button>
    </div>
  </div>`;

  const exRow = s => `<div class="pk ex">
    <div class="pkHead">
      <span class="pkName">${esc(s.name || s.name_en || T('parkUnnamed'))}
        <small>${s.km_to_gate} km ${T('parkToGate')}</small></span>
      <span class="rank blocked">${T('parkExcluded')}</span>
    </div>
    <div class="pkWhy">${esc(s.truck_access_why)}</div>
    <div class="pkSrc">${T('parkSrc')}: ${parkSrcLinks(s.source)}</div>
  </div>`;

  box.innerHTML = `
    <div class="kicker">${T('parkTitle')}</div>
    <p class="ps">${T('parkSub')}</p>
    <div class="seg" id="parkScope">
      <button type="button" data-scope="near" aria-pressed="${PARK.scope === 'near'}">${T('parkNear')}</button>
      <button type="button" data-scope="far" aria-pressed="${PARK.scope === 'far'}">${T('parkFar')}</button>
    </div>
    ${eligible.length
      ? eligible.map(card).join('')
      : `<div class="pkNone">${T('parkNone')}</div>
         ${PARK.scope === 'near' ? `<button class="ghost" id="parkFarther" type="button">${T('parkFarther')}</button>` : ''}`}
    ${PARK.rest ? parkRestPanel() : ''}
    ${avoid.length ? `<div class="kicker" style="margin-top:16px">${T('parkAvoid')}</div>`
      + avoid.map(a => `<div class="pk ex">
          <div class="pkHead"><span class="pkName">${esc(a.name)}<small>${esc(a.name_en)}</small></span>
            <span class="rank bad">${T('parkDoNot')}</span></div>
          <div class="pkWhy">${esc(a.truck_access_why)}</div>
          <div class="pkSrc">${T('parkSrc')}: ${parkSrcLinks(a.source)}</div></div>`).join('') : ''}
    <details style="margin-top:12px"><summary>${T('parkExTitle').replace('{n}', excluded.length)}</summary>
      <div class="note">${T('parkExNote')}</div>${excluded.map(exRow).join('')}</details>
    <div class="note">${esc(PARK.doc.note)}</div>
    <div class="note">${T('parkFetched')}: ${PARK.doc.fetched_on} · ${esc(PARK.doc.source)}</div>`;

  $('#parkScope').querySelectorAll('button').forEach(b => b.onclick = () => {
    PARK.scope = b.dataset.scope; parkRender();
  });
  const farther = $('#parkFarther');
  if (farther) farther.onclick = () => { PARK.scope = 'far'; parkRender(); };
  box.querySelectorAll('[data-rest]').forEach(b => b.onclick = () => parkAskRest(b.dataset.rest));
  box.querySelectorAll('[data-report]').forEach(b =>
    b.onclick = () => parkReport(b.dataset.report, b.dataset.kind));
  const rm = $('#restMin');
  if (rm) {
    rm.onchange = () => parkSetRest(PARK.rest.stop, +rm.value || 0);
    $('#restClear').onclick = () => { PARK.rest = null; parkRender(); renderAnswer(); };
  }
}

/* Sources are shown as links, not as a bare "verified" claim. */
function parkSrcLinks(src) {
  return String(src || '').split(';').map(s => s.trim()).filter(Boolean).map(s =>
    /^https?:\/\//.test(s)
      ? `<a href="${esc(s)}" target="_blank" rel="noopener">${esc(s.replace(/^https?:\/\/(www\.)?/, '').slice(0, 38))}…</a>`
      : esc(s)).join(' · ');
}

function parkAskRest(id) {
  const [eligible, excluded] = parkRanked();
  const stop = eligible.concat(excluded).find(s => s.id === id);
  if (stop) parkSetRest(stop, 30);                 // 30 min = the default a driver edits, not a claim
}

/* The driver's rest plan. The gate and warehouse ETAs move by the detour plus
 * the rest; the destination, the slot and the dispatcher's plan do not change. */
function parkSetRest(stop, restMin) {
  PARK.rest = { stop, detourMin: stop.detourMin || 0,
                restMin: Math.max(0, Math.min(11 * 60, restMin)) };
  parkRender();
  renderAnswer();
}

function parkRestPanel() {
  const { stop, detourMin, restMin } = PARK.rest;
  const shift = detourMin + restMin;
  const gate = best ? best.gateMin : null;
  const wh = parkWarehouseMin();
  return `<div class="pkRest">
    <div class="kicker">${T('restTitle')}</div>
    <div class="note">${esc(stop.name || stop.name_en || T('parkUnnamed'))}</div>
    <label class="lab" for="restMin">${T('restMinLab')}</label>
    <input id="restMin" type="number" min="0" max="660" step="5" value="${restMin}">
    <table class="costs">
      <tr><td>${T('restDetour')}</td><td>+${detourMin}′</td></tr>
      <tr><td>${T('restRest')}</td><td>+${restMin}′</td></tr>
      <tr><td><b>${T('restGate')}</b></td><td>${gate != null ? `${fmt(gate)} → <b>${fmt(gate + shift)}</b>` : '—'}</td></tr>
      <tr><td><b>${T('restWh')}</b></td><td>${wh != null ? `${fmt(wh)} → <b>${fmt(wh + shift)}</b>` : '—'}</td></tr>
      ${wh != null && parkWindowClose() != null && wh + shift > parkWindowClose()
        ? `<tr class="unbilled"><td colspan="2">${T('restLate').replace('{n}', Math.round(wh + shift - parkWindowClose()))}</td></tr>`
        : ''}
    </table>
    <div class="note">${T('restNote')}</div>
    <button class="ghost" id="restClear" type="button">${T('restClear')}</button>
  </div>`;
}

/* Warehouse arrival and window for my truck. Picks the same allocator row the
 * fleet card is showing, so a rest stop is measured against the appointment the
 * driver can actually see rather than a different plan. */
function parkMyRow() {
  try {
    const d = fleetDay(), row = p => p.ev.rows.find(r => r.id === myTruck);
    const live = SH.step === 4 && SH.approved;
    return (live ? row(d.replan) : SH.step >= 3 ? row(d.stale) : row(d.normal)) || null;
  } catch { return null; }
}
const parkWarehouseMin = () => { const r = parkMyRow(); return r ? r.whArrive : null; };
const parkWindowClose = () => { const r = parkMyRow(); return r && r.win ? r.win[1] : null; };

/* A lot report is an ordinary driver update: same feed, same server timestamp,
 * same corroboration rules. No private parking channel to maintain. */
async function parkReport(id, kind) {
  const stop = (PARK.doc.stops || []).find(s => s.id === id);
  if (!stop || !['full', 'closed', 'inaccessible'].includes(kind)) return;
  const name = stop.name || stop.name_en || stop.id;
  try {
    const r = await fetch('/api/posts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ who: whoAmI, cat: 'parking', road: '', lang, corridor: destId,
        text: `${T('park_' + kind)} — ${name} (${stop.km_to_gate} km ${T('parkToGate')})` }),
    });
    const j = await r.json();
    if (!r.ok) { toast(T('sendFail')); return; }
    FEED = { ...j, offline: false };
    renderFeed(); toast(T('posted'));
  } catch { toast(T('sendFail')); }
}

/* ---------------- strings --------------------------------------------------- */

const NAV_STR = {
  // camera / rotation
  rotL: { vi: 'Quay trái', en: 'Rotate left' },
  rotR: { vi: 'Quay phải', en: 'Rotate right' },
  north: { vi: 'Về hướng bắc', en: 'Reset north' },
  overview: { vi: 'Toàn tuyến', en: 'Route overview' },
  startNav: { vi: 'Bắt đầu dẫn đường', en: 'Start navigation' },
  endNav: { vi: 'Kết thúc', en: 'End' },
  // HUD
  navThen: { vi: 'vào {road}', en: 'onto {road}' },
  navFollow: { vi: 'theo {road} (không xác định được hướng rẽ)',
               en: 'follow {road} (turn direction not determined)' },
  navSkip: { vi: 'Tới khúc rẽ (mô phỏng)', en: 'Skip to turn (replay)' },
  navGate: { vi: 'Cổng Cát Lái', en: 'Cát Lái gate' },
  navArrive: { vi: 'Tới cổng', en: 'Arrive at the gate' },
  navEtaLab: { vi: 'còn {n} phút (EST)', en: '{n} min left (EST)' },
  navEtaNone: { vi: 'chưa tính được', en: 'not computed' },
  navHeadingUp: { vi: 'Theo hướng xe', en: 'Heading-up' },
  navNorthUp: { vi: 'Hướng bắc', en: 'North-up' },
  navNoHeading: { vi: 'Không có hướng GPS tin cậy — giữ hướng bắc.', en: 'No reliable GPS heading — staying north-up.' },
  navResume: { vi: 'Tiếp tục theo xe', en: 'Resume following' },
  navNoGeom: { vi: 'Tuyến này chưa có hình học đã kiểm chứng để dẫn đường.',
               en: 'This route has no verified geometry to navigate on.' },
  // which position the view is following
  fix_live: { vi: 'GPS trực tiếp', en: 'Live GPS' },
  fix_coarse: { vi: 'GPS thô — không chắc đúng làn', en: 'Coarse GPS — carriageway not certain' },
  fix_stale: { vi: 'GPS cũ hơn 30 giây', en: 'GPS older than 30 s' },
  fix_denied: { vi: 'GPS bị từ chối — bật quyền vị trí', en: 'GPS denied — allow location' },
  fix_unavailable: { vi: 'Không có GPS', en: 'No GPS signal' },
  fix_none: { vi: 'Chưa bật GPS', en: 'GPS not started' },
  fix_replay: { vi: 'MÔ PHỎNG — phát lại trên hình học OSM, không phải GPS thật',
                en: 'SIMULATED — replay on OSM geometry, not a real fix' },
  navPreview: { vi: 'XEM TRƯỚC — tuyến gần đúng, chưa đủ để dẫn đường từng khúc',
                en: 'PREVIEW — approximate route, not street-level guidance' },
  // parking
  parkOpen: { vi: 'Bãi đỗ xe tải / Truck parking', en: 'Truck parking / Bãi đỗ xe tải' },
  parkTitle: { vi: 'Bãi đỗ xe tải', en: 'Truck parking' },
  parkSub: { vi: 'Chỉ gợi ý nơi đã có người xác nhận xe tải vào được. Nơi chưa xác nhận được liệt kê riêng kèm lý do.',
             en: 'Only places a human confirmed a truck can enter are recommended. Unconfirmed ones are listed separately with the reason.' },
  parkNear: { vi: 'Gần xe', en: 'Near the truck' },
  parkFar: { vi: 'Xa hơn phía trước', en: 'Farther ahead' },
  parkNone: { vi: 'Không có bãi đỗ xe tải đã xác nhận ở gần.', en: 'No verified truck parking nearby.' },
  parkFarther: { vi: 'Tìm xa hơn phía trước', en: 'Search farther ahead' },
  parkVerified: { vi: 'Đã xác nhận', en: 'Verified' },
  parkExcluded: { vi: 'Chưa xác nhận', en: 'Unverified' },
  parkDoNot: { vi: 'Không đỗ', en: 'Do not park' },
  parkAvoid: { vi: 'Nơi tài xế hay đỗ nhưng bị cấm', en: 'Where drivers stop but may not' },
  parkToGate: { vi: 'tới cổng', en: 'to the gate' },
  parkReach: { vi: 'tới bãi ~{n}′', en: '~{n}′ to the lot' },
  parkDetour: { vi: 'Đi thêm', en: 'Added detour' },
  parkHours: { vi: 'Giờ', en: 'Hours' },
  parkHours247: { vi: 'không rõ', en: 'not published' },
  parkFee: { vi: 'Phí', en: 'Fee' },
  parkToilets: { vi: 'Nhà vệ sinh', en: 'Toilets' },
  parkRestShort: { vi: 'Nghỉ ngắn', en: 'Short rest' },
  parkOvernight: { vi: 'Qua đêm', en: 'Overnight' },
  parkSrc: { vi: 'Nguồn', en: 'Source' },
  parkVerifiedOn: { vi: 'kiểm chứng', en: 'verified' },
  parkFetched: { vi: 'Lấy dữ liệu', en: 'Fetched' },
  parkUnnamed: { vi: 'Bãi không tên', en: 'Unnamed lot' },
  parkAddRest: { vi: 'Thêm điểm nghỉ', en: 'Add rest stop' },
  park_full: { vi: 'Bãi đã đầy', en: 'Lot is full' },
  park_closed: { vi: 'Bãi đã đóng', en: 'Lot is closed' },
  park_inaccessible: { vi: 'Xe tải không vào được', en: 'A truck cannot get in' },
  parkExTitle: { vi: 'Đã loại {n} nơi — xem lý do', en: '{n} places excluded — see why' },
  parkExNote: { vi: 'OpenStreetMap không ghi thẻ xe tải cho các bãi này, nên không được gợi ý.',
                en: 'OpenStreetMap carries no truck-access tag for these, so they are not recommended.' },
  parkLoading: { vi: 'Đang tải…', en: 'Loading…' },
  parkOffline: { vi: 'Không tải được danh sách bãi đỗ.', en: 'Could not load the parking list.' },
  ynYes: { vi: 'Có', en: 'Yes' }, ynNo: { vi: 'Không', en: 'No' },
  ynLikely: { vi: 'Có thể', en: 'Likely' }, ynUnknown: { vi: 'Không rõ', en: 'Unknown' },
  // rest stop
  restTitle: { vi: 'Điểm nghỉ đã thêm', en: 'Rest stop added' },
  restMinLab: { vi: 'Nghỉ bao nhiêu phút?', en: 'Rest for how many minutes?' },
  restDetour: { vi: 'Đi thêm (vòng qua bãi)', en: 'Detour to the lot' },
  restRest: { vi: 'Thời gian nghỉ', en: 'Rest time' },
  restGate: { vi: 'Vào cổng', en: 'Gate' },
  restWh: { vi: 'Tới kho', en: 'At the warehouse' },
  restLate: { vi: 'Trễ giờ kho {n} phút — hỏi nhà xe trước khi nghỉ.',
              en: '{n} min past the warehouse window — clear it with the dispatcher first.' },
  restNote: { vi: 'Điểm đến và khung giờ cổng không đổi. Chỉ hai mốc giờ trên dịch đi.',
              en: 'The destination and the gate slot do not change. Only the two arrival times move.' },
  restClear: { vi: 'Bỏ điểm nghỉ', en: 'Remove rest stop' },
};

/* ---------------- wiring ---------------------------------------------------- */

const isPhone = () => window.matchMedia('(max-width:700px)').matches;

function navInit() {
  Object.assign(STR, NAV_STR);
  // Ctrl-drag rotation: MapLibre binds only the right button by default, and a
  // laptop trackpad has no comfortable right-drag.
  map.dragRotate.enable();
  map.touchZoomRotate.enableRotation();
  navCtrlDrag(map.getCanvasContainer());
  navWatchManual();
  map.on('rotate', () => { if (typeof syncCompass === 'function') syncCompass(); });

  $('#btnRotL').onclick = () => navRotate(-30);
  $('#btnRotR').onclick = () => navRotate(30);
  $('#btnNorth').onclick = navNorthUp;
  $('#btnOverview').onclick = navOverview;
  $('#btnStartNav').onclick = () => NAV.on ? navEnd() : navStart();
  $('#navResume').onclick = () => navSetFollow(true);
  $('#navHeadingUp').onclick = navToggleHeading;
  $('#navSkip').onclick = navSkipToTurn;
  $('#navEndBtn').onclick = navEnd;
  navCtrlLabels();
  parkRender();
  navRenderHud();
}

/* Ctrl+left-drag rotates, for trackpads with no right button. MapLibre's own
 * handler ignores ctrl, so the gesture is driven straight at the camera. */
function navCtrlDrag(el) {
  let from = null, b0 = 0;
  el.addEventListener('mousedown', e => {
    if (!e.ctrlKey || e.button !== 0) return;
    from = e.clientX; b0 = map.getBearing(); e.preventDefault();
  });
  window.addEventListener('mousemove', e => {
    if (from == null) return;
    map.setBearing(b0 + (e.clientX - from) * 0.4);      // 0.4°/px: same feel as right-drag
    if (NAV.on && NAV.follow) navSetFollow(false);
  });
  window.addEventListener('mouseup', () => { from = null; });
}

function navCtrlLabels() {
  for (const [id, key] of [['#btnRotL', 'rotL'], ['#btnRotR', 'rotR'], ['#btnNorth', 'north'],
                           ['#btnOverview', 'overview']]) {
    const el = $(id);
    if (!el) continue;
    el.title = T(key); el.setAttribute('aria-label', T(key));
  }
  const s = $('#btnStartNav');
  if (s) s.innerHTML = `<span>${NAV.on ? T('endNav') : T('startNav')}</span>`;
  const o = $('#btnOverviewLab');
  if (o) o.textContent = T('overview');
  for (const [id, key] of [['#navResume', 'navResume'], ['#navSkip', 'navSkip'],
                           ['#navEndBtn', 'endNav']]) {
    const el = $(id);
    if (el) el.textContent = T(key);
  }
}

/* Called whenever the drawn route changes, so maneuvers follow the new plan and
 * a driver mid-navigation is re-snapped rather than left on the old line. */
function navOnRoute() {
  if (!NAV.path.length && !NAV.on) return;
  navBuildPath();
  if (NAV.on && NAV.pos) navSetPos(NAV.pos, NAV.heading, NAV.posTier);
  navRenderHud();
}
