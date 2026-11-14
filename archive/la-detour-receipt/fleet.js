/* ============================================================================
   SYNTHETIC FLEET DATA  —  everything in this file is MADE UP.
   No public live container-level data exists, so shipments, trucks, drivers and
   warehouse appointments are invented. Terminal and warehouse coordinates are
   real industrial locations; the businesses at them are fictional.

   >> TEAMMATES: this is the file to edit. Add shipments, trucks, routes, events.
      Nothing here does maths. All formulas live in scoring.js.
   ========================================================================== */

// Simulated clock for the demo, in minutes past midnight. 13:00.
const SIM_NOW = 13 * 60;

const ASSUMPTIONS = {
  truckMpg:        { v: 6.0,   unit: 'mpg',      label: 'Drayage truck fuel economy',
                     src: 'Typical Class 8 drayage, loaded. ASSUMPTION.' },
  dieselPrice:     { v: 5.10,  unit: '$/gal',    label: 'CA diesel price',
                     src: 'California average, Nov 2026. VERIFY before presenting.' },
  wearPerMile:     { v: 0.21,  unit: '$/mi',     label: 'Tyres + maintenance per mile',
                     src: 'ATRI operational cost of trucking (order of magnitude). ASSUMPTION.' },
  driverHourly:    { v: 28.00, unit: '$/h',      label: 'Hourly driver rate',
                     src: 'Illustrative SoCal drayage rate. ASSUMPTION.' },
  co2PerGal:       { v: 10.18, unit: 'kg/gal',   label: 'CO2 per gallon diesel',
                     src: 'US EPA emission factor for diesel fuel.' },
  idleGalPerHour:  { v: 0.80,  unit: 'gal/h',    label: 'Idling fuel burn',
                     src: 'EPA/Argonne idling estimates for Class 8. ASSUMPTION.' },
  freeFlowMph:     { v: 55,    unit: 'mph',      label: 'Motorway free-flow truck speed',
                     src: 'Below the 55 mph CA truck limit. ASSUMPTION.' },
  normalCongestion:{ v: 1.18,  unit: 'x',        label: 'Normal midday congestion factor',
                     src: 'Applied to free-flow time on all corridors. ASSUMPTION.' },
  lastMileMph:     { v: 24,    unit: 'mph',      label: 'Surface-street speed',
                     src: 'ASSUMPTION. Last-mile geometry is a straight line, not a real route.' },
  schoolBufferM:   { v: 150,   unit: 'm',        label: 'School proximity buffer',
                     src: 'Counts schools whose point falls within this distance of the route line.' },
  burdenPct:       { v: 75,    unit: 'pctile',   label: 'High-burden threshold',
                     src: 'CalEnviroScreen 4.0 diesel PM percentile at or above this counts.' },
  perDiemPerDay:   { v: 185,   unit: '$/day',    label: 'Container per-diem after free time',
                     src: 'Illustrative. ASSUMPTION.' },
};

// Default trade-off weights. Dispatcher moves these live.
const DEFAULT_WEIGHTS = {
  delay: 0.30, cost: 0.20, driverUnpaid: 0.15, co2: 0.15, school: 0.10, burden: 0.10,
};

// --- Real coordinates, fictional operators ---------------------------------
const TERMINALS = [
  { id: 'T-PIER400', name: 'Pier 400 Terminal',      lat: 33.7395, lon: -118.2545 },
  { id: 'T-PIER300', name: 'Pier 300 Terminal',      lat: 33.7420, lon: -118.2650 },
  { id: 'T-WBCT',    name: 'West Basin Terminal',    lat: 33.7620, lon: -118.2560 },
  { id: 'T-MIDHARB', name: 'Middle Harbor Terminal', lat: 33.7560, lon: -118.2130 },
  { id: 'T-PIERT',   name: 'Pier T Terminal',        lat: 33.7470, lon: -118.2320 },
];

const WAREHOUSES = [
  { id: 'W-CARSON',   name: 'Harbor Gate DC (Carson)',       lat: 33.8350, lon: -118.2450, city: 'Carson' },
  { id: 'W-COMMERCE', name: 'Eastside Transload (Commerce)', lat: 34.0010, lon: -118.1510, city: 'Commerce' },
  { id: 'W-ONTARIO',  name: 'Inland Fulfilment (Ontario)',   lat: 34.0640, lon: -117.6120, city: 'Ontario' },
  { id: 'W-FONTANA',  name: 'Cherry Ave Megasite (Fontana)', lat: 34.0900, lon: -117.4400, city: 'Fontana' },
  { id: 'W-RIALTO',   name: 'Rialto Crossdock',              lat: 34.1000, lon: -117.3750, city: 'Rialto' },
];

