import { describe, expect, it } from 'vitest';
import { SIGMA_MULTIPLIER, aboveUnitCount, counterweightCount, impliedZ, zTint } from '../weigh.ts';

describe('SIGMA_MULTIPLIER', () => {
  it('is exp(1.25), the factor one standard deviation buys', () => {
    expect(SIGMA_MULTIPLIER).toBeCloseTo(Math.exp(1.25), 10);
  });
});

describe('aboveUnitCount', () => {
  it('counts destinations strictly heavier than the average weight of 1', () => {
    expect(aboveUnitCount([14.2, 1.01, 1, 0.9, 0.05])).toBe(2);
  });

  it('is zero for an empty table', () => {
    expect(aboveUnitCount([])).toBe(0);
  });
});

describe('counterweightCount', () => {
  it('says how many of the lightest it takes to outweigh the heaviest', () => {
    // 1 + 2 + 3 < 10, adding 5 tips it: four weights on the light pan.
    expect(counterweightCount([10, 5, 3, 2, 1])).toBe(4);
  });

  it('accepts the table in any order', () => {
    expect(counterweightCount([1, 10, 2, 5, 3])).toBe(4);
  });

  it('is zero when the rest can never outweigh the heaviest', () => {
    expect(counterweightCount([10, 1])).toBe(0);
    expect(counterweightCount([10])).toBe(0);
    expect(counterweightCount([])).toBe(0);
  });
});

describe('impliedZ', () => {
  it('inverts the weight formula: exp(1.25 × Z) back to Z', () => {
    expect(impliedZ(Math.exp(1.25 * 2))).toBeCloseTo(2, 10);
  });

  it('reads the average weight of 1 as exactly zero sigma', () => {
    expect(impliedZ(1)).toBe(0);
  });
});

describe('zTint', () => {
  it('is null for a missing signal', () => {
    expect(zTint(null)).toBeNull();
  });

  it('mixes marigold to depth for an above-average score', () => {
    // +3 sigma caps the ramp at its deepest marigold step.
    expect(zTint(3)).toBe('color-mix(in srgb, var(--color-marigold) 92%, var(--color-white))');
    expect(zTint(1.5)).toBe('color-mix(in srgb, var(--color-marigold) 46%, var(--color-white))');
  });

  it('mixes the quiet ink wash for a below-average score', () => {
    expect(zTint(-3)).toBe('color-mix(in srgb, var(--color-ink) 14%, var(--color-white))');
    expect(zTint(-1.5)).toBe('color-mix(in srgb, var(--color-ink) 7%, var(--color-white))');
  });

  it('caps the ramp beyond three sigma instead of overshooting', () => {
    expect(zTint(5)).toBe(zTint(3));
    expect(zTint(-5)).toBe(zTint(-3));
  });

  it('leaves a dead-average score untinted', () => {
    expect(zTint(0)).toBeNull();
    // Rounds-to-zero stays untinted too: a 0% mix is a no-op worth skipping.
    expect(zTint(0.01)).toBeNull();
  });
});
