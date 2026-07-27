import { describe, expect, it } from 'vitest';
import { hundredCells, type HundredCell } from '../hundred.ts';

// The grid is emitted in DOM order (top-left → bottom-right) while the pour
// index `i` runs bottom-left → top-right, so the marigold mass sits on the
// floor and builds upward on load.
const byPour = (cells: HundredCell[]) => [...cells].sort((a, b) => a.i - b.i);
const count = (cells: HundredCell[], kind: HundredCell['kind']) => cells.filter((c) => c.kind === kind).length;

describe('hundredCells (the passport spread: score drawn as 100 point-squares)', () => {
  it('always emits exactly 100 cells covering pour indexes 0–99 once each', () => {
    const cells = hundredCells(94.4);
    expect(cells).toHaveLength(100);
    expect(new Set(cells.map((c) => c.i)).size).toBe(100);
    expect(Math.min(...cells.map((c) => c.i))).toBe(0);
    expect(Math.max(...cells.map((c) => c.i))).toBe(99);
  });

  it('emits rows top-down while the pour index climbs bottom-up', () => {
    const cells = hundredCells(50);
    // DOM row 0 (top) holds pour indexes 90..99, left to right.
    expect(cells.slice(0, 10).map((c) => c.i)).toEqual([90, 91, 92, 93, 94, 95, 96, 97, 98, 99]);
    // DOM last row (bottom) holds pour indexes 0..9.
    expect(cells.slice(90).map((c) => c.i)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('splits 94.4 into 94 earned, one partial at 0.4, five locked — locked at the top of the pour', () => {
    const cells = byPour(hundredCells(94.4));
    expect(count(cells, 'gold')).toBe(94);
    expect(count(cells, 'part')).toBe(1);
    expect(count(cells, 'lock')).toBe(5);
    expect(cells[94].kind).toBe('part');
    expect(cells[94].part).toBeCloseTo(0.4, 9);
    cells.slice(0, 94).forEach((c) => expect(c.kind).toBe('gold'));
    cells.slice(95).forEach((c) => expect(c.kind).toBe('lock'));
  });

  it('agrees with the displayed one-decimal score, not the raw float', () => {
    // fmt() shows 93.97 as "94.0": the grid must show 94 whole squares, no sliver.
    const cells = hundredCells(93.97);
    expect(count(cells, 'gold')).toBe(94);
    expect(count(cells, 'part')).toBe(0);
    expect(count(cells, 'lock')).toBe(6);
  });

  it('holds at both extremes of the index', () => {
    const full = hundredCells(100);
    expect(count(full, 'gold')).toBe(100);
    expect(count(full, 'part')).toBe(0);

    const empty = hundredCells(0);
    expect(count(empty, 'lock')).toBe(100);

    const low = hundredCells(12.3);
    expect(count(low, 'gold')).toBe(12);
    expect(byPour(low)[12].part).toBeCloseTo(0.3, 9);
    expect(count(low, 'lock')).toBe(87);
  });

  it('clamps out-of-range scores instead of emitting phantom squares', () => {
    expect(count(hundredCells(101.2), 'gold')).toBe(100);
    expect(count(hundredCells(-3), 'lock')).toBe(100);
  });

  it('only partial cells carry a part value', () => {
    hundredCells(94.4).forEach((c) => {
      if (c.kind === 'part') expect(c.part).toBeGreaterThan(0);
      else expect(c.part).toBeUndefined();
    });
  });
});
