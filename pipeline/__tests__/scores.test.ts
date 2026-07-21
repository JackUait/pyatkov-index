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
  it('uses standard competition ranking on descending score', () => {
    const rows = [{ s: 10 }, { s: 30 }, { s: 30 }, { s: 5 }];
    const ranks = assignRanks(rows, (r) => r.s);
    expect(ranks.get(rows[1])).toBe(1);
    expect(ranks.get(rows[2])).toBe(1);
    expect(ranks.get(rows[0])).toBe(3);
    expect(ranks.get(rows[3])).toBe(4);
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

  it('computes weighted score per the spec formula', () => {
    const rows = computeScores(matrix, weights, names);
    const byIso = Object.fromEntries(rows.map((r) => [r.iso3, r]));
    expect(byIso.AAA.score).toBeCloseTo((100 * (1.0 * 0.9 + 0 * 0.1)) / totalW); // 60
    expect(byIso.BBB.score).toBeCloseTo((100 * (1.0 * 0.5 + 1.0 * 0.1)) / totalW); // 40
    expect(byIso.CCC.score).toBeCloseTo((100 * (0.5 * 0.5 + 0.8 * 0.9)) / totalW); // 64.67
  });

  it('computes equal-weight score, ranks, and delta', () => {
    const rows = computeScores(matrix, weights, names);
    const byIso = Object.fromEntries(rows.map((r) => [r.iso3, r]));
    // equal: AAA = 100*(1+0)/3 = 33.3; BBB = 100*2/3 = 66.7; CCC = 100*1.3/3 = 43.3
    expect(byIso.BBB.equalScore).toBeCloseTo(66.667, 2);
    expect(byIso.BBB.equalRank).toBe(1);
    expect(byIso.BBB.rank).toBe(3); // weighted: CCC 64.7 > AAA 60 > BBB 40
    expect(byIso.BBB.delta).toBe(-2);
    expect(byIso.CCC.rank).toBe(1);
    expect(byIso.CCC.delta).toBe(1); // equalRank 2 -> rank 1
  });

  it('counts destinations per access category', () => {
    const rows = computeScores(matrix, weights, names);
    const ccc = rows.find((r) => r.iso3 === 'CCC')!;
    expect(ccc.counts).toEqual({ 'visa-free': 0, 'visa-on-arrival': 1, 'e-visa': 1, 'visa-required': 0 });
  });

  it('returns rows sorted by rank ascending with names attached', () => {
    const rows = computeScores(matrix, weights, names);
    expect(rows[0].iso3).toBe('CCC');
    expect(rows[0].name).toBe('Ceeland');
  });
});
