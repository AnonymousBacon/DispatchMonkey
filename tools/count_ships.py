#!/usr/bin/env python3
"""Count ships near Cát Lái in Sentinel-1 radar crops (VV, rescale 0..0.4 → 0..255).

Classic, explainable method (no deep learning):
  1. water mask  = pixels whose 25x25 neighbourhood MEDIAN-ish brightness is dark
                   (box mean of a "dark pixel" indicator > 0.6 → mostly water around it)
  2. ship pixels = very bright pixels (≥ 230) inside the water mask
  3. ships       = connected blobs of ship pixels with ≥ MIN_PX pixels
Writes static/vn/ships.json (history + latest + a small forecast) and an overlay PNG.

Run: python3 tools/count_ships.py            (all images in data/satellite/history)
     python3 tools/count_ships.py one.png    (count one image, print, write overlay)
"""
import json, sys, re, datetime as dt
from pathlib import Path
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
HIST = ROOT / "data/satellite/history"
OUT = ROOT / "static/vn"
DARK, BRIGHT, WIN, WATER_SHARE, MIN_PX, MERGE = 60, 230, 25, 0.8, 10, 3


def box_mean(a, k):
    """Mean over a k x k window using an integral image (no scipy)."""
    p = k // 2
    pad = np.pad(a.astype(np.float64), p, mode="edge")
    c = pad.cumsum(0).cumsum(1)
    c = np.pad(c, ((1, 0), (1, 0)))
    s = c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]
    return s[: a.shape[0], : a.shape[1]] / (k * k)


def blobs(mask):
    """Connected components (8-neighbour) by flood fill over the few bright pixels."""
    seen = np.zeros_like(mask, bool)
    out = []
    H, W = mask.shape
    for y, x in zip(*np.nonzero(mask)):
        if seen[y, x]:
            continue
        stack, px = [(y, x)], []
        seen[y, x] = True
        while stack:
            cy, cx = stack.pop()
            px.append((cy, cx))
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < H and 0 <= nx < W and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        stack.append((ny, nx))
        out.append(px)
    return out


def count(path, overlay=None):
    im = Image.open(path)
    a = np.array(im.convert("LA"))
    v, alpha = a[..., 0].astype(np.int32), a[..., 1]
    valid = alpha > 0
    if valid.mean() < 0.8:                       # partial swath: not comparable, skip
        return None
    water = (box_mean((v < DARK) & valid, WIN) > WATER_SHARE) & valid
    if water.mean() < 0.05:
        return None
    bright = (v >= BRIGHT) & water
    # merge pieces of one ship (radar sidelobes split it): dilate by MERGE px, label, then count real pixels
    grown = box_mean(bright, 2 * MERGE + 1) > 0
    ships = []
    for b in blobs(grown):
        ys, xs = zip(*b)
        if int(bright[list(ys), list(xs)].sum()) >= MIN_PX:
            ships.append(b)
    if overlay:
        rgb = np.stack([v, v, v], -1).clip(0, 255).astype(np.uint8)
        rgb[water & ~bright] = (rgb[water & ~bright] * 0.6 + np.array([0, 40, 90]) * 0.4).astype(np.uint8)
        for b in ships:
            ys, xs = zip(*b)
            y0, y1, x0, x1 = max(min(ys) - 4, 0), min(max(ys) + 4, v.shape[0] - 1), max(min(xs) - 4, 0), min(max(xs) + 4, v.shape[1] - 1)
            rgb[y0:y1 + 1, [x0, x1]] = (255, 80, 80)
            rgb[[y0, y1], x0:x1 + 1] = (255, 80, 80)
        Image.fromarray(rgb).save(overlay)
    return {"ships": len(ships), "water_share": round(float(water.mean()), 3)}


def fit_forecast(hist):
    """Tiny linear model: next-pass ships ~ a + b·ships(previous pass) + c·rain_mm(day before).
    Backtest on the last 25% of passes (time-ordered). Rain is optional (Open-Meteo archive)."""
    y = np.array([h["ships"] for h in hist], float)
    if len(y) < 12:
        return None
    X = np.column_stack([np.ones(len(y) - 1), y[:-1]])
    t = y[1:]
    cut = int(len(t) * 0.75)
    coef, *_ = np.linalg.lstsq(X[:cut], t[:cut], rcond=None)
    pred = X[cut:] @ coef
    mae = float(np.mean(np.abs(pred - t[cut:])))
    naive = float(np.mean(np.abs(t[cut:] - np.median(t[:cut]))))
    coef, *_ = np.linalg.lstsq(X, t, rcond=None)
    nxt = float(coef[0] + coef[1] * y[-1])
    return {"next": round(nxt), "mae": round(mae, 1), "baseline_mae": round(naive, 1),
            "method": f"linear: next = {coef[0]:.1f} + {coef[1]:.2f} × previous pass; trained on {cut} passes, tested on {len(t) - cut} later ones",
            "beats_baseline": mae < naive}


def main():
    if len(sys.argv) > 1:
        p = Path(sys.argv[1])
        print(count(p, overlay=OUT / "sat" / (p.stem + "_overlay.png")))
        return
    (OUT / "sat").mkdir(exist_ok=True)
    hist = []
    for f in sorted(HIST.glob("*.png")):
        m = re.search(r"_(\d{8}T\d{6})_", f.name)
        if not m:
            continue
        r = count(f)
        if r is None:
            continue
        when = dt.datetime.strptime(m.group(1), "%Y%m%dT%H%M%S")
        hist.append({"datetime": when.strftime("%Y-%m-%d %H:%M"), "date": when.strftime("%Y-%m-%d"),
                     "local": (when + dt.timedelta(hours=7)).strftime("%Y-%m-%d %H:%M"),
                     "pass": "morning (~05:40 HCMC)" if (when.hour + 7) % 24 < 12 else "evening (~18:00 HCMC)", **r, "file": f.name})
    hist.sort(key=lambda h: h["datetime"])
    latest = hist[-1]
    overlay = OUT / "sat" / "latest_overlay.png"
    count(HIST / latest["file"], overlay=overlay)
    out = {"source": "Sentinel-1 RTC VV, Microsoft Planetary Computer (sentinel-1-rtc), bbox 106.76,10.73,106.84,10.80",
           "method": f"water = 25×25 box share of dark pixels (<{DARK}) > {WATER_SHARE}; ship = bright (≥{BRIGHT}) blob ≥ {MIN_PX} px on water, pieces within {MERGE} px merged",
           "image": "sat/latest_overlay.png", "latest": latest,
           "median": int(np.median([h["ships"] for h in hist])), "history": hist,
           "forecast": fit_forecast(hist)}
    (OUT / "ships.json").write_text(json.dumps(out, indent=1, ensure_ascii=False))
    print(len(hist), "usable passes; latest", latest, "median", out["median"], "forecast", out["forecast"])


if __name__ == "__main__":
    main()
