# Đúng Giờ — Data Sources

Every source the app uses or should use, how credible it is, how to get it, and whether it is
already in the repo. Rule for the demo: **say where every number comes from**, and tag anything
modelled, estimated or simulated.

Credibility scale: **A** official / peer-reviewed / major open-data provider · **B** reputable
commercial API or established press · **C** single press report or dated document.

---

## 1. Downloaded into `data/vn/` (no key needed)

Re-download any time with `python3 tools/fetch_data_vn.py` (stdlib only; on macOS use
`/usr/bin/python3` if the python.org build reports a certificate error). `data/vn/manifest.json`
records the exact URL, licence and retrieval time of each file.

| File | What | Source | Credibility | Licence |
|---|---|---|---|---|
| `weather_hourly.json` | Temperature, humidity, rain, wind at the Cát Lái gate; last 92 days + 7-day forecast | Open-Meteo Forecast API | A (national weather-service models) | CC BY 4.0, credit Open-Meteo |
| `weather_daily_1y.json` | Daily rain and temperature, last 12 months (rainy-season disruption context) | Open-Meteo Historical API, Copernicus ERA5 reanalysis | A | CC BY 4.0, credit Open-Meteo + ERA5 |
| `air_quality_hourly.json` | PM2.5, PM10, NO₂, CO, US AQI at the gate; last 92 days + 5-day forecast | Open-Meteo Air Quality API, **CAMS** global model | A, but **modelled**, not a sensor | CC BY 4.0, credit CAMS + Open-Meteo |
| `tide_vung_tau_hourly.json` | Sea-level height at the Vũng Tàu coast (tide proxy for triều cường) | Open-Meteo Marine API | B — **coastal model cell, not a Cát Lái river gauge** | CC BY 4.0, credit Open-Meteo |
| `worldbank_lpi.json` | Logistics Performance Index, Vietnam vs. Thailand, Malaysia, Indonesia, Philippines, Singapore | World Bank Open Data API | A | CC BY 4.0 |
| `port_facts.csv` | Hand-collected cited facts: trucks/day, port hours, truck bans, camera count, CO₂ and idle-burn factors | Press, SNP, legal databases, US EPA/DOE (URL per row) | A–C per row (column `confidence`) | Facts with citations |

Sanity check on retrieval (14 Nov 2026): temperature 24–33 °C hourly, max daily rain 42 mm,
PM2.5 6.5–94 µg/m³ (mean ≈26), US AQI mean ≈83. Plausible for Ho Chi Minh City in the late
rainy season.

Already in the repo: `static/vn/geo.json` — Cát Lái approach roads, schools and hospitals from
**OpenStreetMap** (A for road geometry; ODbL, credit "© OpenStreetMap contributors"). Rebuild with
`tools/fetch_osm_vn.py`.

---

## 2. Live APIs that need a key

Copy `.env.example` to `.env`, paste keys there. `.env` is git-ignored. **Never put a key in
`static/` files**: anything in the browser is public. Call keyed APIs from `server.py`.

Free limits below come from each provider's pricing page when checked; providers change them, so
confirm in your dashboard before the demo.

| Provider | Gives | Sign up | Free tier (verify) | Credibility |
|---|---|---|---|---|
| **HERE** Traffic v7 + Routing v8 | Live speeds and jam factor per road segment, incidents, **truck-mode** routes with traffic | https://platform.here.com | Traffic: 5,000 transactions/month on the pricing page | B |
| **TomTom** Traffic | Second source for flow and incidents | https://developer.tomtom.com | 2,500 non-tile requests/day (developer pricing page); newer docs list monthly quotas | B |
| **Google Maps Platform** Routes API | Traffic-aware ETA (car mode; apply a truck factor) | https://console.cloud.google.com (enable "Routes API") | Monthly free usage per SKU; traffic-aware routes are a higher SKU. Needs billing account | B |
| **WAQI / AQICN** | Real station readings (e.g. US Consulate HCMC) | https://aqicn.org/data-platform/token/ | Free token; attribution required; **no redistribution** of the data | B (aggregates official stations) |
| **OpenAQ** v3 | Open sensor network readings | https://explore.openaq.org/register | Free key, `X-API-Key` header | A–B (varies by sensor) |
| **Open-Meteo** | Weather, air quality, tide — live | none | Free for non-commercial use | A |

### Example requests (replace `KEY`)

