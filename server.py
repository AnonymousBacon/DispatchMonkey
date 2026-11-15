#!/usr/bin/env python3
"""Detour Receipt server.

Three jobs only:
  GET  /                serve static/
  GET  /api/chp         proxy the real CHP incident feed (the browser cannot: no CORS)
  POST /api/explain     ask a language model to write prose from numbers we computed

The model is never asked for a figure. See PROMPTS below.
Run:  python3 server.py   then open http://localhost:8787
"""
import base64, hashlib, json, math, re, subprocess, shutil, sys, os, urllib.request
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse, parse_qs

ROOT = Path(__file__).resolve().parent
STATIC = ROOT / "static"
CACHE = ROOT / ".cache"          # model replies, so a demo re-run is instant
PORT = int(os.environ.get("PORT", 8787))
CHP_URL = "https://media.chp.ca.gov/sa_xml/sa.xml"
NEAR_MI = 4.0           # how close a statewide incident must be to count as ours
CHP_TIMEOUT = 20

# ---------------------------------------------------------------- CHP feed ----
LOG_RE = re.compile(r"<Log ID = \"(?P<id>[^\"]+)\">(?P<body>.*?)</Log>", re.S)


def _tag(body, name):
    m = re.search(rf"<{name}>\"?(.*?)\"?</{name}>", body, re.S)
    return (m.group(1).strip() if m else "")


def classify(log_type):
    """Map a CHP log type to a travel-time effect.

    These effects are OUR ESTIMATES. The CHP feed says what happened and where;
    it does not say how far the queue stretches or how slow it is.
    """
    t = log_type.lower()
    if "clos" in t or "road closed" in t:
        return "closure", {"closed": True}, 1.5
    if "fire" in t:
        return "fire", {"slow": 2.5}, 1.5
    if "collision" in t:
        inj = "no inj" not in t
        return "collision", {"slow": 4.5 if inj else 3.0}, 2.5 if inj else 1.5
    if "hazard" in t:
        return "hazard", {"slow": 1.6}, 0.8
    if "animal" in t or "pedestrian" in t:
        return "hazard", {"slow": 1.4}, 0.6
    return "other", {"slow": 1.3}, 0.6


def mi(lon1, lat1, lon2, lat2):
    x = (lon2 - lon1) * math.cos(math.radians((lat1 + lat2) / 2)) * 69.17
    return math.hypot(x, (lat2 - lat1) * 69.05)


_corridor_pts = None


def corridor_points():
    global _corridor_pts
    if _corridor_pts is None:
        geo = json.loads((ROOT / "archive" / "la-detour-receipt" / "geo.json").read_text())  # old LA demo, archived
        _corridor_pts = [p for line in geo["corridors"].values() for p in line]
    return _corridor_pts


def fetch_chp():
    req = urllib.request.Request(CHP_URL, headers={"User-Agent": "detour-receipt-hackathon/0.1"})
    with urllib.request.urlopen(req, timeout=CHP_TIMEOUT) as r:
        xml = r.read().decode("utf-8", "replace")

    pts = corridor_points()
    out, total = [], 0
    for m in LOG_RE.finditer(xml):
        total += 1
        body = m.group("body")
        latlon = _tag(body, "LATLON")
        if ":" not in latlon:
            continue
        a, b = latlon.split(":", 1)
        try:
            lat, lon = int(a) / 1e6, -abs(int(b)) / 1e6
        except ValueError:
            continue
        if not (32.0 < lat < 42.5 and -125 < lon < -114):
            continue
        d = min(mi(p[0], p[1], lon, lat) for p in pts)
        if d > NEAR_MI:
            continue

        log_type = _tag(body, "LogType")
        kind, effect, radius = classify(log_type)
        desc = _tag(body, "LocationDesc") or _tag(body, "Location")
        out.append({
            "id": "CHP-" + m.group("id"),
            "kind": kind, "source": "CHP (live)", "confirmed": True, "confidence": 0.9,
            "lat": round(lat, 5), "lon": round(lon, 5), "radiusMi": radius,
            "effect": effect, "at": 0,
            "text": f"{log_type} — {desc}".strip(" —"),
            "evidence": (f"Live CHP incident feed, {_tag(body, 'LogTime')}, {d:.1f} mi from our corridor. "
                         "The incident is real; the backup radius and slowdown factor are OUR ESTIMATES."),
        })
    out.sort(key=lambda e: (0 if e["effect"].get("closed") else 1, -e["effect"].get("slow", 0)))
    return {"total": total, "radiusMi": NEAR_MI, "events": out[:8]}


