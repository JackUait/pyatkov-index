import { describe, expect, it } from 'vitest';
import { stripTicks, type StripTick } from '../strip.ts';

// The anatomy strip is the hero's hundred unrolled: 100 one-point ticks laid
// 0–100, each inked by the tier whose span covers it. A boundary that falls
// inside a tick splits it — the hc-part waterline turned on its side — so the
// tick carries every span crossing it, each with the fraction where it ends.

const ticksWith = (ticks: StripTick[], tier: string) => ticks.filter((t) => t.spans.some((s) => s.tier === tier));

describe('stripTicks (the anatomy strip: tier spans cut into 100 point-ticks)', () => {
  it('always emits exactly 100 ticks, indexed 0–99, each closing at its own edge', () => {
    const ticks = stripTicks([
      { tier: 'visa-free', points: 69.1 },
      { tier: 'visa-on-arrival', points: 24.4 },
      { tier: 'e-visa', points: 0.9 },
      { tier: 'visa-required', points: 5.6 },
    ]);
    expect(ticks).toHaveLength(100);
    expect(ticks.map((t) => t.i)).toEqual(Array.from({ length: 100 }, (_, i) => i));
    for (const t of ticks) {
      expect(t.spans.length).toBeGreaterThan(0);
      // The last span always closes the tick exactly, so a gradient never
      // leaks a sliver of unpainted tick at the right edge.
      expect(t.spans[t.spans.length - 1].to).toBe(1);
      // Cuts run strictly left to right.
      for (let j = 1; j < t.spans.length; j++) expect(t.spans[j].to).toBeGreaterThan(t.spans[j - 1].to);
    }
  });

  it('gives whole-number spans clean single-tier ticks', () => {
    const ticks = stripTicks([
      { tier: 'a', points: 60 },
      { tier: 'b', points: 40 },
    ]);
    expect(ticks[0].spans).toEqual([{ tier: 'a', to: 1 }]);
    expect(ticks[59].spans).toEqual([{ tier: 'a', to: 1 }]);
    expect(ticks[60].spans).toEqual([{ tier: 'b', to: 1 }]);
    expect(ticks[99].spans).toEqual([{ tier: 'b', to: 1 }]);
  });

  it('splits a boundary tick at the fraction where the earlier span stops', () => {
    const ticks = stripTicks([
      { tier: 'visa-free', points: 69.1 },
      { tier: 'visa-on-arrival', points: 24.4 },
      { tier: 'e-visa', points: 0.9 },
      { tier: 'visa-required', points: 5.6 },
    ]);
    // Tick 69 covers points 69–70: visa-free holds the first tenth.
    expect(ticks[69].spans.map((s) => s.tier)).toEqual(['visa-free', 'visa-on-arrival']);
    expect(ticks[69].spans[0].to).toBeCloseTo(0.1, 5);
    // Tick 93 covers 93–94: on-arrival to the score's half-point, then the
    // eVisa fifth begins.
    expect(ticks[93].spans.map((s) => s.tier)).toEqual(['visa-on-arrival', 'e-visa']);
    expect(ticks[93].spans[0].to).toBeCloseTo(0.5, 5);
    // Tick 94 covers 94–95: the eVisa fifth ends at 94.4 and the locked tail
    // takes the rest of the line.
    expect(ticks[94].spans.map((s) => s.tier)).toEqual(['e-visa', 'visa-required']);
    expect(ticks[94].spans[0].to).toBeCloseTo(0.4, 5);
    expect(ticks[95].spans).toEqual([{ tier: 'visa-required', to: 1 }]);
  });

  it('covers both extremes of the index: a full line and a nearly locked one', () => {
    const full = stripTicks([{ tier: 'visa-free', points: 100 }]);
    expect(full.every((t) => t.spans.length === 1 && t.spans[0].tier === 'visa-free')).toBe(true);

    const low = stripTicks([
      { tier: 'visa-free', points: 2.5 },
      { tier: 'visa-required', points: 97.5 },
    ]);
    expect(low[2].spans.map((s) => s.tier)).toEqual(['visa-free', 'visa-required']);
    expect(ticksWith(low, 'visa-free')).toHaveLength(3);
    expect(low[99].spans).toEqual([{ tier: 'visa-required', to: 1 }]);
  });

  it('stretches the last span to close the line when dropped slivers leave it short', () => {
    // The caller drops sub-0.05 spans (the page hides figures below the
    // displayed precision), so the laid spans can sum a hair under 100.
    const ticks = stripTicks([
      { tier: 'a', points: 50 },
      { tier: 'b', points: 49.9 },
    ]);
    expect(ticks).toHaveLength(100);
    expect(ticks[99].spans).toEqual([{ tier: 'b', to: 1 }]);
  });

  it('drops float-noise slivers instead of painting hairlines', () => {
    // A span ending 0.005 into a tick is below any visible width; the tick
    // reads as its real occupant alone.
    const ticks = stripTicks([
      { tier: 'a', points: 50.005 },
      { tier: 'b', points: 49.995 },
    ]);
    expect(ticks[50].spans).toEqual([{ tier: 'b', to: 1 }]);

    // Thirds put float noise on every third boundary; every tick still closes
    // at exactly 1 with strictly ordered cuts.
    const thirds = stripTicks([
      { tier: 'a', points: 100 / 3 },
      { tier: 'b', points: 100 / 3 },
      { tier: 'c', points: 100 / 3 },
    ]);
    for (const t of thirds) {
      expect(t.spans[t.spans.length - 1].to).toBe(1);
      for (let j = 1; j < t.spans.length; j++) expect(t.spans[j].to).toBeGreaterThan(t.spans[j - 1].to);
    }
  });

  it('ignores empty spans and returns nothing when no span has any points', () => {
    const ticks = stripTicks([
      { tier: 'ghost', points: 0 },
      { tier: 'a', points: 100 },
    ]);
    expect(ticks.every((t) => t.spans.length === 1 && t.spans[0].tier === 'a')).toBe(true);
    expect(stripTicks([])).toEqual([]);
  });
});
