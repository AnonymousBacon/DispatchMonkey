#!/usr/bin/env python3
"""Detour Receipt server.

Three jobs only:
  GET  /                serve static/
  GET  /api/chp         proxy the real CHP incident feed (the browser cannot: no CORS)
  POST /api/explain     ask a language model to write prose from numbers we computed

The model is never asked for a figure. See PROMPTS below.
Run:  python3 server.py   then open http://localhost:8787
"""
import hashlib, json, math, re, subprocess, shutil, sys, os, urllib.request
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

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
        geo = json.loads((STATIC / "geo.json").read_text())
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
        if self.path.startswith("/api/chp"):
            try:
                self._send(200, fetch_chp())
            except Exception as e:
                self._send(502, {"error": f"{type(e).__name__}: {e}"})
            return
        super().do_GET()

    def do_POST(self):
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
    if not (STATIC / "geo.json").exists():
        sys.exit("static/geo.json missing — run: python3 tools/fetch_osm.py && python3 tools/build_geo.py")
    print(f"Detour Receipt on http://localhost:{PORT}")
    print(f"  model backend: {CLAUDE or 'NONE (UI will use its written fallbacks)'}")
    ThreadingHTTPServer(("0.0.0.0", PORT), H).serve_forever()
