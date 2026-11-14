# OFFICIAL GeoAI judging rubric: THE #1 PRIORITY

Source: `GeoAI_Rubric.docx` (official, received 2026-11-14 ~15:40 PT). It **overrides** every earlier
guess at the rubric (the old J1–J5 table at 20% each is dead). If a feature, slide or sentence
doesn't earn points below, cut it. When two tasks compete, do the one worth more points here.

Each criterion gets a rating of 1–5 (5 Excellent, 4 Good, 3 Satisfactory, 2 Developing, 1 Limited or
not demonstrated) and is weighted:

| # | Criterion | Pts | What judges assess (official wording, condensed) | Where we earn it |
|---|---|---|---|---|
| C1 | **Problem Understanding & Decision Support** | **20** | Clearly identifies the chosen logistics problem, the **intended user**, and the **decision**. The solution helps the user **identify a problem and consider a practical response**. | Opening: dispatcher at Cát Lái; decision = *when each truck leaves*. Website: red conflict → Re-plan → one-click approve. |
| C2 | **Prototype Functionality & Response to Change** | **20** | A functional proof of concept that **responds when at least one condition changes** (delay, road disruption, availability constraint). | Live replay: crash on cầu Phú Mỹ + ship surge → timeline restaggers, KPIs move, phone updates. Never crashes, works offline. |
| C3 | **Ethical AI & Responsible Design** | **15** | ≥ 2 distinct considerations incl. fairness/stakeholder impact or environment (**6**); explains assumptions, estimates, uncertainty, limitations (**4**); supports transparent decisions, e.g. the user can **review or question an output** (**5**). AI use explained accurately, **no overstating what a model can determine** ("a feature detected in imagery does not by itself confirm that a road is blocked"). | Fairness (driver unpaid min, shift-creep cap, school exposure) + Human oversight (approve, override-with-reason, trust-unconfirmed switch). Truth-tier tag on every number. UNCONFIRMED → second source → CONFIRMED. The AI never makes a number. |
| C4 | **Transdisciplinary Integration** | **15** | ≥ 2 perspectives/fields (**5**); considers stakeholder needs: dispatchers, drivers, warehouses, communities (**5**); **explains how they influenced the prototype or its comparison of responses** (**5**). "Show how perspectives affect the decision, not only list them." | Per-truck "why this time" line naming the stakeholder rule that set it (warehouse window, driver cap, school bell, CO₂). At least one truck whose time differs from the money-only answer because of a driver/community rule. |
| C5 | **Scenario Testing & Evidence** | **15** | Normal **and** changed scenarios, compared with **≥ 2 indicators or checks**, and **how each was calculated**. | `pitch/tests.md` table (Normal / Changed no re-plan / Changed + re-plan) from real engine output; one-click formula + inputs + tier on every KPI. |
| C6 | **Presentation & Communication** | **15** | Clearly explains and demonstrates the solution, methods, data, results, responsible design, **limitations and potential improvements**. | 7:00 talk: story → user/decision → demo → indicators → responsible design → limits/next. |

**Total 100 = 30 shared (C3, C4) + 70 track-specific (C1, C2, C5, C6).**
**There is NO "innovative technology" criterion.** Fancy tech (radar ship counter, forecasts, herding
math) earns points only as *decision support* (C1), *evidence* (C5) or *honest AI use* (C3). Keep it
small and never let it delay the C1/C2 demo path.

## Priority order for every decision (highest first)
1. **C1 + C2 (40 pts):** the dispatcher website works end-to-end, normal → change → Re-plan, offline.
2. **C5 (15):** the Normal-vs-Changed table with ≥ 2 indicators and "how calculated."
3. **C3 (15):** two responsible-design items visible in the demo, uncertainty labeled, the user can question/override.
4. **C4 (15):** stakeholder perspectives visibly *change* a truck's time, not just a list.
5. **C6 (15):** limits + improvements slide, rehearsed to time.
6. Everything else (radar, forecasts, live APIs, polish) only after 1–5 are at "5 Excellent."

## Self-check before freeze (score ourselves 1–5 on each row; fix anything below 4)
- C1: can a stranger name the user and the decision in 10 s of looking at the website?
- C2: does one changed condition visibly change the plan, on stage, offline?
- C3: can the judge click a number and see formula + source + tier? Is anything AI-made overstated?
- C4: is there one truck whose time was set by a driver or community rule, and does the screen say so?
- C5: are there ≥ 2 indicators, normal vs changed, each with its calculation?
- C6: do the slides cover methods, data, results, responsible design, limits and improvements?
