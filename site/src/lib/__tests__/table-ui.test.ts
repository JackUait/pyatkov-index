import { describe, expect, it } from 'vitest';
import { compareValues, nextAscending, sortValue } from '../table-ui.ts';

describe('sortValue', () => {
  it('reads numeric attributes as numbers so 10 sorts after 9, not before', () => {
    expect(sortValue('10')).toBe(10);
    expect(sortValue('-3.5')).toBe(-3.5);
  });

  it('reads non-numeric attributes as strings', () => {
    expect(sortValue('portugal')).toBe('portugal');
    expect(sortValue(null)).toBe('');
  });
});

describe('compareValues', () => {
  it('orders numbers numerically', () => {
    expect(compareValues('9', '10', true)).toBeLessThan(0);
    expect(compareValues('9', '10', false)).toBeGreaterThan(0);
  });

  it('orders strings by locale', () => {
    expect(compareValues('albania', 'zambia', true)).toBeLessThan(0);
    expect(compareValues('albania', 'zambia', false)).toBeGreaterThan(0);
  });

  it('reports equality for identical values in both directions', () => {
    expect(compareValues('5', '5', true)).toBe(0);
    expect(compareValues('5', '5', false)).toBe(0);
  });
});

describe('nextAscending', () => {
  const defaults = { rank: true, score: false, name: true };

  it('uses the column default the first time a column is clicked', () => {
    expect(nextAscending('score', 'rank', true, defaults)).toBe(false);
    expect(nextAscending('name', 'rank', true, defaults)).toBe(true);
  });

  it('flips direction when the same column is clicked again', () => {
    expect(nextAscending('rank', 'rank', true, defaults)).toBe(false);
    expect(nextAscending('rank', 'rank', false, defaults)).toBe(true);
  });

  it('falls back to ascending for a column with no declared default', () => {
    expect(nextAscending('mystery', 'rank', true, defaults)).toBe(true);
  });
});
