/**
 * Shared airport code reference + flight-number format validation.
 *
 * The IATA code set is built from the SAME data already used by the ClaimVelo
 * Rules Engine (supabase/functions/_shared/evaluate.ts):
 *   UK_AIRPORT_CODES ∪ EU_EEA_AIRPORT_CODES ∪ ISRAELI_AIRPORT_CODES
 *   ∪ BRAZIL_AIRPORT_CODES ∪ AIRPORT_COORDS keys
 *
 * No second airport database is created — this is the existing ClaimVelo
 * reference data, extracted to a shared module so the import edge function
 * can validate without duplicating logic.
 */

// ── Known IATA airport codes (synced from evaluate.ts) ────────────────────────

const UK_AIRPORT_CODES = new Set([
  "LHR","LGW","STN","LTN","LCY","SEN","MAN","EDI","BHX","GLA","BRS","NCL","ABZ",
  "LPL","EMA","LBA","CWL","BFS","SOU","EXT","NWI","INV","JER","GCI","IOM",
]);

const EU_EEA_AIRPORT_CODES = new Set([
  "CDG","ORY","NCE","LYS","MRS","TLS","BOD","BIA","NTE","MPL",
  "FRA","MUC","DUS","HAM","BER","CGN","STR","HAJ","LEJ","DRS","NUE",
  "AMS","RTM","EIN","BRU","CRL","LUX",
  "FCO","MXP","LIN","BGY","VCE","NAP","CIA","FLR","TRN","BLQ","CTA","PSA","BRI","CAG","PMO","TSF",
  "MAD","BCN","VLC","AGP","PMI","SVQ","BIO","OVD","SCQ","TFN","TFS","LPA","ACE","FUE","ALC","GRX","XRY",
  "LIS","OPO","FAO","FNC","PDL",
  "ATH","SKG","HER","RHO","CHQ","KGS","CFU","JKH","VOL","PVK","AOI",
  "VIE","SZG","INN","GRZ","LNZ","HOH",
  "ZRH","GVA","BSL","BRN","LUG",
  "CPH","RNN","BLL","AAL","AAR",
  "ARN","BMA","GOT","MMX","NBQ","LLA","UME","OSD","VBY","KLR","RNB","GEV",
  "OSL","BGO","TRD","SVG","TOS","KKN","BOO","HAU","AES","EVE","BNN","FRO",
  "HEL","TMP","TKU","OUL","KUO","JYV","SVL","KEM","MIK","RVN","KTT",
  "TLL","TAY",
  "RIX","VSI","LPX","VNO","KUN","PLQ","SQQ",
  "DUB","ORK","SNN","NOC","KIR","WAT",
  "KEF","REK","AEY","IFJ","GRM","HFN","HUS","THO","VEY",
  "WAW","KRK","GDN","KTW","WRO","POZ","LCJ","RZE","SZZ","BZG",
  "PRG","BRQ","OSR","KLV",
  "BUD","DEB",
  "OTP","CLJ","TSR","CNR","SBZ","IAS","ARW","BCM","CMB","CSB","CRA","ISL","SUJ",
  "SOF","VAR","BOJ","PDV","GSB",
  "ZAG","SPU","DBV","RJK","OSI","ZAD","PUY","BWK",
  "LJU","MBX","POW",
  "BTS","KSC","TAT","DSV",
  "MLA","GZM",
  "LCA","PFO",
  "IST","SAW","AYT","ADB","ESB",
]);

const ISRAELI_AIRPORT_CODES = new Set(["TLV","BGW","ETM","HFA","SDV","VDA","KCN"]);

const BRAZIL_AIRPORT_CODES = new Set([
  "GRU","GIG","BSB","CGH","SDU","CNF","POA","REC","SSA","FOR","CWB","MAO","BEL",
  "GYN","VCP","FLN","NAT","MCZ","VIX","CGB","SLZ","UDI","RAO","ATM","JPA","MCP",
  "PVH","STM","BPS","MGB","THE",
]);

const AIRPORT_COORD_KEYS = new Set([
  "TLV","SDV","ETM","VDA","KCN",
  "LHR","LGW","STN","LTN","LCY","MAN","EDI","BHX","GLA","BRS",
  "CDG","ORY","NCE","LYS","MRS","AMS","BRU",
  "FRA","MUC","BER","DUS","HAM","MAD","BCN","PMI","AGP",
  "FCO","MXP","LIN","VCE","NAP","LIS","OPO","ATH","SKG",
  "VIE","ZRH","GVA","CPH","ARN","OSL","HEL","DUB","SNN","KEF",
  "WAW","PRG","BUD","OTP","SOF","ZAG","RIX","TLL","VNO",
  "JFK","LAX","ORD","ATL","DXB",
  "GRU","GIG","BSB","CNF",
]);

/** Union of all known IATA codes from the ClaimVelo reference data. */
export const KNOWN_IATA_CODES = new Set<string>([
  ...UK_AIRPORT_CODES,
  ...EU_EEA_AIRPORT_CODES,
  ...ISRAELI_AIRPORT_CODES,
  ...BRAZIL_AIRPORT_CODES,
  ...AIRPORT_COORD_KEYS,
]);

/** Check if a 3-letter code is a known IATA airport in the ClaimVelo reference. */
export function isKnownIata(code: string): boolean {
  return KNOWN_IATA_CODES.has(code.trim().toUpperCase());
}

/**
 * Validate flight-number format using existing ClaimVelo conventions.
 *
 * A valid flight number has:
 *   - At least 2 characters (airline IATA code, may be alphanumeric e.g. U2, 4U)
 *   - At least 1 letter (the airline code)
 *   - At least 1 digit (the flight number)
 *   - No special characters in the original value (spaces, hyphens, ? etc.)
 *   - Total length 3-7 after stripping non-alphanumeric
 *
 * Legitimate codeshares (marketing ≠ operating) are NOT rejected — only the
 * format is checked, not whether the airline code is in a carrier set.
 */
export function isValidFlightNumber(fn: string): boolean {
  if (!fn || !fn.trim()) return false;
  const original = fn.trim();
  // Reject if original contains non-alphanumeric characters
  if (!/^[A-Za-z0-9]+$/.test(original)) return false;
  const upper = original.toUpperCase();
  // Must have at least 1 letter and 1 digit
  if (!/[A-Z]/.test(upper)) return false;
  if (!/[0-9]/.test(upper)) return false;
  // Length 3-7
  if (upper.length < 3 || upper.length > 7) return false;
  return true;
}
