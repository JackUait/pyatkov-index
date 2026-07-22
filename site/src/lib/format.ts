export function flagEmoji(iso2: string): string {
  return [...iso2.toUpperCase()].map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65)).join('');
}

export function fmt(n: number): string {
  return n.toFixed(1);
}

export function deltaLabel(d: number): string {
  if (d === 0) return '=';
  return d > 0 ? `+${d}` : `−${Math.abs(d)}`;
}

// ---------------------------------------------------------------------------
// B5 — reconcile per-tier "Points" with the displayed Score.
// Each tier's contribution and the headline score were each rounded to one
// decimal independently, so the rounded parts need not sum to the rounded
// total (68/199 passport pages drifted). reconcilePoints rounds the parts to
// one decimal AND forces them to sum exactly to round(total, 1) using the
// largest-remainder method, so the tier rows always add up to the Score.
// ---------------------------------------------------------------------------
export function reconcilePoints(values: number[], total: number, decimals = 1): number[] {
  const scale = 10 ** decimals;
  const targetUnits = Math.round(total * scale);
  const scaled = values.map((v) => v * scale);
  const floors = scaled.map((v) => Math.floor(v));
  const result = floors.slice();
  let remainder = targetUnits - floors.reduce((a, b) => a + b, 0);

  // Distribute the leftover units to the parts with the largest fractional
  // remainder first (largest-remainder method). When we overshot (remainder
  // negative) we take units back, preferring the smallest fractional parts but
  // never pushing a nonneg part below zero — so a zero tier (e.g. visa-required,
  // whose credit is always 0) can never render as negative points.
  const byFracDesc = scaled.map((v, i) => ({ i, frac: v - floors[i] })).sort((a, b) => b.frac - a.frac);
  const byFracAsc = [...byFracDesc].reverse();

  for (let k = 0; remainder > 0 && byFracDesc.length > 0; k++, remainder--) {
    result[byFracDesc[k % byFracDesc.length].i] += 1;
  }
  let guard = 0;
  while (remainder < 0 && byFracAsc.length > 0 && guard < byFracAsc.length * 4) {
    const { i } = byFracAsc[guard % byFracAsc.length];
    if (result[i] > 0) {
      result[i] -= 1;
      remainder++;
    }
    guard++;
  }

  return result.map((u) => u / scale);
}

// ---------------------------------------------------------------------------
// B8 — published names are World Bank economy labels; 31/199 diverge from the
// passport-issuing entity's common name and homepage search fails for common
// names. displayName overrides the confusing labels; COUNTRY_ALIASES + the
// iso3/iso2 codes feed the search index so "Palestine"/"Turkey"/etc resolve.
// ---------------------------------------------------------------------------
const DISPLAY_NAMES: Record<string, string> = {
  PSE: 'Palestine',
  NRU: 'Nauru',
  TUR: 'Türkiye',
  KOR: 'South Korea',
  PRK: 'North Korea',
  SVK: 'Slovakia',
  CZE: 'Czechia',
  KGZ: 'Kyrgyzstan',
  LCA: 'Saint Lucia',
  BRN: 'Brunei',
  VNM: 'Vietnam',
  LAO: 'Laos',
  CIV: "Côte d'Ivoire",
  RUS: 'Russia',
  IRN: 'Iran',
  SYR: 'Syria',
  EGY: 'Egypt',
  VEN: 'Venezuela',
  COD: 'DR Congo',
  COG: 'Congo (Republic)',
};

const COUNTRY_ALIASES: Record<string, string[]> = {
  PSE: ['palestine'],
  TUR: ['turkey', 'turkiye'],
  KOR: ['south korea'],
  PRK: ['north korea'],
  VNM: ['vietnam', 'viet nam'],
  NRU: ['nauru'],
  CZE: ['czech republic', 'czechia'],
  CIV: ['ivory coast', "cote d'ivoire"],
  CPV: ['cape verde', 'cabo verde'],
  LAO: ['laos'],
  SWZ: ['swaziland', 'eswatini'],
  SVK: ['slovakia'],
  KGZ: ['kyrgyzstan'],
  LCA: ['saint lucia', 'st lucia', 'st. lucia'],
  RUS: ['russia'],
  IRN: ['iran'],
  EGY: ['egypt'],
  VEN: ['venezuela'],
  BRN: ['brunei'],
  COD: ['dr congo', 'democratic republic of the congo'],
  COG: ['congo', 'republic of the congo'],
};

export function displayName(iso3: string, fallback: string): string {
  return DISPLAY_NAMES[iso3] ?? fallback;
}

export interface SearchableRow {
  name: string;
  iso3: string;
  iso2: string;
}

/** Lowercased blob of every token a passport row should match on. */
export function searchIndex(row: SearchableRow): string {
  const tokens = [
    displayName(row.iso3, row.name),
    row.name,
    row.iso3,
    row.iso2,
    ...(COUNTRY_ALIASES[row.iso3] ?? []),
  ];
  return tokens.join(' ').toLowerCase();
}

export function matchesSearch(row: SearchableRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (q === '') return true;
  return searchIndex(row).includes(q);
}
