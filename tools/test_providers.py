#!/usr/bin/env python3
"""Fixture tests for providers.py — no key, no network, no clock dependence.

Covers what the providers are actually trusted to decide:
  VIETMAP   request shape per profile; [lat,lon] → [lon,lat]; maneuver indexes;
            ramp detection; whether the geometry really reaches the gate
  Orbis     closure removes a route, advisory does not; opposite-direction,
            cleared and stale responses; "the delay is OUR estimate" flag
  AISStream subscription shape, message folding, last-seen staleness
  Speech    vi-VN request with the local place names, and both response parsers

Run: python3 tools/test_providers.py
"""
import json
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import providers as PV  # noqa: E402

OK, FAIL = 0, []


def t(name, cond, extra=""):
    global OK
    if cond:
        OK += 1
    else:
        FAIL.append(f"{name} {extra}".strip())


GATE = (10.7646, 106.7786)
ROADS = json.loads((ROOT / "static" / "vn" / "geo.json").read_text())["roads"]
# A point that really is on Cầu Phú Mỹ, taken from the OSM extract itself, and a
# point far away in the city centre that must never match.
PHU_MY = ROADS["Cầu Phú Mỹ"][len(ROADS["Cầu Phú Mỹ"]) // 2]
NTD = ROADS["Nguyễn Thị Định"][len(ROADS["Nguyễn Thị Định"]) // 2]
FAR_AWAY = [106.700, 10.776]

# ============================================================ VIETMAP Route v4 ==
u = PV.vietmap_route_url([(10.837, 106.753), GATE], "container40",
                         depart_utc="2026-11-15T23:10:00Z", key="K")
t("vietmap url base", u.startswith("https://maps.vietmap.vn/api/route/v4?"))
t("vietmap sends the key as apikey", "apikey=K" in u)
t("vietmap sends both points as lat,lon", u.count("point=") == 2 and "point=10.837000,106.753000" in u)
t("vietmap container profile", "vehicle=container" in u)
t("vietmap sends gross weight", "capacity=30000" in u)
t("vietmap sends container length", "container_feet=40" in u)
t("vietmap asks for raw coordinates", "points_encoded=false" in u)
t("vietmap asks for congestion + toll", "annotations=congestion,toll" in u)
t("vietmap sends the departure time", "time=2026-11-15T23%3A10%3A00Z" in u or "time=2026-11-15T23:10:00Z" in u)
t("vietmap rigid-truck profile differs",
  "vehicle=truck" in PV.vietmap_route_url([(1, 2), (3, 4)], "truck", key="K"))
try:
    PV.vietmap_route_url([(1, 2)], key="K")
    t("vietmap rejects a one-point route", False)
except ValueError:
    t("vietmap rejects a one-point route", True)
try:
    PV.vietmap_route_url([(1, 2), (3, 4)], "bulldozer", key="K")
    t("vietmap rejects an unknown profile", False)
except ValueError:
    t("vietmap rejects an unknown profile", True)

# A path that actually reaches the gate, with a ramp and a turn.
VM_OK = {"code": "OK", "paths": [{
    "distance": 18240.4, "time": 2_280_000, "points_encoded": False,
    "bbox": [106.75, 10.73, 106.79, 10.84],
    "points": [[10.8370, 106.7530], [10.8000, 106.7600], [10.7800, 106.7700],
               [10.7700, 106.7760], [10.76462, 106.77858]],
    "instructions": [
        {"distance": 6100.0, "time": 760_000, "sign": 0, "interval": [0, 1],
         "text": "Đi theo Võ Chí Công", "street_name": "Võ Chí Công"},
        {"distance": 2400.0, "time": 300_000, "sign": 7, "interval": [1, 2],
         "text": "Đi bên phải vào đường nhánh", "street_name": "Nhánh Mỹ Thủy"},
        {"distance": 1200.0, "time": 150_000, "sign": 2, "interval": [2, 3],
         "text": "Rẽ phải vào Nguyễn Thị Định", "street_name": "Nguyễn Thị Định"},
        {"distance": 300.0, "time": 40_000, "sign": 4, "interval": [3, 4],
         "text": "Đến cổng Cảng Cát Lái", "street_name": "Nguyễn Thị Định"},
    ],
    "toll_cost": 80000,
    "tolls": [{"id": 1, "name": "Cầu Phú Mỹ", "type": "entry", "price": 80000}],
    "annotations": {"congestion": ["low", "moderate", "heavy", "moderate"]},
}]}
r = PV.parse_vietmap_route(VM_OK, gate=GATE)
t("vietmap flips [lat,lon] to [lon,lat]", r["coords"][0] == [106.753, 10.837], r["coords"][0])
t("vietmap keeps every shape point", len(r["coords"]) == 5)
t("vietmap distance in metres", r["distanceM"] == 18240.4)
t("vietmap time ms → seconds", r["durationS"] == 2280.0, r["durationS"])
t("vietmap keeps provider maneuver indexes",
  [m["at"] for m in r["maneuvers"]] == [0, 1, 2, 3])
t("vietmap names the turn kinds",
  [m["kind"] for m in r["maneuvers"]] == ["continue", "keep_right", "turn_right", "arrive"])
t("vietmap flags the ramp", [m["isRamp"] for m in r["maneuvers"]] == [False, True, False, False])
t("vietmap keeps the street name", r["maneuvers"][2]["street"] == "Nguyễn Thị Định")
t("vietmap reads the toll", r["tollVnd"] == 80000)
t("vietmap keeps congestion annotations", r["congestion"][2] == "heavy")
t("vietmap verifies the gate approach", r["gateApproach"]["endsAtGate"] is True)
t("vietmap gate gap is small", r["gateApproach"]["endGapM"] < 10, r["gateApproach"]["endGapM"])
t("vietmap final maneuver is the gate turn-in",
  r["gateApproach"]["finalManeuver"]["kind"] == "arrive")
t("vietmap marks a verified route navigable", r["navigable"] is True)

# Same path, but stopping 1.4 km short of the gate: a preview, not navigation.
VM_SHORT = json.loads(json.dumps(VM_OK))
VM_SHORT["paths"][0]["points"][-1] = [10.7770, 106.7786]
r2 = PV.parse_vietmap_route(VM_SHORT, gate=GATE)
t("vietmap detects a short approach", r2["gateApproach"]["endsAtGate"] is False)
t("vietmap reports how short", 1300 < r2["gateApproach"]["endGapM"] < 1500, r2["gateApproach"]["endGapM"])
t("vietmap refuses to call a short route navigable", r2["navigable"] is False)

for bad, why in [({"paths": []}, "no path"),
                 ({"paths": [{"points_encoded": True, "points": "a}b_c"}]}, "polyline"),
                 ({"paths": [{"points_encoded": False, "points": [[1, 2]]}]}, "one point")]:
    try:
        PV.parse_vietmap_route(bad, gate=GATE)
        t(f"vietmap rejects {why}", False)
    except RuntimeError:
        t(f"vietmap rejects {why}", True)

# ======================================================== TomTom Orbis incidents ==
u = PV.orbis_incidents_url()
t("orbis url base", u.startswith("https://api.tomtom.com/maps/orbis/traffic/incidents/details?"))
t("orbis sends apiVersion=2", "apiVersion=2" in u)
t("orbis sends the Cát Lái bbox", "bbox=106.69,10.62,106.82,10.86" in u)
t("orbis asks for present incidents", "timeValidity=present" in u)
t("orbis never puts the key in the url", "key=" not in u)
t("orbis asks for the fields we read", "magnitudeOfDelay" in PV.ORBIS_ATTRS
  and "probabilityOfOccurrence" in PV.ORBIS_ATTRS and "endTime" in PV.ORBIS_ATTRS)

NOW = 1_800_000_000.0        # fixed clock: these tests must not drift
AGO = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(NOW - 600))
SOON = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(NOW + 3600))
PAST = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(NOW - 300))
FRESH = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(NOW - 30))
OLD = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(NOW - 7200))

