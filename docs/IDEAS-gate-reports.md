# Đúng Giờ: gate reports, predictions and a planner for everyone

*Hackathon ideas, Cát Lái port and cầu Phú Mỹ corridor, Ho Chi Minh City. Working draft, November 2026.
Copy of the team Google Doc "Đúng Giờ – Gate Reports, Predictions and Planner (Ideas)"; the Doc is the version people edit.*

## Summary

Nobody publishes when the Cát Lái gate is open, slow or jammed, so the app should collect it from truck drivers. Each driver report goes into a database, and the database learns the pattern by hour and day so it can predict the next queue. The same prediction then serves two groups: truck drivers choose when to go to the port, and people in cars and on motorbikes choose when to drive through the area to avoid the truck rush.

## 1. Driver input: when the port opens and how long the queue is

Truck drivers report what they see at the gate with as few taps as possible.

- **Gate status:** one tap for "Cổng mở", "Cổng đóng" or "Cổng chậm", with the time recorded automatically.
- **Queue check-ins:** "Vào hàng chờ" (joined the queue) and "Vào cổng" (entered the gate). The time between the two taps is the real wait, measured instead of guessed.
- **Opening time:** when a driver sees the gate start working, they tap "Cổng vừa mở". After many reports, the app knows the usual opening time and spots changes.
- **Short note or voice:** for example "Kẹt từ chân cầu Phú Mỹ tới Mỹ Thủy". The AI turns it into a map report.
- **Optional photo of the gate receipt (EIR):** it usually shows the official gate-in time, which is the strongest proof of a report.

### Keeping reports honest

- A tap only counts when the phone is inside the queue area on Nguyễn Thị Định or at the gate (geofence).
- Phone movement must match: a phone moving at 40 km/h is not in a queue.
- The app shows the median of recent reports and marks a status as confirmed only when three or more drivers agree ("7 tài xế báo, chờ 18–25 phút").
- Reporters who usually agree with others count more over time (anonymous trust score).
- Live road speeds from Vietmap or TomTom, and a glance at the nearest city camera, act as a second check.

### Driver report count and credibility

Each driver account shows a credibility record built from that driver's reports. It tells other drivers how much to trust a report, and it gives the prediction model a weight for each one.

- **What the account shows:** total reports, confirmed reports (matched by other drivers, road speeds or a gate receipt), confirmation rate, and how long the driver has been reporting. Example: "Tài xế #4821, 128 báo cáo, 94% được xác nhận, 6 tháng".
- **Separate counts by type:** port opening and closing times, queue waits, and incidents such as crashes, flooding or road works. A driver who is accurate on gate times may still be new to incident reports.
- **Count confirmed reports, not taps:** if every tap earned credit, people would press the button for points. Only reports that later match other drivers, road data or the gate receipt raise the count.
- **Levels:** new reporter, trusted, and verified (for example after 20 confirmed reports with at least 85% confirmed). A single report from a verified driver can show as "likely" straight away; a new account needs other drivers to agree first.
- **Weight in the prediction:** each report counts in proportion to the reporter's confirmation rate, and recent months count more than old history.
- **False reports:** they lower the confirmation rate, and repeated false reports pause that account's influence. A limit on how often one account can report stops flooding.
- **Privacy:** the record belongs to the random driver ID, not a name or plate. Other users see only the level and the counts.
- **Safety:** reporting works only when the truck is stopped or crawling, so the count never rewards using the phone while driving.

### Privacy

- No names, phone numbers or license plates. Each driver gets a random ID.
- Location is used only to check the report and is deleted after the trip; only the timings are kept.
- Follow Vietnam's personal data protection rules (Decree 13/2023 and the newer Personal Data Protection Law; confirm the effective date).

## 2. The database

