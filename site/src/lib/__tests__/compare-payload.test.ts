import { describe, expect, it } from 'vitest';
import { encodeAccessRow, tierAt } from '../compare-payload.ts';

const ORDER = ['USA', 'JPN', 'DEU', 'BRA'];

describe('encodeAccessRow', () => {
  it('spends one character per destination', () => {
    const row = { USA: 'visa-free', JPN: 'e-visa', DEU: 'visa-on-arrival', BRA: 'visa-required' };
    expect(encodeAccessRow(ORDER, row)).toHaveLength(ORDER.length);
  });

  it('round-trips every tier through its code', () => {
    const row = { USA: 'visa-free', JPN: 'visa-on-arrival', DEU: 'e-visa', BRA: 'visa-required' };
    const encoded = encodeAccessRow(ORDER, row);
    expect(ORDER.map((_, i) => tierAt(encoded, i))).toEqual([
      'visa-free',
      'visa-on-arrival',
      'e-visa',
      'visa-required',
    ]);
  });

  it('marks a destination the matrix does not rate, rather than guessing a tier', () => {
    const encoded = encodeAccessRow(ORDER, { USA: 'visa-free' });
    expect(tierAt(encoded, 0)).toBe('visa-free');
    expect(tierAt(encoded, 1)).toBeNull();
  });

  it('marks a tier name it does not recognise instead of throwing', () => {
    expect(tierAt(encodeAccessRow(ORDER, { USA: 'visa-on-request' }), 0)).toBeNull();
  });
});

describe('tierAt', () => {
  it('reads nothing past the end of the row', () => {
    expect(tierAt(encodeAccessRow(ORDER, {}), 99)).toBeNull();
    expect(tierAt('', 0)).toBeNull();
  });
});
