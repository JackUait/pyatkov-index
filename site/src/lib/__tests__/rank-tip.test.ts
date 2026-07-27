import { describe, expect, it } from 'vitest';
import { tipX } from '../rank-tip.ts';

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