# Our trucks drive Cầu Phú Mỹ and Nguyễn Thị Định toward the gate.
BEAR = {}
for name, line in ROADS.items():
    if len(line) < 2:
        continue
    d = [(p[0] - GATE[1]) ** 2 + (p[1] - GATE[0]) ** 2 for p in line]
    BEAR[name] = PV._bearing(line[d.index(max(d))], line[d.index(min(d))])


def inc(iid, cat, geom, start=AGO, end=SOON, **extra):
    props = {"id": iid, "iconCategory": cat, "startTime": start, "endTime": end,
             "timeValidity": "present", "from": "A", "to": "B"}
    props.update(extra)
    return {"type": "Feature", "properties": props, "geometry": geom}


def line_along(name, i0, i1):
    return {"type": "LineString", "coordinates": [ROADS[name][i0], ROADS[name][i1]]}


def line_against(name, i0, i1):
    return {"type": "LineString", "coordinates": [ROADS[name][i1], ROADS[name][i0]]}


# Index pair on Cầu Phú Mỹ running the same way our trucks do.
pm = ROADS["Cầu Phú Mỹ"]
d_pm = [(p[0] - GATE[1]) ** 2 + (p[1] - GATE[0]) ** 2 for p in pm]
i_far, i_near = d_pm.index(max(d_pm)), d_pm.index(min(d_pm))

