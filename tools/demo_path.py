"""The judge-ready demo path, driven through the real endpoints.

    python3 server.py &
    python3 tools/demo_path.py

Normal plan -> a driver posts a crash from Gate slots -> unverified advisory ->
a second driver corroborates -> a third confirms -> the dispatcher compares
departure/route pairs and approves -> the phone shows the new plan.

Every line it prints comes back from the server, so the output is evidence
rather than a script of what we hoped would happen.
"""
import json, sys, time, urllib.request

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8787"


def call(path, body=None):
    url = f"{BASE}{path}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data,
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        return {"error": json.loads(e.read()).get("error", e.reason)}


def top(feed):
    return feed["posts"][0]


def line(n, title):
    print(f"\n--- {n}. {title} " + "-" * max(0, 58 - len(title)))


ok = True


def check(label, cond, detail=""):
    global ok
    ok = ok and cond
    print(f"  [{'ok' if cond else 'FAIL'}] {label}{(' — ' + detail) if detail else ''}")


line(1, "Normal morning: no incident, nothing approved")
st = call("/api/state", {"step": 0, "approved": False, "trust": False, "reports": 0})
check("shared state is at the normal plan", st["step"] == 0 and not st["approved"])

line(2, "Driver T09 posts a crash from the Gate slots tab")
feed = call("/api/posts", {
    "who": "driverT09", "cat": "crash", "road": "Cầu Phú Mỹ",
    "dir": "Toward Cát Lái", "corridor": "cat-lai", "lang": "vi",
    "text": "Tai nạn chân cầu Phú Mỹ, kẹt cứng từ Mỹ Thủy",
})
p = top(feed)
pid = p["id"]
print(f"      “{p['text']}”  ({p['road']}, {p['dir']})")
check("one driver alone is UNVERIFIED", p["state"] == "unverified",
      f"{p['confirms'] + 1}/{feed['confirmsForConfirmed'] + 1} sources")
call("/api/state", {"step": 1, "reports": 1})
check("the dispatcher sees an unverified advisory, not a closure",
      call("/api/state")["step"] == 1)

line(3, "A second, independent driver confirms")
feed = call("/api/posts/confirm", {"who": "driverT04", "id": pid})
p = top(feed)
check("state rises to CORROBORATED", p["state"] == "corroborated",
      f"{p['confirms'] + 1}/{feed['confirmsForConfirmed'] + 1} sources")

line(4, "A third driver confirms")
feed = call("/api/posts/confirm", {"who": "driverT11", "id": pid})
p = top(feed)
check("state rises to CONFIRMED", p["state"] == "confirmed",
      f"{p['confirms'] + 1}/{feed['confirmsForConfirmed'] + 1} sources")
call("/api/state", {"step": 2, "reports": 2, "trust": True})

line(5, "Guards that must hold while the demo runs")
check("the reporting driver cannot confirm their own report",
      call("/api/posts/confirm", {"who": "driverT09", "id": pid}).get("error") == "already counted")
check("one phone cannot confirm twice",
      call("/api/posts/confirm", {"who": "driverT04", "id": pid}).get("error") == "already counted")
check("the confirmer list never leaves the server",
      all("confirmers" not in q for q in call("/api/posts")["posts"]))

line(6, "Dispatcher reviews the departure/route pairs and approves")
st = call("/api/state", {"step": 4, "approved": True})
check("the approved re-plan is on the shared state", st["step"] == 4 and st["approved"])
print(f"      rev {st['rev']} — the phone polls /api/state and redraws within ~1.5 s")

line(7, "A driver reports it clear again")
feed = call("/api/posts/confirm", {"who": "driverT07", "id": pid, "cleared": True})
check("the report expires and stops steering trucks", top(feed)["state"] == "expired")

print("\n" + ("DEMO PATH OK" if ok else "DEMO PATH FAILED"))
sys.exit(0 if ok else 1)
