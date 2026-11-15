/* DispatchMonkey — simulated data for the Cát Lái demo.
 * EVERYTHING in this file is SIMULATED or a dated estimate; the UI shows the tag
 * on every value. Teammates: edit numbers here, not in scoring.js. */

const RATES = {
  dieselVndPerL: { v: 26820, src: 'Retail diesel price set by MoIT/MoF, from 15:00 12/11/2026 (Dân Trí)', tag: 'official' },
  idleBurnLPerH: { v: 3.0, src: 'heavy-truck idle estimate', tag: 'model estimate' },
  co2KgPerL:     { v: 2.68, src: 'diesel emission factor', tag: 'official' },
  driverVndPerH: { v: 60000, src: 'typical container driver wage', tag: 'model estimate' },
  phuMyTollVnd:  { v: 80000, src: 'container toll, cầu Phú Mỹ', tag: 'model estimate' },
  rebookVnd:     { v: 300000, src: 'missed ePort slot rebooking', tag: 'SIMULATED' },
};

/* Rules Book — each rule carries source + date + confidence. Never shown without them. */
const RULES = [
  { id: 'port-hours', vi: 'Cảng làm thủ tục 7:30–17:00 (24/24 nếu đăng ký trước)',
    en: 'Port admin hours 7:30–17:00 (24/24 if pre-registered)',
    src: 'Biểu giá SNP 01/04/2021', src_en: 'SNP tariff 01/04/2021', verified: '2026-11-14', confidence: 'dated — re-verify' },
  /* Corrected 2026-11-14 from the HCMC DoT notice itself (see data/vn/lane_rules.json):
   * this is NOT an all-day ban. It bites in three windows, on the mixed-use
   * carriageway, from Huỳnh Tấn Phát to QL1. `hours` are minute-of-day ranges and
   * are what makes the route legal at some departure times and not others.
   * Whether the main carriageway is exempt is not stated in any source we could
   * reach, so the planner conservatively restricts the whole road in those hours. */
  { id: 'nvl-ban', vi: 'Nguyễn Văn Linh (Huỳnh Tấn Phát → QL1): cấm xe tải >2,5 t ở phần đường hỗn hợp, 06–08, 11–13, 17–19',
    en: 'Nguyễn Văn Linh (Huỳnh Tấn Phát → QL1): trucks >2.5 t banned from the mixed-use carriageway, 06–08, 11–13, 17–19',
    src: 'Sở GTVT TP.HCM, hiệu lực 09/05/2020 (Thanh Niên, Pháp Luật TP.HCM)',
    src_en: 'HCMC Dept of Transport notice, effective 2020-05-09 (Thanh Niên, Pháp Luật TP.HCM)',
    verified: '2026-11-14', confidence: 'hours + lane scope verified; main-carriageway exemption unverified',
    blocksRoads: ['Nguyễn Văn Linh'], hours: [[360, 480], [660, 780], [1020, 1140]],
    lane: 'phần đường hỗn hợp / mixed-use carriageway', laneVerified: true },
  { id: 'inner-ban', vi: 'Nội thành: cấm xe tải nặng 6:00–22:00, trừ hành lang được phép',
    en: 'Inner city: heavy trucks banned 6:00–22:00 except named corridors',
    src: 'QĐ 23/2018/QĐ-UBND', verified: '2026-11-14', confidence: 'dated — re-verify',
    /* Context only: every route here stays on the named corridors, and the
     * corridor list in the decision's annex is not something we could read. */
    context: true },
];

/* Origins a driver can pick. Coordinates are road-side staging points. */
const ORIGINS = [
  { id: 'hiep-phuoc', name: 'KCN Hiệp Phước (Nhà Bè)', en: 'Hiệp Phước Industrial Park (Nhà Bè)', lat: 10.671, lon: 106.738 },
  { id: 'song-than', name: 'KCN Sóng Thần (Bình Dương)', en: 'Sóng Thần Industrial Park (Bình Dương)', lat: 10.837, lon: 106.753 },
  { id: 'long-hau', name: 'KCN Long Hậu (Long An)', en: 'Long Hậu Industrial Park (Long An)', lat: 10.639, lon: 106.714 },
];

/* Gate of Cảng Cát Lái (approx, on Nguyễn Thị Định). */
const GATE = { lat: 10.7646, lon: 106.7786, name: 'Cổng Cảng Cát Lái' };

/* Route options per origin. km/min are SIMULATED baselines (no-traffic).
 * roads = named roads used, for the map + exposure + rule checks.
 * queueRoad = where the truck idles if there is a queue. */
