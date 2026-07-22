import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeWeights, zScoreNormalize } from '../weights.ts';
import { parseVisaMatrix } from '../ingest.ts';
import { loadSignals, parseArrivals, parseHdiCsv, parseWorldBankJson, type Override } from '../signals.ts';
import type { RawSignals } from '../types.ts';

const sig = (p: Partial<RawSignals>): RawSignals => ({ gdp: null, arrivals: null, hdi: null, migrants: null, ...p });

describe('zScoreNormalize', () => {
  it('centers on the population mean and scales by population sd (log branch)', () => {
    // values 1, 10, 100 -> logs 0, ln10, 2ln10; mean = ln10, population sd = sqrt(2/3)*ln10
    const m = zScoreNormalize(new Map([['A', 1], ['B', 10], ['C', 100]]), { log: true });
    const sd = Math.sqrt(2 / 3) * Math.log(10);
    expect(m.get('A')).toBeCloseTo((-Math.log(10)) / sd);
    expect(m.get('B')).toBeCloseTo(0);
    expect(m.get('C')).toBeCloseTo(Math.log(10) / sd);
    // population z-scores sum to 0
    expect((m.get('A')! + m.get('B')! + m.get('C')!)).toBeCloseTo(0);
  });

  it('normalizes raw (non-logged) values for HDI', () => {
    // 0.4, 0.6, 0.8 -> mean 0.6, population sd = sqrt(2/3)*0.2
    const m = zScoreNormalize(new Map([['A', 0.4], ['B', 0.6], ['C', 0.8]]), { log: false });
    const sd = Math.sqrt(2 / 3) * 0.2;
    expect(m.get('A')).toBeCloseTo(-0.2 / sd);
    expect(m.get('B')).toBeCloseTo(0);
    expect(m.get('C')).toBeCloseTo(0.2 / sd);
  });

  it('returns 0 for every entry when the pool has zero variance (single value / all equal)', () => {
    const m = zScoreNormalize(new Map([['A', 7], ['B', 7]]), { log: true });
    expect(m.get('A')).toBe(0);
    expect(m.get('B')).toBe(0);
    const one = zScoreNormalize(new Map([['A', 42]]), { log: false });
    expect(one.get('A')).toBe(0);
  });

  it('throws loudly on non-positive values in the log branch', () => {
    expect(() => zScoreNormalize(new Map([['A', 0], ['B', 100]]), { log: true })).toThrow(
      'zScoreNormalize: non-positive value for A: 0',
    );
    expect(() => zScoreNormalize(new Map([['X', -5], ['Y', 10]]), { log: true })).toThrow(
      'zScoreNormalize: non-positive value for X: -5',
    );
  });

  it('permits non-positive values in the raw (non-log) branch', () => {
    const m = zScoreNormalize(new Map([['A', -1], ['B', 1]]), { log: false });
    expect(m.get('A')).toBeCloseTo(-1);
    expect(m.get('B')).toBeCloseTo(1);
  });
});

