import { describe, expect, it } from 'vitest';
import { buildComparison, parseCompareQuery } from '../compare-view.ts';
import { encodeAccessRow } from '../compare-payload.ts';
import type { ComparePayload } from '../compare-view.ts';

// Four countries, ordered heaviest destination first — enough to exercise both
// sides of a difference, the ordering, and the two home countries that have to
// stay out of the lists.
const ORDER = ['USA', 'JPN', 'DEU', 'BRA'];

const stats = (score: number, rank: number, counts: Partial<Record<string, number>>) => ({
  score,
  rank,
  equalScore: score - 5,
  equalRank: rank + 1,
  counts: {
    'visa-free': counts['visa-free'] ?? 0,
    'visa-on-arrival': counts['visa-on-arrival'] ?? 0,
    'e-visa': counts['e-visa'] ?? 0,
    'visa-required': counts['visa-required'] ?? 0,
  },
});

const PAYLOAD: ComparePayload = {
  order: ORDER,
  countries: {
    USA: { name: 'United States', article: 'the United States', iso2: 'US', weight: 40 },
    JPN: { name: 'Japan', article: 'Japan', iso2: 'JP', weight: 30 },
    DEU: { name: 'Germany', article: 'Germany', iso2: 'DE', weight: 20 },
    BRA: { name: 'Brazil', article: 'Brazil', iso2: 'BR', weight: 10 },
  },
  passports: {
    USA: stats(90, 1, { 'visa-free': 3, 'e-visa': 1 }),
    JPN: stats(80, 2, { 'visa-free': 3, 'e-visa': 1 }),
    DEU: stats(70, 3, { 'visa-free': 1, 'e-visa': 1, 'visa-required': 2 }),
    BRA: stats(60, 4, { 'visa-free': 2, 'e-visa': 1, 'visa-required': 1 }),
  },
  destinations: {
    USA: stats(50, 4, { 'visa-free': 2, 'e-visa': 1, 'visa-required': 1 }),
    JPN: stats(75, 1, { 'visa-free': 2, 'e-visa': 1, 'visa-required': 1 }),
    DEU: stats(70, 2, { 'visa-free': 3, 'e-visa': 1 }),
    BRA: stats(60, 3, { 'visa-free': 2, 'e-visa': 1, 'visa-required': 1 }),
  },
  // Read as: access[holder][destination].
  access: {
    USA: encodeAccessRow(ORDER, { USA: 'visa-free', JPN: 'visa-free', DEU: 'visa-free', BRA: 'e-visa' }),
    JPN: encodeAccessRow(ORDER, { USA: 'visa-free', JPN: 'visa-free', DEU: 'e-visa', BRA: 'visa-free' }),
    DEU: encodeAccessRow(ORDER, { USA: 'e-visa', JPN: 'visa-required', DEU: 'visa-free', BRA: 'visa-required' }),
    BRA: encodeAccessRow(ORDER, { USA: 'visa-required', JPN: 'e-visa', DEU: 'visa-free', BRA: 'visa-free' }),
  },
};

describe('parseCompareQuery', () => {
  it('reads the kind and both codes, upper-casing the codes', () => {
    expect(parseCompareQuery('?kind=passport&a=kor&b=jpn')).toEqual({
      kind: 'passport',
      a: 'KOR',
      b: 'JPN',
    });
  });

  it('reads the destination kind too', () => {
    expect(parseCompareQuery('?kind=destination&a=usa&b=deu')).toMatchObject({ kind: 'destination' });
  });

  it('defaults to passports when no kind is named', () => {
    expect(parseCompareQuery('?a=kor&b=jpn')).toMatchObject({ kind: 'passport' });
  });

  it('rejects a kind it does not render', () => {
    expect(parseCompareQuery('?kind=airline&a=kor&b=jpn')).toEqual({ error: 'kind' });
  });

  it('rejects a query missing either side', () => {
    expect(parseCompareQuery('?kind=passport&a=kor')).toEqual({ error: 'missing' });
    expect(parseCompareQuery('')).toEqual({ error: 'missing' });
  });
});

