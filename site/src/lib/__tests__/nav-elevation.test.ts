import { describe, expect, it } from 'vitest';
import { isAtTop } from '../nav-elevation.ts';

describe('isAtTop', () => {
  it('reports the top of the page at zero scroll', () => {
    expect(isAtTop(0)).toBe(true);
  });

  it('tolerates sub-threshold jitter (rubber-banding, anchor rounding)', () => {
    expect(isAtTop(8)).toBe(true);
  });

  it('reports scrolled once past the threshold', () => {
    expect(isAtTop(9)).toBe(false);
    expect(isAtTop(400)).toBe(false);
  });

  it('accepts a custom threshold', () => {
    expect(isAtTop(20, 24)).toBe(true);
    expect(isAtTop(25, 24)).toBe(false);
  });
});
