import { describe, expect, it } from 'vitest';
import { assignRanks, computeScores } from '../scores.ts';
import { parseVisaMatrix } from '../ingest.ts';
import type { DestinationWeight } from '../types.ts';

const dw = (iso3: string, weight: number): DestinationWeight => ({
  iso3, name: iso3, weight,
  signals: { gdp: null, arrivals: null, hdi: weight, migrants: null },
  normalized: { gdp: null, arrivals: null, hdi: weight, migrants: null },
  signalsUsed: 1,
});

describe('assignRanks', () => {
  it('uses DENSE ranking on descending score (rank numbers stay continuous)', () => {
    const rows = [{ s: 10 }, { s: 30 }, { s: 30 }, { s: 5 }];
    const ranks = assignRanks(rows, (r) => r.s);
    expect(ranks.get(rows[1])).toBe(1);
    expect(ranks.get(rows[2])).toBe(1); // tie shares rank 1
    expect(ranks.get(rows[0])).toBe(2); // next distinct score is rank 2, NOT 3
    expect(ranks.get(rows[3])).toBe(3); // and the next is 3 — no gaps
  });
});

describe('computeScores', () => {
  // AAA: visa-free to BBB (w .9), required to CCC (w .1)
  // BBB: visa-free everywhere
  // CCC: e-visa to AAA (w .5), voa to BBB
  const csv = ['Passport,AAA,BBB,CCC', 'AAA,-1,visa free,visa required', 'BBB,visa free,-1,visa free', 'CCC,e-visa,visa on arrival,-1'].join('\n');
  const matrix = parseVisaMatrix(csv);
  const weights = [dw('BBB', 0.9), dw('AAA', 0.5), dw('CCC', 0.1)];
  const names = new Map([['AAA', 'Aland'], ['BBB', 'Beeland'], ['CCC', 'Ceeland']]);
  const totalW = 0.9 + 0.5 + 0.1; // 1.5

  // Self-INCLUSION: a passport always admits its own holder, so the home country
  // is counted as visa-free (credit 1.0) in BOTH the numerator and the denominator.
  // The denominator is therefore the FULL destination pool (all n), and a country's
  // own destination value accrues to its score.
  const denom = totalW; // full pool, same for every passport

  it('computes weighted score per the spec formula (self counted as visa-free)', () => {
    const rows = computeScores(matrix, weights, names);
    const byIso = Object.fromEntries(rows.map((r) => [r.iso3, r]));
    // AAA: free→BBB(0.9), required→CCC(0), plus free→self AAA(0.5)
    expect(byIso.AAA.score).toBeCloseTo((100 * (1.0 * 0.9 + 0 * 0.1 + 1.0 * 0.5)) / denom); // 93.33
    // BBB: free→AAA(0.5), free→CCC(0.1), plus free→self BBB(0.9)
    expect(byIso.BBB.score).toBeCloseTo((100 * (1.0 * 0.5 + 1.0 * 0.1 + 1.0 * 0.9)) / denom); // 100
    // CCC: e-visa→AAA(0.5·0.5), voa→BBB(0.8·0.9), plus free→self CCC(0.1)
    expect(byIso.CCC.score).toBeCloseTo((100 * (0.5 * 0.5 + 0.8 * 0.9 + 1.0 * 0.1)) / denom); // 71.33
  });

  it('computes equal-weight score, ranks, and delta (self counted, n denominator)', () => {
    const rows = computeScores(matrix, weights, names);
    const byIso = Object.fromEntries(rows.map((r) => [r.iso3, r]));
    // equal over all n=3 destinations incl. self: AAA=100*2/3; BBB=100*3/3=100; CCC=100*2.3/3
    expect(byIso.AAA.equalScore).toBeCloseTo((100 * 2) / 3, 6); // 66.67
    expect(byIso.BBB.equalScore).toBeCloseTo(100, 6);
    expect(byIso.CCC.equalScore).toBeCloseTo((100 * 2.3) / 3, 6); // 76.67
    // weighted ranks: BBB 100 > AAA 90 > CCC 69.29
    expect(byIso.BBB.rank).toBe(1);
    expect(byIso.AAA.rank).toBe(2);
    expect(byIso.CCC.rank).toBe(3);
    // equal ranks: BBB 100 > CCC 65 > AAA 50
    expect(byIso.BBB.equalRank).toBe(1);
    expect(byIso.CCC.equalRank).toBe(2);
    expect(byIso.AAA.equalRank).toBe(3);
    // delta = equalRank - rank
    expect(byIso.BBB.delta).toBe(0);
    expect(byIso.AAA.delta).toBe(1);
    expect(byIso.CCC.delta).toBe(-1);
    for (const r of rows) expect(r.delta).toBe(r.equalRank - r.rank);
  });

  it('counts destinations per access category, with the home country as visa-free', () => {
    const rows = computeScores(matrix, weights, names);
    const ccc = rows.find((r) => r.iso3 === 'CCC')!;
    // CCC reaches AAA (e-visa) and BBB (voa); its own country is counted visa-free.
    expect(ccc.counts).toEqual({ 'visa-free': 1, 'visa-on-arrival': 1, 'e-visa': 1, 'visa-required': 0 });
  });

  it('returns rows sorted by rank ascending with names attached', () => {
    const rows = computeScores(matrix, weights, names);
    expect(rows[0].iso3).toBe('BBB');
    expect(rows[0].name).toBe('Beeland');
  });
});