# 1. A confirmed, present full closure on our side removes the road.
res = PV.match_incidents(
    {"incidents": [inc("c1", "roadClosed", {"type": "LineString",
      "coordinates": [pm[i_far], pm[i_near]]}, magnitudeOfDelay="undefined")],
     "fetchedUtc": FRESH}, ROADS, now=NOW, travel_bearing=BEAR)
t("orbis closure removes the road", res["closedRoads"] == ["Cầu Phú Mỹ"], res["closedRoads"])
t("orbis closure is labelled a closure", res["events"][0]["effect"] == "closure")
t("orbis closure is not also an advisory", res["slowRoads"] == [])

# 2. A crash is an advisory with a delay, never a closure.
res = PV.match_incidents(
    {"incidents": [inc("a1", "accident", {"type": "Point", "coordinates": NTD},
                       delayInSeconds=420, magnitudeOfDelay="major")],
     "fetchedUtc": FRESH}, ROADS, now=NOW, travel_bearing=BEAR)
t("orbis crash is an advisory", res["events"][0]["effect"] == "advisory")
t("orbis crash slows but does not close",
  res["slowRoads"] == ["Nguyễn Thị Định"] and res["closedRoads"] == [])
t("orbis uses the provider's delay", res["events"][0]["delayS"] == 420)
t("orbis says the provider gave the delay", res["events"][0]["delayIsOurEstimate"] is False)

# 3. A lane closure with no delay figure gets OUR estimate, flagged as ours.
res = PV.match_incidents(
    {"incidents": [inc("l1", "laneClosed", {"type": "Point", "coordinates": NTD})],
     "fetchedUtc": FRESH}, ROADS, now=NOW, travel_bearing=BEAR)
t("orbis lane closure is an advisory", res["events"][0]["effect"] == "advisory")
t("orbis estimates a missing delay", res["events"][0]["delayS"] == PV.DEFAULT_DELAY_S["laneClosed"])
t("orbis admits the delay is ours", res["events"][0]["delayIsOurEstimate"] is True)
t("orbis says so in the evidence line", "OUR ESTIMATE" in res["events"][0]["evidence"])

# 4. An opposite-direction closure does not touch our side.
res = PV.match_incidents(
    {"incidents": [inc("o1", "roadClosed", {"type": "LineString",
      "coordinates": [pm[i_near], pm[i_far]]})],
     "fetchedUtc": FRESH}, ROADS, now=NOW, travel_bearing=BEAR)