const ROUTES = {
  'hiep-phuoc': [
    { id: 'hp-phumy', vi: 'Qua cầu Phú Mỹ', en: 'Via Phú Mỹ bridge',
      roads: ['Nguyễn Lương Bằng', 'Cầu Phú Mỹ', 'Võ Chí Công', 'Đồng Văn Cống', 'Nguyễn Thị Định'],
      km: 21.5, baseMin: 42, toll: 'phuMyTollVnd', queueRoad: 'Nguyễn Thị Định' },
    { id: 'hp-nvl', vi: 'Qua Nguyễn Văn Linh + hầm Thủ Thiêm', en: 'Via Nguyễn Văn Linh + tunnel',
      roads: ['Nguyễn Văn Linh', 'Mai Chí Thọ', 'Đồng Văn Cống', 'Nguyễn Thị Định'],
      km: 26.0, baseMin: 55, toll: null, queueRoad: 'Nguyễn Thị Định' },
  ],
  'song-than': [
    { id: 'st-vcc', vi: 'Qua Võ Chí Công (Vành đai 2)', en: 'Via Võ Chí Công (Ring 2)',
      roads: ['Võ Chí Công', 'Đồng Văn Cống', 'Nguyễn Thị Định'],
      km: 18.0, baseMin: 38, toll: null, queueRoad: 'Nguyễn Thị Định' },
    { id: 'st-mct', vi: 'Qua Mai Chí Thọ', en: 'Via Mai Chí Thọ',
      roads: ['Mai Chí Thọ', 'Đồng Văn Cống', 'Nguyễn Thị Định'],
      km: 21.0, baseMin: 46, toll: null, queueRoad: 'Nguyễn Thị Định' },
  ],
  'long-hau': [
    { id: 'lh-phumy', vi: 'Qua cầu Phú Mỹ', en: 'Via Phú Mỹ bridge',
      roads: ['Nguyễn Lương Bằng', 'Cầu Phú Mỹ', 'Võ Chí Công', 'Đồng Văn Cống', 'Nguyễn Thị Định'],
      km: 25.0, baseMin: 50, toll: 'phuMyTollVnd', queueRoad: 'Nguyễn Thị Định' },
    { id: 'lh-nvl', vi: 'Qua Nguyễn Văn Linh + hầm Thủ Thiêm', en: 'Via Nguyễn Văn Linh + tunnel',
      roads: ['Nguyễn Văn Linh', 'Mai Chí Thọ', 'Đồng Văn Cống', 'Nguyễn Thị Định'],
      km: 29.5, baseMin: 62, toll: null, queueRoad: 'Nguyễn Thị Định' },
  ],
};

/* One simulated day of arrivals at the gate, trucks per 15-min slot (96 slots,
 * 00:00→24:00), scaled to ≈19,000 trucks/day with morning + afternoon peaks. */
const ARRIVALS = (() => {
  const a = [];
  for (let s = 0; s < 96; s++) {
    const h = s / 4;
    let v = 90;                                   // overnight base
    v += 160 * Math.exp(-((h - 9) ** 2) / 4.5);   // morning peak ~9:00
    v += 130 * Math.exp(-((h - 15) ** 2) / 5);    // afternoon peak ~15:00
    a.push(Math.round(v));
  }
  return a;                                        // ≈ 19k/day total
})();

/* Scenarios. capacityPerSlot = trucks the gates clear per 15 min. */
const SCENARIOS = {
  normal: { vi: 'Bình thường', en: 'Normal', capacityPerSlot: 210, speedFactor: 1.0,
            arrivalsFactor: 1.0 },
  disrupted: { vi: 'Sự cố: kẹt cầu Phú Mỹ + tàu dồn chuyến', en: 'Crash on Phú Mỹ bridge + vessel surge',
            capacityPerSlot: 150, speedFactor: 0.55, arrivalsFactor: 1.25,
            slowRoads: ['Cầu Phú Mỹ', 'Nguyễn Lương Bằng', 'Võ Chí Công'],
            report: { vi: '“Kẹt từ chân cầu Phú Mỹ tới Mỹ Thủy” — 7 tài xế báo', en: '“Jammed from Phú Mỹ bridge to Mỹ Thủy” — 7 driver reports' } },
};

/* Default weights for Tốt nhất (sum 100). */
const WEIGHTS = { time: 25, cost: 20, idle: 20, co2: 15, exposure: 20 };

/* Fairness Ledger — today's running burden per area, idle truck-minutes. SIMULATED. */
const LEDGER = {
  'Nguyễn Thị Định (Cát Lái)': 340,
  'Nguyễn Văn Linh (Q7)': 40,
  'Mai Chí Thọ (Thủ Đức)': 95,
};

if (typeof module !== 'undefined') module.exports = {
  RATES, RULES, ORIGINS, GATE, ROUTES, ARRIVALS, SCENARIOS, WEIGHTS, LEDGER,
};