```text
HERE flow, 3 km around the gate
GET https://data.traffic.hereapi.com/v7/flow?in=circle:10.7646,106.7786;r=3000&locationReferencing=shape&apiKey=KEY

HERE incidents, 8 km around the gate
GET https://data.traffic.hereapi.com/v7/incidents?in=circle:10.7646,106.7786;r=8000&apiKey=KEY

HERE truck route Hiệp Phước → Cát Lái, with traffic at a departure time
GET https://router.hereapi.com/v8/routes?transportMode=truck&origin=10.671,106.738&destination=10.7646,106.7786&departureTime=2026-11-15T06:40:00%2B07:00&return=summary&apiKey=KEY

TomTom flow at the gate
GET https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json?point=10.7646,106.7786&key=KEY

TomTom incidents in the corridor box
GET https://api.tomtom.com/traffic/services/5/incidentDetails?bbox=106.70,10.65,106.82,10.80&key=KEY

Google Routes (POST)
POST https://routes.googleapis.com/directions/v2:computeRoutes
Headers: X-Goog-Api-Key: KEY ; X-Goog-FieldMask: routes.duration,routes.distanceMeters
Body: {"origin":{"location":{"latLng":{"latitude":10.671,"longitude":106.738}}},
       "destination":{"location":{"latLng":{"latitude":10.7646,"longitude":106.7786}}},
       "travelMode":"DRIVE","routingPreference":"TRAFFIC_AWARE"}

WAQI nearest station
GET https://api.waqi.info/feed/geo:10.7646;106.7786/?token=KEY

OpenAQ locations within 25 km
GET https://api.openaq.org/v3/locations?coordinates=10.7646,106.7786&radius=25000   (header X-API-Key: KEY)
```

Check each provider's terms on caching and display. Google, for example, restricts storing
results and showing Google data on non-Google maps.

---

## 3. HCMC traffic portal — giaothong.hochiminhcity.gov.vn

Run by **Sở Xây dựng TP.HCM** (Department of Construction, which now holds the transport
function). Credibility A (official).

What it has (checked 14 Nov 2026): live fast/slow traffic map, public traffic cameras, traffic-plan
notices (road closures, metro works, expressway ramp closures), **tide forecast notices
(triều cường)**, and lookups including vehicle circulation permits (giấy phép lưu thông).

What it does not have: a public API or published data terms. So:
- **Do** use it by hand to verify rules and incidents, cite notices in the Rules Book, and link
  drivers to the relevant camera page.
- **Don't** scrape it or call its internal endpoints from the app.
- **Ask** Sở Xây dựng (or its traffic operations centre) for data access. A letter from the
  hackathon team describing the non-commercial use is the right first step, and an official data
  partnership is a strong "next steps" slide.

## 4. Other official sources to read by hand

| Source | Use | Link |
|---|---|---|
| Saigon Newport (SNP / Tân Cảng) | Gate hours, ePort, operation notices | https://saigonnewport.com.vn |
| HCMC traffic police (PC08) announcements | Temporary truck bans | via HCMC police site / press |
| Petrolimex retail prices | Diesel price for cost cards (record the date) | https://www.petrolimex.com.vn |
| HealthyAir dataset (6 HCMC stations, 2022) | Historical sensor PM2.5 to compare with the CAMS model | https://data.mendeley.com/datasets/pk6tzrjks8/1 |
| Kaggle "Traffic Flow Data in HCMC" (via TUMI hub) | Historical traffic flow; needs a Kaggle login | https://hub.tumidata.org/dataset/traffic_flow_data_in_ho_chi_minh_city_viet_nam_hochiminhcity |

## 5. Research to cite (why timing arrivals works)

| Work | Why it matters |
|---|---|
| Huynh & Walton (2005), *Methodologies for Reducing Truck Turn Time at Marine Container Terminals* — https://trid.trb.org/View/761948 | Early study of limiting truck arrivals at terminal gates |
| Huynh, Smith & Harder (2016), "Truck Appointment Systems: Where We Are and Where to Go from Here," *Transportation Research Record* 2548 | Review of appointment systems (confirm the citation in TRID before quoting) |
| Abdelmagid, Gheith & Eltawil (2022), "A comprehensive review of the truck appointment scheduling models and directions for future research," *Transport Reviews* 42(1):102–126 — https://ideas.repec.org/a/taf/transr/v42y2022i1p102-126.html | Most complete recent review |
| Lange, Nellen & Jahn (2022), TUHH / HICL — https://tore.tuhh.de/handle/11420/13929 | Why many appointment systems under-delivered: a caution to show judges |
| "Truck Appointment Systems Considering Impact to Drayage Truck Tours" — https://trid.trb.org/view/1496979 | Effect on drivers' whole day, not only the gate |
| World Bank Logistics Performance Index — https://lpi.worldbank.org | Country-level logistics context (data in `worldbank_lpi.json`) |

## 6. Design reference

Ronas IT, "Delivery Web App Design" (Dribbble): https://dribbble.com/shots/25708347-Delivery-Web-App-Design.
Used as layout inspiration only (map-first, floating panel, status pills). The shot's images are
the designer's copyright and are not copied into this repo. Full prompts in `DESIGN-PROMPTS.md`.
