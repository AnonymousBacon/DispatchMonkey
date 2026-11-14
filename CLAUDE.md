# Đúng Giờ — shared agent brief (every agent reads this)

## What we're building
A smart arrival-slot recommender for trucks going to Cát Lái port (Ho Chi Minh City).
Problem: trucks can't see each other's plans, so they all hit the gate at once and wait hours.
Our fix: give each truck a *different* recommended gate slot, spread the load, and explain why.
Pitch line: "We stopped trucks from all showing up at once."

CGU Hacks 2026, GeoAI track (Port-to-Warehouse Visibility & Decision Support).
Hacking ends 6:00 PM. Feature freeze 4:30 PM. Nothing new after 4:30 — only fixes and polish.

## OFFICIAL JUDGING RUBRIC: the #1 priority for every decision (full text: `RUBRIC.md`)
Source: the official `GeoAI_Rubric.docx`. It overrides any older rubric guess. Every feature,
slide and sentence must earn points here; when tasks compete, do the one worth more points.
| Criterion | Pts | Judges want |
|---|---|---|
| C1 Problem Understanding & Decision Support | 20 | Clear problem, **intended user**, **decision**; helps the user spot a problem and consider a practical response |
| C2 Prototype Functionality & Response to Change | 20 | Working prototype that **visibly responds when a condition changes** |
| C3 Ethical AI & Responsible Design | 15 | ≥ 2 considerations incl. fairness/stakeholder or environment (6); assumptions/uncertainty/limits explained (4); user can **review or question** an output (5); never overstate what AI/imagery can determine |
| C4 Transdisciplinary Integration | 15 | ≥ 2 fields (5); stakeholder needs of dispatchers/drivers/warehouses/communities (5); **show how they changed the decision**, not just list them (5) |
| C5 Scenario Testing & Evidence | 15 | Normal **and** changed scenarios, ≥ 2 indicators, **how each was calculated** |
| C6 Presentation & Communication | 15 | Solution, methods, data, results, responsible design, **limitations and improvements** |
There is **no "innovative tech" criterion**: tech earns points only via C1/C3/C5.
Priority: C1+C2 demo path → C5 table → C3 → C4 → C6 → everything else.
Talk: 7:00 presentation incl. demo + 2:00 Q&A (not 5 min). Demo must never break.

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
