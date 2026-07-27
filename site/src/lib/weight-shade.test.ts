import { describe, expect, it } from 'vitest';
import {
  RIBBON_DEEP,
  PAPER,
  RIBBON_FAINT,
  TAIL_DEEP,
  TAIL_FAINT,
  TAIL_STEPS,
  tailShade,
  weightShade,
} from './weight-shade.ts';

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

// The tail wears the logotype's second ink: neutral gray, not amber, so the
// strip carries the same warm-to-neutral boundary the brand mark does.
describe('tailShade', () => {
  it('anchors the extremes and clamps out-of-range strengths', () => {
    expect(tailShade(1)).toBe(TAIL_DEEP);
    expect(tailShade(0)).toBe(TAIL_FAINT);
    expect(tailShade(1.5)).toBe(tailShade(1));
    expect(tailShade(-0.2)).toBe(tailShade(0));
  });

  it('quantizes to a fixed set of bands rather than fading slat by slat', () => {
    const seen = new Set<string>();
    for (let i = 0; i <= 400; i++) seen.add(tailShade(i / 400));
    expect(seen.size).toBe(TAIL_STEPS);
  });

  it('darkens strictly from band to band', () => {
    for (let i = 1; i < TAIL_STEPS; i++) {
      const step = i / (TAIL_STEPS - 1);
      const prev = (i - 1) / (TAIL_STEPS - 1);
      expect(luminance(tailShade(step))).toBeLessThan(luminance(tailShade(prev)));
    }
  });

  it('separates neighbouring bands enough to be seen side by side', () => {
    for (let i = 1; i < TAIL_STEPS; i++) {
      const gap =
        luminance(tailShade((i - 1) / (TAIL_STEPS - 1))) - luminance(tailShade(i / (TAIL_STEPS - 1)));
      expect(gap).toBeGreaterThan(0.04);
    }
  });

  it('never washes out into the paper it sits on', () => {
    expect(luminance(TAIL_FAINT)).toBeLessThan(luminance(PAPER) - 0.08);
  });

  it('is neutral at every step: no channel strays from the others', () => {
    for (let i = 0; i <= 20; i++) {
      const n = parseInt(tailShade(i / 20).slice(1), 16);
      const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      expect(Math.max(r, g, b) - Math.min(r, g, b)).toBeLessThanOrEqual(4);
    }
  });

  it('stays lighter than the head ramp, so the heavy half still leads', () => {
    for (let i = 0; i <= 20; i++) {
      expect(luminance(tailShade(i / 20))).toBeGreaterThan(luminance(RIBBON_DEEP));
    }
  });

  it('spans enough range to read as a decay, not one flat wash', () => {
    expect(luminance(TAIL_FAINT) - luminance(TAIL_DEEP)).toBeGreaterThan(0.3);
  });

  it('always returns a six-digit hex', () => {
    for (let i = 0; i <= 40; i++) expect(tailShade(i / 40)).toMatch(/^#[0-9a-f]{6}$/);
  });
});
