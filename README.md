# Đúng Giờ — Smart Arrival for Cát Lái Port

**Google Maps tells a driver which way to go. Đúng Giờ tells them *when* to go, so they don't
join a queue that hurts everyone.**

GeoAI Track — Port-to-Warehouse Visibility and Decision Support. Perspective 2 (Delivery
Reliability and Capacity Coordination) + Perspective 3 (Resilience, Cost and Sustainability).

Drivers going to Cảng Cát Lái to pick up containers for warehouses queue on the approach to
cầu Phú Mỹ and along Nguyễn Thị Định with engines running. Đúng Giờ gives each driver the best
departure time and route, and shows what each choice costs them, the climate and the people
living along the road.

## Run it

```bash
python3 server.py
# open http://localhost:8787  (redirects to /vn/)
```

No install, no API key. The map (MapLibre) and fonts load from the internet.

Self-check the engine: `node tools/test_vn.mjs`.

## Data, live APIs and design

- **[DATA-SOURCES.md](DATA-SOURCES.md):** every data source with credibility rating, licence,
  API sign-up links, free limits and example requests. Downloaded data is in `data/vn/`
  (`python3 tools/fetch_data_vn.py`); API keys go in `.env` (see `.env.example`, never committed).
- **[DESIGN-PROMPTS.md](DESIGN-PROMPTS.md):** design system and prompts. Layout inspired by
  [Ronas IT — Delivery Web App Design](https://dribbble.com/shots/25708347-Delivery-Web-App-Design).

## What is real, estimated or simulated

| | What | Source |
|---|---|---|
| **Real** | Cát Lái approach roads, schools, hospitals | OpenStreetMap, via `tools/fetch_osm_vn.py` |
| **Dated rules** | Port hours 7:30–17:00 (24/24 if pre-registered), truck bans | SNP tariff 2021, QĐ 23/2018 — re-verify before the demo |
| **Estimated** | Diesel price, idle burn, Phú Mỹ toll, driver wage | `static/vn/data.js`, each tagged with source |
| **Simulated** | Truck arrivals (~19,000/day), gate capacity, routes' baseline times, Fairness Ledger | `static/vn/data.js` |

## How it decides

All numbers come from `static/vn/scoring.js`. No language model writes a number.

- **Queue model:** arrivals per 15-minute slot vs. gate capacity; backlog becomes wait time,
  shown as a range (±30%).
- **Five cards:** Fastest, Cheapest, Cleanest, Leave Later, Overall Best.
- **Hard filters:** truck bans, port hours, missed ePort slot, driver hours.
- **Overall Best:** each metric scaled 0–1 with a "doesn't matter" band, weighted sum
  (time 25, cost 20, idle 20, CO₂ 15, exposure 20), tie-break on idle minutes then km.
- **Exposure:** idle minutes near schools/hospitals on the queue road, ×3 at school hours,
  ×1.5 on unhealthy-air days.

## Files

| File | What it is |
|---|---|
| `static/vn/index.html` | Driver page: onboarding, map, cards, chart, check-ins, Zalo share |
| `static/vn/data.js` | All rates, rules, routes and simulated data. **Edit numbers here** |
| `static/vn/scoring.js` | The engine. Tests cover it |
| `static/vn/geo.json` | OSM roads and points for the map |
| `server.py` | Static file server |
| `tools/fetch_osm_vn.py`, `tools/fetch_osm_vn_retry.py` | One-off: rebuild `geo.json` from OSM (use helpers in `tools/fetch_osm.py`) |
| `tools/test_vn.mjs` | Engine tests |

## Known limits

- Queue, routes and fleet are simulated; no live traffic or air-quality feed is wired in yet.
- Port hours and truck-ban rules come from dated sources.
- No AI agent is connected to this page yet. The earlier SoCal server had a guard that rejects
  model replies containing numbers not in the data (`check_no_invented_numbers`, see git
  history before branch `vn-only`); reuse it when adding Gemma 4.
