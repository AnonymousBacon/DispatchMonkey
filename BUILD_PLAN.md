# Đúng Giờ: build plan (written 15:05 PT, Sat 2026-11-14; priorities updated 15:40)

## Priorities now (founder, 15:30): Vietnam only, two products, one engine
1. **Website `/` = the dispatcher** (`static/vn/dispatch.html`, served at `/` by server.py). DONE 15:40.
2. **Phone `/vn/`** upgraded in place: dispatcher-plan card from the same allocator, report button
   (UNCONFIRMED → CONFIRMED needs a second independent source), full cost breakdown incl. unbilled costs,
   shift-creep message, full gate slots shown as taken, truth-tier tags, radar overlay. DONE 15:40.
3. **Shared state** `/api/state` (server memory, no personal data): website Re-plan/Approve → phone; phone report → website.
   Both pages fall back to local state offline.
4. **Live traffic** `/api/flow` (TomTom key in `.env`, gitignored): measured speeds on 3 approach roads, logged to
   `data/logs/flow.jsonl`, shown LIVE on the evidence step. aisstream.io: skipped (HCMC coverage unverified, websocket risk).
5. Old LA "Detour Receipt" demo archived at `archive/la-detour-receipt/` (not served). Vietnam only.
Freeze still 16:30.

The spec is `FRAMEWORK_FOR_FABLE.md`. The only official rules document is the brief (`GEOAI_TRACK_NEW.docx`).
This plan only orders the work. It changes no idea, user, scope or locked decision.
Planning started late (15:00, not 14:15), so P0/P1 are already done (allocator + 33 tests) and the
blocks below start at P2.

## 1. Rules checklist (§0) → where each one is met
| Rule | Met by |
|---|---|
| R1 clock: freeze 16:30, rehearsals 17:15/17:40, submit 17:50, stop 18:00 | blocks below |
| R2: 7:00 talk + 2:00 Q&A, deck order, live demo + backup video | B5 `pitch/script.md`, humans record the video |
| R3 J1 impact | KPI strip: unpaid driver min (max one driver) + school-exposure idle min (S2) |
| R3 J2 explainability | truth-tier tag + formula tooltip on every number; AI sentence passes number guard (S2, S3) |
| R3 J3 innovative / spatial | anti-herding allocator, evidence ladder → capacity → re-plan, 150 m school buffer, radar ship counter (S3–S5) |
| R3 J4 safety | UNCONFIRMED ≠ CONFIRMED, trust-unconfirmed toggle, dispatcher approves, override-with-reason, IDs not names (S3) |
| R3 J5 story | replay is click-by-click, never needs network (S3) |
| R4.1 small synthetic + public data | 12 simulated trucks (real field names) + OSM roads/schools + Sentinel-1 radar |
| R4.2 see / spot / respond | map + timeline + red conflict + Re-plan |
| R4.3 condition changes → output changes | crash + ship surge → timeline restaggers |
| R4.4 two responsible-design items | Fairness (primary), Human oversight (primary); Environmental + Transparency shown |
| R4.5 assumptions labeled | tier tag on every number; Assumptions panel |
| R4.6 normal + changed | replay steps 1 and 5–6 |
| R4.7 ≥ 2 indicators + how calculated | KPI strip tooltips + `pitch/tests.md` |
| R4.10 "imagery ≠ confirmation" | ladder: photo/radar = evidence, a second source needed |

## 2. Blocks (owner is Fable = LEAD for code; PITCH = humans)
Contracts are in-page JS, no new HTTP endpoints: `planFleet(scn) → {trucks[], kpis}`, `replay.json` steps.

