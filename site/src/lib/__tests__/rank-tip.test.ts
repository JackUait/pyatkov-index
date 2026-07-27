import { describe, expect, it } from 'vitest';
import { coldWarmth, stepWarmth, tipX, TIP_DELAY_MS, TIP_GRACE_MS } from '../rank-tip.ts';

describe('stepWarmth', () => {
  const a = { id: 'a' } as unknown as Element;
  const b = { id: 'b' } as unknown as Element;
  // A row event, at the delay and grace the page actually runs.
  const step = (w: ReturnType<typeof coldWarmth>, row: Element | null, time: number) =>
    stepWarmth(w, row, time, TIP_DELAY_MS, TIP_GRACE_MS);

  it('starts cold, so the first row waits out the reveal delay', () => {
    expect(step(coldWarmth(), a, 0).warm).toBe(false);
  });

  it('stays cold while the pointer sweeps past a row faster than the delay', () => {
    let w = step(coldWarmth(), a, 0);
    w = step(w, a, TIP_DELAY_MS - 40);
    w = step(w, b, TIP_DELAY_MS - 20);
    expect(w.warm).toBe(false);
  });

  it('warms on the move away from a rested row, which emitted no events of its own', () => {
    let w = step(coldWarmth(), a, 0);
    w = step(w, b, TIP_DELAY_MS + 200);
    expect(w.warm).toBe(true);
  });

  it('warms once one row has been held for the delay — its tip is out', () => {
    let w = step(coldWarmth(), a, 0);
    w = step(w, a, TIP_DELAY_MS);
    expect(w.warm).toBe(true);
  });

  it('carries warmth to the next row, so the tip hands over without a wait', () => {
    let w = step(coldWarmth(), a, 0);
    w = step(w, a, TIP_DELAY_MS);
    w = step(w, b, TIP_DELAY_MS + 10);
    expect(w.warm).toBe(true);
  });

  it('carries warmth across the gap between the two ledgers', () => {
    let w = step(coldWarmth(), a, 0);
    w = step(w, a, TIP_DELAY_MS);
    w = step(w, null, TIP_DELAY_MS + 10); // out of one ledger…
    w = step(w, b, TIP_DELAY_MS + 40); // …and straight into the other
    expect(w.warm).toBe(true);
  });

  it('counts the rested row on the way out, so the other ledger opens at once', () => {
    let w = step(coldWarmth(), a, 0);
    w = step(w, null, TIP_DELAY_MS + 100); // read the tip, then leave for the gutter
    w = step(w, b, TIP_DELAY_MS + 130);
    expect(w.warm).toBe(true);
  });

  it('cools once the pointer has been away longer than the grace', () => {
    let w = step(coldWarmth(), a, 0);
    w = step(w, a, TIP_DELAY_MS);
    w = step(w, null, TIP_DELAY_MS + 10);
    w = step(w, b, TIP_DELAY_MS + 10 + TIP_GRACE_MS + 1);
    expect(w.warm).toBe(false);
  });

  it('keeps warmth however long a row is read, since the grace counts time away', () => {
    let w = step(coldWarmth(), a, 0);
    w = step(w, a, TIP_DELAY_MS);
    w = step(w, b, TIP_DELAY_MS + TIP_GRACE_MS * 10);
    expect(w.warm).toBe(true);
  });
});

describe('tipX', () => {
  it('centers the tip on the pointer when there is room on both sides', () => {
    expect(tipX(300, 500, 200)).toBe(300);
  });

  it('clamps at the left edge so the tip never spills before the row', () => {
    expect(tipX(20, 500, 200)).toBe(100);
  });

  it('clamps at the right edge so the tip never spills past the row', () => {
    expect(tipX(480, 500, 200)).toBe(400);
  });

  it('centers a tip as wide as the row instead of pinning it to one edge', () => {
    expect(tipX(10, 300, 340)).toBe(150);
    expect(tipX(290, 300, 340)).toBe(150);
  });
});
