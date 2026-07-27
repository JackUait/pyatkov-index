// The compare page holds two countries against each other. Everything it prints
// is derived here, from a snapshot the page inlines at build time, so the page
// itself only paints a model and every rule below is unit-tested.
import { CREDIT, LABEL, TIERS, type Tier } from './credit.ts';
import { tierAt } from './compare-payload.ts';
import type { CompareKind } from './share.ts';

export interface CountryStats {
  score: number;
  rank: number;
  equalScore: number;
  equalRank: number;
  counts: Record<Tier, number>;
}

export interface ComparePayload {
  /** Every country, heaviest destination first. The access rows are encoded
   *  against this order, so it is the one index both axes share. */
  order: string[];
  /** `article` is the name with its definite article, for sentence slots —
   *  "Who the United States admits". Bare `name` is the label form. */
  countries: Record<string, { name: string; article: string; iso2: string; weight: number }>;
  passports: Record<string, CountryStats>;
  destinations: Record<string, CountryStats>;
  /** access[holder] is one encoded row over `order`. */
  access: Record<string, string>;
}

export interface CompareQuery {
  kind: CompareKind;
  a: string;
  b: string;
}

export type CompareError = { error: 'missing' | 'unknown' | 'same' | 'kind' };

export interface Side {
  iso3: string;
  name: string;
  article: string;
  iso2: string;
  score: number;
  rank: number;
  equalScore: number;
  equalRank: number;
}

export interface MixRow {
  tier: Tier;
  label: string;
  a: number;
  b: number;
}

/** One country the two sides treat differently, with the tier on each side. */
export interface Difference {
  iso3: string;
  name: string;
  iso2: string;
  weight: number;
  aTier: Tier | null;
  bTier: Tier | null;
}

export interface Comparison {
  kind: CompareKind;
  a: Side;
  b: Side;
  mix: MixRow[];
  aOnly: Difference[];
  bOnly: Difference[];
}

const KINDS: CompareKind[] = ['passport', 'destination'];

/** Read a pair out of the page's query string. Unnamed kind means passports —
 *  the front-page table is where most readers start. */
export function parseCompareQuery(search: string): CompareQuery | CompareError {
  const params = new URLSearchParams(search);
  const kind = params.get('kind') ?? 'passport';
  if (!KINDS.includes(kind as CompareKind)) return { error: 'kind' };
  const a = params.get('a');
  const b = params.get('b');
  if (!a || !b) return { error: 'missing' };
  return { kind: kind as CompareKind, a: a.toUpperCase(), b: b.toUpperCase() };
}

/** How freely a tier lets someone through — the pipeline's own credit, so
 *  "more easily" here means exactly what it means in the score. A cell the
 *  matrix does not rate ranks below every rated one rather than tying with a
 *  required visa, so an unrated pair is never reported as a difference. */
const ease = (t: Tier | null): number => (t === null ? -1 : CREDIT[t]);

const side = (iso3: string, payload: ComparePayload, stats: CountryStats): Side => ({
  iso3,
  name: payload.countries[iso3].name,
  article: payload.countries[iso3].article,
  iso2: payload.countries[iso3].iso2,
  score: stats.score,
  rank: stats.rank,
  equalScore: stats.equalScore,
  equalRank: stats.equalRank,
});

export function buildComparison(payload: ComparePayload, q: CompareQuery): Comparison | CompareError {
  if (q.a === q.b) return { error: 'same' };
  const table = q.kind === 'passport' ? payload.passports : payload.destinations;
  if (!payload.countries[q.a] || !payload.countries[q.b] || !table[q.a] || !table[q.b]) {
    return { error: 'unknown' };
  }

  const mix: MixRow[] = TIERS.map((tier) => ({
    tier,
    label: LABEL[tier],
    a: table[q.a].counts[tier] ?? 0,
    b: table[q.b].counts[tier] ?? 0,
  }));

  // The same walk serves both kinds; only which index moves changes. Comparing
  // passports, the two sides are holders and the walk is over destinations;
  // comparing destinations, the sides are the destinations and the walk is over
  // holders — the matrix read down its other axis.
  const aOnly: Difference[] = [];
  const bOnly: Difference[] = [];
  const bIndex = payload.order.indexOf(q.b);
  const aIndex = payload.order.indexOf(q.a);

  payload.order.forEach((iso3, i) => {
    // A country's own door is not news: every passport enters its own country
    // freely, so listing the two sides themselves would open both lists with a
    // tautology. The per-country pages drop the home country for the same reason.
    if (iso3 === q.a || iso3 === q.b) return;
    const [aTier, bTier] =
      q.kind === 'passport'
        ? [tierAt(payload.access[q.a] ?? '', i), tierAt(payload.access[q.b] ?? '', i)]
        : [tierAt(payload.access[iso3] ?? '', aIndex), tierAt(payload.access[iso3] ?? '', bIndex)];
    if (ease(aTier) === ease(bTier)) return;
    const row: Difference = { iso3, ...payload.countries[iso3], aTier, bTier };
    (ease(aTier) > ease(bTier) ? aOnly : bOnly).push(row);
  });

  // order is already heaviest-first, so both lists come out sorted by weight.
  return { kind: q.kind, a: side(q.a, payload, table[q.a]), b: side(q.b, payload, table[q.b]), mix, aOnly, bOnly };
}
