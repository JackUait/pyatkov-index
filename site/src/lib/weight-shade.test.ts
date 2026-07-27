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

// WCAG contrast ratio, for the one slat that carries a white in-mark label.
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

// OKLCH chroma and hue, independently derived (Ottosson's reference matrices),
// so the stops' character — burnt, not muddy — is pinned by measurement.
const oklch = (hex: string) => {
  const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const n = parseInt(hex.slice(1), 16);
  const r = lin(((n >> 16) & 255) / 255);
  const g = lin(((n >> 8) & 255) / 255);
  const b = lin((n & 255) / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return {
    C: Math.hypot(A, B),
    H: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360,
  };
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

  // Darkening yellow without bending it lands in mud: the deep stop must lean
  // toward orange (hue well under marigold's 76°) and keep its fire (chroma),
  // so the heavy end reads as burnt amber, never chocolate.
  it('burns orange at the deep end instead of going muddy', () => {
    const { C, H } = oklch(RIBBON_DEEP);
    expect(H).toBeGreaterThan(40);
    expect(H).toBeLessThan(62);
    expect(C).toBeGreaterThanOrEqual(0.12);
  });

  it('keeps the extreme slat legible under its white label', () => {
    expect(contrast('#ffffff', RIBBON_DEEP)).toBeGreaterThanOrEqual(4.5);
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

  // Dead-neutral gray goes cold and dirty against warm paper. Every band tips
  // the same way the paper does — red over green over blue — with a tint wide
  // enough to read as warmth but too quiet to ever read as a third color.
  it('wears the paper\'s warmth at every step: greige, never concrete', () => {
    for (let i = 0; i <= 20; i++) {
      const n = parseInt(tailShade(i / 20).slice(1), 16);
      const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      expect(r).toBeGreaterThanOrEqual(g);
      expect(g).toBeGreaterThanOrEqual(b);
      expect(r - b).toBeGreaterThanOrEqual(6);
      expect(r - b).toBeLessThanOrEqual(18);
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
