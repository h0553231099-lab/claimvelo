"""
Rules Engine port — faithful Python translation of the canonical server-side
engine in supabase/functions/_shared/evaluate.ts.

Used by excel_300_test.py for preliminary eligibility classification of Excel
leads. NO claims are created, NO evidence is persisted, NO notifications sent.
"""

import math

# ── Airport coordinates (same map as evaluate.ts) ─────────────────────────────

AIRPORT_COORDS = {
    'TLV': (32.011, 34.887), 'SDV': (32.419, 34.880), 'ETM': (29.698, 35.013),
    'VDA': (29.569, 35.009), 'KCN': (29.632, 35.014),
    'LHR': (51.477, -0.461), 'LGW': (51.148, -0.190), 'STN': (51.885, 0.235),
    'LTN': (51.874, -0.368), 'LCY': (51.505, 0.055),
    'MAN': (53.354, -2.275), 'EDI': (55.950, -3.373), 'BHX': (52.453, -1.748),
    'GLA': (55.872, -4.433), 'BRS': (51.382, -2.719),
    'CDG': (49.009, 2.548), 'ORY': (48.724, 2.380), 'NCE': (43.658, 7.215),
    'LYS': (45.726, 5.081), 'MRS': (43.435, 5.215),
    'AMS': (52.308, 4.764), 'BRU': (50.902, 4.484),
    'FRA': (50.033, 8.570), 'MUC': (48.354, 11.786), 'BER': (52.366, 13.503),
    'DUS': (51.289, 6.767), 'HAM': (53.630, 10.006),
    'MAD': (40.472, -3.561), 'BCN': (41.297, 2.078), 'PMI': (39.551, 2.739),
    'AGP': (36.675, -4.499),
    'FCO': (41.800, 12.239), 'MXP': (45.630, 8.723), 'LIN': (45.445, 9.277),
    'VCE': (45.505, 12.352), 'NAP': (40.886, 14.291),
    'LIS': (38.781, -9.136), 'OPO': (41.248, -8.681),
    'ATH': (37.936, 23.944), 'SKG': (40.520, 22.971),
    'VIE': (48.110, 16.570), 'ZRH': (47.458, 8.548), 'GVA': (46.238, 6.109),
    'CPH': (55.618, 12.656), 'ARN': (59.651, 17.919), 'OSL': (60.194, 11.100),
    'HEL': (60.317, 24.963),
    'DUB': (53.421, -6.270), 'SNN': (52.702, -8.925), 'KEF': (63.985, -22.606),
    'WAW': (52.165, 20.967), 'PRG': (50.100, 14.260), 'BUD': (47.433, 19.261),
    'OTP': (44.572, 26.102), 'SOF': (42.696, 23.411), 'ZAG': (45.743, 16.069),
    'RIX': (56.924, 23.971), 'TLL': (59.413, 24.833), 'VNO': (54.634, 25.285),
    'JFK': (40.640, -73.779), 'LAX': (33.943, -118.408), 'ORD': (41.978, -87.905),
    'ATL': (33.640, -84.427),
    'DXB': (25.253, 55.363),
    'GRU': (-23.432, -46.469), 'GIG': (-22.808, -43.244), 'BSB': (-15.869, -47.920),
    'CNF': (-19.633, -43.968),
}

# ── Airport code sets (from evaluate.ts) ──────────────────────────────────────

UK_AIRPORT_CODES = {
    'LHR', 'LGW', 'STN', 'LTN', 'LCY', 'SEN', 'MAN', 'EDI', 'BHX', 'GLA', 'BRS',
    'NCL', 'ABZ', 'LPL', 'EMA', 'LBA', 'CWL', 'BFS', 'SOU', 'EXT', 'NWI', 'INV',
    'JER', 'GCI', 'IOM',
}

