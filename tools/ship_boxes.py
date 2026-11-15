#!/usr/bin/env python3
"""Georeference the ship detections that are already drawn on the committed overlay.

tools/count_ships.py detects vessels and draws each one as a 1-px red (255, 80, 80)
rectangle on static/vn/sat/latest_overlay.png, but it only writes the COUNT to
ships.json. The Sentinel-1 source scenes live in data/satellite/history/ and are not
in the repository, so the detector cannot be re-run here. The boxes themselves are,
however, still in the overlay, pixel-exact: this reads them back out and converts
each box centre to lon/lat using the fixed scene bbox from ships.json.

shortcut: recovers detections from the rendered overlay rather than from the detector.
Upgrade by having count_ships.py write the boxes straight into ships.json the next
time the history scenes are available (the loop over `ships` in count() already has
y0/y1/x0/x1 in hand).

Run: /tmp/dmvenv/bin/python3 tools/ship_boxes.py        # needs numpy + pillow
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "static" / "vn"
# Same bbox count_ships.py records in ships.json["source"].
BBOX = {"w": 106.76, "s": 10.73, "e": 106.84, "n": 10.80}
BOX_RGB = (255, 80, 80)


def red_mask(img):
    a = np.array(img.convert("RGB")).astype(np.int16)
    # The overlay is greyscale radar plus a blue water tint, so the box colour is
    # the only strongly red pixel in the image; an exact match is enough.
    return (np.abs(a - np.array(BOX_RGB)).sum(-1) <= 12)


def boxes(mask):
    """Bounding box of each 8-connected red component (one rectangle per vessel)."""
    seen = np.zeros_like(mask, bool)
    out = []
    H, W = mask.shape
    for y, x in zip(*np.nonzero(mask)):
        if seen[y, x]:
            continue
        stack, ys, xs = [(y, x)], [], []
        seen[y, x] = True
        while stack:
            cy, cx = stack.pop()
            ys.append(cy)
            xs.append(cx)
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < H and 0 <= nx < W and mask[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        stack.append((ny, nx))
        out.append((min(xs), min(ys), max(xs), max(ys)))
    return out


def to_lonlat(x0, y0, x1, y1, w, h):
    cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    return (BBOX["w"] + cx / w * (BBOX["e"] - BBOX["w"]),
            BBOX["n"] - cy / h * (BBOX["n"] - BBOX["s"]))


def extract(png, ships_json):
    im = Image.open(png)
    w, h = im.size
    bs = boxes(red_mask(im))
    ships = json.loads(Path(ships_json).read_text())
    latest = ships["latest"]
    vessels = []
    for x0, y0, x1, y1 in sorted(bs):
        lon, lat = to_lonlat(x0, y0, x1, y1, w, h)
        vessels.append({"lon": round(lon, 6), "lat": round(lat, 6),
                        "wPx": int(x1 - x0 + 1), "hPx": int(y1 - y0 + 1)})
    # Degrees → km at 10.76°N, so the UI can state a real coverage area.
    km2 = (BBOX["e"] - BBOX["w"]) * 109.2 * (BBOX["n"] - BBOX["s"]) * 111.3
    return {
        "source": ships["source"],
        "method": ships["method"] + "; box centres read back from the rendered overlay "
                  "and mapped linearly onto the scene bbox",
        "tier": "REAL",
        "caveat": "A bright blob in radar is a vessel-sized metal object. It does NOT by "
                  "itself show the vessel is berthed, working cargo, or sending trucks to the gate.",
        "image": ships["image"], "imagePx": [w, h],
        "bbox": [BBOX["w"], BBOX["s"], BBOX["e"], BBOX["n"]],
        "coverageKm2": round(km2, 1),
        "observedUtc": latest["datetime"], "observedLocal": latest["local"],
        "pass": latest["pass"], "detectorCount": latest["ships"],
        "boxCount": len(vessels),
        # Two detections moored side by side draw rectangles that touch, so they come
        # back as one component. The count the UI must quote as "vessels detected" is
        # therefore detectorCount; boxCount is how many we can place on the map.
        "recoveryNote": (f"{len(vessels)} of {latest['ships']} detections recovered as separate "
                         "outlines; rectangles that touch merge into one component, so a circle "
                         "may cover more than one vessel."),
        "vessels": vessels,
    }


if __name__ == "__main__":
    data = extract(OUT / "sat" / "latest_overlay.png", OUT / "ships.json")
    (OUT / "ships_geo.json").write_text(json.dumps(data, indent=1, ensure_ascii=False))
    print(f"{data['boxCount']} boxes recovered (detector said {data['detectorCount']}); "
          f"{data['coverageKm2']} km² coverage, observed {data['observedUtc']} UTC")