# ------------------------------------------------------------------ model ----
# Prompts are kept terse on purpose: on this CLI, latency scales with prompt
# length (a 1,950-char prompt took 66 s, a 700-char one takes 5 s).
RULE = ("Plain factual English for a lorry dispatcher. Copy figures exactly from the JSON; "
        "never compute or invent one. Never call a road closed unless confirmed is true. "
        "One paragraph, no lists, no preamble.")

PROMPTS = {
    "watcher": RULE + " In under 25 words: what changed and does it matter. JSON:\n",
    "planner": RULE + (" Pick the 2 most important of tradeOffs given the weights and join "
                       "them into one sentence under 30 words, starting 'Ranked first because'. "
                       "Keep every more/fewer/less/MORE/FEWER/LESS pointing the same way as "
                       "written, but write them in normal lower case. JSON:\n"),
}

CLAUDE = shutil.which("claude")
NUM_RE = re.compile(r"\d+(?:\.\d+)?")


def check_no_invented_numbers(text, facts):
    """Reject a reply containing a figure that is not in the facts we supplied.

    This is the guard behind the claim that the model never produces a number.
    shortcut: substring matching, so it catches invented magnitudes (a '47' that
    appears nowhere) but not a digit reshuffle inside a number that does appear.
    Upgrade to token-level matching if that ever matters.
    """
    haystack = json.dumps(facts)
    bad = [n for n in NUM_RE.findall(text) if n not in haystack]
    if bad:
        raise RuntimeError(f"model produced figures not present in the data: {', '.join(bad)}")