| Table | What it stores |
|---|---|
| `gate_reports` | Report type (open, closed, slow, opened now), time, gate, trust score of the reporter |
| `queue_trips` | Joined-queue time, gate-in time, measured wait in minutes, terminal |
| `road_speeds` | Speed per road segment every 2 minutes from Vietmap or TomTom (Nguyễn Thị Định, Đồng Văn Cống, Mai Chí Thọ, Nguyễn Văn Linh, cầu Phú Mỹ) |
| `rules` | Port hours and truck bans, each with source, date checked and confidence |
| `context` | Rain, tide, air quality, holidays and Tết dates, ship arrivals when available |
| `predictions` | Predicted wait and truck volume per 15 minutes, with a range, plus what actually happened afterwards |

Keeping the prediction next to what actually happened lets the app measure its own accuracy and show it.

## 3. Predicting the future

Start simple and add detail as data arrives.

1. **Week one:** the average wait for each 15-minute slot of each weekday, from driver reports, blended with the existing queue model while data is thin.
2. **Recent correction:** if today's reports run above the usual pattern, shift the next few hours up by the same amount.
3. **Known events:** add effects for rain, high tide, holidays and the days before Tết, ship arrivals, and the wave of trucks entering the city when the truck ban lifts at 22:00.
4. **Later:** a small machine-learning model (for example gradient boosting) trained on all of the above, once there are several weeks of reports.

- Every prediction is shown as a range ("18–30 phút"), never a single exact number.
- Accuracy is tracked as the average error in minutes per hour of the day, and shown to users.
- **Avoid herding:** if everyone gets the same "best time", they all arrive together and create a new peak. The app spreads recommendations across nearby slots and caps how many drivers it sends to each slot.

## 4. Planner for cars and motorbikes

The truck queue also affects everyone else who lives near or drives through Cát Lái, Thạnh Mỹ Lợi and the Phú Mỹ bridge. The same predictions can help them.

- **"Giờ nào nên đi qua khu Cát Lái?"** A simple chart by hour showing when truck traffic is expected to be heavy or light, for today and tomorrow.
- **Best window suggestion:** the user picks a trip (for example District 7 to Thủ Đức over cầu Phú Mỹ) and the app suggests the times with the fewest trucks.
- **Alerts:** "Xe container đang dồn trên Nguyễn Thị Định, nên đi sau 9:30" for people who save a route.
- **School runs:** highlight overlaps between truck waves and school start and end times, when motorbikes with children share the road with container trucks.
- **Phà Cát Lái:** the ferry to Nhơn Trạch shares the same roads, so include its queue in the planner.
- **Safety focus:** the main risk in Ho Chi Minh City is motorbikes mixed with container trucks at rush hour. Showing people when to avoid that mix is a safety feature, not only a time saver.

## 5. Why this helps both sides

- Truck drivers spend less unpaid time idling and burn less fuel.
- Residents and commuters avoid the worst truck hours and breathe less exhaust.
- When trucks spread out, the roads are calmer for everyone, so each group's use of the app benefits the other.
- The port and the city get data they do not have today: when and where the queue forms.

## 6. Things to check before the demo

- Current Cát Lái working hours: use the newer SNP tariff (effective 1 February 2026) and confirm by phone with SNP.
- Whether SNP uses arrival time slots in ePort. If not, a virtual queue would be a first for Cát Lái.
- Whether the gate receipt (EIR) shows the gate-in time.
- The truck ban hours that are in force now, and the Phú Mỹ bridge toll for container trucks.
- Coverage of Vietmap and TomTom live traffic on the corridor (test for two or three days).
- Vietnamese speech recognition on real Android and iPhone devices, with engine noise.

## 7. Data sources

- Driver reports and check-ins (collected by the app).
- Vietmap traffic API and TomTom incidents for live road speeds and crashes, every 2 minutes.
- Open-Meteo for weather, rain, tide and modelled air quality (already downloaded to `data/vn/`).
- OpenStreetMap for roads, schools and hospitals.
- SNP notices and tariff for port hours; shipping line schedules (port code VNCLI) for ship arrivals.
- HCMC traffic portal (giaothong.hochiminhcity.gov.vn) for cameras and notices, checked by hand; a data partnership with Sở Xây dựng as a next step.
