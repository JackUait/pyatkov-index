import { CREDIT } from './ingest.ts';
import { CREDIT_TENTHS, assignRanks } from './scores.ts';
import type { AccessCategory, DestinationOpenness, VisaMatrix } from './types.ts';

const TIERS: AccessCategory[] = ['visa-free', 'visa-on-arrival', 'e-visa', 'visa-required'];

const zeroed = (): Record<AccessCategory, number> => ({
  'visa-free': 0,
  'visa-on-arrival': 0,
  'e-visa': 0,
  'visa-required': 0,
});

/**
 * The openness rating: the index run backwards.
 *
 * Where computeScores asks "how much of the world's destination VALUE does this
 * passport open?", computeOpenness asks "how much of the world's PEOPLE does this
 * destination let in?" — the credit-weighted share of the population holding a
 * passport that can enter without a prior visa.
 *
 * Self-inclusion mirrors computeScores exactly: a country always admits its own
 * citizens, so its own population is counted at credit 1.0 in the numerator, and
 * the denominator is the FULL population pool. A destination open to every
 * passport therefore scores exactly 100.
 *
 * equalScore is the same sum with every passport counting one — the naive
 * "how many countries can enter" reading. delta = equalRank - rank is how far
 * population weighting moves the destination, the mirror of the passport table's
 * "Δ vs count".
 */
export function computeOpenness(
  matrix: VisaMatrix,
  populations: Map<string, number>,
  names: Map<string, string>,
): DestinationOpenness[] {
  const n = matrix.countries.length;
  let totalPop = 0;
  for (const iso3 of matrix.countries) {
    const pop = populations.get(iso3);
    if (pop === undefined) throw new Error(`passport ${iso3} has no population`);
    totalPop += pop;
  }

  const partial = matrix.countries.map((dest) => {
    const points = zeroed();
    const counts = zeroed();
    let equalTenths = 0;

    for (const passport of matrix.countries) {
      if (passport === dest) continue;
      const cat = matrix.access.get(passport)?.get(dest);
      if (cat === undefined) throw new Error(`no access cell for ${passport} -> ${dest}`);
      points[cat] += CREDIT[cat] * populations.get(passport)!;
      equalTenths += CREDIT_TENTHS[cat];
      counts[cat] += 1;
    }

    // Self-inclusion: own citizens are always admitted (credit 1.0).
    points['visa-free'] += CREDIT['visa-free'] * populations.get(dest)!;
    equalTenths += CREDIT_TENTHS['visa-free'];
    counts['visa-free'] += 1;

    for (const t of TIERS) points[t] = (100 * points[t]) / totalPop;
    const score = TIERS.reduce((a, t) => a + points[t], 0);

    return {
      iso3: dest,
      name: names.get(dest) ?? dest,
      score,
      equalScore: (100 * equalTenths) / (10 * n),
      equalTenths,
      counts,
      points,
    };
  });

  // Rank on the score AS DISPLAYED (one decimal) so destinations the reader sees as
  // equally open share a rank; rank the equal-weight baseline on exact integer
  // tenths so mathematically tied destinations are never split by float drift (B1).
  const displayedScore = (s: number) => Number(s.toFixed(1));
  const ranks = assignRanks(partial, (r) => displayedScore(r.score));
  const equalRanks = assignRanks(partial, (r) => r.equalTenths);

  return partial
    .map((d) => {
      const { equalTenths: _equalTenths, ...r } = d;
      return {
        ...r,
        rank: ranks.get(d)!,
        equalRank: equalRanks.get(d)!,
        delta: equalRanks.get(d)! - ranks.get(d)!,
      };
    })
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
}
