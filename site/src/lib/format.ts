export function flagEmoji(iso2: string): string {
  return [...iso2.toUpperCase()].map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65)).join('');
}

export function fmt(n: number): string {
  return n.toFixed(1);
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** "2026-07-22" -> "July 22, 2026"; non-ISO strings pass through untouched. */
export function formatBuiltDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return iso;
  return `${MONTHS[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
}

/** Rank values shared by more than one row — the table marks them "=5" style. */
export function tiedRanks(ranks: number[]): Set<number> {
  const seen = new Set<number>();
  const tied = new Set<number>();
  for (const r of ranks) (seen.has(r) ? tied : seen).add(r);
  return tied;
}

export function deltaLabel(d: number): string {
  if (d === 0) return '=';
  return d > 0 ? `+${d}` : `−${Math.abs(d)}`;
}

// Worst-first: each band covers ranks up to `maxShare` of the way down the rank scale.
const OPENNESS_BANDS: Array<{ maxShare: number; phrase: string }> = [
  { maxShare: 0.05, phrase: 'among the most open destinations rated' },
  { maxShare: 0.25, phrase: 'in the open quarter of the table' },
  { maxShare: 0.5, phrase: 'in the open half of the table, though not near the top' },
  { maxShare: 0.75, phrase: 'in the more restrictive half of the table' },
  { maxShare: 0.95, phrase: 'in the restrictive quarter of the table' },
  { maxShare: Infinity, phrase: 'among the hardest destinations in the index to enter' },
];

/** Plain-English placement for a destination's openness rank.
 *
 *  Keyed on the RANK, not on the row's position in the sorted array: openness ranks tie
 *  densely (199 destinations share 139 distinct ranks, eleven of them at #1), so a band
 *  read off the array position contradicts the rank printed in the same sentence — a
 *  joint-first destination came out "in the open quarter of the table, at openness rank
 *  #1". Normalising rank against the last rank keeps ties in one band and pins both ends
 *  of the scale. */
export function opennessBand(rank: number, maxRank: number): string {
  const span = Math.max(1, maxRank - 1);
  const share = Math.min(1, Math.max(0, (rank - 1) / span));
  return OPENNESS_BANDS.find((b) => share < b.maxShare || b.maxShare === Infinity)!.phrase;
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
  HKG: 'Hong Kong',
  MAC: 'Macao',
  BHS: 'The Bahamas',
  GMB: 'The Gambia',
  FSM: 'Micronesia',
  YEM: 'Yemen',
  SOM: 'Somalia',
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

// Countries whose English name carries a definite article. Every generated sentence that
// puts a name after a copula ("the heaviest destination is …") needs it, and the list is
// enumerated rather than inferred: a plural-form heuristic would take Cyprus, Barbados,
// Honduras and Mauritius, none of which take an article.
const ARTICLE_NAMES = new Set([
  'ARE', 'BHS', 'CAF', 'COD', 'COM', 'GBR', 'GMB', 'MDV', 'MHL', 'NLD', 'PHL', 'SLB', 'SYC', 'USA',
]);

/** A display name with its definite article, ready to sit mid-sentence.
 *
 *  BHS and GMB already carry a capitalised "The" in DISPLAY_NAMES because that is how they
 *  read as a standalone table cell; mid-sentence the same article has to be lowercased, so
 *  an existing one is rewritten rather than a second one prepended. */
export function withArticle(iso3: string, fallback: string): string {
  const name = displayName(iso3, fallback);
  if (!ARTICLE_NAMES.has(iso3)) return name;
  return /^the /i.test(name) ? `the ${name.slice(4)}` : `the ${name}`;
}

/** The mirror of withArticle, for slots that already supply their own article — "The
 *  {name} passport" rendered "The The Bahamas passport" on the two pages whose display
 *  name carries one. */
export function bareName(iso3: string, fallback: string): string {
  return displayName(iso3, fallback).replace(/^The /, '');
}

/** Subject-verb agreement for counted prose: `verbFor(1, 'enter')` -> 'enters'.
 *
 *  Only regular verbs pass through here — the generated sentences use enter, need and
 *  offer — so the -s form is the whole rule. "1 foreign passports enter visa-free" is the
 *  most visible kind of template tell, and seven destination pages hit a count of one. */
export function verbFor(count: number, verb: string): string {
  return count === 1 ? `${verb}s` : verb;
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
