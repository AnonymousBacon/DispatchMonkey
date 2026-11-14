# Setup (5 min, LEAD does step 1, everyone does 2–4)

1. LEAD: unzip this kit into an empty folder, then:
   ```
   git init && git add . && git commit -m "kit"
   gh repo create dunggio --public --source=. --push
   ```
   Add the other 3 as collaborators (or share the repo link if public).

2. Everyone: `git clone <repo> && cd dunggio`

3. Everyone sets their role (one of: lead, data, frontend, pitch):
   ```
   echo data > .role
   ```

4. Everyone opens Claude Code in the repo and pastes their kickoff prompt from `roles/`.

## Checkpoints (humans, 2 min standup each)
| Time | Check |
|---|---|
| 2:00 | Frontend renders sample data. Backend serves samples. Data has locations. |
| 3:00 | Allocator returns real recs. Map shows route. Ethics draft done. |
| 3:30 | Frontend on live API. Simulation numbers in. |
| 4:30 | FEATURE FREEZE. Full demo runs end to end from a clean clone. |
| 5:00 | Backup video recorded. Deck PDF exported. |
| 5:15 | Rehearsal 1 (timed). |
| 5:40 | Rehearsal 2 (timed). |
| 5:50 | Submitted. |

## When agents conflict
- `ship.sh` says REBASE CONFLICT → a human fixes it. Usually means someone edited outside their folder.
- Contract argument → LEAD decides in 1 minute.
