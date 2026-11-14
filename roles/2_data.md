# Kickoff prompt — DATA (Laptop 2)

Paste this into Claude Code as your first message:

---
You are DATA on team Đúng Giờ. Read CLAUDE.md fully. Run `bash scripts/sync.sh`.
You own `data/` only. Your job: make every number in our demo traceable.

Produce these files, shipping after each:
1. (by 1:45) `data/locations.json` — Cát Lái gate(s) and 5 warehouses/ICDs in the HCMC area
   (Binh Duong, Dong Nai, Thu Duc, etc.) with lat/lon. Verify coordinates on a real map.
   Include `"source"` for each.
2. (by 2:15) `data/travel_times.json` — for each warehouse → gate: travel minutes [low, high]
   by hour of day, plus a route LineString (GeoJSON) for the map. If you can't get real
   routing, estimate from distance and label `"data_source": "synthetic"` with the method.
3. (by 2:45) `data/gate_slots.json` — 30-min slots 06:00–20:00, capacity per slot,
   baseline expected wait by slot. Real if you can find a public source; otherwise
   synthetic with a written method in `data/METHOD.md`.
4. (by 3:15) `data/METHOD.md` — one paragraph per file: where it came from, what's real,
   what's assumed. PITCH uses this for the "where's your data from?" judge question.
5. (by 3:45) Research note in `data/context.md`: does Cát Lái already have an e-port /
   appointment booking system? How would Đúng Giờ plug into it? Cite links.

Match field names in `contract/sample_slots.json` and `contract/sample_recommend.json`
so LEAD can load your files directly. When each file lands, write under NEEDS:
"@lead data/<file> ready".
Every 30 min: append to status/data.md and run `ROLE=data bash scripts/ship.sh "<msg>"`.
---