EU_EEA_AIRPORT_CODES = {
    'CDG', 'ORY', 'NCE', 'LYS', 'MRS', 'TLS', 'BOD', 'BIA', 'NTE', 'MPL',
    'FRA', 'MUC', 'DUS', 'HAM', 'BER', 'CGN', 'STR', 'HAJ', 'LEJ', 'DRS', 'NUE',
    'AMS', 'RTM', 'EIN', 'BRU', 'CRL', 'LUX',
    'FCO', 'MXP', 'LIN', 'BGY', 'VCE', 'NAP', 'CIA', 'FLR', 'TRN', 'BLQ', 'CTA',
    'PSA', 'BRI', 'CAG', 'PMO', 'TSF',
    'MAD', 'BCN', 'VLC', 'AGP', 'PMI', 'SVQ', 'BIO', 'OVD', 'SCQ', 'TFN', 'TFS',
    'LPA', 'ACE', 'FUE', 'ALC', 'GRX', 'XRY',
    'LIS', 'OPO', 'FAO', 'FNC', 'PDL',
    'ATH', 'SKG', 'HER', 'RHO', 'CHQ', 'KGS', 'CFU', 'JKH', 'VOL', 'PVK', 'AOI',
    'VIE', 'SZG', 'INN', 'GRZ', 'LNZ', 'HOH',
    'ZRH', 'GVA', 'BSL', 'BRN', 'LUG',
    'CPH', 'RNN', 'BLL', 'AAL', 'AAR',
    'ARN', 'BMA', 'GOT', 'MMX', 'NBQ', 'LLA', 'UME', 'OSD', 'VBY', 'KLR', 'RNB',
    'GEV',
    'OSL', 'BGO', 'TRD', 'SVG', 'TOS', 'KKN', 'BOO', 'HAU', 'AES', 'EVE', 'BNN',
    'FRO',
    'HEL', 'TMP', 'TKU', 'OUL', 'KUO', 'JYV', 'SVL', 'KEM', 'MIK', 'RVN', 'KTT',
    'TLL', 'TAY',
    'RIX', 'VSI', 'LPX', 'VNO', 'KUN', 'PLQ', 'SQQ',
    'DUB', 'ORK', 'SNN', 'NOC', 'KIR', 'WAT',
    'KEF', 'REK', 'AEY', 'IFJ', 'GRM', 'HFN', 'HUS', 'THO', 'VEY',
    'WAW', 'KRK', 'GDN', 'KTW', 'WRO', 'POZ', 'LCJ', 'RZE', 'SZZ', 'BZG',
    'PRG', 'BRQ', 'OSR', 'KLV',
    'BUD', 'DEB',
    'OTP', 'CLJ', 'TSR', 'CNR', 'SBZ', 'IAS', 'ARW', 'BCM', 'CMB', 'CSB', 'CRA',
    'ISL', 'SUJ',
    'SOF', 'VAR', 'BOJ', 'PDV', 'GSB',
    'ZAG', 'SPU', 'DBV', 'RJK', 'OSI', 'ZAD', 'PUY', 'BWK',
    'LJU', 'MBX', 'POW',
    'BTS', 'KSC', 'TAT', 'DSV',
    'MLA', 'GZM',
    'LCA', 'PFO',
    'IST', 'SAW', 'AYT', 'ADB', 'ESB',
}

ISRAELI_AIRPORT_CODES = {'TLV', 'BGW', 'ETM', 'HFA', 'SDV', 'VDA', 'KCN'}

BRAZIL_AIRPORT_CODES = {
    'GRU', 'GIG', 'BSB', 'CGH', 'SDU', 'CNF', 'POA', 'REC', 'SSA', 'FOR', 'CWB',
    'MAO', 'BEL', 'GYN', 'VCP', 'FLN', 'NAT', 'MCZ', 'VIX', 'CGB', 'SLZ', 'UDI',
    'RAO', 'ATM', 'JPA', 'MCP', 'PVH', 'STM', 'BPS', 'MGB', 'THE', 'MCZ',
}

# ── Carrier code sets (from evaluate.ts) ──────────────────────────────────────

UK_CARRIERS = {
    'BA', 'VS', 'U2', 'LS', 'BE', 'GR', 'WQ', 'T3', 'JD', 'EX', 'MM',
}

