// Shared compensation calculation engine for ClaimVelo
// Supports EU261, UK261, Israeli Aviation Services Law, and US DOT rules.

export type Jurisdiction = 'eu' | 'uk' | 'il' | 'us';
export type DisruptionType = 'delay' | 'cancelled' | 'missed' | 'denied' | 'baggage';
export type AirlineReason =
  | 'technical_fault'
  | 'bad_weather'
  | 'atc'
  | 'crew_shortage'
  | 'strike'
  | 'no_reason'
  | 'other';

export const EXTRAORDINARY_REASONS: AirlineReason[] = [
  'bad_weather',
  'atc',
  'strike',
];

// ── Airport coordinates for haversine distance ──────────────────────────────
const AIRPORT_COORDS: Record<string, [number, number]> = {
  LHR:[51.477,-0.461],LGW:[51.148,-0.190],LTN:[51.874,-0.368],STN:[51.885,0.235],LCY:[51.505,0.055],
  MAN:[53.354,-2.275],EDI:[55.950,-3.373],BHX:[52.453,-1.748],GLA:[55.872,-4.433],BRS:[51.382,-2.719],
  CDG:[49.009,2.548],ORY:[48.724,2.380],NCE:[43.658,7.215],LYS:[45.726,5.081],MRS:[43.435,5.215],
  AMS:[52.308,4.764],BRU:[50.902,4.484],LGG:[50.637,5.443],
  FRA:[50.033,8.570],MUC:[48.354,11.786],BER:[52.366,13.503],DUS:[51.289,6.767],HAM:[53.630,10.006],
  STR:[48.690,9.222],CGN:[50.866,7.143],NUE:[49.499,11.078],HAJ:[52.461,9.685],
  MAD:[40.472,-3.561],BCN:[41.297,2.078],PMI:[39.551,2.739],AGP:[36.675,-4.499],ALC:[38.282,-0.558],
  VLC:[39.489,-0.481],BIO:[43.301,-2.911],SVQ:[37.418,-5.893],
  FCO:[41.800,12.239],MXP:[45.630,8.723],LIN:[45.445,9.277],VCE:[45.505,12.352],NAP:[40.886,14.291],
  BGY:[45.669,9.704],PSA:[43.683,10.393],BLQ:[44.535,11.289],CTA:[37.467,15.066],
  LIS:[38.781,-9.136],OPO:[41.248,-8.681],FAO:[37.014,-7.966],
  ZRH:[47.458,8.548],GVA:[46.238,6.109],BSL:[47.590,7.530],
  VIE:[48.110,16.570],SZG:[47.793,13.004],GRZ:[46.991,15.440],
  PRG:[50.100,14.260],BRQ:[49.151,16.695],
  WAW:[52.165,20.967],KRK:[50.077,19.785],WRO:[51.102,16.885],KTW:[50.474,19.080],
  BUD:[47.433,19.261],
  OTP:[44.572,26.102],CLJ:[46.785,23.686],
  SOF:[42.696,23.411],VAR:[43.232,27.825],
  ATH:[37.936,23.944],SKG:[40.520,22.971],HER:[35.340,25.181],
  IST:[40.976,28.814],SAW:[40.898,29.309],AYT:[36.899,30.800],ADB:[38.292,27.157],ESB:[40.128,32.995],
  SVO:[55.973,37.415],DME:[55.408,37.906],LED:[59.800,30.262],VKO:[55.591,37.261],
  ARN:[59.651,17.919],GOT:[57.669,12.300],BMA:[59.354,17.947],
  CPH:[55.618,12.656],AAL:[57.093,9.849],
  OSL:[60.194,11.100],BGO:[60.294,5.218],
  HEL:[60.317,24.963],TMP:[61.414,23.604],
  RIX:[56.924,23.971],TLL:[59.413,24.833],VNO:[54.634,25.285],
  DUB:[53.421,-6.270],SNN:[52.702,-8.925],ORK:[51.841,-8.491],
  KEF:[63.985,-22.606],
  TXL:[52.554,13.291],SXF:[52.380,13.522],
  LPA:[27.931,-15.387],TFS:[28.045,-16.572],ACE:[28.945,-13.605],FUE:[28.300,-13.864],
  HRG:[27.178,33.799],SSH:[27.977,34.395],CAI:[30.122,31.405],
  DXB:[25.253,55.364],AUH:[24.433,54.651],SHJ:[25.328,55.517],DOH:[25.273,51.608],
  KWI:[29.227,47.969],BAH:[26.270,50.634],MCT:[23.594,58.285],
  DEL:[28.556,77.100],BOM:[19.089,72.868],BLR:[13.199,77.706],MAA:[12.990,80.169],
  HYD:[17.231,78.430],CCU:[22.655,88.447],COK:[10.152,76.401],
  BKK:[13.681,100.747],DMK:[13.913,100.606],HKT:[8.113,98.316],
  SIN:[1.359,103.989],KUL:[2.745,101.710],CGK:[-6.127,106.655],
  HKG:[22.308,113.915],PEK:[40.080,116.585],PVG:[31.143,121.805],CAN:[23.392,113.299],
  ICN:[37.469,126.451],GMP:[37.558,126.791],
  NRT:[35.765,140.386],HND:[35.549,139.780],KIX:[34.426,135.244],NGO:[34.858,136.805],
  SYD:[-33.946,151.177],MEL:[-37.673,144.843],BNE:[-27.384,153.118],PER:[-31.940,115.967],
  JNB:[-26.134,28.242],CPT:[-33.965,18.602],
  YYZ:[43.677,-79.631],YVR:[49.194,-123.184],YUL:[45.470,-73.741],YYC:[51.131,-114.010],
  JFK:[40.640,-73.779],LAX:[33.943,-118.408],ORD:[41.978,-87.905],ATL:[33.640,-84.427],
  DFW:[32.896,-97.038],DEN:[39.856,-104.674],SFO:[37.619,-122.375],LAS:[36.080,-115.152],
  SEA:[47.449,-122.309],PHX:[33.436,-112.008],EWR:[40.693,-74.169],MIA:[25.796,-80.287],
  BOS:[42.365,-71.010],MSP:[44.882,-93.222],IAD:[38.944,-77.456],CLT:[35.214,-80.943],
  DTW:[42.212,-83.353],MCO:[28.430,-81.309],PHL:[39.873,-75.241],SAN:[32.734,-117.190],
  TPA:[27.976,-82.533],PDX:[45.589,-122.593],STL:[38.748,-90.370],BNA:[36.124,-86.678],
  GRU:[-23.432,-46.469],GIG:[-22.808,-43.244],EZE:[-34.822,-58.536],
  BOG:[4.700,-74.147],LIM:[-12.022,-77.114],SCL:[-33.393,-70.786],
  MEX:[19.436,-99.072],CUN:[21.037,-86.877],GDL:[20.521,-103.311],MTY:[25.775,-100.107],
  TLV:[32.011,34.887],SDV:[32.419,34.880],ETM:[29.698,35.013],VDA:[29.569,35.009],
  KCN:[29.632,35.014],
};

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function routeDistanceKm(depCode?: string, arrCode?: string): number | null {
  if (!depCode || !arrCode) return null;
  const dep = AIRPORT_COORDS[depCode.toUpperCase()];
  const arr = AIRPORT_COORDS[arrCode.toUpperCase()];
  if (!dep || !arr) return null;
  return Math.round(haversineKm(dep[0], dep[1], arr[0], arr[1]));
}

