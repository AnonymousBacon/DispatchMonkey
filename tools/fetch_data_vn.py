#!/usr/bin/env python3
"""Download the no-key public datasets for the Cát Lái corridor into data/vn/.

Every file gets an entry in data/vn/manifest.json with source, licence, URL and
retrieval time, so the app and the slides can cite exactly what was used.

Run:  python3 tools/fetch_data_vn.py        (stdlib only, ~10 s)
Keyed live APIs (HERE, TomTom, Google, WAQI, OpenAQ) are documented in
DATA-SOURCES.md; they are not fetched here so no key ever lands in git.
"""
import datetime as dt, json, pathlib, sys, urllib.parse, urllib.request

OUT = pathlib.Path(__file__).resolve().parent.parent / "data" / "vn"
GATE = (10.7646, 106.7786)          # Cổng Cảng Cát Lái, Nguyễn Thị Định
COAST = (10.33, 107.10)             # Vũng Tàu coast: nearest open-sea cell for tide
TZ = "Asia/Ho_Chi_Minh"
UA = {"User-Agent": "dunggio-hackathon-fetch/1.0"}


def get(url, params):
    full = url + "?" + urllib.parse.urlencode(params, safe=",;")
    with urllib.request.urlopen(urllib.request.Request(full, headers=UA), timeout=60) as r:
        return full, json.loads(r.read())


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    today = dt.date.today()
    year_ago = today - dt.timedelta(days=365)
    lat, lon = GATE
    jobs = [
        ("weather_hourly.json", "Open-Meteo Forecast API (past 92 days + 7-day forecast)",
         "CC BY 4.0 — credit Open-Meteo", "https://api.open-meteo.com/v1/forecast",
         dict(latitude=lat, longitude=lon, timezone=TZ, past_days=92, forecast_days=7,
              hourly="temperature_2m,relative_humidity_2m,precipitation,rain,wind_speed_10m")),
        ("weather_daily_1y.json", "Open-Meteo Historical Weather API (ERA5 reanalysis), last 12 months",
         "CC BY 4.0 — credit Open-Meteo and Copernicus ERA5", "https://archive-api.open-meteo.com/v1/archive",
         dict(latitude=lat, longitude=lon, timezone=TZ, start_date=year_ago.isoformat(),
              end_date=(today - dt.timedelta(days=6)).isoformat(),
              daily="precipitation_sum,rain_sum,temperature_2m_max,temperature_2m_min")),
        ("air_quality_hourly.json", "Open-Meteo Air Quality API (CAMS global model, past 92 days + 5-day forecast)",
         "CC BY 4.0 — credit CAMS (Copernicus) and Open-Meteo. MODELLED, not a sensor reading",
         "https://air-quality-api.open-meteo.com/v1/air-quality",
         dict(latitude=lat, longitude=lon, timezone=TZ, past_days=92, forecast_days=5,
              hourly="pm2_5,pm10,nitrogen_dioxide,carbon_monoxide,us_aqi")),
        ("tide_vung_tau_hourly.json", "Open-Meteo Marine API sea-level height at Vũng Tàu coast (tide proxy)",
         "CC BY 4.0 — credit Open-Meteo. Coastal model cell, NOT a Cát Lái river gauge",
         "https://marine-api.open-meteo.com/v1/marine",
         dict(latitude=COAST[0], longitude=COAST[1], timezone=TZ, past_days=30, forecast_days=7,
              hourly="sea_level_height_msl")),
        ("worldbank_lpi.json", "World Bank Logistics Performance Index (overall score), Vietnam + ASEAN peers",
         "CC BY 4.0 — World Bank Open Data",
         "https://api.worldbank.org/v2/country/VNM;THA;MYS;IDN;PHL;SGP/indicator/LP.LPI.OVRL.XQ",
         dict(format="json", per_page=200)),
    ]
    manifest, failed = [], []
    for name, source, licence, url, params in jobs:
        try:
            full, data = get(url, params)
        except Exception as e:                      # keep going; report at the end
            failed.append(f"{name}: {type(e).__name__}: {e}")
            continue
        (OUT / name).write_text(json.dumps(data, ensure_ascii=False, indent=1))
        manifest.append(dict(file=name, source=source, licence=licence, url=full,
                             retrieved=dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")))
        print("ok  ", name)
    (OUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1))
    for f in failed:
        print("FAIL", f, file=sys.stderr)
    sys.exit(1 if failed else 0)


if __name__ == "__main__":
    main()
