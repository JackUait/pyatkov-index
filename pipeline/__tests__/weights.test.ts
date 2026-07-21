import { describe, expect, it } from 'vitest';
import { computeWeights, logMinMaxNormalize } from '../weights.ts';
import type { RawSignals } from '../types.ts';

const sig = (p: Partial<RawSignals>): RawSignals => ({ gdp: null, arrivals: null, hdi: null, migrants: null, ...p });

describe('logMinMaxNormalize', () => {
  it('maps min to 0, max to 1, log-spaced midpoint to 0.5', () => {
    const m = logMinMaxNormalize(new Map([['A', 1], ['B', 100], ['C', 10]]));
    expect(m.get('A')).toBeCloseTo(0);
    expect(m.get('B')).toBeCloseTo(1);
    expect(m.get('C')).toBeCloseTo(0.5); // ln10 is the midpoint of ln1..ln100
  });
  it('maps everything to 1 when all values are equal', () => {
    const m = logMinMaxNormalize(new Map([['A', 7], ['B', 7]]));
    expect(m.get('A')).toBe(1);
    expect(m.get('B')).toBe(1);
  });
});

describe('computeWeights', () => {
  const names = new Map([['AAA', 'Aland'], ['BBB', 'Beeland'], ['CCC', 'Ceeland']]);

  it('averages available normalized signals only', () => {
    const signals = new Map([
      ['AAA', sig({ gdp: 100, hdi: 0.8 })], // gdp normalizes to 1 (max), hdi direct
      ['BBB', sig({ gdp: 1, hdi: 0.4 })],   // gdp normalizes to 0 (min)
      ['CCC', sig({ hdi: 0.6 })],           // only one signal
    ]);
    const w = computeWeights(signals, names);
    const byIso = Object.fromEntries(w.map((d) => [d.iso3, d]));
    expect(byIso.AAA.weight).toBeCloseTo((1 + 0.8) / 2);
    expect(byIso.BBB.weight).toBeCloseTo((0 + 0.4) / 2);
    expect(byIso.CCC.weight).toBeCloseTo(0.6);
    expect(byIso.CCC.signalsUsed).toBe(1);
    expect(byIso.AAA.signalsUsed).toBe(2);
  });

  it('sorts by weight descending and carries names', () => {
    const signals = new Map([['AAA', sig({ hdi: 0.9 })], ['BBB', sig({ hdi: 0.2 })]]);
    const w = computeWeights(signals, names);
    expect(w.map((d) => d.iso3)).toEqual(['AAA', 'BBB']);
    expect(w[0].name).toBe('Aland');
  });

  it('records normalized values per signal', () => {
    const signals = new Map([['AAA', sig({ arrivals: 10 })], ['BBB', sig({ arrivals: 1000 })]]);
    const w = computeWeights(signals, names);
    const byIso = Object.fromEntries(w.map((d) => [d.iso3, d]));
    expect(byIso.BBB.normalized.arrivals).toBeCloseTo(1);
    expect(byIso.AAA.normalized.arrivals).toBeCloseTo(0);
    expect(byIso.AAA.normalized.gdp).toBeNull();
  });
});
