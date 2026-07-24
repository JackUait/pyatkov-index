import { describe, expect, it } from 'vitest';
import { openToAllCount, openToHalfCount, openToNoneCount } from '../doors.ts';

describe('openToHalfCount', () => {
  it('counts destinations strictly above the half-the-world line', () => {
    expect(openToHalfCount([100, 50.01, 50, 49.9, 0])).toBe(2);
  });

  it('is zero for an empty table', () => {
    expect(openToHalfCount([])).toBe(0);
  });
});

describe('openToAllCount', () => {
  it('counts every score the site displays as 100.0', () => {
    expect(openToAllCount([100, 99.96, 99.94, 42])).toBe(2);
  });
});

describe('openToNoneCount', () => {
  it('counts every score the site displays as 0.0', () => {
    expect(openToNoneCount([0, 0.04, 0.06, 42])).toBe(2);
  });
});
