/* Đúng Giờ — environment context helpers (air quality, weather, tide).
 * Pure functions over the Open-Meteo files in data/vn/ so node can test them.
 * No number is invented here: this only looks up and bands real readings. */

/* Index of the hourly row for `hour` on `day` (YYYY-MM-DD). If the dataset does
 * not cover that day (stale download), fall back to the same hour on the last
 * day it does cover, so the UI shows a real reading instead of a blank — the
 * caller gets the row's own timestamp back and must display it. */
function hourIndex(times, day, hour) {
  const hh = String(hour).padStart(2, '0');
  let i = times.indexOf(`${day}T${hh}:00`);
  if (i >= 0) return { i, time: times[i], stale: false };
  const lastDay = times.length ? times[times.length - 1].slice(0, 10) : '';
  i = times.indexOf(`${lastDay}T${hh}:00`);
  return i >= 0 ? { i, time: times[i], stale: true } : null;
}

/* band(v, okBelow, warnBelow) -> 'ok' (green) | 'warn' (yellow) | 'bad' (red) */
function band(v, okBelow, warnBelow) {
  if (v == null || !Number.isFinite(v)) return 'na';
  return v < okBelow ? 'ok' : v < warnBelow ? 'warn' : 'bad';
}

/* Colour-rank a set of options on one metric, lower = better.
 * Lowest value green, highest red, anything between yellow.
 * Equal values always get the same colour (never claim a tie is a win). */
function rankBand(values) {
  const uniq = [...new Set(values)].sort((a, b) => a - b);
  if (uniq.length < 2) return values.map(() => 'ok');
  const worst = uniq[uniq.length - 1];
  return values.map(v => (v === uniq[0] ? 'ok' : v === worst ? 'bad' : 'warn'));
}

if (typeof module !== 'undefined') module.exports = { hourIndex, band, rankBand };