| ID | Clock | Lens | Files | Acceptance test | Kill switch |
|---|---|---|---|---|---|
| S1 Engine: fleet + KPIs | 15:05–15:30 | B, C, E | `static/vn/fleet.js`, `tools/test_vn.mjs` | `node tools/test_vn.mjs` all pass, incl. new: re-plan beats no-re-plan on idle min, 0 shift-creep violations, warehouse hit rate ↑, re-plan < 500 ms | Drop the swap pass; greedy only |
| S2 Dispatcher screen | 15:30–16:00 | B, D, J, K | `static/vn/dispatch.html` | Open `/vn/dispatch.html`: map (gate, bridge, 3 warehouses, queue road, schools), 12-row timeline, KPI strip money first, every number has a tier tag | Map without tiles (OSM lines only) |
| S3 Replay + ladder | 15:45–16:10 | G, H, D | `static/vn/replay.js` (cached AI outputs inline) | Click Next ×6: normal → UNCONFIRMED (plan unchanged) → 2nd source → CONFIRMED → capacity drop + ship surge, a red conflict → Re-plan → green; Wi-Fi off still works | Hard-code the step states |
| S4 Anti-herding chart + slider | 16:00–16:20 | F, E | `fleet.js` (`herdingCurves`), `dispatch.html` | Test T-H3: peak(all at once) > peak(naive best) > peak(aware) at 10/30/60 % | Static chart from precomputed numbers |
| S5 Radar ship counter + forecast | bg from 15:05, decide **16:00** | A, J3 | `tools/fetch_s1_history.py`, `tools/count_ships.py`, `static/vn/ships.json` | Sample image count matches a hand count ±2; backtest error printed honestly | **16:00:** if unreliable → show radar image + 3 hand-checked counts, surge stays SIMULATED (§3.6) |
| S6 TomTom / AIS | — | A | — | — | **Skipped: no keys in `.env`** |
| FREEZE | **16:30** | | | | |
| S7 Debug | 16:30–16:55 | H | — | clean run, offline (no network) run, reload mid-demo resets, each replay step ×3, console has 0 errors | Cut whatever errors |
| S8 Numbers + script | 16:55–17:15 | D, L | `pitch/tests.md`, `pitch/script.md` | §4.2 table filled from `node tools/kpi_table.mjs` output; script times to 6:45 | — |
| Rehearsal 1 / 2 | 17:15 / 17:40 | J5 | — | ≤ 6:45 each | Cut the data-tier block first |
| Submit | 17:50 | — | deck PDF, repo, backup video | — | — |

## 3. Tests
Existing 33 + new: fleet plan feasibility (no truck before its container is ready), shift-creep cap (0 violations),
re-plan beats no-re-plan (idle min, VND), warehouse conflicts drop to 0 after re-plan where feasible,
T-H3 three-curve ordering, re-plan latency < 500 ms, ship counter on the sample image.
Manual: the S7 checklist.

## 4. Debug protocol (S7)
1. `python3 server.py`, open `http://localhost:8787/vn/dispatch.html`, run the replay 3×.
2. Block the network (Wi-Fi off) and reload: the page must work (Leaflet is vendored, map tiles are optional).
3. Reload in the middle of the replay: state resets to step 1.
4. Console: 0 errors. 5. `node tools/test_vn.mjs && node tools/test.mjs`.

## 5. Risks (likelihood / impact → fallback, decided now)
1. Run out of time on the dispatcher screen (M/H) → ship timeline + KPI strip + Re-plan first, map last.
2. Radar counter unreliable (M/M) → kill at 16:00, hand counts (§3.6).
3. Planetary Computer slow (M/L) → train on whatever downloaded by 15:50.
4. Map tiles fail offline (H/M) → draw OSM lines on a blank background (no tiles needed).
5. Re-plan shows only tiny gains (M/H) → show it honestly; the headline is the conflict resolved + idle min.
6. Judges ask "is it real?" (H/H) → tier tags + Q&A answer #2.
7. Herding question (H/H) → three-curve chart is on screen, not only a backup slide.
8. Demo laptop crash (L/H) → backup video recorded by humans after 17:15 rehearsal.