EU_CARRIERS = {
    'LH', 'LX', 'OS', 'SN', 'EN', 'DE', 'EW', '4U', 'AB',
    'AF', 'U2', 'A5', 'TO', 'SS', 'XL', 'BJ',
    'KL', 'HV', 'WA',
    'IB', 'UX', 'FR', 'VY', 'QS',
    'EI', 'WI', 'FR',
    'AZ', 'NO', 'IG', 'EI', 'VE', 'XR', 'W6',
    'SK', 'DY', 'W6', 'FI', 'RC', 'EF',
    'TP', 'S4',
    'A3', 'OA', 'EG', 'W6',
    'LO', 'W6', 'BT', 'RJ',
    'BT', 'LO', 'RJ', 'PS',
    'OK', 'QS',
    'MA', 'W6',
    'RO', 'W6', '0B',
    'FB', 'W6',
    'OU',
    'JP',
    'W6', 'OK',
    'KM',
    'CY', 'W6',
    'TK', 'PC',
    'FI',
    'AY', 'W6',
    'OS', 'W6',
}

BRAZIL_CARRIERS = {'JJ', 'LA', 'G3', 'AD', 'RJ', '2Z', 'O6', 'W3'}

# ── Compensation table (from evaluate.ts) ─────────────────────────────────────

COMPENSATION = {
    'EU261': {
        'short': {'full': 250, 'reduced': 125},
        'medium': {'full': 400, 'reduced': 200},
        'long': {'full': 600, 'reduced': 300},
    },
    'UK261': {
        'short': {'full': 220, 'reduced': 110},
        'medium': {'full': 350, 'reduced': 175},
        'long': {'full': 520, 'reduced': 260},
    },
    'ISRAEL': {
        'short': {'full': 1470, 'reduced': 1470},
        'medium': {'full': 2390, 'reduced': 2390},
        'long': {'full': 3530, 'reduced': 3530},
    },
}

# ── Constants ─────────────────────────────────────────────────────────────────

MIN_DELAY_EU_UK = 180   # 3 hours
MIN_DELAY_IL = 480      # 8 hours
KM_SHORT = 1500
KM_MEDIUM = 3500
REDUCTION_THRESHOLDS = {'short': 120, 'medium': 180, 'long': 240}

EXTRAORDINARY_REASONS = {'WEATHER', 'ATC', 'SECURITY', 'STRIKE'}

REASON_MAP = {
    'carrier': 'CARRIER', 'technical': 'TECHNICAL', 'crew': 'CREW',
    'weather': 'WEATHER', 'atc': 'ATC', 'air traffic control': 'ATC',
    'security': 'SECURITY', 'strike': 'STRIKE',
}

# ── Helpers ───────────────────────────────────────────────────────────────────

def normalize_flight_number(s):
    if not s:
        return ''
    return ''.join(c for c in s.upper() if c.isalnum())


def normalize_date(s):
    if not s:
        return ''
    return s[:10]


def normalize_iata(s):
    if not s:
        return ''
    return s.strip().upper()


def haversine_km(a, b):
    R = 6371
    d_lat = math.radians(b[0] - a[0])
    d_lon = math.radians(b[1] - a[1])
    lat1 = math.radians(a[0])
    lat2 = math.radians(b[0])
    h = (math.sin(d_lat / 2) ** 2 +
         math.cos(lat1) * math.cos(lat2) * math.sin(d_lon / 2) ** 2)
    return round(2 * R * math.asin(math.sqrt(h)))


def get_distance_km(dep, arr):
    coord_a = AIRPORT_COORDS.get(dep.upper())
    coord_b = AIRPORT_COORDS.get(arr.upper())
    if not coord_a or not coord_b:
        return None
    return haversine_km(coord_a, coord_b)


def get_distance_category(dep, arr):
    km = get_distance_km(dep, arr)
    if km is None:
        return None
    if km <= KM_SHORT:
        return 'short'
    if km <= KM_MEDIUM:
        return 'medium'
    return 'long'


def is_uk_airport(code):
    return code.upper() in UK_AIRPORT_CODES


def is_eu_eea_airport(code):
    return code.upper() in EU_EEA_AIRPORT_CODES


def is_israeli_route(dep, arr):
    return (dep.upper() in ISRAELI_AIRPORT_CODES or
            arr.upper() in ISRAELI_AIRPORT_CODES)


def is_brazilian_route(dep, arr):
    return (dep.upper() in BRAZIL_AIRPORT_CODES or
            arr.upper() in BRAZIL_AIRPORT_CODES)


def is_uk_carrier(iata):
    return iata is not None and iata.upper() in UK_CARRIERS