describe('rank reflects displayed power: equal shown score ⇒ equal rank', () => {
  // P and Q have identical foreign access; their own weights differ just enough that
  // their true scores are 90.02 vs 89.98 — DIFFERENT numbers, but both round to the
  // displayed "90.0". A reader sees the same power, so they must share rank 1, and the
  // next passport takes rank 2 (dense ranking — the rank numbers stay continuous).
  const csv = [
    'Passport,P,Q,R',
    'P,-1,visa required,visa free',
    'Q,visa required,-1,visa free',
    'R,visa required,visa required,-1',
  ].join('\n');
  const matrix = parseVisaMatrix(csv);
  const weights = [dw('P', 5.01), dw('Q', 4.99), dw('R', 40)];
  const names = new Map([['P', 'P'], ['Q', 'Q'], ['R', 'R']]);

  it('ties passports whose scores round to the same displayed value', () => {
    const rows = computeScores(matrix, weights, names);
    const byIso = Object.fromEntries(rows.map((r) => [r.iso3, r]));
    expect(byIso.P.score.toFixed(1)).toBe('90.0');
    expect(byIso.Q.score.toFixed(1)).toBe('90.0');
    expect(byIso.P.score).not.toBe(byIso.Q.score); // truly different underlying scores
    expect(byIso.P.rank).toBe(1);
    expect(byIso.Q.rank).toBe(1); // same displayed power ⇒ same rank
    expect(byIso.R.rank).toBe(2); // dense ranking: next distinct score is 2, no gap
  });

  it('never shows two different rank numbers for the same displayed score', () => {
    const rows = computeScores(matrix, weights, names);
    const rankByShown = new Map<string, number>();
    for (const r of rows) {
      const shown = r.score.toFixed(1);
      if (rankByShown.has(shown)) expect(r.rank).toBe(rankByShown.get(shown));
      else rankByShown.set(shown, r.rank);
    }
  });
});

