import { describe, expect, it } from 'vitest';
import { countLabel, queryMatches } from '../dest-search.ts';

describe('queryMatches', () => {
  // Blobs as searchIndex() builds them: lowercased names, codes and aliases.
  const blobs = ['türkiye turkey tur tr', 'united states usa us', 'south korea kor kr'];

  it('shows everything for an empty or whitespace query', () => {
    expect(queryMatches(blobs, '')).toEqual([true, true, true]);
    expect(queryMatches(blobs, '   ')).toEqual([true, true, true]);
  });

  it('is case-insensitive and ignores surrounding whitespace', () => {
    expect(queryMatches(blobs, '  TURKEY ')).toEqual([true, false, false]);
  });

  it('matches substrings anywhere in the blob, codes and aliases included', () => {
    expect(queryMatches(blobs, 'kor')).toEqual([false, false, true]);
    expect(queryMatches(blobs, 'usa')).toEqual([false, true, false]);
  });

  it('matches nothing when no blob contains the query', () => {
    expect(queryMatches(blobs, 'atlantis')).toEqual([false, false, false]);
  });
});

describe('countLabel', () => {
  it('shows the plain total when not filtering', () => {
    expect(countLabel(114, 114, false)).toBe('114');
  });

  it('shows "shown of total" while a filter narrows the group', () => {
    expect(countLabel(3, 114, true)).toBe('3 of 114');
  });

  it('collapses back to the total when the filter matches the whole group', () => {
    expect(countLabel(114, 114, true)).toBe('114');
  });
});
