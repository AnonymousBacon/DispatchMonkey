# Demo script — 10 minutes

Before you start: `python3 server.py`, then `node tools/warm.mjs`, then open
`http://localhost:8787` and leave it on **Replay / Normal operations**. Check the top-left
reads **1** shipment at risk.

Have `driver.html` open in a second tab on a phone-shaped window.

---

## 0:00 — The problem (45 s, no screen)

> A drayage dispatcher moves containers from the Ports of LA and Long Beach to warehouses inland.
> Four things have to line up: the container is ready, a truck is free, the roads are clear, and
> the warehouse has a dock appointment. When one changes, the dispatcher has to work out which
> loads are now in trouble — and every fix costs somebody something.
>
> Google Maps routes one truck. It does not know about the appointment, the driver's remaining
> hours, or the neighbourhood the detour goes through.

## 1:00 — Normal operations

Point at the indicator strip.

> Ten shipments. Every number up here is shown as "now" against "normally", so you can always see
> what moved.

Point at **EGHU-2240 — Not possible**, already flagged with no disruption at all.

> This one is already broken and nothing has gone wrong yet. Driver DRV-78 has 55 minutes of
> driving hours left and the run needs 87. That is a capacity conflict the schedule hides.

Click it, show the only workable card is **Reassign to DRV-47**.

## 2:00 — The disruption

Switch the dropdown to **I-710 N crash at Firestone + driver report**.

> Three real sources arrive at once. CHP — official, confirmed. A driver report — one person,
> unconfirmed. A camera still — suggests stopped traffic, 80%, still unconfirmed.

Point at the red banner, then the indicators.

> Shipments at risk went 1 to 3. Driver unpaid minutes went 0 to 108. Nobody is billed for that
> last number, which is exactly why we put it on screen.

## 3:15 — The receipt

Click **MSCU-4471**. Let the four cards show.

> Four possible responses, each itemised. This is the whole idea: not "here is the best route",
> but "here is what each option costs, and who pays".

Walk one card top to bottom. Hover **Schools within 150 m** and **Miles in high-burden areas** so
the formula tooltips open.

> Every number has its formula and its source. These schools are real OpenStreetMap locations.

Then the comparison:

> Keeping the I-710 misses the 2 o'clock window by 4 minutes — that is a $120 rebooking fee.
> The SR-91 and I-605 reroute makes it at 1:59. It costs $12 instead of $120, but it drives 11
> miles further, emits 18 kg more CO₂, and passes 6 schools instead of 2.
>
> It is also the *better* option for pollution-burdened neighbourhoods — 5.4 miles instead of
> 10.7. So the fair choice and the green choice point in opposite directions. The tool does not
> resolve that. It shows it.

## 5:00 — The dispatcher decides

Drag **Passing schools** to the top and **Being on time** down. The ranking reorders live.

> The weights are the dispatcher's, not ours.

Put them back. Click **Use this option** on the reroute. The message drafts appear.

> Nothing has been sent. These are drafts, built from the numbers on the card we chose. The
> warehouse message says why, and says when a report behind it is unconfirmed.

Click **Send both messages**, then open **Activity log**.

> Every machine output and every human decision, with the figures that were on screen at the time.

## 7:00 — Uncertainty and oversight

Switch to **Brush fire near SR-60 (unconfirmed perimeter)**. Click **TGHU-8812**.

> A satellite hotspot and a fire perimeter cross the SR-60. The current route is ruled out.
>
> But look at *why*: "blocked by an **unconfirmed** closure, 65% confidence." A perimeter near a
> road is not proof the road is shut. So the dispatcher can disagree.

Untick **Trust unconfirmed reports** in the map legend. The route returns, ranked first, with an
amber "Needs your judgement" strip.

> It comes back — it still meets the window — but it is never silently promoted. The tool holds
> its evidence and its confidence either way, and the switch itself is logged.

## 8:30 — Live data

Click **Live CHP**.

> That is the real California Highway Patrol feed, right now, filtered to incidents within 4
> miles of our corridors.

If it is quiet, say so — that is the honest result and the reason Replay exists.

## 9:00 — Limits

> Containers, trucks and appointments are invented; no public live container data exists. The
> burden map is city-level, not census tract. The backup radius around a crash is our estimate,
> not CHP's. And a camera that suggests stopped traffic is evidence, never confirmation.
>
> Next would be real TMS integration, port turn-time data, and designing the driver page with
> actual drivers.

---

## If something breaks

| Problem | Do this |
|---|---|
| Model sentences are slow | They are enrichment. The deterministic sentence is already on screen; keep talking |
| Live CHP fails or is empty | Say it out loud, switch to Replay. The quiet feed is a real finding |
| Map tiles don't load | The routes, markers and all numbers still render. Carry on |
| Everything is wrong | Reload the page. No state is saved on the server |
