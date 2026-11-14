#!/usr/bin/env python3
"""Ship-counter checks. Run: python3 tools/test_ships.py"""
import json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from count_ships import count, box_mean, blobs
import numpy as np
ok = fail = 0
def t(name, cond):
    global ok, fail
    if cond: ok += 1
    else: fail += 1; print("FAIL", name)
ROOT = Path(__file__).resolve().parent.parent
r = count(ROOT / "data/satellite/catlai_s1_vv_2026-11-11.png")
t("sample image: 25..45 ships on open water (hand check ≈ 35 visible off-quay)", r and 25 <= r["ships"] <= 45)
t("box_mean of ones is ones", np.allclose(box_mean(np.ones((20, 20)), 5), 1))
m = np.zeros((10, 10), bool); m[1, 1] = m[1, 2] = m[7, 7] = True
t("two blobs found", len(blobs(m)) == 2)
s = json.loads((ROOT / "static/vn/ships.json").read_text())
t("ships.json has ≥ 50 passes", len(s["history"]) >= 50)
t("forecast reports its own error", s["forecast"] is None or "mae" in s["forecast"])
print(f"{ok}/{ok + fail} PASS"); sys.exit(1 if fail else 0)
