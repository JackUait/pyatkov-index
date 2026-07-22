import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// B4: the committed data/raw/hdi.csv must be a byte-faithful snapshot of the
// Latin-1 UNDP source. fetch.ts decodes it as latin1; if that regressed to a
// UTF-8 decode, accented country names would corrupt to U+FFFD. This guards the
// shipped raw file directly (the fetch.test.ts unit test only covers the decode
// primitive, not the save call site).
const HDI = readFileSync(join(import.meta.dirname, '..', '..', 'data', 'raw', 'hdi.csv'), 'utf8');

describe('data/raw/hdi.csv is decoded faithfully (B4)', () => {
  it('contains no U+FFFD replacement characters', () => {
    expect(HDI.includes('�')).toBe(false);
  });

  it('preserves accented country names', () => {
    expect(HDI).toMatch(/Côte d'Ivoire/);
    expect(HDI).toMatch(/Türkiye/);
  });
});
