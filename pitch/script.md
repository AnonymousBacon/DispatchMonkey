# DispatchMonkey: 7:00 pitch (incl. the ad) + 2:00 Q&A

**This is the current run of show** — four speakers, matches `DispatchMonkey_Revised_Pitch_Script.pdf`.
The lines below are that script with the rubric's own vocabulary worked in at the four places judges
are scoring against a checklist and listening for the words on it: C4 (transdisciplinary, stakeholders),
C3 (responsible design: fairness, environment, transparency, human oversight, assumptions/uncertainty),
C1 (user, decision), C5 (indicators, how calculated). Nothing added changes a number or a timing mark —
same four clock blocks, same clicks. `pitch/deck_outline.md` and `static/slides/index.html` carry the
full evidence; this stays sayable out loud in the time given.

| Clock | Section | Speaker |
|---|---|---|
| 0:00–0:45 | Introduction and hook | 1 |
| 0:45–1:45 | AI video ad | 2 plays video |
| 1:45–4:30 | Live demo | 2 |
| 4:30–5:50 | Benefits and queue chart | 3 |
| 5:50–7:00 | Benefits, evidence and close | 4 |
| 7:00–9:00 | Q&A | all |

**Setup before going on.** `python3 server.py` → `http://localhost:8787/vn/dispatch.html`, reload (resets
to step 1). Driver view ready on a phone or second tab for the approval step. Queue chart tab ready for
Speaker 3. Backup video open in another tab. Offline is fine — only the port satellite basemap needs a
network; the app falls back without it.

## 01 — Introduction and hook / Speaker 1 / 0:00–0:45

> "Imagine getting to Cát Lái port on time, then spending part of your morning waiting in a truck line.
> For a driver paid by the trip, that can mean unpaid time. For the fleet, it can mean wasted fuel and a
> missed warehouse appointment. We built DispatchMonkey as a **decision-support tool for the dispatcher**
> — the person who has to decide when each truck should leave, based on what's happening at the gate.
> Here's what that looks like from the driver's seat."

*Rubric words landed: intended **user** (dispatcher), the **decision** (when each truck leaves) — C1.*

## 02 — AI video ad / Speaker 2 plays video / 0:45–1:45, exactly 1:00

Speaker 2 starts playback, then switches straight to the dispatcher screen. Cues below only if the ad needs re-cutting.

| Clock | Shot | Line |
|---|---|---|
| 0:00–0:15 | The truck line | "Your truck is ready. The port gate is backed up. Every minute in line costs time." |
| 0:15–0:30 | Dispatcher dashboard | "DispatchMonkey shows which trips could miss their warehouse window." |
| 0:30–0:45 | Re-plan and approval | "The dispatcher checks the new departure times and sends the plan to drivers." |
| 0:45–1:00 | Driver's phone, then app name | "Drivers know when to leave. The fleet spends less time in line. DispatchMonkey." |

## 03 — Live demo / Speaker 2 talks and drives the laptop / 1:45–4:30

| Beat | Say | Click |
|---|---|---|
| Open on the normal morning | "Here's our dispatcher screen. This is a **simulated** morning at Cát Lái with 12 trucks. Each row is a trip — we can see when the truck should reach the gate and when the warehouse expects it. This is our **working prototype**." | Step 1, already showing |
| First crash report | "A driver reports a crash on the Phú Mỹ bridge. The map marks it **unverified** — one report is not proof a road is blocked, so the current plan stays in place. That's **human oversight** built into the first step, not bolted on at the end." | → Step 2 |
| Corroboration and impact | "In the replay, a second driver reports the same crash, and the simulated bridge speed drops. With the disruption in place, two trucks are expected to miss their warehouse windows, and the fleet is projected to spend 71 minutes idling. That's our condition changing, live." | → Step 3 → 4. Point at red LATE boxes |
| Re-plan | "DispatchMonkey updates the trucks still waiting to leave. Both warehouse windows are met, and idle time falls from 71 to 24 minutes. The dispatcher can **review the change before sending it** — nothing moves without a human decision." | Click **Re-plan** |
| Approve, show the phone | "The dispatcher approves the plan. Now the driver sees the new departure time on their phone. What happens if more drivers start using this? Our next speaker will show you." | Click **Approve**, cut to driver phone |

*Rubric words landed: **functional proof of concept**, **responds when a condition changes**, **human oversight**, **review** — C1/C2/C3.*

## 04A — Why the queue shrinks / Speaker 3 / 4:30–5:50