// ── Claim window limits ──────────────────────────────────────────────────────
export const CLAIM_WINDOWS: Record<string, { years: number; label: string }> = {
  'GB-EN': { years: 6, label: '6 years (England & Wales)' },
  'GB-SCT': { years: 5, label: '5 years (Scotland)' },
  'IE': { years: 6, label: '6 years (Ireland)' },
  'IL': { years: 4, label: '4 years (Israel)' },
  'FR': { years: 5, label: '5 years (France)' },
  'DE': { years: 3, label: '3 years (Germany)' },
  'NL': { years: 3, label: '3 years (Netherlands)' },
  'ES': { years: 5, label: '5 years (Spain)' },
  'IT': { years: 2, label: '2 years (Italy)' },
  'DEFAULT': { years: 3, label: '3 years (most EU countries)' },
};

export function isWithinClaimWindow(flightDate: string, countryCode?: string): { within: boolean; years: number; label: string } {
  const key = countryCode?.toUpperCase() || 'DEFAULT';
  const config = CLAIM_WINDOWS[key] || CLAIM_WINDOWS['DEFAULT'];
  const flight = new Date(flightDate);
  const limit = new Date();
  limit.setFullYear(limit.getFullYear() - config.years);
  return { within: flight >= limit, years: config.years, label: config.label };
}