describe('computeWeights (z-composite / tempered exponential)', () => {
  const names = new Map([['AAA', 'Aland'], ['BBB', 'Beeland'], ['CCC', 'Ceeland']]);

  it('weight = exp(BETA * mean-of-available z-scores), missing signals omitted from the mean', () => {
    const signals = new Map([
      ['AAA', sig({ gdp: 100, hdi: 0.8 })],
      ['BBB', sig({ gdp: 1, hdi: 0.4 })],
      ['CCC', sig({ hdi: 0.6 })],
    ]);
    const BETA = 1.25;
    // gdp over {AAA:100, BBB:1}: logs {ln100, 0}, mean=ln100/2, pop sd = ln100/2 -> z: AAA=+1, BBB=-1
    // hdi over {AAA:0.8, BBB:0.4, CCC:0.6}: mean 0.6, pop sd = sqrt(2/3)*0.2 -> z: AAA=+0.2/sd, BBB=-0.2/sd, CCC=0
    const hdiSd = Math.sqrt(2 / 3) * 0.2;
    const zA = (1 + 0.2 / hdiSd) / 2;
    const zB = (-1 - 0.2 / hdiSd) / 2;
    const zC = 0;
    const w = computeWeights(signals, names);
    const byIso = Object.fromEntries(w.map((d) => [d.iso3, d]));
    expect(byIso.AAA.weight).toBeCloseTo(Math.exp(BETA * zA));
    expect(byIso.BBB.weight).toBeCloseTo(Math.exp(BETA * zB));
    expect(byIso.CCC.weight).toBeCloseTo(Math.exp(BETA * zC));
    expect(byIso.CCC.signalsUsed).toBe(1);
    expect(byIso.AAA.signalsUsed).toBe(2);
  });

  it('all four signals share one z-scale before averaging (HDI is not left on raw [0,1])', () => {
    // HDI-only pool spanning its real-ish range; a mid HDI must land near the pool mean (z≈0),
    // not near its raw magnitude. Weight for the mean-HDI country must be ≈ exp(0) = 1.
    const signals = new Map([
      ['AAA', sig({ hdi: 0.95 })],
      ['BBB', sig({ hdi: 0.72 })],
      ['CCC', sig({ hdi: 0.49 })],
    ]);
    const w = computeWeights(signals, names);
    const byIso = Object.fromEntries(w.map((d) => [d.iso3, d]));
    expect(byIso.BBB.weight).toBeCloseTo(1, 5); // mean HDI -> z 0 -> exp(0)=1
    expect(byIso.AAA.weight).toBeGreaterThan(1);
    expect(byIso.CCC.weight).toBeLessThan(1);
  });

  it('imputes a missing signal coherently (a country missing one signal is scored on its present z-scores, never off-scale)', () => {
    const signals = new Map([
      ['AAA', sig({ gdp: 100, hdi: 0.9 })],
      ['BBB', sig({ gdp: 10, hdi: 0.5 })],
      ['CCC', sig({ gdp: 1 })], // missing HDI -> composite is just its gdp z, on the same scale
    ]);
    const w = computeWeights(signals, names);
    const byIso = Object.fromEntries(w.map((d) => [d.iso3, d]));
    // CCC's composite = its gdp z-score alone (the pool-minimum gdp), a normal negative z — finite, not off-scale.
    expect(Number.isFinite(byIso.CCC.weight)).toBe(true);
    expect(byIso.CCC.weight).toBeGreaterThan(0);
    expect(byIso.CCC.signalsUsed).toBe(1);
    // normalized carries the per-signal z-score, and the missing one stays null.
    expect(byIso.CCC.normalized.hdi).toBeNull();
    expect(typeof byIso.CCC.normalized.gdp).toBe('number');
  });

  it('sorts by weight descending and carries names', () => {
    const signals = new Map([['AAA', sig({ hdi: 0.9 })], ['BBB', sig({ hdi: 0.2 })]]);
    const w = computeWeights(signals, names);
    expect(w.map((d) => d.iso3)).toEqual(['AAA', 'BBB']);
    expect(w[0].name).toBe('Aland');
  });

  it('records normalized (z-score) values per signal', () => {
    const signals = new Map([['AAA', sig({ arrivals: 10 })], ['BBB', sig({ arrivals: 1000 })]]);
    const w = computeWeights(signals, names);
    const byIso = Object.fromEntries(w.map((d) => [d.iso3, d]));
    expect(byIso.BBB.normalized.arrivals).toBeCloseTo(1); // +1 pop-sd
    expect(byIso.AAA.normalized.arrivals).toBeCloseTo(-1); // -1 pop-sd
    expect(byIso.AAA.normalized.gdp).toBeNull();
  });

  it('throws loudly when a country has zero available signals', () => {
    const signals = new Map([['AAA', sig({ hdi: 0.8 })], ['ZZZ', sig({})]]);
    expect(() => computeWeights(signals, names)).toThrow('computeWeights: country ZZZ has zero available signals');
  });

  it('weights are strictly monotonic in the composite z (exp is strictly increasing)', () => {
    const signals = new Map([
      ['AAA', sig({ gdp: 1000, hdi: 0.9 })],
      ['BBB', sig({ gdp: 100, hdi: 0.7 })],
      ['CCC', sig({ gdp: 1, hdi: 0.4 })],
    ]);
    const w = computeWeights(signals, names); // sorted desc by weight
    expect(w[0].weight).toBeGreaterThan(w[1].weight);
    expect(w[1].weight).toBeGreaterThan(w[2].weight);
  });
});