describe('B1: mathematically-tied passports tie (no float-equality split)', () => {
  // AAA and BBB reach the same credit MULTISET {voa 0.8, voa 0.8, e-visa 0.5, free 1.0}
  // over their four non-self destinations, but assembled in different column orders.
  // Accumulated as floats those sums diverge (3.1 vs 3.0999999999999996), which the old
  // exact-=== ranking split into different equalRanks. Integer-tenths accumulation ties them.
  const csv = [
    'Passport,AAA,BBB,C1,C2,C3',
    'AAA,-1,visa on arrival,visa on arrival,e-visa,visa free', // BBB,C1,C2,C3 = [0.8,0.8,0.5,1.0]
    'BBB,visa on arrival,-1,e-visa,visa free,visa on arrival', // AAA,C1,C2,C3 = [0.8,0.5,1.0,0.8]
    'C1,visa required,visa required,-1,visa required,visa required',
    'C2,visa required,visa required,visa required,-1,visa required',
    'C3,visa required,visa required,visa required,visa required,-1',
  ].join('\n');
  const matrix = parseVisaMatrix(csv);
  const weights = [dw('AAA', 0.7), dw('BBB', 0.3), dw('C1', 0.2), dw('C2', 0.15), dw('C3', 0.11)];
  const names = new Map([['AAA', 'A'], ['BBB', 'B'], ['C1', 'C1'], ['C2', 'C2'], ['C3', 'C3']]);

  it('gives identical equalScore, equalRank, and delta to identical-multiset passports', () => {
    const rows = computeScores(matrix, weights, names);
    const byIso = Object.fromEntries(rows.map((r) => [r.iso3, r]));
    expect(byIso.AAA.equalScore).toBe(byIso.BBB.equalScore);
    expect(byIso.AAA.equalRank).toBe(byIso.BBB.equalRank);
    expect(byIso.AAA.equalRank).toBe(1); // both top the equal-weight baseline, tied at rank 1
    for (const r of rows) expect(r.delta).toBe(r.equalRank - r.rank);
  });
});

describe('self-inclusion: full access still tops out at 100, and own weight lifts the score', () => {
  // X and Y both have full visa-free access to every OTHER destination. Because the
  // home country is itself counted as visa-free (self-inclusion), each reaches the whole
  // pool, so both still hit exactly 100 — the ceiling is full coverage, not a function
  // of own weight.
  const csv = [
    'Passport,X,Y,Z',
    'X,-1,visa free,visa free',
    'Y,visa free,-1,visa free',
    'Z,visa required,visa required,-1',
  ].join('\n');
  const matrix = parseVisaMatrix(csv);
  const weights = [dw('X', 0.9), dw('Y', 0.05), dw('Z', 0.4)];
  const names = new Map([['X', 'X'], ['Y', 'Y'], ['Z', 'Z']]);

  it('full-access passports reach exactly 100', () => {
    const rows = computeScores(matrix, weights, names);
    const byIso = Object.fromEntries(rows.map((r) => [r.iso3, r]));
    expect(byIso.X.score).toBeCloseTo(100, 9);
    expect(byIso.Y.score).toBeCloseTo(100, 9);
    expect(byIso.X.equalScore).toBeCloseTo(100, 9);
    expect(byIso.Y.equalScore).toBeCloseTo(100, 9);
  });
});

describe('self-inclusion: a country\'s own destination value accrues to its own score', () => {
  // P and Q have IDENTICAL foreign access (both required→each other, visa-free→R), so the
  // only thing separating their scores is their own weight, now that the home country is
  // counted as visa-free. The gap must equal exactly 100 × (wP − wQ) / totalWeight.
  const csv = [
    'Passport,P,Q,R',
    'P,-1,visa required,visa free',
    'Q,visa required,-1,visa free',
    'R,visa required,visa required,-1',
  ].join('\n');
  const matrix = parseVisaMatrix(csv);
  const wP = 0.9, wQ = 0.1, wR = 0.5;
  const weights = [dw('P', wP), dw('Q', wQ), dw('R', wR)];
  const names = new Map([['P', 'P'], ['Q', 'Q'], ['R', 'R']]);

  it('the higher-own-weight passport scores higher, by exactly its own-weight share', () => {
    const rows = computeScores(matrix, weights, names);
    const byIso = Object.fromEntries(rows.map((r) => [r.iso3, r]));
    const totalW = wP + wQ + wR;
    // P: required→Q(0), free→R(wR), free→self(wP);  Q: required→P(0), free→R(wR), free→self(wQ)
    expect(byIso.P.score).toBeCloseTo((100 * (wR + wP)) / totalW, 9);
    expect(byIso.Q.score).toBeCloseTo((100 * (wR + wQ)) / totalW, 9);
    expect(byIso.P.score).toBeGreaterThan(byIso.Q.score);
    expect(byIso.P.score - byIso.Q.score).toBeCloseTo((100 * (wP - wQ)) / totalW, 9);
  });
});