t("orbis spots the opposite carriageway", res["events"][0]["oppositeDirection"] is True)
t("orbis does not close our side for it", res["closedRoads"] == [], res["closedRoads"])
t("orbis does not slow our side for it", res["slowRoads"] == [])

# 5. A cleared closure (endTime in the past) stops steering trucks.
res = PV.match_incidents(
    {"incidents": [inc("x1", "roadClosed", {"type": "LineString",
      "coordinates": [pm[i_far], pm[i_near]]}, start=OLD, end=PAST)],
     "fetchedUtc": FRESH}, ROADS, now=NOW, travel_bearing=BEAR)
t("orbis drops a cleared closure", res["closedRoads"] == [] and res["events"] == [])
t("orbis says why it was dropped", res["skipped"][0]["why"] == "cleared")
t("orbis records how long ago it cleared", res["skipped"][0]["endedMinAgo"] == 5)

# 6. A future incident is not applied now.
res = PV.match_incidents(
    {"incidents": [inc("f1", "roadClosed", {"type": "Point", "coordinates": NTD},
                       start=SOON, end=None, timeValidity="future")],
     "fetchedUtc": FRESH}, ROADS, now=NOW, travel_bearing=BEAR)
t("orbis ignores a future incident", res["closedRoads"] == [])
t("orbis says it has not started", res["skipped"][0]["why"] == "not started yet")

# 7. A stale response never removes a route, but still reports what it saw.
res = PV.match_incidents(
    {"incidents": [inc("s1", "roadClosed", {"type": "LineString",
      "coordinates": [pm[i_far], pm[i_near]]})],
     "fetchedUtc": OLD}, ROADS, now=NOW, travel_bearing=BEAR)
t("orbis marks a stale response", res["stale"] is True)
t("orbis applies no closure when stale", res["closedRoads"] == [], res["closedRoads"])
t("orbis still lists the stale incident", len(res["events"]) == 1)
t("orbis explains the staleness", "Stale provider response" in res["note"])
t("orbis downgrades the tier when stale", res["tier"].endswith("(stale)"))

# 8. An incident off our corridor is skipped with the distance recorded.
res = PV.match_incidents(
    {"incidents": [inc("n1", "roadClosed", {"type": "Point", "coordinates": FAR_AWAY})],
     "fetchedUtc": FRESH}, ROADS, now=NOW, travel_bearing=BEAR)
t("orbis skips an off-corridor incident", res["closedRoads"] == [] and res["events"] == [])
t("orbis says it was off corridor", res["skipped"][0]["why"] == "off corridor")
t("orbis records the nearest distance", res["skipped"][0]["nearestM"] > 180)

# 9. An uncertain closure is not treated as one.
res = PV.match_incidents(
    {"incidents": [inc("p1", "roadClosed", {"type": "LineString",
      "coordinates": [pm[i_far], pm[i_near]]}, probabilityOfOccurrence="risk_of")],
     "fetchedUtc": FRESH}, ROADS, now=NOW, travel_bearing=BEAR)
t("orbis will not close on an uncertain report", res["closedRoads"] == [])
t("orbis keeps it as an advisory event", res["events"][0]["effect"] == "advisory")

# 10. Closures sort ahead of advisories.
res = PV.match_incidents(
    {"incidents": [inc("a2", "jam", {"type": "Point", "coordinates": NTD}, delayInSeconds=60),
                   inc("c2", "roadClosed", {"type": "LineString",
                       "coordinates": [pm[i_far], pm[i_near]]})],
     "fetchedUtc": FRESH}, ROADS, now=NOW, travel_bearing=BEAR)
t("orbis puts closures first", res["events"][0]["effect"] == "closure")
t("orbis handles both at once",
  res["closedRoads"] == ["Cầu Phú Mỹ"] and res["slowRoads"] == ["Nguyễn Thị Định"])

