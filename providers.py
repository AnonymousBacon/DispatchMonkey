#!/usr/bin/env python3
"""Provider integrations for DispatchMonkey: VIETMAP, TomTom Orbis, AISStream, speech.

Every function here is split into "build the request" and "parse the response", so
the parsing and the decision rules can be tested from fixtures with no key and no
network (tools/test_providers.py). The live call is a thin wrapper around each pair.

Keys never leave the server and are never echoed in an error. See .env.example for
the exact variable names.

What each provider decides:
  VIETMAP Route v4        real truck/container road geometry + provider maneuvers
  TomTom Orbis incidents  closure (removes a route) vs advisory (adds delay)
  AISStream               vessels in a tight Cát Lái box, with last-seen times
  Speech-to-text          a Vietnamese transcript the DRIVER confirms before posting
"""
import base64
import json
import os
import subprocess
import threading
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def env(name):
    """Env var, else a line in .env (gitignored). Returns None when absent."""
    v = os.environ.get(name)
    if v:
        return v.strip()
    f = ROOT / ".env"
    if f.exists():
        for line in f.read_text().splitlines():
            line = line.strip()
            if line.startswith(name + "="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return None


def curl_json(url, headers=None, timeout=12, data=None):
    """One small HTTP call. curl is already a dependency of fetch_flow()."""
    cmd = ["curl", "-s", "-m", str(timeout)]
    for k, v in (headers or {}).items():
        cmd += ["-H", f"{k}: {v}"]
    if data is not None:
        cmd += ["--data-binary", data if isinstance(data, str) else json.dumps(data)]
    cmd.append(url)
    out = subprocess.run(cmd, capture_output=True, check=True).stdout
    if not out:
        raise RuntimeError("empty provider response")
    return json.loads(out)


# =========================================================== VIETMAP Route v4 ==
# https://maps.vietmap.vn/docs/map-api/route-version/route-v4/
# GET https://maps.vietmap.vn/api/route/v4
#   apikey, point=lat,lon (>=2), vehicle=car|motorcycle|truck|container,
#   capacity (kg, required for truck), container_feet, points_encoded,
#   annotations=congestion,toll, time=ISO-8601 UTC departure, alternative
VIETMAP_URL = "https://maps.vietmap.vn/api/route/v4"

# Our demo trucks are 40 ft container tractors. Gross weight is the regulated
# figure the profile has to be asked for, not a guess about one truck.
TRUCK_PROFILES = {
    "container40": {"vehicle": "container", "capacity": 30000, "container_feet": 40,
                    "label": "40 ft container tractor, 30 t GVW"},
    "container20": {"vehicle": "container", "capacity": 24000, "container_feet": 20,
                    "label": "20 ft container tractor, 24 t GVW"},
    "truck": {"vehicle": "truck", "capacity": 15000,
              "label": "rigid truck, 15 t GVW"},
}


def vietmap_route_url(points, profile="container40", depart_utc=None, alternative=False,
                      key="REDACTED"):
    """Build the Route v4 URL. points = [(lat, lon), ...] in travel order."""
    if len(points) < 2:
        raise ValueError("a route needs at least two points")
    p = TRUCK_PROFILES.get(profile)
    if not p:
        raise ValueError(f"unknown truck profile: {profile}")
    q = [f"apikey={key}"]
    q += [f"point={lat:.6f},{lon:.6f}" for lat, lon in points]
    q.append(f"vehicle={p['vehicle']}")
    q.append(f"capacity={p['capacity']}")
    if "container_feet" in p:
        q.append(f"container_feet={p['container_feet']}")
    # Coordinates, not a polyline: we want the full road geometry to draw, and
    # decoding polyline5 in the browser is work we do not need to do.
    q.append("points_encoded=false")
    q.append("annotations=congestion,toll")
    if depart_utc:
        q.append(f"time={depart_utc}")
    if alternative:
        q.append("alternative=true")
    return VIETMAP_URL + "?" + "&".join(q)


# sign → what the driver is being told to do. Values follow the GraphHopper
# convention Route v4 inherits. Anything unlisted stays "continue".
VIETMAP_SIGNS = {
    -98: "uturn", -8: "uturn", -7: "keep_left", -3: "turn_sharp_left",
    -2: "turn_left", -1: "turn_slight_left", 0: "continue", 1: "turn_slight_right",
    2: "turn_right", 3: "turn_sharp_right", 4: "arrive", 5: "via", 6: "roundabout",
    7: "keep_right", 8: "uturn",
}
RAMP_SIGNS = {-7, 7}            # keep left / keep right = a ramp or a fork


def parse_vietmap_route(raw, gate=None, gate_tol_m=250):
    """Provider response → the fields the app needs, with the gate approach verified.

    Returns dict with coords [[lon,lat],...], distanceM, durationS, maneuvers
    (each with provider point index, sign, text, street), tollVnd, congestion,
    and gateApproach: whether the provider's own geometry actually reaches the
    gate. If it does not, the caller must not present this as turn-by-turn.
    """
    paths = (raw or {}).get("paths") or []
    if not paths:
        raise RuntimeError((raw or {}).get("messages") or "provider returned no path")
    p = paths[0]
    pts = p.get("points")
    if p.get("points_encoded", True) and isinstance(pts, str):
        raise RuntimeError("asked for points_encoded=false but got a polyline")
    if not isinstance(pts, list) or len(pts) < 2:
        raise RuntimeError("provider path has no usable geometry")
    # Route v4 returns [lat, lng]; GeoJSON and MapLibre want [lon, lat].
    coords = [[float(a[1]), float(a[0])] for a in pts]

    maneuvers = []
    for ins in p.get("instructions") or []:
        iv = ins.get("interval") or [0, 0]
        sign = int(ins.get("sign", 0))
        maneuvers.append({
            "at": int(iv[0]), "to": int(iv[-1]), "sign": sign,
            "kind": VIETMAP_SIGNS.get(sign, "continue"),
            "isRamp": sign in RAMP_SIGNS,
            "text": ins.get("text") or "",
            "street": ins.get("street_name") or "",
            "distanceM": round(float(ins.get("distance") or 0), 1),
            "durationS": round(float(ins.get("time") or 0) / 1000, 1),
        })

    approach = None
    if gate:
        glat, glon = gate
        # Flat-earth metres at 10.76°N is accurate to well under a metre here.
        last = coords[-1]
        dx = (last[0] - glon) * 109200.0
        dy = (last[1] - glat) * 111320.0
        d = (dx * dx + dy * dy) ** 0.5
        approach = {"endsAtGate": d <= gate_tol_m, "endGapM": round(d, 1),
                    "toleranceM": gate_tol_m,
                    # The last maneuver on a verified approach is the gate turn-in.
                    "finalManeuver": maneuvers[-1] if maneuvers else None}

    return {
        "source": "VIETMAP Route v4", "tier": "REAL-PROVIDER",
        "coords": coords, "distanceM": round(float(p.get("distance") or 0), 1),
        "durationS": round(float(p.get("time") or 0) / 1000, 1),
        "bbox": p.get("bbox"), "maneuvers": maneuvers,
        "tollVnd": p.get("toll_cost"), "tolls": p.get("tolls") or [],
        "congestion": (p.get("annotations") or {}).get("congestion"),
        "gateApproach": approach,
        # Explicit so the UI cannot accidentally promote a preview to navigation.
        "navigable": bool(approach and approach["endsAtGate"]) if gate else False,
    }


# ================================================ TomTom Orbis incident details ==
# https://docs.tomtom.com/traffic-api/documentation/tomtom-orbis-maps/v2/traffic-incidents/incident-details
ORBIS_URL = "https://api.tomtom.com/maps/orbis/traffic/incidents/details"
# A tight box around the Cát Lái approaches, not the whole city: an incident on the
# far side of HCMC is not our corridor.
CATLAI_BBOX = (106.69, 10.62, 106.82, 10.86)      # minLon, minLat, maxLon, maxLat

ORBIS_ATTRS = ("incidents{type,geometry,properties{id,iconCategory,magnitudeOfDelay,"
               "startTime,endTime,from,to,lengthInMeters,delayInSeconds,roadNumbers,"
               "timeValidity,probabilityOfOccurrence,numberOfReports,lastReportTime,"
               "events{code,description,iconCategory}}}")

# Only a certain, present, full road closure may remove a route. Everything else
# is an advisory with a delay: a crash or a lane closure slows a road, it does not
# make driving it illegal.
CLOSURE_CATS = {"roadClosed"}
ADVISORY_CATS = {"accident", "laneClosed", "jam", "roadWorks", "flooding",
                 "brokenDownVehicle", "dangerousConditions", "ice", "fog", "rain", "wind"}
# Delay we attribute when the provider reports a closure or gives us no number.
# OUR ESTIMATE, never TomTom's.
DEFAULT_DELAY_S = {"accident": 270, "laneClosed": 180, "jam": 150, "roadWorks": 120,
                   "flooding": 240, "brokenDownVehicle": 120}


def orbis_incidents_url(bbox=CATLAI_BBOX, time_validity="present"):
    return (f"{ORBIS_URL}?apiVersion=2"
            f"&bbox={bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]}"
            f"&timeValidity={time_validity}")


def _iso(t):
    """ISO-8601 → epoch seconds. Returns None for a missing or unparsable value."""
    if not t:
        return None
    t = t.strip().replace("Z", "+00:00")
    try:
        import datetime as dt
        return dt.datetime.fromisoformat(t).timestamp()
    except ValueError:
        return None


def _bearing(a, b):
    """Degrees from point a to point b, 0 = north. Used to test direction."""
    import math
    dx = (b[0] - a[0]) * math.cos(math.radians((a[1] + b[1]) / 2))
    dy = b[1] - a[1]
    return (math.degrees(math.atan2(dx, dy)) + 360) % 360


def _angle_gap(a, b):
    d = abs((a - b) % 360)
    return min(d, 360 - d)


def incident_geometry_points(inc):
    g = inc.get("geometry") or {}
    c = g.get("coordinates") or []
    if g.get("type") == "Point" and len(c) >= 2:
        return [[float(c[0]), float(c[1])]]
    if g.get("type") == "LineString":
        return [[float(p[0]), float(p[1])] for p in c if len(p) >= 2]
    if g.get("type") == "MultiLineString":
        return [[float(p[0]), float(p[1])] for line in c for p in line if len(p) >= 2]
    return []


def match_incidents(raw, road_lines, now=None, travel_bearing=None,
                    near_m=180, dir_tol_deg=70, stale_after_s=1800):
    """Match provider incidents to our roads, direction and active time window.

    road_lines: {road name: [[lon,lat], ...]} from static/vn/geo.json.
    travel_bearing: {road name: degrees} the direction OUR trucks drive that road.
      An incident whose own geometry runs the other way is reported as
      oppositeDirection and never slows our side.
    now: epoch seconds (injectable so the tests are not clock-dependent).

    Returns {closedRoads, slowRoads, events, skipped, stale, note}. A closure is
    only emitted when the provider says the closure is present and certain.
    """
    now = time.time() if now is None else now
    incidents = (raw or {}).get("incidents") or []
    fetched = _iso((raw or {}).get("fetchedUtc"))
    stale = fetched is not None and (now - fetched) > stale_after_s

    closed, slow, events, skipped = set(), set(), [], []

    for inc in incidents:
        pr = inc.get("properties") or inc
        cat = pr.get("iconCategory") or "unknown"
        pts = incident_geometry_points(inc)
        if not pts:
            skipped.append({"id": pr.get("id"), "why": "no geometry"})
            continue

        # ---- active time window -------------------------------------------
        start, end = _iso(pr.get("startTime")), _iso(pr.get("endTime"))
        if pr.get("timeValidity") == "future" or (start is not None and start > now):
            skipped.append({"id": pr.get("id"), "why": "not started yet", "cat": cat})
            continue
        if end is not None and end < now:
            # A closure whose endTime has passed is CLEARED: it must stop steering trucks.
            skipped.append({"id": pr.get("id"), "why": "cleared", "cat": cat,
                            "endedMinAgo": round((now - end) / 60)})
            continue

        # ---- which of our roads is it on ----------------------------------
        hit, hit_d, hit_i = None, float("inf"), 0
        for name, line in (road_lines or {}).items():
            for i, q in enumerate(line):
                for p in pts:
                    dx = (p[0] - q[0]) * 109200.0
                    dy = (p[1] - q[1]) * 111320.0
                    d = (dx * dx + dy * dy) ** 0.5
                    if d < hit_d:
                        hit, hit_d, hit_i = name, d, i
        if hit is None or hit_d > near_m:
            skipped.append({"id": pr.get("id"), "why": "off corridor", "cat": cat,
                            "nearestM": None if hit_d == float("inf") else round(hit_d)})
            continue

        # ---- direction ----------------------------------------------------
        opposite = False
        if travel_bearing and hit in travel_bearing and len(pts) >= 2:
            inc_b = _bearing(pts[0], pts[-1])
            if _angle_gap(inc_b, travel_bearing[hit]) > 180 - dir_tol_deg:
                opposite = True

        certain = pr.get("probabilityOfOccurrence") in (None, "certain")
        is_closure = cat in CLOSURE_CATS and certain and not opposite
        delay = pr.get("delayInSeconds")
        delay_est = delay is None
        if delay_est:
            delay = DEFAULT_DELAY_S.get(cat, 90)

        ev = {
            "id": pr.get("id"), "cat": cat, "road": hit,
            "distanceM": round(hit_d), "atIndex": hit_i,
            "oppositeDirection": opposite,
            "magnitudeOfDelay": pr.get("magnitudeOfDelay") or "unknown",
            "delayS": int(delay), "delayIsOurEstimate": delay_est,
            "probability": pr.get("probabilityOfOccurrence") or "certain",
            "from": pr.get("from") or "", "to": pr.get("to") or "",
            "lengthM": pr.get("lengthInMeters"),
            "startTime": pr.get("startTime"), "endTime": pr.get("endTime"),
            "numberOfReports": pr.get("numberOfReports"),
            "effect": "closure" if is_closure else "advisory",
            # Said out loud because it is the C3 claim: TomTom tells us WHAT and
            # WHERE. Whether a truck may still drive is our rule, not their data.
            "evidence": ("TomTom Orbis reports this incident and its location. "
                         "Treating it as " + ("a route-removing closure" if is_closure
                                              else "an advisory delay") +
                         " is OUR rule." + ("" if not delay_est else
                                            " The delay shown is OUR ESTIMATE: the provider sent none.")),
        }
        events.append(ev)

        if opposite:
            continue                       # the other carriageway is not our problem
        if is_closure:
            closed.add(hit)
        elif cat in ADVISORY_CATS:
            slow.add(hit)

    note = ("Stale provider response: older than "
            f"{stale_after_s // 60} min, so no closure from it is applied."
            if stale else "")
    if stale:
        closed = set()                     # never remove a route on stale evidence

    events.sort(key=lambda e: (0 if e["effect"] == "closure" else 1, -e["delayS"]))
    return {"source": "TomTom Orbis Traffic Incident Details v2",
            "tier": "REAL-PROVIDER" if not stale else "REAL-PROVIDER (stale)",
            "closedRoads": sorted(closed), "slowRoads": sorted(slow),
            "events": events, "skipped": skipped, "stale": stale, "note": note}


# ======================================================== AISStream (WebSocket) ==
# https://www.aisstream.io/documentation
AIS_WS = "wss://stream.aisstream.io/v0/stream"
# Tight coverage: the Cát Lái reach of the Đồng Nai river and its turning basin.
# BoundingBoxes are [[lat, lon], [lat, lon]] — latitude first, unlike GeoJSON.
AIS_BOX = [[10.730, 106.760], [10.800, 106.840]]
AIS_VESSEL_TTL_S = 1800          # a position older than 30 min is "last seen", not "here"


def ais_subscribe_msg(key, box=None):
    return {
        "APIKey": key,
        "BoundingBoxes": [box or AIS_BOX],
        "FilterMessageTypes": ["PositionReport", "ShipStaticData"],
    }


def parse_ais_message(msg, vessels, now):
    """Fold one AISStream frame into the vessel table. Returns True if it changed.

    vessels: {mmsi: {...}} mutated in place. Unknown message types are ignored
    rather than guessed at.
    """
    kind = msg.get("MessageType")
    meta = msg.get("MetaData") or {}
    body = (msg.get("Message") or {}).get(kind) or {}
    mmsi = meta.get("MMSI") or body.get("UserID")
    if not mmsi:
        return False
    mmsi = str(mmsi)
    v = vessels.setdefault(mmsi, {"mmsi": mmsi})
    if meta.get("ShipName"):
        v["name"] = str(meta["ShipName"]).strip()
    if kind == "PositionReport":
        lat = body.get("Latitude", meta.get("latitude"))
        lon = body.get("Longitude", meta.get("longitude"))
        if lat is None or lon is None or body.get("Valid") is False:
            return False
        v.update(lat=round(float(lat), 6), lon=round(float(lon), 6),
                 sog=body.get("Sog"), cog=body.get("Cog"),
                 navStatus=body.get("NavigationalStatus"),
                 seenAt=now, timeUtc=meta.get("time_utc"))
        # Moored/at anchor per AIS status 1 and 5. Reported, not inferred into
        # "working cargo": AIS says where a hull is, not what the cranes are doing.
        v["moored"] = body.get("NavigationalStatus") in (1, 5)
        return True
    if kind == "ShipStaticData":
        v.update(type=body.get("Type"), callSign=body.get("CallSign"),
                 lengthM=(body.get("Dimension") or {}).get("A"), staticAt=now)
        return True
    return False


def ais_snapshot(vessels, now, ttl=AIS_VESSEL_TTL_S):
    """The public shape: positioned vessels, each with how stale its fix is."""
    out = []
    for v in vessels.values():
        if "lat" not in v:
            continue
        age = now - v.get("seenAt", 0)
        out.append({**v, "ageS": int(age), "current": age <= ttl})
    out.sort(key=lambda v: v.get("seenAt", 0), reverse=True)
    return {
        "source": "AISStream.io live AIS", "tier": "REAL-LIVE",
        "box": AIS_BOX, "ttlS": ttl,
        "vessels": out, "count": len(out),
        "currentCount": sum(1 for v in out if v["current"]),
        "caveat": ("AIS reports a vessel's own broadcast position. It does not show "
                   "whether the vessel is working cargo, nor how many trucks that "
                   "will send to the gate."),
    }


class AisClient:
    """Background AISStream reader with reconnects and a cached last-known state.

    Uses the `websockets` package when it is installed. Without it, or without a
    key, state() reports why and the UI shows the cached/replay snapshot instead
    of pretending the feed is live.
    """

    BACKOFF = (1, 2, 5, 10, 30, 60)

    def __init__(self, key=None, box=None, cache=None):
        self.key = key
        self.box = box or AIS_BOX
        self.cache = Path(cache) if cache else (ROOT / "data" / "logs" / "ais_last.json")
        self.vessels = {}
        self.lock = threading.Lock()
        self.status = "idle"
        self.err = None
        self.connected_at = None
        self.reconnects = 0
        self._thread = None
        self._stop = threading.Event()
        self._load_cache()

    def _load_cache(self):
        try:
            d = json.loads(self.cache.read_text())
            with self.lock:
                self.vessels = {v["mmsi"]: v for v in d.get("vessels", []) if "lat" in v}
            self.status = "cached"
        except (OSError, ValueError, KeyError):
            pass

    def _save_cache(self):
        try:
            self.cache.parent.mkdir(parents=True, exist_ok=True)
            with self.lock:
                snap = ais_snapshot(self.vessels, time.time())
            self.cache.write_text(json.dumps(snap, ensure_ascii=False))
        except OSError:
            pass

    def start(self):
        if not self.key:
            self.status = "no-key"
            self.err = "AISSTREAM_KEY is not set"
            return False
        try:
            import websockets  # noqa: F401
        except ImportError:
            self.status = "no-client"
            self.err = "the websockets package is not installed"
            return False
        if self._thread and self._thread.is_alive():
            return True
        self._stop.clear()
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()
        return True

    def stop(self):
        self._stop.set()

    def _run(self):
        import asyncio
        asyncio.run(self._loop())

    async def _loop(self):
        import asyncio
        import websockets
        i = 0
        while not self._stop.is_set():
            try:
                self.status = "connecting"
                async with websockets.connect(AIS_WS, compression="deflate") as ws:
                    await ws.send(json.dumps(ais_subscribe_msg(self.key, self.box)))
                    self.status, self.err = "live", None
                    self.connected_at = time.time()
                    i = 0
                    last_save = 0.0
                    while not self._stop.is_set():
                        raw = await asyncio.wait_for(ws.recv(), timeout=120)
                        try:
                            msg = json.loads(raw)
                        except ValueError:
                            continue
                        with self.lock:
                            parse_ais_message(msg, self.vessels, time.time())
                        if time.time() - last_save > 30:
                            last_save = time.time()
                            self._save_cache()
            except Exception as e:                       # noqa: BLE001 — any drop reconnects
                self.status = "reconnecting"
                self.err = f"{type(e).__name__}"
                self.reconnects += 1
                self._save_cache()
                await asyncio.sleep(self.BACKOFF[min(i, len(self.BACKOFF) - 1)])
                i += 1

    def state(self):
        with self.lock:
            snap = ais_snapshot(self.vessels, time.time())
        snap.update(status=self.status, error=self.err, reconnects=self.reconnects,
                    connectedAt=self.connected_at,
                    live=self.status == "live",
                    # Honest label for the UI: live, replayed from the last cached
                    # snapshot, or simply not configured.
                    mode=("live" if self.status == "live"
                          else "cached" if snap["count"] else self.status))
        if self.status != "live":
            snap["tier"] = "REAL-CACHED" if snap["count"] else "UNAVAILABLE"
        return snap


# =============================================== Vietnamese speech-to-text ==
# Google Cloud Speech-to-Text v1 (vi-VN; chirp / chirp_2 / chirp_3 / long / short),
#   https://docs.cloud.google.com/speech-to-text/docs/speech-to-text-supported-languages
# or OpenAI /v1/audio/transcriptions with the gpt-transcribe model.
GOOGLE_STT_URL = "https://speech.googleapis.com/v1/speech:recognize"
OPENAI_STT_URL = "https://api.openai.com/v1/audio/transcriptions"
OPENAI_STT_MODEL = "gpt-transcribe"          # `languages` (plural) on this model
VI = "vi-VN"
MAX_AUDIO_BYTES = 8 * 1024 * 1024            # a cab clip, not a podcast

# Place names the recogniser has to get right for a report to be actionable.
# Passed as a hint/prompt, never used to rewrite what the driver actually said.
VI_PLACE_HINTS = ["Mỹ Thủy", "Phú Mỹ", "Cát Lái", "Đồng Văn Cống", "Nguyễn Thị Định",
                  "Võ Chí Công", "Mai Chí Thọ", "Nguyễn Văn Linh", "Nguyễn Lương Bằng",
                  "Thủ Thiêm", "Hiệp Phước", "Sóng Thần", "Long Hậu", "Nhà Bè", "Thủ Đức"]


def google_stt_body(audio_b64, encoding="WEBM_OPUS", rate=48000, model="chirp_2"):
    return {
        "config": {
            "languageCode": VI, "encoding": encoding, "sampleRateHertz": rate,
            "model": model, "enableAutomaticPunctuation": True,
            # Model adaptation: nudge toward the real street names, with a weight
            # low enough that it cannot invent one out of silence.
            "speechContexts": [{"phrases": VI_PLACE_HINTS, "boost": 10.0}],
        },
        "audio": {"content": audio_b64},
    }


def parse_google_stt(raw):
    """Google response → {text, confidence, alternatives}. Raises if empty."""
    results = (raw or {}).get("results") or []
    if not results:
        err = (raw or {}).get("error") or {}
        raise RuntimeError(err.get("message") or "no speech recognised")
    best, confs = [], []
    for r in results:
        alts = r.get("alternatives") or []
        if not alts:
            continue
        best.append((alts[0].get("transcript") or "").strip())
        if alts[0].get("confidence") is not None:
            confs.append(float(alts[0]["confidence"]))
    text = " ".join(t for t in best if t).strip()
    if not text:
        raise RuntimeError("no speech recognised")
    return {"text": text, "provider": f"Google Cloud Speech-to-Text ({VI})",
            "confidence": round(sum(confs) / len(confs), 3) if confs else None,
            "needsReview": True}


def parse_openai_stt(raw):
    text = ((raw or {}).get("text") or "").strip()
    if not text:
        err = (raw or {}).get("error") or {}
        raise RuntimeError(err.get("message") or "no speech recognised")
    return {"text": text, "provider": f"OpenAI {OPENAI_STT_MODEL} ({VI})",
            "confidence": None, "needsReview": True}


def transcribe(audio_bytes, mime="audio/webm", rate=48000):
    """Transcribe a cab clip to Vietnamese text. The DRIVER confirms it, not us.

    Google first (vi-VN is a first-class language there and we can boost the local
    place names), OpenAI second. Raises with a short reason when neither is keyed,
    so the UI keeps playback and manual captioning.
    """
    if not audio_bytes:
        raise ValueError("empty audio")
    if len(audio_bytes) > MAX_AUDIO_BYTES:
        raise ValueError("audio too large")

    gkey = env("GOOGLE_STT_KEY")
    if gkey:
        enc = "WEBM_OPUS" if "webm" in mime else "OGG_OPUS" if "ogg" in mime else "LINEAR16"
        body = google_stt_body(base64.b64encode(audio_bytes).decode(), enc, rate)
        return parse_google_stt(curl_json(f"{GOOGLE_STT_URL}?key={gkey}",
                                         {"Content-Type": "application/json"},
                                         timeout=30, data=body))

    okey = env("OPENAI_API_KEY")
    if okey:
        # multipart: curl -F, so the bytes go to a temp file rather than the argv.
        import tempfile
        suffix = ".webm" if "webm" in mime else ".ogg" if "ogg" in mime else ".wav"
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=True) as fh:
            fh.write(audio_bytes)
            fh.flush()
            p = subprocess.run(
                ["curl", "-s", "-m", "40", OPENAI_STT_URL,
                 "-H", f"Authorization: Bearer {okey}",
                 "-F", f"file=@{fh.name}",
                 "-F", f"model={OPENAI_STT_MODEL}",
                 "-F", "languages=vi",
                 "-F", "prompt=" + ", ".join(VI_PLACE_HINTS),
                 "-F", "response_format=json"],
                capture_output=True, check=True)
        return parse_openai_stt(json.loads(p.stdout or b"{}"))

    raise RuntimeError("no transcription provider configured "
                       "(set GOOGLE_STT_KEY or OPENAI_API_KEY)")