// ── Core compensation calculation ────────────────────────────────────────────
export interface CompensationInput {
  jurisdiction: Jurisdiction;
  disruption: DisruptionType;
  delayMin?: number;          // actual or estimated delay in minutes
  depCode?: string;           // IATA departure code
  arrCode?: string;           // IATA arrival code
  passengers?: number;        // number of passengers claiming (default 1)
  airlineReason?: AirlineReason;
  noticeDays?: number;        // for cancellations: days of notice given by airline
  offeredAlternative?: boolean; // for cancellations: was a comparable alternative offered?
  altArrivalDeltaMin?: number;   // if alternative offered, how close to original arrival
}

export interface CompensationResult {
  eligible: boolean;
  amountPerPassenger: number;
  totalAmount: number;
  currency: string;
  currencySymbol: string;
  distanceKm: number | null;
  jurisdiction: Jurisdiction;
  reasons: string[];          // explanation strings
  warnings: string[];         // non-blocking warnings (e.g. extraordinary circumstances claim)
  blocked: boolean;           // hard block — claim likely invalid
  blockedReason?: string;
}

const CURRENCY_MAP: Record<Jurisdiction, { code: string; symbol: string }> = {
  eu: { code: 'EUR', symbol: '€' },
  uk: { code: 'GBP', symbol: '£' },
  il: { code: 'ILS', symbol: '₪' },
  us: { code: 'USD', symbol: '$' },
};

export function isExtraordinary(reason?: AirlineReason): boolean {
  if (!reason) return false;
  return EXTRAORDINARY_REASONS.includes(reason);
}