/* Route options. A leg rides a real OSM corridor centreline between two points
   (snapped to the nearest vertex). Terminal->first leg and last leg->warehouse
   are drawn as straight "surface street" lines and priced at lastMileMph:
   SIMULATED geometry, not a real street route. */
const ROUTE_OPTIONS = {
  'W-CARSON': [
    { id: 'carson-710', name: 'I-710 North',
      legs: [{ c: 'I-710', from: [-118.202, 33.760], to: [-118.198, 33.838] }] },
    { id: 'carson-110', name: 'I-110 North',
      legs: [{ c: 'I-110', from: [-118.285, 33.745], to: [-118.282, 33.838] }] },
    { id: 'carson-405', name: 'I-405 East',
      legs: [{ c: 'I-405', from: [-118.330, 33.800], to: [-118.240, 33.845] }] },
  ],
  'W-COMMERCE': [
    { id: 'comm-710', name: 'I-710 North direct',
      legs: [{ c: 'I-710', from: [-118.202, 33.760], to: [-118.166, 34.000] }] },
    { id: 'comm-110-10', name: 'I-110 North then I-10 East',
      legs: [{ c: 'I-110', from: [-118.285, 33.745], to: [-118.277, 34.033] },
             { c: 'I-10',   from: [-118.250, 34.034], to: [-118.160, 34.010] }] },
    { id: 'comm-91-605', name: 'SR-91 East then I-605 North',
      legs: [{ c: 'I-710', from: [-118.202, 33.760], to: [-118.199, 33.872] },
             { c: 'SR-91', from: [-118.199, 33.872], to: [-118.093, 33.871] },
             { c: 'I-605', from: [-118.093, 33.871], to: [-118.096, 34.020] }] },
  ],
  'W-ONTARIO': [
    { id: 'ont-710-60', name: 'I-710 North then SR-60 East',
      legs: [{ c: 'I-710', from: [-118.202, 33.760], to: [-118.164, 34.028] },
             { c: 'SR-60', from: [-118.164, 34.028], to: [-117.620, 34.030] }] },
    { id: 'ont-91-15', name: 'SR-91 East then I-15 North',
      legs: [{ c: 'I-710', from: [-118.202, 33.760], to: [-118.199, 33.872] },
             { c: 'SR-91', from: [-118.199, 33.872], to: [-117.569, 33.877] },
             { c: 'I-15',  from: [-117.569, 33.877], to: [-117.540, 34.045] }] },
    { id: 'ont-110-10', name: 'I-110 North then I-10 East',
      legs: [{ c: 'I-110', from: [-118.285, 33.745], to: [-118.277, 34.033] },
             { c: 'I-10',   from: [-118.250, 34.034], to: [-117.620, 34.072] }] },
  ],
  'W-FONTANA': [
    { id: 'font-60-15-10', name: 'SR-60 East, I-15 North, I-10 East',
      legs: [{ c: 'I-710', from: [-118.202, 33.760], to: [-118.164, 34.028] },
             { c: 'SR-60', from: [-118.164, 34.028], to: [-117.540, 34.024] },
             { c: 'I-15',  from: [-117.540, 34.024], to: [-117.539, 34.072] },
             { c: 'I-10',  from: [-117.539, 34.075], to: [-117.440, 34.092] }] },
    { id: 'font-10', name: 'I-10 East throughout',
      legs: [{ c: 'I-110', from: [-118.285, 33.745], to: [-118.277, 34.033] },
             { c: 'I-10',   from: [-118.250, 34.034], to: [-117.440, 34.092] }] },
    { id: 'font-91-15-10', name: 'SR-91 East, I-15 North, I-10 East',
      legs: [{ c: 'I-710', from: [-118.202, 33.760], to: [-118.199, 33.872] },
             { c: 'SR-91', from: [-118.199, 33.872], to: [-117.569, 33.877] },
             { c: 'I-15',  from: [-117.569, 33.877], to: [-117.539, 34.072] },
             { c: 'I-10',  from: [-117.539, 34.075], to: [-117.440, 34.092] }] },
  ],
  'W-RIALTO': [
    { id: 'rial-60-15-10', name: 'SR-60 East, I-15 North, I-10 East',
      legs: [{ c: 'I-710', from: [-118.202, 33.760], to: [-118.164, 34.028] },
             { c: 'SR-60', from: [-118.164, 34.028], to: [-117.540, 34.024] },
             { c: 'I-15',  from: [-117.540, 34.024], to: [-117.539, 34.072] },
             { c: 'I-10',  from: [-117.539, 34.075], to: [-117.375, 34.098] }] },
    { id: 'rial-10', name: 'I-10 East throughout',
      legs: [{ c: 'I-110', from: [-118.285, 33.745], to: [-118.277, 34.033] },
             { c: 'I-10',   from: [-118.250, 34.034], to: [-117.375, 34.098] }] },
  ],
};

