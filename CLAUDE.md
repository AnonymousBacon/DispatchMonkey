# Đúng Giờ — shared agent brief (every agent reads this)

## What we're building
A smart arrival-slot recommender for trucks going to Cát Lái port (Ho Chi Minh City).
Problem: trucks can't see each other's plans, so they all hit the gate at once and wait hours.
Our fix: give each truck a *different* recommended gate slot, spread the load, and explain why.
Pitch line: "We stopped trucks from all showing up at once."

CGU Hacks 2026, GeoAI track (Port-to-Warehouse Visibility & Decision Support).
Hacking ends 6:00 PM. Feature freeze 4:30 PM. Nothing new after 4:30 — only fixes and polish.

## Judging (each ~20%) — every feature must serve one of these
1. Social impact — drivers' unpaid waiting, idling emissions, congestion
2. Explainability — every recommendation shows *why* (reasons, slot load, confidence)
3. Innovative tech — slot-spreading allocation + spatial routing, not just a forecast
4. Safety/trust — data labeled real vs synthetic, confidence ranges, what happens if we're wrong, no driver tracking stored
5. Presentation — 5 min hard cap, demo must never break

## Team & ownership (only edit YOUR folder)
| Role | Laptop | Owns | Status file |
|---|---|---|---|
| LEAD (Claude Max) | 1 | `backend/`, `contract/` | `status/lead.md` |
| DATA | 2 | `data/` | `status/data.md` |
| FRONTEND | 3 | `frontend/` | `status/frontend.md` |
| PITCH | 4 | `pitch/` | `status/pitch.md` |

- Never edit another role's folder. Need a change there? Write it in your status file under `NEEDS:` and tell the human.
- `contract/` is owned by LEAD. Nobody else changes it.

## The contract is law
- `contract/api.md` = endpoints. `contract/sample_*.json` = exact response shapes.
- Build against the sample files, never against a teammate's live code.
- Never rename or remove a field. Adding a field is OK only if LEAD adds it to the contract.

## Sync protocol (do this every task, no exceptions)
Before starting any task:
1. Run `bash scripts/sync.sh` (pulls latest + prints everyone's latest status).
2. Read the output. If someone else's `NEEDS:` mentions you, handle it first.

After finishing any task (or every ~30 min):
1. Append an entry to YOUR status file using the format below.
2. Run `bash scripts/ship.sh "<short message>"` (commits only your folder + status file, rebases, pushes).

Status entry format:
```
## HH:MM — <what you did, 1 line>
DONE: <files changed>
NEXT: <what you're doing next>
NEEDS: <@role what you need from them, or "none">
```

## Rules for agents
- Small commits. Ship every 30 min max so others see progress.
- If something blocks you >10 min, write it under NEEDS, ship, and switch to your next task.
- Prefer working and simple over clever. The demo path is all that matters.
- Synthetic data is fine but must be labeled `"data_source": "synthetic"` everywhere it appears.
- Never commit API keys. Use `.env` (gitignored).