export function calculateCompensation(input: CompensationInput): CompensationResult {
  const { jurisdiction, disruption, passengers = 1 } = input;
  const cur = CURRENCY_MAP[jurisdiction];
  const distanceKm = routeDistanceKm(input.depCode, input.arrCode);
  const reasons: string[] = [];
  const warnings: string[] = [];

  // ── Extraordinary circumstances check ────────────────────────────────────
  if (isExtraordinary(input.airlineReason)) {
    reasons.push(`Airline cited "${input.airlineReason}" — this may qualify as extraordinary circumstances.`);
    warnings.push('Airlines frequently misuse the extraordinary circumstances defence. We challenge this in the majority of cases.');
    // Don't hard-block — warn and let the team verify
  }

  // ── US DOT rules (simplified) ────────────────────────────────────────────
  if (jurisdiction === 'us') {
    if (disruption === 'denied') {
      // Involuntary denied boarding on US flights
      const amount = 400 * passengers; // simplified — up to 400% of one-way fare
      return {
        eligible: true,
        amountPerPassenger: 400,
        totalAmount: amount,
        currency: cur.code,
        currencySymbol: cur.symbol,
        distanceKm,
        jurisdiction,
        reasons: ['Involuntary denied boarding on a US flight — up to 400% of one-way fare value.'],
        warnings: [],
        blocked: false,
      };
    }
    if (disruption === 'cancelled') {
      return {
        eligible: true,
        amountPerPassenger: 0,
        totalAmount: 0,
        currency: cur.code,
        currencySymbol: cur.symbol,
        distanceKm,
        jurisdiction,
        reasons: ['US DOT rules require a full refund for cancelled flights when you reject the alternative.'],
        warnings: ['US rules provide refunds, not fixed cash compensation. We can help enforce your refund right.'],
        blocked: false,
      };
    }
    // US delays — no fixed compensation, but refund may apply
    return {
      eligible: false,
      amountPerPassenger: 0,
      totalAmount: 0,
      currency: cur.code,
      currencySymbol: cur.symbol,
      distanceKm,
      jurisdiction,
      reasons: ['US DOT rules do not provide fixed cash compensation for delays. EU261/UK261 may apply if the flight was EU/UK-operated.'],
      warnings: ['If your flight was operated by an EU or UK carrier, or departed from the EU/UK, you may still qualify under EU261 or UK261.'],
      blocked: false,
    };
  }

  // ── EU261 / UK261 / Israeli law ──────────────────────────────────────────
  const minDelayMin = jurisdiction === 'il' ? 480 : 180; // IL: 8h, EU/UK: 3h

  // Cancellation
  if (disruption === 'cancelled') {
    // Check notice period
    if (input.noticeDays !== undefined && input.noticeDays >= 14) {
      return {
        eligible: false,
        amountPerPassenger: 0,
        totalAmount: 0,
        currency: cur.code,
        currencySymbol: cur.symbol,
        distanceKm,
        jurisdiction,
        reasons: [`Cancellation was notified ${input.noticeDays} days before departure — 14+ days notice means no fixed compensation.`],
        warnings: ['You may still be entitled to a full refund or rerouting even if compensation doesn\'t apply.'],
        blocked: false,
        blockedReason: 'Cancellation notified more than 14 days in advance.',
      };
    }

    // Check if comparable alternative was offered (arrived within 2h of original for short/medium, 4h for long)
    if (input.offeredAlternative && input.altArrivalDeltaMin !== undefined) {
      const tolerance = distanceKm && distanceKm > 3500 ? 240 : 120;
      if (input.altArrivalDeltaMin <= tolerance) {
        return {
          eligible: false,
          amountPerPassenger: 0,
          totalAmount: 0,
          currency: cur.code,
          currencySymbol: cur.symbol,
          distanceKm,
          jurisdiction,
          reasons: [`Alternative flight arrived within ${tolerance / 60}h of original — compensation may be reduced or not owed.`],
          warnings: ['The airline must prove the alternative was comparable. We verify this during the claim.'],
          blocked: false,
          blockedReason: 'Alternative flight arrived close to original schedule.',
        };
      }
    }

    const amount = calcByDistance(jurisdiction, distanceKm, 600);
    return {
      eligible: true,
      amountPerPassenger: amount,
      totalAmount: amount * passengers,
      currency: cur.code,
      currencySymbol: cur.symbol,
      distanceKm,
      jurisdiction,
      reasons: [
        `Flight cancelled with less than 14 days' notice.`,
        `Compensation of ${cur.symbol}${amount} per passenger under ${jurisdictionName(jurisdiction)}.`,
      ],
      warnings,
      blocked: false,
    };
  }

  // Denied boarding — always eligible (if involuntary)
  if (disruption === 'denied') {
    const amount = calcByDistance(jurisdiction, distanceKm, 600);
    return {
      eligible: true,
      amountPerPassenger: amount,
      totalAmount: amount * passengers,
      currency: cur.code,
      currencySymbol: cur.symbol,
      distanceKm,
      jurisdiction,
      reasons: [
        'Involuntary denied boarding (overbooking) — full compensation right applies.',
        `${cur.symbol}${amount} per passenger under ${jurisdictionName(jurisdiction)}.`,
      ],
      warnings,
      blocked: false,
    };
  }

  // Missed connection — eligibility based on final arrival delay
  if (disruption === 'missed') {
    if ((input.delayMin ?? 0) < minDelayMin) {
      return {
        eligible: false,
        amountPerPassenger: 0,
        totalAmount: 0,
        currency: cur.code,
        currencySymbol: cur.symbol,
        distanceKm,
        jurisdiction,
        reasons: [`Final arrival delay of ${formatDelay(input.delayMin ?? 0)} is below the ${minDelayMin / 60}-hour threshold.`],
        warnings: [],
        blocked: jurisdiction === 'il' ? false : false,
      };
    }
    const amount = calcByDistance(jurisdiction, distanceKm, 600);
    return {
      eligible: true,
      amountPerPassenger: amount,
      totalAmount: amount * passengers,
      currency: cur.code,
      currencySymbol: cur.symbol,
      distanceKm,
      jurisdiction,
      reasons: [
        `Missed connection caused ${formatDelay(input.delayMin ?? 0)} arrival delay — above the ${minDelayMin / 60}-hour threshold.`,
        `${cur.symbol}${amount} per passenger based on total journey distance.`,
      ],
      warnings,
      blocked: false,
    };
  }

  // Baggage — flat amounts (simplified Montreal Convention)
  if (disruption === 'baggage') {
    const amount = jurisdiction === 'il' ? 1440 : 1400;
    return {
      eligible: true,
      amountPerPassenger: amount,
      totalAmount: amount * passengers,
      currency: cur.code,
      currencySymbol: cur.symbol,
      distanceKm,
      jurisdiction,
      reasons: ['Baggage problem — up to ~€1,400 per passenger under Montreal Convention.'],
      warnings: ['Baggage claims require documentation of the issue and item value.'],
      blocked: false,
    };
  }

  // Delay — the main case
  if (disruption === 'delay') {
    const delay = input.delayMin ?? 0;

    if (delay < minDelayMin) {
      // For EU/UK, under 3h = not eligible. For IL, under 8h = not eligible.
      if (delay >= 120 && jurisdiction !== 'il') {
        // 2-3h delay in EU/UK — partial may apply in rare cases, but generally no
        warnings.push('Delays between 2–3 hours may qualify for care expenses (meals, refreshments) even if cash compensation doesn\'t apply.');
      }
      return {
        eligible: false,
        amountPerPassenger: 0,
        totalAmount: 0,
        currency: cur.code,
        currencySymbol: cur.symbol,
        distanceKm,
        jurisdiction,
        reasons: [
          `Delay of ${formatDelay(delay)} is below the ${minDelayMin / 60}-hour threshold required by ${jurisdictionName(jurisdiction)}.`,
        ],
        warnings,
        blocked: false,
        blockedReason: `Delay below ${minDelayMin / 60} hours.`,
      };
    }

    // For long-haul EU/UK flights with 3-4h delay, compensation is reduced
    const amount = calcByDistance(jurisdiction, distanceKm, delay);
    return {
      eligible: true,
      amountPerPassenger: amount,
      totalAmount: amount * passengers,
      currency: cur.code,
      currencySymbol: cur.symbol,
      distanceKm,
      jurisdiction,
      reasons: [
        `Delay of ${formatDelay(delay)} exceeds the ${minDelayMin / 60}-hour threshold.`,
        `${cur.symbol}${amount} per passenger under ${jurisdictionName(jurisdiction)}.`,
        ...(distanceKm ? [`Route distance: ${distanceKm.toLocaleString()} km.`] : []),
      ],
      warnings,
      blocked: false,
    };
  }

  // Fallback
  return {
    eligible: false,
    amountPerPassenger: 0,
    totalAmount: 0,
    currency: cur.code,
    currencySymbol: cur.symbol,
    distanceKm,
    jurisdiction,
    reasons: ['Unable to determine eligibility from the provided information.'],
    warnings: ['Our team will review your case manually.'],
    blocked: false,
  };
}

