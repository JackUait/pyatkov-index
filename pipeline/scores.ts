import { CREDIT } from './ingest.ts';
import type { AccessCategory, DestinationWeight, PassportRow, VisaMatrix } from './types.ts';

// The same credits in an EXACT integer domain (tenths) for equal-weight ranking, so
// mathematically-tied passports compare equal instead of being split by float 1-ulp drift (B1).
// Must stay in lockstep with CREDIT (ingest.ts) — see the binary-ladder note there.
export const CREDIT_TENTHS: Record<AccessCategory, number> = {
  'visa-free': 10,
  'visa-on-arrival': 10,
  'e-visa': 0,
  'visa-required': 0,
};

export function assignRanks<T>(rows: T[], score: (r: T) => number): Map<T, number> {
  // DENSE ranking (1-2-2-3): tied rows share a rank and the next distinct score takes the
  // very next integer, so the displayed rank numbers stay continuous with no gaps — the way
  // real passport indices number their tiers. Round the ranking key to a fixed precision
  // before the tie test so float-accumulated scores that are mathematically equal are not
  // split by 1-ulp drift (B1).
  const key = (r: T) => Math.round(score(r) * 1e9) / 1e9;
  const sorted = [...rows].sort((a, b) => key(b) - key(a));
  const ranks = new Map<T, number>();
  let rank = 0;
  sorted.forEach((row, i) => {
    if (i === 0 || key(row) !== key(sorted[i - 1])) rank += 1;
    ranks.set(row, rank);
  });
  return ranks;
}

export function computeScores(
  matrix: VisaMatrix,
  weights: DestinationWeight[],
  names: Map<string, string>,
): PassportRow[] {
  const weightByIso = new Map(weights.map((w) => [w.iso3, w.weight]));
  const totalWeight = weights.reduce((a, w) => a + w.weight, 0);
  const n = matrix.countries.length;

  const partial = matrix.countries.map((iso3) => {
    const row = matrix.access.get(iso3)!;
    let weighted = 0;
    let equalTenths = 0; // exact integer accumulation for tie-safe equal-weight ranking (B1)
    const counts: Record<AccessCategory, number> = { 'visa-free': 0, 'visa-on-arrival': 0, 'e-visa': 0, 'visa-required': 0 };
    for (const [dest, cat] of row) {
      const w = weightByIso.get(dest);
      if (w === undefined) throw new Error(`destination ${dest} has no weight`);
      weighted += CREDIT[cat] * w;
      equalTenths += CREDIT_TENTHS[cat];
      counts[cat] += 1;
    }
    // Self-INCLUSION: a passport always admits its own holder, so the home country is
    // counted as visa-free (credit 1.0) in BOTH the numerator and the denominator. The
    // self cell is dropped in ingest, so we add it back explicitly here — its own weight
    // accrues to the score. High-value home countries (USA has the single largest
    // destination weight) gain the most; the denominator is the FULL pool (all n), so a
    // passport with full visa-free access still scores exactly 100.
    const ownWeight = weightByIso.get(iso3);
    if (ownWeight === undefined) throw new Error(`passport ${iso3} has no destination weight`);
    weighted += CREDIT['visa-free'] * ownWeight;
    equalTenths += CREDIT_TENTHS['visa-free'];
    counts['visa-free'] += 1;
    return {
      iso3,
      name: names.get(iso3) ?? iso3,
      score: (100 * weighted) / totalWeight,
      equalScore: (100 * equalTenths) / (10 * n),
      equalTenths,
      counts,
    };
  });

  // Rank on the score AS DISPLAYED (one decimal), so passports the reader sees as the
  // same "power" share a rank. Two scores of 89.98 and 90.02 both render "90.0" and must
  // therefore tie; competition ranking then skips the consumed rank numbers. The one-decimal
  // rounding must stay in lockstep with the site's fmt() (site/src/lib/format.ts).
  const displayedScore = (s: number) => Number(s.toFixed(1));
  const ranks = assignRanks(partial, (r) => displayedScore(r.score));
  // Rank the equal-weight baseline on the exact integer tenths, never the float score (B1).
  const equalRanks = assignRanks(partial, (r) => r.equalTenths);
  return partial
    .map((p) => {
      const { equalTenths: _equalTenths, ...r } = p;
      return {
        ...r,
        rank: ranks.get(p)!,
        equalRank: equalRanks.get(p)!,
        delta: equalRanks.get(p)! - ranks.get(p)!,
      };
    })
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
}
