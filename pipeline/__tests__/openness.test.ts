import { describe, expect, it } from 'vitest';
import { computeOpenness } from '../openness.ts';
import { parseVisaMatrix } from '../ingest.ts';

// Three countries. Rows are passports, columns destinations; -1 is the self cell.
//   AAA -> BBB visa free,        AAA -> CCC visa required
//   BBB -> AAA visa free,        BBB -> CCC visa free
//   CCC -> AAA e-visa,           CCC -> BBB visa on arrival
const csv = [
  'Passport,AAA,BBB,CCC',
  'AAA,-1,visa free,visa required',
  'BBB,visa free,-1,visa free',
  'CCC,e-visa,visa on arrival,-1',
].join('\n');
const matrix = parseVisaMatrix(csv);
const names = new Map([['AAA', 'Aland'], ['BBB', 'Beeland'], ['CCC', 'Ceeland']]);
// Deliberately lopsided: BBB holds most of the world's people.
const pops = new Map([['AAA', 10], ['BBB', 80], ['CCC', 10]]);
const total = 100;
const byIso = (rows: ReturnType<typeof computeOpenness>) =>
  Object.fromEntries(rows.map((r) => [r.iso3, r]));

describe('computeOpenness', () => {
  it('scores the credit-weighted population share, counting the destination itself as visa-free', () => {
    const o = byIso(computeOpenness(matrix, pops, names));
    // Who can enter AAA: BBB visa-free (80), CCC e-visa (0.5 x 10), AAA itself (10).
    expect(o.AAA.score).toBeCloseTo((100 * (1.0 * 80 + 0.5 * 10 + 1.0 * 10)) / total, 9); // 95
    // Who can enter BBB: AAA visa-free (10), CCC visa-on-arrival (0.8 x 10), BBB itself (80).
    expect(o.BBB.score).toBeCloseTo((100 * (1.0 * 10 + 0.8 * 10 + 1.0 * 80)) / total, 9); // 98
    // Who can enter CCC: AAA visa-required (0), BBB visa-free (80), CCC itself (10).
    expect(o.CCC.score).toBeCloseTo((100 * (0 * 10 + 1.0 * 80 + 1.0 * 10)) / total, 9); // 90
  });

  it('scores exactly 100 when every passport is visa-free', () => {
    const openCsv = [
      'Passport,AAA,BBB',
      'AAA,-1,visa free',
      'BBB,visa free,-1',
    ].join('\n');
    const o = byIso(computeOpenness(parseVisaMatrix(openCsv), new Map([['AAA', 3], ['BBB', 7]]), new Map()));
    expect(o.AAA.score).toBeCloseTo(100, 9);
    expect(o.BBB.score).toBeCloseTo(100, 9);
  });

  it("floors at the destination's own population share when it admits no one else", () => {
    const closedCsv = [
      'Passport,AAA,BBB',
      'AAA,-1,visa required',
      'BBB,visa required,-1',
    ].join('\n');
    const o = byIso(computeOpenness(parseVisaMatrix(closedCsv), new Map([['AAA', 3], ['BBB', 7]]), new Map()));
    expect(o.AAA.score).toBeCloseTo(30, 9);
    expect(o.BBB.score).toBeCloseTo(70, 9);
  });

  it('computes the equal-weight baseline over every passport including self', () => {
    const o = byIso(computeOpenness(matrix, pops, names));
    // AAA: free(1.0) + e-visa(0.5) + self(1.0) = 2.5 of 3
    expect(o.AAA.equalScore).toBeCloseTo((100 * 2.5) / 3, 9);
    // BBB: free(1.0) + voa(0.8) + self(1.0) = 2.8 of 3
    expect(o.BBB.equalScore).toBeCloseTo((100 * 2.8) / 3, 9);
    // CCC: required(0) + free(1.0) + self(1.0) = 2.0 of 3
    expect(o.CCC.equalScore).toBeCloseTo((100 * 2) / 3, 9);
  });

  it('ranks densely and sets delta = equalRank - rank', () => {
    const rows = computeOpenness(matrix, pops, names);
    const o = byIso(rows);
    // weighted: BBB 98 > AAA 95 > CCC 90
    expect([o.BBB.rank, o.AAA.rank, o.CCC.rank]).toEqual([1, 2, 3]);
    // equal:    BBB 93.3 > AAA 83.3 > CCC 66.7
    expect([o.BBB.equalRank, o.AAA.equalRank, o.CCC.equalRank]).toEqual([1, 2, 3]);
    for (const r of rows) expect(r.delta).toBe(r.equalRank - r.rank);
    // returned sorted by rank
    expect(rows.map((r) => r.iso3)).toEqual(['BBB', 'AAA', 'CCC']);
  });

  it('gives tied destinations the same rank with no gap after (dense ranking)', () => {
    // AAA and BBB are both visa-free to everyone; CCC admits no one but itself.
    const tieCsv = [
      'Passport,AAA,BBB,CCC',
      'AAA,-1,visa free,visa required',
      'BBB,visa free,-1,visa required',
      'CCC,visa free,visa free,-1',
    ].join('\n');
    const o = byIso(computeOpenness(parseVisaMatrix(tieCsv), new Map([['AAA', 10], ['BBB', 10], ['CCC', 10]]), new Map()));
    expect(o.AAA.rank).toBe(1);
    expect(o.BBB.rank).toBe(1);
    expect(o.CCC.rank).toBe(2); // next distinct score takes the NEXT integer, not 3
  });

  it('counts every passport exactly once, with self in the visa-free tier', () => {
    const o = byIso(computeOpenness(matrix, pops, names));
    expect(o.AAA.counts).toEqual({ 'visa-free': 2, 'visa-on-arrival': 0, 'e-visa': 1, 'visa-required': 0 });
    expect(o.CCC.counts).toEqual({ 'visa-free': 2, 'visa-on-arrival': 0, 'e-visa': 0, 'visa-required': 1 });
    for (const r of Object.values(o)) {
      const sum = Object.values(r.counts).reduce((a, b) => a + b, 0);
      expect(sum).toBe(3);
    }
  });

  it('splits the score into per-tier points that sum back to it', () => {
    const rows = computeOpenness(matrix, pops, names);
    for (const r of rows) {
      const sum = Object.values(r.points).reduce((a, b) => a + b, 0);
      expect(sum).toBeCloseTo(r.score, 9);
    }
    const o = byIso(rows);
    expect(o.AAA.points['visa-free']).toBeCloseTo((100 * (80 + 10)) / total, 9); // BBB + self
    expect(o.AAA.points['e-visa']).toBeCloseTo((100 * 0.5 * 10) / total, 9);
    expect(o.AAA.points['visa-required']).toBe(0);
  });

  it('throws when a passport in the matrix has no population', () => {
    expect(() => computeOpenness(matrix, new Map([['AAA', 10], ['BBB', 80]]), names)).toThrow(/CCC/);
  });
});
