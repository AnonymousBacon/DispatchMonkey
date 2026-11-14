# API contract (owned by LEAD — do not edit unless you are LEAD)

Base URL (local): `http://localhost:8000`
Until the real backend is ready, frontend loads the sample JSON files directly.

## GET /recommend
Get a recommended gate slot for one truck.

Query params:
- `origin` — warehouse id (from `data/warehouses.json`), e.g. `wh_binh_duong_01`
- `earliest` — earliest departure, `HH:MM`
- `cutoff` — vessel/cargo cutoff, `HH:MM`

Response: see `sample_recommend.json`

## GET /slots
Current load for every 30-min gate slot today (for the bar chart + map).
Response: see `sample_slots.json`

## POST /claim
Body: `{ "truck_id": "...", "slot_start": "14:30" }`
Claims a slot so the next truck gets spread to a different one.
Response: `{ "ok": true, "slot_start": "14:30", "slot_load": 0.66 }`

## Field rules
- Times are local HCMC time, `HH:MM` strings.
- Ranges are `[low, high]` in minutes.
- `slot_load` is 0–1 (claimed trucks / gate capacity for that slot).
- `confidence` is one of `"low" | "medium" | "high"`.
- `data_source` is `"real" | "synthetic" | "mixed"` — always present.
