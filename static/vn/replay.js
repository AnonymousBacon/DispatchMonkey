/* Đúng Giờ — the demo replay. Works with no network.
 * Every "AI" output here is a CACHED FIXTURE written to the agent's JSON schema,
 * not a live model call. The UI says so. No number in here feeds the engine:
 * the engine (fleet.js) computes every KPI. */

const REPLAY = [
  { id: 'normal', clock: '05:45', title: 'Normal morning',
    vi: 'Sáng bình thường', what: 'Plan for 12 trucks. All warehouse windows met.',
    state: { event: null, plan: 'normal' } },

  { id: 'report', clock: '06:03', title: 'Driver report: UNCONFIRMED',
    vi: 'Tài xế báo: CHƯA XÁC NHẬN',
    what: 'One driver reports a crash on the Phú Mỹ bridge. One report is evidence, not confirmation, so the plan does not change yet.',
    report: { from: 'Driver D-07 (ID only, no name)', channel: 'Zalo text', text: 'Xe container tông nhau giữa cầu Phú Mỹ, kẹt 2 làn hướng Cát Lái, đứng im 10 phút rồi.' },
    intake: { // Intake agent, cached fixture (schema: place, type, lanes_blocked, direction, confidence)
      place: 'Cầu Phú Mỹ', snapped_to_osm: 'Cầu Phú Mỹ (OSM way)', type: 'crash',
      direction: 'towards Cát Lái', lanes_blocked: 2, confidence: 'medium', status: 'UNCONFIRMED' },
    state: { event: 'unconfirmed', plan: 'normal' } },

  { id: 'second', clock: '06:08', title: 'Second, independent source',
    vi: 'Nguồn thứ hai, độc lập',
    what: 'A second driver on a different truck reports the same jam, and the bridge-approach speed drops (SIMULATED in this replay; today’s live TomTom speeds on the bridge show no jam). Two independent sources means CONFIRMED.',
    report: { from: 'Driver D-11 (ID only)', channel: 'app button "kẹt xe"', text: 'Kẹt cứng chân cầu Phú Mỹ phía Quận 7.' },
    speed: { segment: 'Cầu Phú Mỹ approach', normalKmh: 42, nowKmh: 9, tier: 'SIMULATED' },
    state: { event: 'confirmed', plan: 'normal' } },

  { id: 'impact', clock: '06:10', title: 'Capacity drops + ship wave',
    vi: 'Năng lực cổng giảm + tàu lớn dỡ hàng',
    what: 'Confirmed crash: gate approach throughput ×0.6 until it clears (estimate, 60 min). Radar shows a big ship at berth: a truck wave from 08:00 to 11:00 (+40 %, estimate). The old plan now makes 2 trucks late.',
    state: { event: 'confirmed', plan: 'stale' } },

  { id: 'replan', clock: '06:10', title: 'Re-plan (dispatcher approves)',
    vi: 'Lập lại kế hoạch',
    what: 'The allocator re-times the trucks that have not left yet, one at a time, counting its own trucks in the queue. The dispatcher approves before anything is sent.',
    state: { event: 'confirmed', plan: 'replan' } },
];

if (typeof module !== 'undefined') module.exports = { REPLAY };