function calcByDistance(jurisdiction: Jurisdiction, distanceKm: number | null, delayOrMax: number): number {
  // delayOrMax: for delays, pass delayMin (to determine 3-4h vs 4h+ for long-haul)
  //             for cancellations/denied, pass 600 (always max)

  if (jurisdiction === 'il') {
    // Israeli law: flat amounts by haul type
    if (distanceKm === null) return 3530; // unknown — show max
    if (distanceKm <= 2200) return 1470;  // short-haul
    if (distanceKm <= 4600) return 2390;  // medium-haul
    return 3530;                            // long-haul
  }

  // EU261 amounts
  if (jurisdiction === 'eu') {
    if (distanceKm === null) return 600;
    if (distanceKm <= 1500) return 250;
    if (distanceKm <= 3500) return 400;
    // Over 3500 km
    if (delayOrMax >= 240 || delayOrMax === 600) return 600;
    return 300; // 3-4h delay on long-haul
  }

  // UK261 amounts
  if (jurisdiction === 'uk') {
    if (distanceKm === null) return 520;
    if (distanceKm <= 1500) return 220;
    if (distanceKm <= 3500) return 350;
    if (delayOrMax >= 240 || delayOrMax === 600) return 520;
    return 260;
  }

  return 0;
}

function jurisdictionName(j: Jurisdiction): string {
  return { eu: 'EU Regulation 261/2004', uk: 'UK261', il: 'Israeli Aviation Services Law', us: 'US DOT Rules' }[j];
}

