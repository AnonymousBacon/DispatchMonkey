# Kickoff prompt — FRONTEND (Laptop 3)

Paste this into Claude Code as your first message:

---
You are FRONTEND on team Đúng Giờ. Read CLAUDE.md fully. Run `bash scripts/sync.sh`.
You own `frontend/` only. Build against `contract/sample_*.json` — do NOT wait for the backend.

One page, one demo flow. Build in this order, shipping after each:
1. (by 1:45) Single-page app (plain HTML + JS, or Vite). Load the sample JSON files.
   Inputs: warehouse dropdown, earliest departure, cutoff. Button: "Get my slot".
2. (by 2:30) Map (ArcGIS Maps SDK for JavaScript preferred — Esri is a sponsor; Leaflet if
   it fights you for >15 min). Show warehouse, Cát Lái gate, and the route from `route_geojson`.
3. (by 3:00) Recommendation card: big "Leave 13:40 → Gate slot 14:30–15:00",
   wait range vs baseline ("saves 80–110 min"), confidence badge, and a
   "Why this slot?" panel listing `reasons`. Show `data_source` as a visible label.
4. (by 3:30) Slot-load bar chart from /slots (color by load), highlighting the chosen slot.
   A "Claim slot" button that calls POST /claim and refreshes the chart — this is the
   "spreading" moment in the demo.
5. (by 4:00) Phone mockup showing `driver_message_vi` (Zalo-style bubble) with English below.
6. (4:00–4:30) Switch from sample files to the live API at http://localhost:8000.
   Keep a `USE_SAMPLES = true` toggle so the demo works even if the backend dies.

Design: clean, big text, readable from the back of the room. No login, no extra pages.
Every 30 min: append to status/frontend.md and run `ROLE=frontend bash scripts/ship.sh "<msg>"`.
---
