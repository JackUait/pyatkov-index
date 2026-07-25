import { describe, expect, it } from 'vitest';
import { sweepDelay, waveDelays } from '../arrival.ts';

describe('sweepDelay', () => {
  it('starts the leftmost element immediately', () => {
    expect(sweepDelay(0, 0, 100, 0.5)).toBe(0);
  });

  it('starts the rightmost element as the sweep leaves the viewport', () => {
    expect(sweepDelay(100, 0, 100, 0.5)).toBe(0.5);
  });

  it('places an element halfway across at half the span', () => {
    expect(sweepDelay(50, 0, 100, 0.5)).toBe(0.25);
  });

  it('is independent of where the row starts', () => {
    expect(sweepDelay(250, 200, 400, 0.6)).toBeCloseTo(0.15, 6);
  });

  it('clamps anything outside the measured range', () => {
    expect(sweepDelay(-40, 0, 100, 0.5)).toBe(0);
    expect(sweepDelay(140, 0, 100, 0.5)).toBe(0.5);
  });

  it('does not divide by zero when every element shares one column', () => {
    expect(sweepDelay(80, 80, 80, 0.5)).toBe(0);
  });
});

describe('waveDelays', () => {
  it('spreads a row of columns across the span in position order', () => {
    expect(waveDelays([0, 50, 100], 0.5)).toEqual([0, 0.25, 0.5]);
  });

  it('keys off position, not DOM order — a grid wraps but the wave does not', () => {
    // Two courses of three: the wave crosses left to right regardless of which
    // row a door sits in, which is the whole point of measuring rather than
    // counting.
    expect(waveDelays([0, 50, 100, 0, 50, 100], 0.6)).toEqual([0, 0.3, 0.6, 0, 0.3, 0.6]);
  });

  it('returns all zeros for a single column', () => {
    expect(waveDelays([12, 12], 0.5)).toEqual([0, 0]);
  });

  it('handles an empty wall', () => {
    expect(waveDelays([], 0.5)).toEqual([]);
  });

  it('measures against the given frame, not the elements own extent', () => {
    // The wall sits in the right third of a 1200px viewport. Measured against
    // itself the first door would start at 0; measured against the viewport the
    // gesture actually crosses, it starts two thirds of the way through — which
    // is when the sweep gets there.
    const delays = waveDelays([800, 1000, 1200], 0.6, { left: 0, right: 1200 });
    [0.4, 0.5, 0.6].forEach((want, i) => expect(delays[i]).toBeCloseTo(want, 6));
  });

  it('falls back to the elements own extent when no frame is given', () => {
    expect(waveDelays([800, 1000, 1200], 0.6)).toEqual([0, 0.3, 0.6]);
  });
});