// ---------------------------------------------------------------------------
// Real-data acceptance criterion (M1): destination quality must genuinely
// dominate count. The README thesis — access to Germany+Japan+USA outranks
// access to fifty small islands — must be TRUE on the shipped weights.
// ---------------------------------------------------------------------------
describe('computeWeights on real refreshed data (M1 hard acceptance criterion)', () => {
  const RAW = join(import.meta.dirname, '..', '..', 'data', 'raw');
  const read = (f: string) => readFileSync(join(RAW, f), 'utf8');

  const matrix = parseVisaMatrix(read('passport-index-matrix-iso3.csv'));
  const overrides = JSON.parse(read('manual-overrides.json')) as Record<string, Override>;
  const countries = JSON.parse(read('countries.json')) as Record<string, { name: string; iso2: string }>;
  for (const [iso3, o] of Object.entries(overrides)) countries[iso3] ??= { name: o.name, iso2: o.iso2 };
  const names = new Map(matrix.countries.map((c) => [c, countries[c]?.name ?? c]));
  const arrivals = new Map(
    [...parseArrivals(read('arrivals.json'))].map(([iso3, { value }]) => [iso3, value]),
  );
  const signals = loadSignals(
    matrix.countries,
    {
      gdp: parseWorldBankJson(read('gdp.json')),
      arrivals,
      hdi: parseHdiCsv(read('hdi.csv')),
      migrants: parseWorldBankJson(read('migrants.json')),
    },
    overrides,
  );
  const weights = computeWeights(signals, names);
  const byIso = new Map(weights.map((w) => [w.iso3, w.weight]));

  it('THESIS: weight(DEU)+weight(JPN)+weight(USA) exceeds the sum of the 50 smallest weights', () => {
    const trio = byIso.get('DEU')! + byIso.get('JPN')! + byIso.get('USA')!;
    const ascending = weights.map((w) => w.weight).sort((a, b) => a - b);
    const bot50 = ascending.slice(0, 50).reduce((a, b) => a + b, 0);
    expect(trio).toBeGreaterThan(bot50);
    // guard headroom: the build guard requires >= 1.30x; verify a healthy margin here.
    expect(trio / bot50).toBeGreaterThan(1.3);
  });

  it('stays face-valid: DEU, JPN, USA all rank in the top decile of destination weights', () => {
    const rankOf = (iso3: string) => weights.findIndex((w) => w.iso3 === iso3);
    const decile = Math.ceil(weights.length / 10);
    for (const c of ['DEU', 'JPN', 'USA']) {
      expect(rankOf(c)).toBeGreaterThanOrEqual(0);
      expect(rankOf(c)).toBeLessThan(decile);
    }
  });

  it('weights are strictly positive, finite, and no single destination is winner-take-all (< 8% share)', () => {
    const total = weights.reduce((a, w) => a + w.weight, 0);
    for (const w of weights) {
      expect(Number.isFinite(w.weight)).toBe(true);
      expect(w.weight).toBeGreaterThan(0);
    }
    const maxShare = Math.max(...weights.map((w) => w.weight)) / total;
    expect(maxShare).toBeLessThan(0.08);
  });

  it('weak destinations fade toward zero (smallest weight is a small fraction of the largest)', () => {
    const max = Math.max(...weights.map((w) => w.weight));
    const min = Math.min(...weights.map((w) => w.weight));
    expect(min / max).toBeLessThan(0.1);
  });
});