// --- Trucks. No driver names: an ID only (responsible data use). -----------
const TRUCKS = [
  { id: 'DRV-21', lat: 33.7550, lon: -118.2100, hosLeftMin: 270, pay: 'per_load' },
  { id: 'DRV-34', lat: 33.8700, lon: -118.1990, hosLeftMin: 95,  pay: 'hourly'   },
  { id: 'DRV-47', lat: 33.7420, lon: -118.2640, hosLeftMin: 410, pay: 'hourly'   },
  { id: 'DRV-52', lat: 34.0200, lon: -118.1650, hosLeftMin: 180, pay: 'per_load' },
  { id: 'DRV-66', lat: 33.7470, lon: -118.2330, hosLeftMin: 330, pay: 'per_load' },
  { id: 'DRV-78', lat: 34.0630, lon: -117.6200, hosLeftMin: 55,  pay: 'hourly'   },
];

/* Shipments. apptStart/apptEnd/dockClose are minutes past midnight.
   status: not_ready | ready | picked_up | delivered */
const SHIPMENTS = [
  { id: 'MSCU-4471', terminal: 'T-MIDHARB', wh: 'W-COMMERCE', truck: 'DRV-21',
    status: 'picked_up', readyAt: 12 * 60 + 30, apptStart: 13 * 60 + 25, apptEnd: 14 * 60,
    dockClose: 16 * 60, rebookFee: 120, weightClass: 'heavy', route: 'comm-710',
    freeTimeEndsDay: 1 },
  { id: 'TGHU-8812', terminal: 'T-PIERT', wh: 'W-ONTARIO', truck: 'DRV-66',
    status: 'picked_up', readyAt: 11 * 60 + 30, apptStart: 14 * 60 + 30, apptEnd: 14 * 60 + 50,
    dockClose: 18 * 60, rebookFee: 200, weightClass: 'heavy', route: 'ont-710-60',
    freeTimeEndsDay: 0 },
  { id: 'CMAU-1209', terminal: 'T-PIER400', wh: 'W-FONTANA', truck: 'DRV-47',
    status: 'ready', readyAt: 12 * 60 + 45, apptStart: 16 * 60, apptEnd: 17 * 60,
    dockClose: 19 * 60, rebookFee: 250, weightClass: 'standard', route: 'font-60-15-10',
    freeTimeEndsDay: 2 },
  { id: 'OOLU-5533', terminal: 'T-WBCT', wh: 'W-CARSON', truck: 'DRV-34',
    status: 'picked_up', readyAt: 12 * 60, apptStart: 13 * 60 + 45, apptEnd: 14 * 60 + 15,
    dockClose: 16 * 60 + 30, rebookFee: 90, weightClass: 'standard', route: 'carson-710',
    freeTimeEndsDay: 1 },
  { id: 'HLXU-7764', terminal: 'T-PIER300', wh: 'W-RIALTO', truck: 'DRV-52',
    status: 'ready', readyAt: 12 * 60 + 30, apptStart: 15 * 60 + 30, apptEnd: 16 * 60 + 15,
    dockClose: 19 * 60, rebookFee: 180, weightClass: 'heavy', route: 'rial-60-15-10',
    freeTimeEndsDay: 1 },
  { id: 'MAEU-3098', terminal: 'T-MIDHARB', wh: 'W-COMMERCE', truck: null,
    status: 'not_ready', readyAt: 15 * 60 + 30, apptStart: 17 * 60, apptEnd: 17 * 60 + 30,
    dockClose: 18 * 60, rebookFee: 120, weightClass: 'standard', route: 'comm-710',
    freeTimeEndsDay: 0 },
  { id: 'EGHU-2240', terminal: 'T-PIERT', wh: 'W-ONTARIO', truck: 'DRV-78',
    status: 'ready', readyAt: 13 * 60, apptStart: 16 * 60, apptEnd: 16 * 60 + 30,
    dockClose: 18 * 60, rebookFee: 200, weightClass: 'standard', route: 'ont-710-60',
    freeTimeEndsDay: 1 },
  { id: 'SEGU-6617', terminal: 'T-PIER400', wh: 'W-FONTANA', truck: null,
    status: 'not_ready', readyAt: 14 * 60 + 45, apptStart: 18 * 60, apptEnd: 19 * 60,
    dockClose: 20 * 60, rebookFee: 250, weightClass: 'heavy', route: 'font-60-15-10',
    freeTimeEndsDay: 3 },
  { id: 'TCLU-9901', terminal: 'T-WBCT', wh: 'W-CARSON', truck: null,
    status: 'ready', readyAt: 12 * 60 + 15, apptStart: 15 * 60 + 30, apptEnd: 16 * 60 + 15,
    dockClose: 17 * 60, rebookFee: 90, weightClass: 'standard', route: 'carson-110',
    freeTimeEndsDay: 2 },
  { id: 'APZU-4455', terminal: 'T-PIER300', wh: 'W-RIALTO', truck: null,
    status: 'not_ready', readyAt: 16 * 60, apptStart: 19 * 60, apptEnd: 20 * 60,
    dockClose: 21 * 60, rebookFee: 180, weightClass: 'standard', route: 'rial-10',
    freeTimeEndsDay: 1 },
];

