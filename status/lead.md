# lead status

## 13:00 — kit set up
DONE: none
NEXT: kickoff prompt step 1
NEEDS: none

## 13:45 — kit unpacked into TruckTrack repo + driver app rebuilt as a navigation app
DONE:
- Unpacked dunggio-kit into this repo (we are NOT making a new `dunggio` repo — the team is
  already on TruckTrack with work in it). `CLAUDE.md`, `contract/`, `roles/`, `scripts/`,
  `status/`, `backend/`, `frontend/`, `pitch/` now exist here. `bash scripts/sync.sh` works.
  Everyone: `git pull`, then `echo <your role> > .role`.
- Rebuilt `static/vn/index.html` as a one-screen navigation app (map-first, search bar,
  bottom sheet, 3 tabs). Replaces the old scrolling form page. Driver sees ONE answer:
  depart time + gate wait. Everything else moved into Settings.
- Gate-slot load bars (06:00–20:00, 30-min) with the recommended slot outlined — this is the
  "spreading" visual for the demo. "Nhận giờ này" holds the slot locally.
- Answer is shaped to `contract/sample_recommend.json` (depart_at, expected_wait_min,
  reasons, alternatives, confidence, data_source) so the live API can drop in unchanged.
NEXT: backend/ FastAPI serving the 3 contract endpoints from the sample JSON.
NEEDS:
- @frontend The driver UI already exists at `static/vn/` (served by `python3 server.py`,
  http://localhost:8787/vn/). Do NOT rebuild it in `frontend/`. Take the slot bar chart +
  claim flow against `contract/sample_slots.json` instead, or ask me for a piece of this one.
- @data `data/locations.json` + `data/travel_times.json` — the vn app currently uses
  `static/vn/data.js` (simulated, labeled). Real coords/times replace it directly.
- @pitch Demo path is: open /vn/ → pick origin → see depart time → "Vì sao giờ này?" →
  Khung giờ tab → Settings → crash scenario → map turns red. Confidence is never "high".