# 11. Empty and malformed responses are survivable.
t("orbis handles an empty response",
  PV.match_incidents({"incidents": []}, ROADS, now=NOW)["events"] == [])
t("orbis handles a null response", PV.match_incidents(None, ROADS, now=NOW)["closedRoads"] == [])
res = PV.match_incidents({"incidents": [inc("g1", "accident", {"type": "Point", "coordinates": []})],
                          "fetchedUtc": FRESH}, ROADS, now=NOW)
t("orbis skips an incident with no geometry", res["skipped"][0]["why"] == "no geometry")

# ============================================================== AISStream ==
m = PV.ais_subscribe_msg("AK")
t("ais subscribes with the key", m["APIKey"] == "AK")
t("ais sends one bounding box", len(m["BoundingBoxes"]) == 1 and len(m["BoundingBoxes"][0]) == 2)
t("ais box is latitude-first", m["BoundingBoxes"][0][0] == [10.730, 106.760])
t("ais box is tight on Cát Lái",
  abs(m["BoundingBoxes"][0][1][0] - 10.800) < 1e-9 and abs(m["BoundingBoxes"][0][1][1] - 106.840) < 1e-9)
t("ais asks for positions and static data",
  m["FilterMessageTypes"] == ["PositionReport", "ShipStaticData"])

ves = {}
POS = {"MessageType": "PositionReport",
       "MetaData": {"MMSI": 574001234, "ShipName": "  BIEN DONG STAR  ", "time_utc": "2026-11-15 03:12:00"},
       "Message": {"PositionReport": {"UserID": 574001234, "Latitude": 10.7712, "Longitude": 106.7905,
                                      "Sog": 0.1, "Cog": 212.4, "NavigationalStatus": 5, "Valid": True}}}
t("ais folds a position report", PV.parse_ais_message(POS, ves, NOW) is True)
v = ves["574001234"]
t("ais trims the ship name", v["name"] == "BIEN DONG STAR")
t("ais keeps the position", (v["lat"], v["lon"]) == (10.7712, 106.7905))
t("ais keeps speed and course", v["sog"] == 0.1 and v["cog"] == 212.4)
t("ais reports moored from status 5", v["moored"] is True)
t("ais stamps last-seen", v["seenAt"] == NOW)
t("ais keeps the provider timestamp", v["timeUtc"] == "2026-11-15 03:12:00")

STATIC_MSG = {"MessageType": "ShipStaticData", "MetaData": {"MMSI": 574001234},
              "Message": {"ShipStaticData": {"Type": 70, "CallSign": "3WAB",
                                             "Dimension": {"A": 180}}}}
t("ais folds static data", PV.parse_ais_message(STATIC_MSG, ves, NOW) is True)
t("ais keeps the vessel type", ves["574001234"]["type"] == 70)
t("ais keeps the position after static data", ves["574001234"]["lat"] == 10.7712)

t("ais ignores an invalid fix", PV.parse_ais_message(
    {"MessageType": "PositionReport", "MetaData": {"MMSI": 1},
     "Message": {"PositionReport": {"Latitude": 1, "Longitude": 2, "Valid": False}}}, {}, NOW) is False)
t("ais ignores a message with no mmsi", PV.parse_ais_message({"MessageType": "PositionReport"}, {}, NOW) is False)
t("ais ignores an unknown message type", PV.parse_ais_message(
    {"MessageType": "AidsToNavigationReport", "MetaData": {"MMSI": 9}}, {}, NOW) is False)

snap = PV.ais_snapshot(ves, NOW)
t("ais snapshot counts the vessel", snap["count"] == 1 and snap["currentCount"] == 1)
t("ais snapshot marks a fresh fix current", snap["vessels"][0]["current"] is True)
t("ais snapshot reports the bounding box", snap["box"] == PV.AIS_BOX)
t("ais snapshot carries the caveat", "working cargo" in snap["caveat"])
stale = PV.ais_snapshot(ves, NOW + 4000)
t("ais snapshot ages a fix out", stale["vessels"][0]["current"] is False and stale["currentCount"] == 0)
t("ais snapshot reports the age", stale["vessels"][0]["ageS"] == 4000)
t("ais snapshot drops a vessel with no position", PV.ais_snapshot({"7": {"mmsi": "7"}}, NOW)["count"] == 0)