describe('buildComparison: what goes wrong', () => {
  it('refuses to compare a country with itself', () => {
    expect(buildComparison(PAYLOAD, { kind: 'passport', a: 'USA', b: 'USA' })).toEqual({ error: 'same' });
  });

  it('refuses a code it has no country for', () => {
    expect(buildComparison(PAYLOAD, { kind: 'passport', a: 'USA', b: 'XXX' })).toEqual({ error: 'unknown' });
    expect(buildComparison(PAYLOAD, { kind: 'destination', a: 'ZZZ', b: 'USA' })).toEqual({ error: 'unknown' });
  });
});

describe('buildComparison: two passports', () => {
  const c = buildComparison(PAYLOAD, { kind: 'passport', a: 'USA', b: 'JPN' });
  if ('error' in c) throw new Error('expected a comparison');

  it('carries the article form for the slots that set the name in prose', () => {
    expect(c.a.article).toBe('the United States');
    expect(c.b.article).toBe('Japan');
  });

  it('names both sides with their score, rank and equal-weight pair', () => {
    expect(c.a).toMatchObject({ iso3: 'USA', name: 'United States', iso2: 'US', score: 90, rank: 1 });
    expect(c.b).toMatchObject({ iso3: 'JPN', name: 'Japan', score: 80, rank: 2 });
    expect(c.a.equalScore).toBe(85);
    expect(c.b.equalRank).toBe(3);
  });

  it('lays the access mix out one row per tier, in tier order', () => {
    expect(c.mix.map((m) => m.tier)).toEqual(['visa-free', 'visa-on-arrival', 'e-visa', 'visa-required']);
    expect(c.mix[0]).toMatchObject({ label: 'Visa-free', a: 3, b: 3 });
    expect(c.mix[2]).toMatchObject({ label: 'eVisa', a: 1, b: 1 });
  });

  it('lists the destinations each passport opens more easily', () => {
    expect(c.aOnly.map((d) => d.iso3)).toEqual(['DEU']);
    expect(c.bOnly.map((d) => d.iso3)).toEqual(['BRA']);
  });

  it('carries each difference with the tier on both sides, so the row can say why', () => {
    expect(c.aOnly[0]).toMatchObject({ name: 'Germany', iso2: 'DE', aTier: 'visa-free', bTier: 'e-visa' });
  });

  it('orders the differences heaviest destination first', () => {
    const wide = buildComparison(PAYLOAD, { kind: 'passport', a: 'USA', b: 'DEU' });
    if ('error' in wide) throw new Error('expected a comparison');
    expect(wide.aOnly.map((d) => d.iso3)).toEqual(['JPN', 'BRA']);
    expect(wide.bOnly).toEqual([]);
  });

  it('leaves out the two home countries, whose own doors are never news', () => {
    const wide = buildComparison(PAYLOAD, { kind: 'passport', a: 'USA', b: 'DEU' });
    if ('error' in wide) throw new Error('expected a comparison');
    const listed = [...wide.aOnly, ...wide.bOnly].map((d) => d.iso3);
    expect(listed).not.toContain('USA');
    expect(listed).not.toContain('DEU');
  });
});

describe('buildComparison: two destinations', () => {
  const c = buildComparison(PAYLOAD, { kind: 'destination', a: 'USA', b: 'DEU' });
  if ('error' in c) throw new Error('expected a comparison');

  it('reads the openness score and rank, not the passport ones', () => {
    expect(c.a).toMatchObject({ iso3: 'USA', score: 50, rank: 4 });
    expect(c.b).toMatchObject({ iso3: 'DEU', score: 70, rank: 2 });
  });

  it('counts the admitted-passport mix from the destination side', () => {
    expect(c.mix[0]).toMatchObject({ tier: 'visa-free', a: 2, b: 3 });
  });

  it('lists the passports each destination admits more easily', () => {
    expect(c.aOnly.map((d) => d.iso3)).toEqual(['JPN']);
    expect(c.bOnly.map((d) => d.iso3)).toEqual(['BRA']);
  });

  it('reads the matrix down the passport axis, so the tiers belong to the holder', () => {
    expect(c.aOnly[0]).toMatchObject({ name: 'Japan', aTier: 'visa-free', bTier: 'e-visa' });
  });

  it('leaves out the two home countries here too', () => {
    const listed = [...c.aOnly, ...c.bOnly].map((d) => d.iso3);
    expect(listed).not.toContain('USA');
    expect(listed).not.toContain('DEU');
  });
});
