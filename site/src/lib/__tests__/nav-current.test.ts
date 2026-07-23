import { describe, expect, it } from 'vitest';
import { normalizePath } from '../nav-current.ts';

describe('normalizePath', () => {
  it('keeps the root as a bare slash', () => {
    expect(normalizePath('/')).toBe('/');
  });

  it('strips a trailing slash so /openness/ and /openness compare equal', () => {
    expect(normalizePath('/openness/')).toBe('/openness');
  });

  it('collapses repeated trailing slashes', () => {
    expect(normalizePath('/openness///')).toBe('/openness');
  });

  it('leaves an already-bare path alone', () => {
    expect(normalizePath('/openness')).toBe('/openness');
  });

  it('normalizes an empty path to the root', () => {
    expect(normalizePath('')).toBe('/');
  });
});
