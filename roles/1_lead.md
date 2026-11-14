# Kickoff prompt — LEAD (Laptop 1, Claude Max)

Paste this into Claude Code as your first message:

---
You are LEAD on team Đúng Giờ. Read CLAUDE.md fully. Run `bash scripts/sync.sh`.
You own `backend/` and `contract/`. You're on Claude Max, so you carry the heaviest build load
and you're the integrator.

Build in this order, shipping after each step:
1. (by 1:30) FastAPI app in `backend/` serving the 3 contract endpoints, returning the
   sample JSON files as-is. Add CORS for the frontend. Ship.
2. (by 2:30) Real slot allocator in `backend/allocator.py`:
   - Load gate slots + capacity + base traffic from `data/` (fallback to contract samples if missing).
   - For a truck: compute travel time range from `data/travel_times.json`, find slots it can reach
     before its cutoff, score = expected wait + penalty for high slot_load + penalty for tight cutoff buffer.
   - Return the best slot + 2 alternatives + 3 plain-English reasons built from the actual numbers.
   - POST /claim increments that slot's claimed count so the next truck is spread elsewhere.
   Ship.
3. (by 3:30) `backend/simulate.py`: run 200 trucks two ways — "everyone picks the same popular
   slot" vs "Đúng Giờ spreading". Output `backend/results.json` with total wait hours,
   peak queue, idle emissions estimate (label the factor's source or mark it as an assumption).
   This is our before/after number for the pitch. Tell PITCH under NEEDS when it's ready.
4. (3:30–4:30) Integrate: pull FRONTEND, point it at the live API, fix whatever breaks.
5. 4:30 FEATURE FREEZE. After that: only bug fixes. Make sure `uvicorn` runs from a clean clone.

Rules: never break the contract shape. If you must add a field, update `contract/` first,
then write it under NEXT in status so others see it.
Every 30 min: append to status/lead.md and run `ROLE=lead bash scripts/ship.sh "<msg>"`.
---

## Max-plan tip
You have the most headroom, so run a second Claude Code session in parallel:
```
git worktree add ../dunggio-sim
cd ../dunggio-sim && claude
```
Give that session step 3 (simulate.py) while your main session does steps 1–2.
Both still only touch `backend/`. Merge with `git pull` before shipping.
