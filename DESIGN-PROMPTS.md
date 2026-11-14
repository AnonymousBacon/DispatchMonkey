# Đúng Giờ — Design Prompts

Copy-paste prompts for building or extending the Đúng Giờ interface with an AI coding tool
(Claude, v0, Cursor). Each prompt is self-contained: paste the **Master prompt** first, then the
prompt for the part you are working on. The current implementation of all of this is
`static/vn/index.html`.

---

## Master prompt (paste first, every time)

> You are designing **Đúng Giờ**, a phone-first web app that tells container-truck drivers in
> Ho Chi Minh City **when to leave and which road to take** so they reach the gate of **Cảng Cát
> Lái** without idling in the queue that backs up from Nguyễn Thị Định to cầu Phú Mỹ. Users are
> drivers with the phone mounted in the cab at arm's length, often in glare, sometimes with
> gloves. A secondary user is a dispatcher on a laptop. The UI is **Vietnamese first** with an
> English toggle.
>
> **Look:** light and map-first, like a modern delivery tracker (reference: Ronas IT "Delivery Web
> App Design" on Dribbble). A muted grey basemap fills the screen; white panels float on top.
> Color carries meaning only: **navy = driving, coral = idling in the gate queue, lime = the
> recommended option**, green/amber/red = road congestion. No gradients, no decorative shadows on
> every element, no all-caps labels, no icons used as decoration.
>
> **Tokens:**
> - Colors: paper `#edefea`, card `#ffffff`, sunk `#f4f5f2`, line `#e3e6e0`, ink `#14202e`,
>   ink-2 `#4b5867`, ink-3 `#6b7785`, navy `#1d3557`, jam/coral `#e5484d`, slow `#e8a317`,
>   ok `#2f9e5b`, lime `#d4f36b` with text `#1f2a05`, simulated-tag `#fbf3d9` / `#7a5b00`.
> - Type: **Be Vietnam Pro** (designed for Vietnamese diacritics) 400/500/600/700, one family
>   only, `font-variant-numeric: tabular-nums` everywhere. Scale 13 / 15 / 17 / 21 / 26 / 34 px.
>   Body floor 17px on phone. Sentence case.
> - Radius: 22px panels, 14px cards, 10px inputs/buttons, 999px pills and tabs.
> - Shadow: only on floating panels: `0 1px 2px rgba(20,32,46,.06), 0 12px 32px rgba(20,32,46,.10)`.
> - Motion: `--ease-out: cubic-bezier(.23,1,.32,1)`; press feedback 140ms `scale(.97)`; state
>   changes 160–220ms; nothing over 300ms; respect `prefers-reduced-motion`.
> - Targets: 52px minimum height for anything tappable.
>
> **Honesty rules:** every simulated value carries a small yellow `SIMULATED` tag; every rule shows
> its source and date; numbers come from the engine (`scoring.js`), never typed by hand or by an AI.
>
> Write plain HTML/CSS/JS (no framework), MapLibre GL for the map, OpenFreeMap tiles (no key).

---

## 1. Layout shell

> Build the page shell. **Phone (<960px):** the map is the top 44dvh; below it a white bottom
> sheet with 22px top corners overlaps the map by 22px and has a 40×5px grab handle. The page
> scrolls normally; the map uses MapLibre `cooperativeGestures` so one finger scrolls the page and
> two fingers move the map. **Desktop (≥960px):** the map is `position:fixed; inset:0`. The sheet
> becomes a floating panel `top/left/bottom: 20px; width: 430px`, rounded 22px, with its own
> scroll and `overscroll-behavior: contain`. The live congestion card floats at bottom-right,
> 420px wide. Set MapLibre `padding` so the route corridor stays visible between the two panels.
> Add the mobile baseline: `viewport-fit=cover`, `env(safe-area-inset-*)` padding on the sheet and
> toast, `-webkit-tap-highlight-color: transparent`, `touch-action: manipulation` and
> `user-select: none` on controls, 16px minimum input font, hover styles only inside
> `@media (hover:hover) and (pointer:fine)`.

## 2. Map

> Use the OpenFreeMap **positron** style (`https://tiles.openfreemap.org/styles/positron`) so the
> basemap stays grey and quiet. Center on the Cát Lái corridor `[106.760, 10.752]`, zoom 12.2
> (phone) / 12.6 (desktop), pitch 30, bearing −20. Draw the approach roads from `geo.json` as 6px
> round-capped lines colored by congestion: green `#15803d` clear, amber `#d97706` slow, red
> `#dc2626` jammed. Under the chosen route, draw a 14px navy casing at 28% opacity so the selected
> option reads as one path. Gate marker in navy. Attribution compact.

## 3. Header and scenario tabs

> Header: a 34px navy rounded-square mark with a small lime arc, the name "Đúng Giờ" at 21px/700,
> then two pill buttons "Hồ sơ" (profile) and "EN/VI". One line of plain description under it.
> Below: a segmented pill control (sunk background, 4px padding) with the two scenarios "Bình
> thường" and "Sự cố: kẹt cầu Phú Mỹ + tàu dồn chuyến". The active segment is solid ink with white
> text; transition background 180ms ease-out. Under the tabs, a one-line note with the driver
> report quote and a `SIMULATED` tag.

## 4. Live gate-congestion card

> A white card titled "Kẹt xe ở cổng Cát Lái — trực tiếp" with a status dot (green, or coral when
> the wait is 20+ min, each with a soft 4px halo). A 34px/700 number shows the wait now as a range
> ("18–32 ph"). Under it an SVG chart, 24 hours on the x-axis: a shaded uncertainty band (16%
> opacity), the expected wait as a 2.5px line (navy normally, coral in the disrupted scenario), a
> dashed "bình thường" baseline when disrupted, a dotted vertical line and dot at the current demo
> time. Hairline grid, three y ticks, axis labels every 6 hours. One hint line explains it's a
> simulated replay updating every 3 seconds.

## 5. Trip form (collapsed by default)

> A bordered `<details>` box whose summary reads "Chuyến đi" on the left and the current trip on
> the right in grey ("KCN Hiệp Phước, 06:10"), with a chevron that rotates 180° in 200ms. Inside:
> origin as a vertical segmented list (selected = white raised pill with a 1px shadow), demo time
> and ePort slot as time inputs, fuel per 100 km and driving hours left as decimal inputs
> (`inputmode="decimal"`), pay type and 24/24 registration as two-option segmented controls, and a
> full-width navy button "Xem giờ đi tốt nhất". Inputs: sunk background, no border until focus,
> navy border on focus.

## 6. Option cards (the signature element)

> Render one card per distinct option (Fastest, Cheapest, Cleanest, Leave Later, Overall Best).
> When one option wins several titles, show them all as tags on one card. Tags are small pills;
> the "Tốt nhất" (Overall Best) tag is lime. The route name sits right-aligned in grey.
> Then: departure time at 26px/700 and "→ vào cổng 07:52" in grey.
> **The trip strip:** a 10px rounded bar showing the whole trip to scale: hatched grey for waiting
> at the origin before leaving, navy for driving, coral for idling in the gate queue. Under it,
> "Đi 07:10" on the left and "42 ph lái xe + 8 ph chờ cổng" on the right. This bar is the main
> visual idea of the app: idling should be something you can see.
> Then a 4-column grid (2 columns under 420px) of small grey labels with bold values: cost (VND),
> fuel (L), CO₂ (kg), unpaid minutes (or km). Then a divider and the engine-written comparison
> sentence with a `SIMULATED` tag.
> Cards are `role="button"` with `aria-pressed`; tapping one makes it the plan (highlights its
> route on the map and is what gets shared). Selected = 1.5px ink border and a soft shadow,
> transitioned in 180ms. Press = `scale(.99)`. Options that break a rule render as a dashed grey
> card titled "Không khả dụng — <route>" with the reason in red.

## 7. Share, rules, ledger, check-in

> - A full-width lime button "Gửi kế hoạch qua Zalo" (uses `navigator.share`, falls back to
>   copying the text and showing a toast "Đã sao chép tin nhắn Zalo").
> - Two `<details>` rows separated by hairlines: "Sổ quy định" listing each rule with its source,
>   verification date and confidence in small grey text; "Sổ công bằng" listing idle
>   truck-minutes per area today, each with a `SIMULATED` tag.
> - "Chấm mốc chuyến đi": a 2×2 grid of 52px buttons (Xuất phát, Vào hàng chờ, Vào cổng, Ra
>   cổng). Tapped = solid ink. Saves a timestamp locally and shows a toast. Note under it: no name
>   or plate stored.

## 8. Toast

> A pill-shaped ink toast centered at the bottom (above the safe area). Enters with opacity 0→1
> and translateY 8px→0 in 200ms ease-out using a `data-show` attribute and CSS transitions (not
> keyframes, so rapid repeats retarget smoothly). Auto-hides after 2.2s.

## 9. First-use onboarding

> Full-screen white wizard, one question per screen, one tap advances: start point, destination
> (searchable; only Cát Lái is active, the others say "Sắp có"), pay type, 24/24 registration.
> Top row: "‹ Quay lại", four 22×5px progress dashes (navy up to the current step), and the
> language pill. Question at 26px/700, a one-line explanation, then 62px option cards on the sunk
> background. Each new step fades and rises 8px in 220ms using `@starting-style`.

## 10. Final polish checklist (paste at the end)

> Review the page against this list and fix anything that fails: every tappable element ≥52px
> and has an `:active` state; no `transition: all`; no animation over 300ms; no hover styles
> outside the hover media query; reduced motion removes transforms but keeps color/opacity
> changes; text contrast ≥4.5:1 on white; Vietnamese diacritics render in Be Vietnam Pro at every
> size; nothing scrolls horizontally at 375px; the map never traps one-finger scrolling on phones;
> every simulated number has its tag.

---

## References

| What | Link | Used for |
|---|---|---|
| Ronas IT — Delivery Web App Design (Dribbble) | https://dribbble.com/shots/25708347-Delivery-Web-App-Design | Light map-first layout, floating list panel, status pills, progress bar in the selected card |
| Be Vietnam Pro (Google Fonts) | https://fonts.google.com/specimen/Be+Vietnam+Pro | Typeface built for Vietnamese |
| OpenFreeMap | https://openfreemap.org/ | Keyless vector tiles, positron style |
| MapLibre GL JS docs | https://maplibre.org/maplibre-gl-js/docs/ | Map, layers, `cooperativeGestures`, `padding` |
| Emil Kowalski — design engineering | https://emilkowal.ski/ | Easing curves, press feedback, transition durations |
| Vaul (drawer) | https://vaul.emilkowal.ski/ | Bottom-sheet behaviour reference for a future draggable sheet |
| Sonner (toasts) | https://sonner.emilkowal.ski/ | Toast motion reference |
| Apple HIG — Maps | https://developer.apple.com/design/human-interface-guidelines/maps | Map + overlay panel conventions |
| Material 3 — Bottom sheets | https://m3.material.io/components/bottom-sheets | Phone sheet sizing and handle |
| MDN — `@starting-style` | https://developer.mozilla.org/en-US/docs/Web/CSS/@starting-style | Entry animations without JS |
| web.dev — viewport units | https://web.dev/blog/viewport-units | `dvh` / `svh` for the phone layout |

Design skills applied while building: frontend-design (token plan, avoid generic defaults),
emil-design-eng (motion values, press states), mobile-native (tap highlight, safe areas,
input zoom, cooperative map gestures).