/* Replay events. Recorded shapes of real past incidents, played back so the
   demo is identical every run. `effect.slow` multiplies travel time inside the
   radius; `effect.closed` makes the route infeasible (hard filter). */
const REPLAY = {
  'baseline': { label: 'Normal operations', events: [] },

  'i710-crash': {
    label: 'I-710 N crash at Firestone + driver report',
    events: [
      { id: 'EV-CHP-1', kind: 'collision', source: 'CHP', confirmed: true, confidence: 0.95,
        lat: 33.9180, lon: -118.1850, radiusMi: 3.0, effect: { slow: 5.5 },
        at: 13 * 60 + 4,
        text: 'Trfc Collision - 1125, two lanes blocked, NB 710 JNO Firestone Blvd',
        evidence: 'CHP incident feed (official). Radius 3 mi and 10 mph through the '
               + 'queue are ESTIMATES of the backup, not measured.' },
      { id: 'EV-DRV-1', kind: 'congestion', source: 'driver report', confirmed: false, confidence: 0.50,
        lat: 33.9250, lon: -118.1840, radiusMi: 2.0, effect: { slow: 2.5 },
        at: 13 * 60 + 6,
        text: 'DRV-34: "710 north stopped near Firestone, smoke ahead"',
        evidence: 'Single driver report. Not independently confirmed.' },
      { id: 'EV-CAM-1', kind: 'camera', source: 'Caltrans CCTV', confirmed: false, confidence: 0.80,
        lat: 33.9210, lon: -118.1845, radiusMi: 0.3, effect: {},
        at: 13 * 60 + 7,
        text: 'Nearest camera: likely STOPPED TRAFFIC - unconfirmed',
        evidence: 'Image classification of a single still. Not a confirmation of closure.' },
    ],
  },

  'sr60-fire': {
    label: 'Brush fire near SR-60 (unconfirmed perimeter)',
    events: [
      { id: 'EV-FIRE-1', kind: 'fire', source: 'NIFC perimeter + FIRMS hotspot', confirmed: false,
        confidence: 0.65, lat: 34.0270, lon: -117.7500, radiusMi: 2.5,
        effect: { closed: true }, at: 13 * 60 + 2,
        text: 'Active fire perimeter crosses SR-60 corridor near Pomona',
        evidence: 'Satellite hotspot + interagency perimeter. A perimeter near a road does NOT confirm the road is closed.' },
      { id: 'EV-CT-1', kind: 'closure', source: 'Caltrans LCS', confirmed: true, confidence: 0.95,
        lat: 34.0400, lon: -117.5400, radiusMi: 0.8, effect: { slow: 1.6 },
        at: 12 * 60 + 40,
        text: 'Planned lane closure, NB I-15 at I-10 connector',
        evidence: 'Caltrans Lane Closure System (official, scheduled).' },
    ],
  },
};
