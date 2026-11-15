/* Đúng Giờ / DispatchMonkey — temperature and humidity along the planned route.
 *
 * Source: Open-Meteo Forecast API (CC BY 4.0, no key, no attribution header
 * required beyond crediting Open-Meteo, which the UI does). Everything here is
 * an OUTDOOR model estimate for a ~1 km grid cell. It is not a cabin
 * temperature and it is not lane-level: Open-Meteo snaps several of our
 * checkpoints to the same cell, which `dedupeCells` makes visible rather than
 * hiding behind four identical-looking readings.
 *
 * No number in this file reaches a driver without a time and a source beside it.
 * Pure functions only, so tools/test_vn.mjs can run them under node.
 */

/* Heat thresholds on apparent temperature (°C), from the US NWS heat index
 * table: 32 = caution, 39 = extreme caution, 41 = danger. A cab without working
 * air conditioning sits above the outdoor reading in traffic, so the limited-AC
 * driver is warned one band earlier. We do NOT model the cab offset — we only
 * move the threshold, because we have never measured a cab. */
const HEAT = { caution: 32, extreme: 39, danger: 41 };
const HEAT_LIMITED_AC = { caution: 29, extreme: 35, danger: 39 };

function heatBand(apparentC, limitedAc) {
  const t = limitedAc ? HEAT_LIMITED_AC : HEAT;
  if (!Number.isFinite(apparentC)) return 'unknown';
  if (apparentC >= t.danger) return 'bad';
  if (apparentC >= t.extreme) return 'warn';
  if (apparentC >= t.caution) return 'caution';
  return 'ok';
}

/* Evenly spaced checkpoints along the drawn route: origin, the stretches in
 * between, and the gate last. `n` includes both ends. */
function routeCheckpoints(feats, gate, n = 5) {
  const pts = feats.flatMap(f => f.geometry.coordinates);
  if (!pts.length) return gate ? [{ lon: gate.lon, lat: gate.lat, label: 'gate' }] : [];
  const out = [];
  const last = pts.length - 1;
  for (let i = 0; i < n - 1; i++) {
    const p = pts[Math.round(last * i / (n - 1))];
    out.push({ lon: p[0], lat: p[1], label: i === 0 ? 'origin' : 'enroute' });
  }
  // The gate is the point that matters most (it is where the queue idles), so it
  // is always sampled at its own coordinates rather than at the nearest shape point.
  out.push(gate ? { lon: gate.lon, lat: gate.lat, label: 'gate' }
                : { lon: pts[last][0], lat: pts[last][1], label: 'gate' });
  return out;
}

/* When the truck passes each checkpoint. Linear along the route between
 * departure and gate arrival; the gate checkpoint uses the END of the queue,
 * because that is how long the driver actually sits there. */
function passingTimes(checkpoints, departMin, gateMin, queueEndMin) {
  const n = checkpoints.length;
  return checkpoints.map((c, i) => {
    if (c.label === 'gate') return Math.round(queueEndMin != null ? queueEndMin : gateMin);
    return Math.round(departMin + (gateMin - departMin) * (i / (n - 1)));
  });
}

/* Open-Meteo returns one object per coordinate and silently snaps each to its
 * grid cell, so two checkpoints 3 km apart can come back identical. Group by
 * the coordinates the API echoed, not the ones we asked for. */
function dedupeCells(points) {
  const seen = new Map();
  for (const p of points) {
    const k = `${p.cellLat},${p.cellLon}`;
    if (!seen.has(k)) seen.set(k, []);
    seen.get(k).push(p);
  }
  return [...seen.values()];
}

/* The one line a driver reads at a glance: the worst point on the trip. */
function summarise(points, limitedAc) {
  const ok = points.filter(p => Number.isFinite(p.apparentC));
  if (!ok.length) return null;
  const worst = ok.reduce((a, b) => (b.apparentC > a.apparentC ? b : a));
  return {
    worst,
    band: heatBand(worst.apparentC, limitedAc),
    tempC: Math.round(ok.reduce((s, p) => s + p.tempC, 0) / ok.length * 10) / 10,
    rh: Math.round(ok.reduce((s, p) => s + p.rh, 0) / ok.length),
    cells: dedupeCells(ok).length,
    points: ok.length,
  };
}

/* Hour index for a passing time. Open-Meteo hourly arrays are local (we request
 * timezone=Asia/Ho_Chi_Minh), so a minute-of-day maps straight onto them once we
 * know which day row the series starts on. Returns null rather than guessing
 * when the time falls outside the series. */
function hourIndex(times, dayISO, minOfDay) {
  const h = String(Math.floor((minOfDay % 1440) / 60)).padStart(2, '0');
  const i = times.indexOf(`${dayISO}T${h}:00`);
  return i < 0 ? null : i;
}

if (typeof module !== 'undefined') module.exports = {
  HEAT, HEAT_LIMITED_AC, heatBand, routeCheckpoints, passingTimes,
  dedupeCells, summarise, hourIndex,
};