def is_eu_carrier(iata):
    return iata is not None and iata.upper() in EU_CARRIERS


def is_brazilian_carrier(iata):
    return iata is not None and iata.upper() in BRAZIL_CARRIERS


def carrier_country(iata):
    if not iata:
        return 'unknown'
    u = iata.upper()
    if u in UK_CARRIERS:
        return 'UK'
    if u in EU_CARRIERS:
        return 'EU'
    if u in BRAZIL_CARRIERS:
        return 'BR'
    return 'non_eu'


def determine_jurisdiction(dep, arr, operating_carrier_iata):
    """Returns (jurisdiction, detail). Jurisdiction: EU261, UK261, ISRAEL,
    BRAZIL_REVIEW, or NONE."""
    d = dep.upper()
    a = arr.upper()

    if is_brazilian_route(d, a):
        return ('BRAZIL_REVIEW',
                'Brazilian route — manual review required (ANAC rules not yet automated).')

    if is_israeli_route(d, a):
        return ('ISRAEL', 'Israeli Aviation Services Law applies.')

    if is_uk_airport(d):
        return ('UK261', 'UK261 applies (departure from UK airport).')

    if is_eu_eea_airport(d):
        return ('EU261', 'EU261 applies (departure from EU/EEA airport).')

    # Non-EU/UK departure → arriving at UK
    if is_uk_airport(a):
        if is_uk_carrier(operating_carrier_iata):
            return ('UK261',
                    'UK261 applies (non-UK departure, UK-licensed operating carrier arriving at UK).')
        if carrier_country(operating_carrier_iata) == 'unknown':
            return ('NONE',
                    'Cannot determine operating carrier country for UK arrival route.')
        return ('NONE',
                'UK261 does not apply (non-UK carrier on non-UK→UK route).')

    # Non-EU/UK departure → arriving at EU/EEA
    if is_eu_eea_airport(a):
        if is_eu_carrier(operating_carrier_iata):
            return ('EU261',
                    'EU261 applies (non-EU departure, EU-licensed operating carrier arriving at EU).')
        if carrier_country(operating_carrier_iata) == 'unknown':
            return ('NONE',
                    'Cannot determine operating carrier country for EU arrival route.')
        return ('NONE',
                'EU261 does not apply (non-EU carrier on non-EU→EU route).')

    return ('NONE',
            'Route not covered by EU261/UK261/Israeli/Brazilian regulations.')


def classify_reason(raw):
    if not raw:
        return 'CARRIER'
    lower = raw.lower().strip()
    for key, code in REASON_MAP.items():
        if key in lower:
            return code
    return 'CARRIER'


def years_between(from_date, to_date):
    """Compute full years between two dates (matching evaluate.ts)."""
    y = to_date.year - from_date.year
    m = to_date.month - from_date.month
    if m < 0 or (m == 0 and to_date.day < from_date.day):
        y -= 1
    return y


def calc_delay_compensation(dep, arr, delay_minutes, jurisdiction):
    """Calculate delay compensation. Returns dict with amount, currency,
    distance_km, or None if coords unavailable."""
    cat = get_distance_category(dep, arr)
    if cat is None:
        return None
    dist_km = get_distance_km(dep, arr)
    if dist_km is None:
        return None

    jur_key = ('UK261' if jurisdiction == 'UK261'
               else 'ISRAEL' if jurisdiction == 'ISRAEL'
               else 'EU261')
    comp = COMPENSATION[jur_key][cat]
    currency = ('GBP' if jurisdiction == 'UK261'
                else 'ILS' if jurisdiction == 'ISRAEL'
                else 'EUR')

    if cat == 'short':
        amount = comp['full']
    elif cat == 'medium':
        amount = comp['full']
    else:  # long
        if MIN_DELAY_EU_UK <= delay_minutes < REDUCTION_THRESHOLDS['long']:
            amount = comp['reduced']
        else:
            amount = comp['full']

    if jurisdiction == 'ISRAEL':
        amount = comp['full']

    return {'amount': amount, 'currency': currency, 'distance_km': dist_km}


def currency_symbol(currency):
    if currency == 'ILS':
        return '\u20aa'  # ₪
    if currency == 'GBP':
        return '\u00a3'  # £
    return '\u20ac'    # €