def explain(kind, facts):
    """Call the model. Returns text, or raises so the browser keeps its own sentence."""
    if kind not in PROMPTS:
        raise ValueError("unknown kind")
    prompt = PROMPTS[kind] + json.dumps(facts, separators=(",", ":"))
    if not CLAUDE:
        raise RuntimeError("no model backend available")

    key = hashlib.sha256(prompt.encode()).hexdigest()[:40]
    cached = CACHE / f"{kind}-{key}.txt"
    if cached.exists():
        return cached.read_text()
    # --strict-mcp-config with an empty config is the difference between 2 s and
    # 40 s: otherwise the CLI boots every MCP server on this machine first.
    p = subprocess.run(
        [CLAUDE, "-p", prompt, "--model", "claude-haiku-4-5-20251001",
         "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}'],
        capture_output=True, text=True, timeout=90,
        # Without DEVNULL the CLI reads the server's inherited stdin, answers the
        # wrong question and takes 6x as long.
        stdin=subprocess.DEVNULL,
    )
    if p.returncode != 0:
        raise RuntimeError((p.stderr or "model call failed").strip()[:200])
    text = " ".join(p.stdout.split())
    if not text:
        raise RuntimeError("empty model reply")
    check_no_invented_numbers(text, facts)
    CACHE.mkdir(exist_ok=True)
    cached.write_text(text)
    print(f"[model:{kind}] {text}", flush=True)
    return text


# ------------------------------------------------------- shared demo state ----
# One scenario state shared by the dispatcher website (/) and the phone (/vn/), so a
# Re-plan on the website changes what the driver sees. In memory only: no driver
# data, no locations, nothing personal. Pages fall back to local state if this is down.
import threading, time
STATE_LOCK = threading.Lock()
STATE = {"step": 0, "approved": False, "trust": False, "reports": 0, "rev": 0, "updated": 0}
STATE_KEYS = {"step": int, "approved": bool, "trust": bool, "reports": int}


def set_state(patch):
    with STATE_LOCK:
        for k, typ in STATE_KEYS.items():
            if k in patch:
                v = typ(patch[k])
                if k == "step":
                    v = max(0, min(4, v))
                if k == "reports":
                    v = max(0, min(99, v))
                STATE[k] = v
        STATE["rev"] += 1
        STATE["updated"] = time.time()
        return dict(STATE)


DISPATCH = STATIC / "vn" / "dispatch.html"


# ------------------------------------------------ driver community feed ----
# Short reports drivers post from the cab: a jam, a blocked lane, water on the
# road. Shared across phones so a second driver can confirm the first one's
# report, which is what moves it up the evidence ladder. Kept on disk so a
# server restart during the demo does not wipe the thread.
#
# Deliberately minimal personal data: a per-phone random id (not a login, not a
# name), the corridor the driver is on, and a coarse road name. No coordinates,
# no live location, no device ids. CONFIRMERS holds ids only so one phone cannot
# confirm the same report twice; it is never sent to a client.
POSTS_FILE = ROOT / "data" / "logs" / "posts.jsonl"
POSTS_LOCK = threading.Lock()
POSTS = []
POST_CATS = {"crash", "blocked_lane", "full_closure", "breakdown",
             # a truck-parking lot reported full, closed or not truck-accessible:
             # same feed, same server timestamp, same corroboration rules
             "flooding", "roadwork", "traffic", "gate_queue", "question", "parking"}
ROADS = {"Nguyễn Thị Định", "Đồng Văn Cống", "Mỹ Thủy", "Võ Chí Công",
         "Cầu Phú Mỹ", "Nguyễn Lương Bằng", "Mai Chí Thọ", "Nguyễn Văn Linh", ""}
# An authority or the dispatcher must sign off before a report is allowed to
# remove a road from planning. Drivers alone can reach "confirmed", not "closed".
CONFIRM_FOR_CONFIRMED = 2
POST_TTL_S = 3 * 3600


def _load_posts():
    if not POSTS_FILE.exists():
        return
    for line in POSTS_FILE.read_text().splitlines():
        try:
            POSTS.append(json.loads(line))
        except ValueError:
            pass                                    # a half-written line from a kill -9


def _post_state(p, now):
    """unverified → corroborated → confirmed, and expired once it is stale.

    The author counts as the first source, so sources = confirms + 1. Expiry is
    by age, not by a driver saying so: a report nobody has renewed is exactly
    the kind of thing that should stop steering trucks."""
    if now - p["at"] > POST_TTL_S or p.get("cleared"):
        return "expired"
    if p["cat"] == "question":
        return "question"
    sources = p["confirms"] + 1
    if sources > CONFIRM_FOR_CONFIRMED:
        return "confirmed"
    if sources == CONFIRM_FOR_CONFIRMED:
        return "corroborated"
    return "unverified"


def public_posts(corridor=None):
    now = time.time()
    with POSTS_LOCK:
        out = []
        for p in POSTS:
            if corridor and p.get("corridor") and p["corridor"] != corridor:
                continue
            q = {k: v for k, v in p.items() if k != "confirmers"}
            q["state"] = _post_state(p, now)
            q["ageS"] = int(now - p["at"])
            out.append(q)
    out.sort(key=lambda q: q["at"], reverse=True)
    return {"posts": out[:60], "now": now,
            "confirmsForConfirmed": CONFIRM_FOR_CONFIRMED, "ttlS": POST_TTL_S,
            "source": "DispatchMonkey driver reports", "tier": "DRIVER-REPORTED"}


def add_post(req, author):
    cat = req.get("cat")
    if cat not in POST_CATS:
        raise ValueError("unknown category")
    road = (req.get("road") or "").strip()
    if road not in ROADS:
        raise ValueError("unknown road")
    text = (req.get("text") or "").strip()[:280]
    if not text:
        raise ValueError("empty report")
    photo = req.get("photo")
    if photo and not (isinstance(photo, str) and photo.startswith("data:image/jpeg;base64,")
                      and len(photo) < 400_000):
        raise ValueError("bad photo")
    # The clip itself, so other drivers can hear it rather than only read a caption.
    # Capped at roughly a minute of Opus; anything longer is a caption, not a report.
    voice = req.get("voice")
    if voice and not (isinstance(voice, str) and voice.startswith("data:audio/")
                      and ";base64," in voice[:40] and len(voice) < 900_000):
        raise ValueError("bad voice clip")
    p = {"id": f"p{int(time.time() * 1000) % 10_000_000}{len(POSTS)}",
         "at": time.time(), "by": author, "cat": cat, "road": road, "text": text,
         "dir": (req.get("dir") or "")[:24], "corridor": (req.get("corridor") or "")[:40],
         "lang": "vi" if req.get("lang") == "vi" else "en",
         "confirms": 0, "confirmers": [], "cleared": False,
         # Browser camera access can be fed a virtual device, so "captured in
         # app" is a provenance note, never proof the photo is of this road.
         "photo": photo or None, "captured": bool(photo) and bool(req.get("inApp")),
         "replyTo": (req.get("replyTo") or "")[:24] or None,
         # Stored text is always the caption the DRIVER confirmed. asr names the
         # provider that drafted it (when one was configured) and asrEdited says
         # whether the driver changed the draft before sending.
         "voiceS": int(req.get("voiceS") or 0),
         "voice": voice or None,
         "asr": (req.get("asr") or "")[:60] or None,
         "asrEdited": bool(req.get("asrEdited"))}
    with POSTS_LOCK:
        POSTS.append(p)
        try:
            POSTS_FILE.parent.mkdir(parents=True, exist_ok=True)
            with open(POSTS_FILE, "a") as fh:
                fh.write(json.dumps(p, ensure_ascii=False) + "\n")
        except OSError:
            pass                                    # demo keeps working from memory
    return public_posts()


def confirm_post(pid, who, cleared=False):
    with POSTS_LOCK:
        for p in POSTS:
            if p["id"] == pid:
                if who in p["confirmers"] or who == p["by"]:
                    # One phone is one source. The driver who filed it is already
                    # counted, so self-confirming would manufacture agreement.
                    raise ValueError("already counted")
                p["confirmers"].append(who)
                p["confirms"] = len(p["confirmers"])
                if cleared:
                    p["cleared"] = True
                break
        else:
            raise ValueError("no such report")
    return public_posts()


def reset_posts():
    """Demo reset: start the next run with an empty feed. The old thread is kept
    on disk (renamed with a timestamp), never deleted."""
    with POSTS_LOCK:
        POSTS.clear()
        if POSTS_FILE.exists():
            POSTS_FILE.rename(POSTS_FILE.with_name(f"posts-{int(time.time())}.jsonl"))


# ------------------------------------------------- live traffic (TomTom) ----
# Measured speed on the gate approach, the only live signal about the jam. Key from .env
# (gitignored). Cached 60 s; every fetch is appended to data/logs/flow.jsonl.
def _env(name):
    v = os.environ.get(name)
    if v:
        return v
    f = ROOT / ".env"
    if f.exists():
        for line in f.read_text().splitlines():
            if line.startswith(name + "="):
                return line.split("=", 1)[1].strip()
    return None


FLOW_POINTS = [  # mid-points of the OSM ways in static/vn/geo.json
    ("Cầu Phú Mỹ", 10.74114, 106.7369),
    ("Nguyễn Thị Định (gate approach)", 10.77525, 106.76788),
    ("Đồng Văn Cống", 10.77899, 106.7574),
]
_flow_cache = {"t": 0, "data": None}


def fetch_flow():
    if time.time() - _flow_cache["t"] < 60 and _flow_cache["data"]:
        return _flow_cache["data"]
    key = _env("TOMTOM_KEY")
    if not key:
        raise RuntimeError("no TOMTOM_KEY in .env")
    out = []
    for name, lat, lon in FLOW_POINTS:
        url = ("https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json"
               f"?point={lat},{lon}&unit=KMPH&key={key}")
        raw = subprocess.run(["curl", "-s", "-m", "10", url], capture_output=True, check=True).stdout
        f = json.loads(raw)["flowSegmentData"]
        out.append({"road": name, "kmh": f["currentSpeed"], "freeKmh": f["freeFlowSpeed"],
                    "ratio": round(f["currentSpeed"] / max(1, f["freeFlowSpeed"]), 2),
                    "confidence": f.get("confidence"), "closed": f.get("roadClosure", False)})
    data = {"source": "TomTom Traffic Flow Segment v4", "tier": "REAL-LIVE",
            "fetched_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "fetched_hcmc": time.strftime("%H:%M", time.gmtime(time.time() + 7 * 3600)), "segments": out}
    _flow_cache.update(t=time.time(), data=data)
    try:
        (ROOT / "data" / "logs").mkdir(parents=True, exist_ok=True)
        with open(ROOT / "data" / "logs" / "flow.jsonl", "a") as fh:
            fh.write(json.dumps(data, ensure_ascii=False) + "\n")
    except OSError:
        pass
    return data


# ------------------------------------------------- provider integrations ----
# Parsing and decision rules live in providers.py so they can be tested from
# fixtures with no key and no network (tools/test_providers.py).
import providers as PV

VN_GEO = STATIC / "vn" / "geo.json"
GATE_LATLON = (10.7646, 106.7786)
_geo_cache = None


def vn_roads():
    """{road name: [[lon,lat], ...]} from the OSM extract the app already ships."""
    global _geo_cache
    if _geo_cache is None:
        try:
            _geo_cache = json.loads(VN_GEO.read_text()).get("roads") or {}
        except (OSError, ValueError):
            _geo_cache = {}
    return _geo_cache


def travel_bearings():
    """Direction OUR trucks drive each road: away-from-gate end → toward-gate end.

    Derived from the road's own shape plus the gate position, so an incident on
    the opposite carriageway can be told apart from one on ours.
    """
    glat, glon = GATE_LATLON
    out = {}
    for name, line in vn_roads().items():
        if len(line) < 2:
            continue
        d = [(p[0] - glon) ** 2 + (p[1] - glat) ** 2 for p in line]
        far, near = line[d.index(max(d))], line[d.index(min(d))]
        out[name] = PV._bearing(far, near)
    return out


_inc_cache = {"t": 0, "data": None}


def fetch_incidents(dir_="to"):
    """TomTom Orbis incidents, matched to our corridor / direction / time window."""
    if time.time() - _inc_cache["t"] < 45 and _inc_cache["data"]:
        return _inc_cache["data"]
    key = PV.env("TOMTOM_KEY")
    if not key:
        raise RuntimeError("no TOMTOM_KEY in .env")
    raw = PV.curl_json(PV.orbis_incidents_url(),
                       {"TomTom-Api-Key": key, "Attributes": PV.ORBIS_ATTRS})
    raw["fetchedUtc"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    bearings = travel_bearings()
    if dir_ == "from":                       # leaving the port: the reverse side is ours
        bearings = {k: (v + 180) % 360 for k, v in bearings.items()}
    data = PV.match_incidents(raw, vn_roads(), travel_bearing=bearings)
    data["fetchedUtc"] = raw["fetchedUtc"]
    data["direction"] = dir_
    _inc_cache.update(t=time.time(), data=data)
    try:
        (ROOT / "data" / "logs").mkdir(parents=True, exist_ok=True)
        with open(ROOT / "data" / "logs" / "incidents.jsonl", "a") as fh:
            fh.write(json.dumps(data, ensure_ascii=False) + "\n")
    except OSError:
        pass
    return data


ORIGIN_LATLON = {                            # same staging points as static/vn/data.js
    "hiep-phuoc": (10.671, 106.738),
    "song-than": (10.837, 106.753),
    "long-hau": (10.639, 106.714),
}
_route_cache = {}


def fetch_route(origin, profile="container40", depart_utc=None):
    """VIETMAP Route v4 for one yard → the Cát Lái gate, truck/container profile."""
    o = ORIGIN_LATLON.get(origin)
    if not o:
        raise ValueError("unknown origin")
    ck = (origin, profile, depart_utc)
    hit = _route_cache.get(ck)
    if hit and time.time() - hit[0] < 300:
        return hit[1]
    key = PV.env("VIETMAP_KEY")
    if not key:
        raise RuntimeError("no VIETMAP_KEY in .env")
    url = PV.vietmap_route_url([o, GATE_LATLON], profile, depart_utc, key=key)
    data = PV.parse_vietmap_route(PV.curl_json(url), gate=GATE_LATLON)
    data["origin"] = origin
    data["profile"] = profile
    data["profileLabel"] = PV.TRUCK_PROFILES[profile]["label"]
    data["departUtc"] = depart_utc
    _route_cache[ck] = (time.time(), data)
    return data


# One AIS client for the process. start() is a no-op without a key or the
# websockets package; state() then reports why and serves the cached snapshot.
AIS = PV.AisClient(PV.env("AISSTREAM_KEY"))


# ----------------------------------------------------------------- server ----
class H(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(STATIC), **kw)

    def _send(self, code, obj):
        b = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def end_headers(self):
        # No caching: teammates editing JS during the hackathon must see their
        # change on reload, not a stale file.
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def do_GET(self):
        path = self.path.split("?")[0]
        if path in ("/", "/index.html"):
            # The website is the dispatcher. Same file as /vn/dispatch.html, with a <base>
            # so its relative links (data.js, geo.json, ../vendor/) resolve under /vn/.
            html = DISPATCH.read_text().replace("<head>", '<head>\n<base href="/vn/">', 1).encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(html)))
            self.end_headers()
            self.wfile.write(html)
            return
        if path == "/api/flow":
            try:
                self._send(200, fetch_flow())
            except Exception as e:
                self._send(503, {"error": f"{type(e).__name__}"[:80]})   # never echo the URL (it has the key)
            return
        if path == "/api/incidents":
            q = parse_qs(urlparse(self.path).query)
            try:
                self._send(200, fetch_incidents((q.get("dir") or ["to"])[0]))
            except Exception as e:
                # Never echo the URL or the message: both can carry the key.
                self._send(503, {"error": f"{type(e).__name__}"[:80],
                                 "provider": "TomTom Orbis Traffic Incident Details v2",
                                 "configured": bool(PV.env("TOMTOM_KEY"))})
            return
        if path == "/api/route":
            q = parse_qs(urlparse(self.path).query)
            try:
                self._send(200, fetch_route((q.get("from") or ["song-than"])[0],
                                            (q.get("profile") or ["container40"])[0],
                                            (q.get("depart") or [None])[0]))
            except Exception as e:
                self._send(503, {"error": f"{type(e).__name__}"[:80],
                                 "provider": "VIETMAP Route v4",
                                 "configured": bool(PV.env("VIETMAP_KEY"))})
            return
        if path == "/api/lane-rules":
            # data/ is outside the static root and is owned by the DATA role, so it
            # is served from here rather than copied into static/.
            try:
                self._send(200, json.loads((ROOT / "data" / "vn" / "lane_rules.json").read_text()))
            except Exception as e:
                self._send(503, {"error": f"{type(e).__name__}"[:80]})
            return
        if path == "/api/truck-parking":
            # Same reason as lane-rules: data/ is outside the static root.
            try:
                self._send(200, json.loads((ROOT / "data" / "vn" / "truck_parking.json").read_text()))
            except Exception as e:
                self._send(503, {"error": f"{type(e).__name__}"[:80]})
            return
        if path == "/api/vessels":
            AIS.start()                      # idempotent; no-op without a key
            self._send(200, AIS.state())
            return
        if path == "/api/state":
            with STATE_LOCK:
                self._send(200, dict(STATE))
            return
        if path == "/api/posts":
            q = parse_qs(urlparse(self.path).query)
            self._send(200, public_posts((q.get("corridor") or [None])[0]))
            return
        if self.path.startswith("/api/chp"):
            try:
                self._send(200, fetch_chp())
            except Exception as e:
                self._send(502, {"error": f"{type(e).__name__}: {e}"})
            return
        super().do_GET()

    def do_POST(self):
        path = self.path.split("?")[0]
        if path in ("/api/posts", "/api/posts/confirm"):
            try:
                # A photo and a voice clip are the only large fields.
                n = int(self.headers.get("Content-Length") or 0)
                if n > 1_500_000:
                    raise ValueError("payload too large")
                req = json.loads(self.rfile.read(n) or b"{}")
                who = str(req.get("who") or "")[:40]
                if not who:
                    raise ValueError("missing phone id")
                if path.endswith("/confirm"):
                    self._send(200, confirm_post(str(req.get("id"))[:24], who,
                                                 bool(req.get("cleared"))))
                else:
                    self._send(200, add_post(req, who))
            except Exception as e:
                self._send(400, {"error": str(e)[:200]})
            return
        if path == "/api/transcribe":
            # Returns a DRAFT transcript. The driver edits and confirms it in the
            # composer; nothing is posted from this endpoint.
            try:
                n = int(self.headers.get("Content-Length") or 0)
                if n > 12_000_000:
                    raise ValueError("payload too large")
                req = json.loads(self.rfile.read(n) or b"{}")
                b64 = (req.get("audio") or "").split(",")[-1]
                audio = base64.b64decode(b64, validate=True)
                out = PV.transcribe(audio, req.get("mime") or "audio/webm",
                                    int(req.get("rate") or 48000))
                out["draft"] = True
                self._send(200, out)
            except Exception as e:
                self._send(503, {"error": str(e)[:160], "draft": False,
                                 "configured": bool(PV.env("GOOGLE_STT_KEY")
                                                    or PV.env("OPENAI_API_KEY"))})
            return
        if path == "/api/state":
            try:
                n = int(self.headers.get("Content-Length") or 0)
                if n > 2000:
                    raise ValueError("payload too large")
                req = json.loads(self.rfile.read(n) or b"{}")
                if req.get("resetPosts"):
                    reset_posts()
                self._send(200, set_state(req))
            except Exception as e:
                self._send(400, {"error": str(e)[:200]})
            return
        if not self.path.startswith("/api/explain"):
            self._send(404, {"error": "not found"})
            return
        try:
            n = int(self.headers.get("Content-Length") or 0)
            if n > 20000:
                raise ValueError("payload too large")
            req = json.loads(self.rfile.read(n) or b"{}")
            self._send(200, {"text": explain(req.get("kind"), req.get("facts") or {})})
        except Exception as e:
            # Not an error the dispatcher needs to see: the UI has a written fallback.
            print(f"[model unavailable] {type(e).__name__}: {e}", flush=True)
            self._send(503, {"error": str(e)[:200]})

    def log_message(self, fmt, *args):
        if "/api/" in (args[0] if args else ""):
            super().log_message(fmt, *args)


if __name__ == "__main__":
    _load_posts()
    print(f"DispatchMonkey on http://localhost:{PORT}  (dispatcher /, driver phone /vn/)")
    print(f"  model backend: {CLAUDE or 'NONE (UI will use its written fallbacks)'}")
    for name, what in [("TOMTOM_KEY", "/api/flow + /api/incidents"),
                       ("VIETMAP_KEY", "/api/route"),
                       ("AISSTREAM_KEY", "/api/vessels"),
                       ("GOOGLE_STT_KEY", "/api/transcribe (Google vi-VN)"),
                       ("OPENAI_API_KEY", "/api/transcribe (OpenAI)")]:
        print(f"  {'set   ' if PV.env(name) else 'unset '} {name:<16} {what}")
    AIS.start()
    ThreadingHTTPServer(("0.0.0.0", PORT), H).serve_forever()
