import { describe, expect, it } from 'vitest';
import { RIBBON_DEEP, RIBBON_FAINT, weightShade } from './weight-shade.ts';

// Relative luminance, the WCAG way — an independent check that "stronger is
// darker" holds at every step, not just at the stops the ramp is built from.
const luminance = (hex: string) => {
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const n = parseInt(hex.slice(1), 16);
  return (
    0.2126 * lin(((n >> 16) & 255) / 255) +
    0.7152 * lin(((n >> 8) & 255) / 255) +
    0.0722 * lin((n & 255) / 255)
  );
};

describe('weightShade', () => {
  it('anchors the extremes: full strength is the deep stop, zero the faint one', () => {
    expect(weightShade(1)).toBe(RIBBON_DEEP);
    expect(weightShade(0)).toBe(RIBBON_FAINT);
  });

  it('darkens strictly with strength across the whole ramp', () => {
    for (let i = 1; i <= 20; i++) {
      expect(luminance(weightShade(i / 20))).toBeLessThan(luminance(weightShade((i - 1) / 20)));
    }
  });

  it('clamps out-of-range strengths instead of extrapolating', () => {
    expect(weightShade(1.5)).toBe(weightShade(1));
    expect(weightShade(-0.2)).toBe(weightShade(0));
  });

  it('always returns a six-digit hex', () => {
    for (let i = 0; i <= 40; i++) expect(weightShade(i / 40)).toMatch(/^#[0-9a-f]{6}$/);
  });
});
