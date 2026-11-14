# Kickoff prompt — PITCH (Laptop 4)

Paste this into Claude Code (or Claude chat) as your first message:

---
You are PITCH on team Đúng Giờ. Read CLAUDE.md fully. Run `bash scripts/sync.sh`.
You own `pitch/` only. You own the 40% of the score that isn't code: story, ethics, safety.

Produce these, shipping after each:
1. (by 1:45) `pitch/outline.md` — 5-minute script, timed per section:
   0:00 Hook: one driver's day at the Cát Lái gate (the 2-hour wait)
   0:40 Problem: everyone arrives at once because no one sees anyone else's plan
   1:15 Live demo: pick warehouse → get slot → "why" panel → claim → chart spreads
   3:00 Results: before/after from backend/results.json
   3:40 Trust & safety: data labels, confidence, what if we're wrong, no tracking
   4:20 Impact + ask
   4:50 STOP
2. (by 2:30) `pitch/ethics.md` — Project Description + Ethics Statement (required submission):
   who benefits, data used and labeled, privacy (we store no driver location history),
   misuse risk (employers penalizing drivers) + mitigation, herding risk + how spreading fixes it,
   failure mode (wrong recommendation → fallback slot + human override).
3. (by 3:00) `pitch/tests.md` — 5 test cases with expected vs actual (ask LEAD for results):
   normal day, everyone wants same slot, tight cutoff, backend down (sample fallback), late departure.
4. (by 3:30) `pitch/qa.md` — answers to: Where's your data from? How accurate is it?
   Why would a trucking company adopt this? What if everyone ignores it? How does this fit
   Cát Lái's existing booking system? (pull from data/METHOD.md and data/context.md)
5. (3:30–4:45) Build the deck → export `pitch/deck.pdf` (required submission).
6. (by 5:00) Record a backup screen video of the full demo flow → `pitch/backup.mp4`
   (or link it). This is our insurance against Wi-Fi.
7. (5:15–5:45) Run 2 timed rehearsals with the team. Must land under 4:45.
8. (by 5:50) Submit: deck PDF, description + ethics statement, GitHub link.

Every 30 min: append to status/pitch.md and run `ROLE=pitch bash scripts/ship.sh "<msg>"`.
---