c = PV.AisClient(key=None, cache="/nonexistent/ais.json")
t("ais client without a key will not start", c.start() is False)
t("ais client says why", c.status == "no-key")
st = c.state()
t("ais client reports not-live", st["live"] is False and st["mode"] == "no-key")
t("ais client marks the tier unavailable", st["tier"] == "UNAVAILABLE")

# ===================================================== Vietnamese speech ==
b = PV.google_stt_body("QUJD", "WEBM_OPUS", 48000)
t("stt asks for Vietnamese", b["config"]["languageCode"] == "vi-VN")
t("stt uses a model that supports vi-VN", b["config"]["model"] in ("chirp", "chirp_2", "chirp_3", "long", "short"))
t("stt sends the audio", b["audio"]["content"] == "QUJD")
t("stt sends the encoding and rate",
  b["config"]["encoding"] == "WEBM_OPUS" and b["config"]["sampleRateHertz"] == 48000)
hints = b["config"]["speechContexts"][0]["phrases"]
t("stt boosts Mỹ Thủy", "Mỹ Thủy" in hints)
t("stt boosts Phú Mỹ", "Phú Mỹ" in hints)
t("stt boosts Cát Lái and Đồng Văn Cống", "Cát Lái" in hints and "Đồng Văn Cống" in hints)

g = PV.parse_google_stt({"results": [
    {"alternatives": [{"transcript": "Kẹt cứng ở vòng xoay Mỹ Thủy", "confidence": 0.91}]},
    {"alternatives": [{"transcript": "hướng về Phú Mỹ", "confidence": 0.87}]}]})
t("stt joins the result segments", g["text"] == "Kẹt cứng ở vòng xoay Mỹ Thủy hướng về Phú Mỹ", g["text"])
t("stt keeps the Vietnamese diacritics", "Mỹ Thủy" in g["text"] and "Phú Mỹ" in g["text"])
t("stt averages the confidence", g["confidence"] == 0.89, g["confidence"])
t("stt always demands driver review", g["needsReview"] is True)
t("stt names the provider", "Google" in g["provider"] and "vi-VN" in g["provider"])

o = PV.parse_openai_stt({"text": "  Ngập nước trên Đồng Văn Cống  "})
t("stt parses an openai reply", o["text"] == "Ngập nước trên Đồng Văn Cống")
t("stt openai also demands review", o["needsReview"] is True)
t("stt openai names the model", PV.OPENAI_STT_MODEL in o["provider"])

for bad, parser in [({"results": []}, PV.parse_google_stt),
                    ({"results": [{"alternatives": [{"transcript": "  "}]}]}, PV.parse_google_stt),
                    ({"text": ""}, PV.parse_openai_stt),
                    (None, PV.parse_google_stt)]:
    try:
        parser(bad)
        t(f"stt rejects {bad}", False)
    except RuntimeError:
        t("stt rejects an empty transcription", True)

try:
    PV.transcribe(b"")
    t("stt rejects empty audio", False)
except ValueError:
    t("stt rejects empty audio", True)
try:
    PV.transcribe(b"x" * (PV.MAX_AUDIO_BYTES + 1))
    t("stt rejects oversized audio", False)
except ValueError:
    t("stt rejects oversized audio", True)

# ================================================================= env ==
t("env returns None for an unset variable", PV.env("DISPATCHMONKEY_DEFINITELY_UNSET") is None)

print(f"{OK} passed, {len(FAIL)} failed")
for f in FAIL:
    print("  FAIL:", f)
sys.exit(1 if FAIL else 0)