export function formatDelay(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

// ── Jurisdiction detection from airport codes ───────────────────────────────
const EU_AIRPORT_CODES = new Set([
  // France
  'CDG','ORY','NCE','LYS','MRS','BOD','TLS','BIA','AJA','BES','BIQ','CAL','CFE','DCM','ETZ','LDE','LRT','MPL','NTE','PUF','QXB','RNS','SXB','UEE',
  // Germany
  'FRA','MUC','BER','DUS','HAM','STR','CGN','NUE','HAJ','LEJ','DRS','FKB','FMM','FDH','HDN','KEL','LGW',
  // Spain
  'MAD','BCN','PMI','AGP','ALC','VLC','BIO','SVQ','TFN','TFS','LPA','ACE','FUE','SCQ','OVG','GRX','XRY',
  // Italy
  'FCO','MXP','LIN','VCE','NAP','BGY','PSA','BLQ','CTA','TRN','GOA','FLR','BRI','CAG','PMO','TSF',
  // Netherlands
  'AMS','EIN','RTM','GRQ','MST','UTC',
  // Belgium
  'BRU','LGG','ANR','OST','CRL',
  // Austria
  'VIE','SZG','GRZ','INN','LNZ','HOH',
  // Switzerland
  'ZRH','GVA','BSL','BRN','LUG',
  // Portugal
  'LIS','OPO','FAO','FNC','PDL','TER',
  // Greece
  'ATH','SKG','HER','RHO','CHQ','KGS','CFU','JKH','VOL','PVK','AOI',
  // Poland
  'WAW','KRK','WRO','KTW','GDN','POZ','LCJ','RZE','SZZ','BZG',
  // Czech Republic
  'PRG','BRQ','OSR','KLV',
  // Hungary
  'BUD','DEB',
  // Romania
  'OTP','CLJ','TSR','CNR','SBZ','IAS','ARW','BCM','CMB','CSB','CRA','ISL','SUJ',
  // Bulgaria
  'SOF','VAR','BOJ','PDV','GSB',
  // Croatia
  'ZAG','SPU','DBV','RJK','OSI','ZAD','PUY','BWK',
  // Denmark
  'CPH','AAL','BLL','AAR','RNN',
  // Sweden
  'ARN','GOT','BMA','MMX','NBQ','LLA','UME','OSD','VBY','KLR','RNB','GEV',
  // Norway
  'OSL','BGO','TRD','SVG','TOS','KKN','BOO','HAU','AES','EVE','BNN','FRO',
  // Finland
  'HEL','TMP','TKU','OUL','KUO','JYV','PMM','SVL','KEM','MIK','RVN','KTT',
  // Estonia
  'TLL','TAY',
  // Latvia
  'RIX','VSI','LPX',
  // Lithuania
  'VNO','KUN','PLQ','SQQ',
  // Ireland
  'DUB','SNN','ORK','NOC','KIR','WAT',
  // Iceland (EEA)
  'KEF','REK','AEY','IFJ','GRM','HFN','HUS','THO','VEY',
  // Luxembourg
  'LUX',
  // Malta
  'MLA','GZM',
  // Cyprus
  'LCA','PFO',
  // Slovakia
  'BTS','KSC','TAT','DSV',
  // Slovenia
  'LJU','MBX','POW',
]);

const UK_AIRPORT_CODES = new Set([
  'LHR','LGW','LTN','STN','LCY','SEN',
  'MAN','EDI','BHX','GLA','BRS','NCL','LPL','EMA','LBA','BRS','CWL','ABZ','BFS','SOU','Bournemouth','CWL',
  'EXT','NWI','INV','DSA','LBA','LEEDS','MME','HUY','CVT','BOH','JER','GCI','IOM','KIR','WIC','NDY','WAT','FIE','BRR','BEN','EOI','ICL','KOI','LKL','PRA','SUM','TRE','TTA','NDY','MPL','STN',
]);

const IL_AIRPORT_CODES = new Set(['TLV','SDV','ETM','VDA','KCN']);

export function detectJurisdiction(depCode?: string, arrCode?: string): Jurisdiction {
  if (!depCode) return 'eu'; // default
  const dep = depCode.toUpperCase();
  if (IL_AIRPORT_CODES.has(dep)) return 'il';
  if (UK_AIRPORT_CODES.has(dep)) return 'uk';
  if (EU_AIRPORT_CODES.has(dep)) return 'eu';
  // US airports — check if either code is a US airport
  const usCodes = new Set(['JFK','LAX','ORD','ATL','DFW','DEN','SFO','LAS','SEA','PHX','EWR','MIA','BOS','MSP','IAD','CLT','DTW','MCO','PHL','SAN','TPA','PDX','STL','BNA']);
  if (usCodes.has(dep)) return 'us';
  return 'eu'; // default to EU for unknown EU-area flights
}

// ── Notice period options for cancellations ──────────────────────────────────
export const NOTICE_OPTIONS = [
  { id: '0-7', label: '0–7 days before', value: 0 },
  { id: '8-13', label: '8–13 days before', value: 8 },
  { id: '14+', label: '14+ days before', value: 14 },
] as const;

export const AIRLINE_REASON_OPTIONS: { id: AirlineReason; label: string }[] = [
  { id: 'technical_fault', label: 'Technical fault' },
  { id: 'bad_weather', label: 'Bad weather' },
  { id: 'atc', label: 'Air traffic control' },
  { id: 'crew_shortage', label: 'Crew shortage / strike' },
  { id: 'strike', label: 'Airline staff strike' },
  { id: 'no_reason', label: 'No reason given' },
  { id: 'other', label: 'Other reason' },
];
