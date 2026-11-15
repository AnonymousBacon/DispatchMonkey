"""Driver community feed: the evidence ladder and its guards.

Run: python3 tools/test_posts.py   (stdlib only, no server needed)

The ladder is the part that must not drift: a report only steers trucks if
independent phones agree, and nothing a single driver does on their own phone
can manufacture that agreement.
"""
import sys, time, pathlib

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parents[1]))
import server as S

ok = fail = 0


def t(name, cond):
    global ok, fail
    if cond:
        ok += 1
    else:
        fail += 1
        print("FAIL", name)


def reset():
    S.POSTS.clear()
    S.POSTS_FILE = pathlib.Path("/dev/null")        # never touch the real log


def post(who, **kw):
    kw.setdefault("cat", "crash")
    kw.setdefault("road", "Mỹ Thủy")
    kw.setdefault("text", "Lật container, chặn làn phải")
    return S.add_post(kw, who)


def state_of(pid):
    return next(p for p in S.public_posts()["posts"] if p["id"] == pid)["state"]


# --- the ladder ------------------------------------------------------------
reset()
pid = post("phoneA")["posts"][0]["id"]
t("one driver alone is unverified", state_of(pid) == "unverified")

S.confirm_post(pid, "phoneB")
t("a second independent phone makes it corroborated", state_of(pid) == "corroborated")

S.confirm_post(pid, "phoneC")
t("a third makes it confirmed", state_of(pid) == "confirmed")

# --- one phone is one source ----------------------------------------------
try:
    S.confirm_post(pid, "phoneB")
    t("the same phone cannot confirm twice", False)
except ValueError as e:
    t("the same phone cannot confirm twice", "already counted" in str(e))

try:
    S.confirm_post(pid, "phoneA")
    t("the author cannot confirm their own report", False)
except ValueError as e:
    t("the author cannot confirm their own report", "already counted" in str(e))

p = next(x for x in S.POSTS if x["id"] == pid)
t("confirm count equals distinct phones", p["confirms"] == len(set(p["confirmers"])) == 2)

# --- clearing and expiry ---------------------------------------------------
reset()
pid = post("phoneA")["posts"][0]["id"]
S.confirm_post(pid, "phoneB", cleared=True)
t("a driver reporting it clear expires the report", state_of(pid) == "expired")

reset()
pid = post("phoneA")["posts"][0]["id"]
# Age out rather than wait three hours: a report nobody renews must stop steering trucks.
next(x for x in S.POSTS if x["id"] == pid)["at"] = time.time() - S.POST_TTL_S - 1
t("a stale report expires on age alone", state_of(pid) == "expired")
S.confirm_post(pid, "phoneB")
S.confirm_post(pid, "phoneC")
t("confirmations cannot revive a stale report", state_of(pid) == "expired")

# --- questions are never evidence -----------------------------------------
reset()
qid = post("phoneA", cat="question", text="Làn phải về Cát Lái có bị chặn không?")["posts"][0]["id"]
S.confirm_post(qid, "phoneB")
S.confirm_post(qid, "phoneC")
t("a question never climbs the ladder", state_of(qid) == "question")

# --- input guards ----------------------------------------------------------
reset()
for bad, why in [
    ({"cat": "ufo", "road": "Mỹ Thủy", "text": "x"}, "unknown category"),
    ({"cat": "crash", "road": "Baker Street", "text": "x"}, "unknown road"),
    ({"cat": "crash", "road": "Mỹ Thủy", "text": "   "}, "empty report"),
    ({"cat": "crash", "road": "Mỹ Thủy", "text": "x", "photo": "javascript:alert(1)"}, "bad photo"),
    ({"cat": "crash", "road": "Mỹ Thủy", "text": "x", "photo": "data:image/jpeg;base64," + "A" * 400_000}, "bad photo"),
]:
    try:
        S.add_post(bad, "phoneA")
        t(f"rejects {why}", False)
    except ValueError as e:
        t(f"rejects {why}", why in str(e))

t("nothing invalid was stored", len(S.POSTS) == 0)

long_text = "x" * 500
S.add_post({"cat": "traffic", "road": "", "text": long_text}, "phoneA")
t("text is capped at 280 chars", len(S.POSTS[0]["text"]) == 280)

try:
    S.confirm_post("no-such-id", "phoneB")
    t("confirming an unknown id is an error", False)
except ValueError as e:
    t("confirming an unknown id is an error", "no such report" in str(e))

# --- privacy ---------------------------------------------------------------
reset()
pid = post("phoneA", corridor="cat-lai")["posts"][0]["id"]
S.confirm_post(pid, "phoneB")
pub = S.public_posts()
t("the confirmer list never leaves the server",
   all("confirmers" not in p for p in pub["posts"]))
t("no coordinates are stored on a post",
   not any(k in S.POSTS[0] for k in ("lat", "lon", "coords", "accuracy")))
t("the feed filters by corridor",
   len(S.public_posts("cat-lai")["posts"]) == 1 and len(S.public_posts("other-port")["posts"]) == 0)
t("the feed is labelled as driver-reported", pub["tier"] == "DRIVER-REPORTED")

print(f"{ok}/{ok + fail} passed")
sys.exit(1 if fail else 0)