Speaker 2 opens the queue chart and sets adoption to 30%. Point to each number.

> "What happens if an app tells every driver to leave at the same quiet time? They all show up together,
> and the jam just moves to a new time.
>
> In our simulation, the longest line was **239 trucks** with no app. When 30 percent of drivers used an
> app that gave everyone the same time, it grew to **1,218 trucks**.
>
> DispatchMonkey schedules trucks one at a time — it counts each truck it has already scheduled before
> choosing a time for the next one. With the same 30 percent using DispatchMonkey, the longest line was
> **34 trucks**. This is one of the **indicators** we use to test the scenario, and it's calculated the
> same way for every bar on this chart: trucks queued at the gate at adoption's peak minute.
>
> We also used radar from **115 satellite passes** to count ships through clouds — **remote sensing**
> feeding a **logistics** model. Those counts give us a clue about when more trucks might arrive. That's
> two fields working together, not just sitting next to each other: the ship count changes which hours
> the scheduler treats as high-arrival. Now I'll hand it over to our next speaker."

*Rubric words landed: **transdisciplinary** (logistics + remote sensing, shown changing the scheduler, not just listed), **indicator**, **how it was calculated** — C4/C5.*

## 04B — Fleet and community benefits / Speaker 4 / 5:50–7:00

> "In our simulated crash, idling near schools and clinics fell from **19 minutes to 7** — that's
> **environmental and community impact**, one of our two required **responsible-design** considerations,
> and it's an input to the schedule, not a slide we added afterward. Less engine idling also means less
> fuel burned.
>
> The second is **fairness and stakeholder impact**: we track the driver with the most unpaid time, not
> the average, and we limit how far back any one driver's departure can be moved. We're also
> **transparent** about what we don't know — every number on screen is tagged real, simulated, or
> estimated, so no one mistakes a simulated gate for a measured one.
>
> The dispatcher can approve the plan or change it and record why — that's **human oversight** again, at
> the last step this time. The demo combines real map and radar data with simulated fleet and gate
> operations. Our next step is to test this with a real trucking company. DispatchMonkey helps
> dispatchers choose when each truck should leave. Thank you."

*Rubric words landed: both required C3 considerations named explicitly (**fairness/stakeholder impact**,
**environmental responsibility**), plus **transparency** and **human oversight** as the two optional ones
— all five from the guidance table, not just the two minimum. **Limitations/next steps** for C6.*

## Q&A (≤ 20 s each, claim → evidence → stop) / 7:00–9:00

| Question | Speaker | Answer |
|---|---|---|
| Is any of this real? | 3 | "Yes. The roads, schools, and clinics come from OpenStreetMap, and the ship counts come from real satellite images — that's our **real** data tier. The trucks and gate operations in the demo are **simulated**, and we say so on screen rather than letting a judge assume otherwise." |
| Doesn't the port already have booking? | 1 | "A booking gives you a window. We help the dispatcher make the **decision** of when each truck should leave so it can reach that window with less waiting — booking and DispatchMonkey answer different questions." |
| Can 12 trucks fix traffic at the whole port? | 3 | "With 12 trucks we can show how one fleet could spend less time waiting. The slider **simulates** what might happen if more fleets use the app — we don't claim the 12-truck result scales, we show the assumption and let you move it." |
| How accurate is it? | 4 | "These are **simulation results** — an explicit limitation, not a hidden one. A pilot with real gate and trip logs would let us test how well they match what happens at Cát Lái." |
| Where's the AI? | 2 | "We use a saved driver-report example in the demo and image processing to count ships in radar images. The **scheduling engine** — not the model — calculates every number you see. That's a deliberate **responsible-design** choice: the AI never gets to invent a figure." |
| How do you protect drivers? | 4 | "We use driver IDs, never names or locations; we track unpaid waiting; and we cap how far a driver's departure can be pushed back. The dispatcher reviews the plan before it goes out — **fairness** and **human oversight** together." |

**Honesty notes for the team (don't overclaim on stage):**
- The Vietnamese driver-report example in the demo is a **cached fixture**, not a live model call. Say
  "a saved driver-report example" (as scripted above), not "the model read this live," unless live intake
  is wired in before freeze.
- The second-source bridge-speed drop is **simulated** (no TomTom key).
- The VND figure in `pitch/tests.md` is dominated by a **simulated** 500,000 ₫ missed-appointment penalty — only say it if asked, and say it's simulated.
