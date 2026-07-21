import { CREDIT } from './ingest.ts';
import type { AccessCategory, DestinationWeight, PassportRow, VisaMatrix } from './types.ts';

export function assignRanks<T>(rows: T[], score: (r: T) => number): Map<T, number> {
  const sorted = [...rows].sort((a, b) => score(b) - score(a));
  const ranks = new Map<T, number>();
  sorted.forEach((row, i) => {
    ranks.set(row, i > 0 && score(row) === score(sorted[i - 1]) ? ranks.get(sorted[i - 1])! : i + 1);
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
    let equal = 0;
    const counts: Record<AccessCategory, number> = { 'visa-free': 0, 'visa-on-arrival': 0, 'e-visa': 0, 'visa-required': 0 };
    for (const [dest, cat] of row) {
      const credit = CREDIT[cat];
      const w = weightByIso.get(dest);
      if (w === undefined) throw new Error(`destination ${dest} has no weight`);
      weighted += credit * w;
      equal += credit;
      counts[cat] += 1;
    }
    return { iso3, name: names.get(iso3) ?? iso3, score: (100 * weighted) / totalWeight, equalScore: (100 * equal) / n, counts };
  });

  const ranks = assignRanks(partial, (r) => r.score);
  const equalRanks = assignRanks(partial, (r) => r.equalScore);
  return partial
    .map((r) => ({
      ...r,
      rank: ranks.get(r)!,
      equalRank: equalRanks.get(r)!,
      delta: equalRanks.get(r)! - ranks.get(r)!,
    }))
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
}
