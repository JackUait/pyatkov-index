import { describe, expect, it } from 'vitest';
import { EMPTY_PICK, cancel, compareUrl, pick } from '../compare-pick.ts';

describe('pick', () => {
  it('holds the first country and asks for nothing yet', () => {
    const { state, pair } = pick(EMPTY_PICK, 'KOR');
    expect(state.first).toBe('KOR');
    expect(pair).toBeNull();
  });

  it('returns the pair once a second country is picked', () => {
    const { state, pair } = pick({ first: 'KOR' }, 'JPN');
    expect(pair).toEqual(['KOR', 'JPN']);
    expect(state.first).toBeNull();
  });

  it('keeps the pair in pick order, so the URL matches what the reader chose', () => {
    expect(pick({ first: 'JPN' }, 'KOR').pair).toEqual(['JPN', 'KOR']);
  });

  it('un-picks when the same country is chosen twice', () => {
    const { state, pair } = pick({ first: 'KOR' }, 'KOR');
    expect(state.first).toBeNull();
    expect(pair).toBeNull();
  });

  it('is case-insensitive about the code it is handed', () => {
    expect(pick({ first: 'KOR' }, 'kor').state.first).toBeNull();
    expect(pick(EMPTY_PICK, 'kor').state.first).toBe('KOR');
  });
});

describe('cancel', () => {
  it('drops the held country', () => {
    expect(cancel({ first: 'KOR' })).toEqual(EMPTY_PICK);
  });

  it('is harmless when nothing is held', () => {
    expect(cancel(EMPTY_PICK)).toEqual(EMPTY_PICK);
  });
});

describe('compareUrl', () => {
  it('builds a query the compare page can read', () => {
    expect(compareUrl('/pyatkov-index/', 'passport', 'KOR', 'JPN')).toBe(
      '/pyatkov-index/compare/?kind=passport&a=kor&b=jpn',
    );
  });

  it('works at the site root, where the base is a single slash', () => {
    expect(compareUrl('/', 'destination', 'USA', 'DEU')).toBe('/compare/?kind=destination&a=usa&b=deu');
  });
});
