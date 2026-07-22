import { describe, expect, it } from 'vitest';
import { displayName, formatBuiltDate, matchesSearch, reconcilePoints, searchIndex } from '../format.ts';

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('reconcilePoints (B5 — tier points sum to the displayed score)', () => {
  it('forces the rounded parts to sum to round(total, 1) even when naive rounding drifts up', () => {
    // NOR-like case: raw parts sum to 84.8 but each rounds up independently.
    const raw = [63.95, 16.45, 4.35, 0.05]; // naive toFixed(1) drifts to 84.9
    const out = reconcilePoints(raw, 84.8);
    expect(sum(out)).toBeCloseTo(84.8, 9);
    // every displayed part stays within one rounding unit of its true value
    out.forEach((v, i) => expect(Math.abs(v - raw[i])).toBeLessThanOrEqual(0.1 + 1e-9));
  });

  it('matches the score when raw parts already round cleanly', () => {
    const raw = [50, 20, 10, 0];
    const out = reconcilePoints(raw, 80);
    expect(sum(out)).toBeCloseTo(80, 9);
    expect(out).toEqual([50, 20, 10, 0]);
  });

  it('handles an all-zero passport (nothing reachable) without NaN', () => {
    const out = reconcilePoints([0, 0, 0, 0], 0);
    expect(sum(out)).toBe(0);
    out.forEach((v) => expect(Number.isFinite(v)).toBe(true));
  });

  it('reconciles down when naive rounding overshoots below the target', () => {
    // raw sums to 30.2, but target score is 30.1 (rounding of the authoritative score differs)
    const raw = [15.06, 10.06, 5.06, 0.02];
    const out = reconcilePoints(raw, 30.1);
    expect(sum(out)).toBeCloseTo(30.1, 9);
  });

  it('never pushes a zero tier (visa-required) negative when it overshoots down', () => {
    // Raw parts sum to 84.9 but the authoritative score is 84.8; the last tier
    // is an exact zero (visa-required credit is always 0).
    const raw = [64.2, 16.4, 4.3, 0.0];
    const out = reconcilePoints(raw, 84.8);
    expect(sum(out)).toBeCloseTo(84.8, 9);
    out.forEach((v) => expect(v).toBeGreaterThanOrEqual(0));
    expect(out[3]).toBe(0); // the zero tier stays zero, not -0.1
  });
});

describe('formatBuiltDate (human-readable build date for display)', () => {
  it('formats an ISO date as a readable English date', () => {
    expect(formatBuiltDate('2026-07-22')).toBe('July 22, 2026');
    expect(formatBuiltDate('2025-01-03')).toBe('January 3, 2025');
  });

  it('passes through strings that are not ISO dates', () => {
    expect(formatBuiltDate('')).toBe('');
    expect(formatBuiltDate('unknown')).toBe('unknown');
  });
});

describe('displayName (B8 — passport-entity names, not World Bank economy labels)', () => {
  it('renders Palestine and Nauru correctly', () => {
    expect(displayName('PSE', 'West Bank and Gaza')).toBe('Palestine');
    expect(displayName('NRU', 'Naoero')).toBe('Nauru');
  });

  it('normalizes other confusing World Bank labels', () => {
    expect(displayName('KOR', 'Korea, Rep.')).toBe('South Korea');
    expect(displayName('TUR', 'Turkiye')).toBe('Türkiye');
    expect(displayName('SVK', 'Slovak Republic')).toBe('Slovakia');
  });

  it('normalizes the remaining World Bank comma/SAR labels', () => {
    expect(displayName('HKG', 'Hong Kong SAR, China')).toBe('Hong Kong');
    expect(displayName('MAC', 'Macao SAR, China')).toBe('Macao');
    expect(displayName('BHS', 'Bahamas, The')).toBe('The Bahamas');
    expect(displayName('GMB', 'Gambia, The')).toBe('The Gambia');
    expect(displayName('FSM', 'Micronesia, Fed. Sts.')).toBe('Micronesia');
    expect(displayName('YEM', 'Yemen, Rep.')).toBe('Yemen');
    expect(displayName('SOM', 'Somalia, Fed. Rep.')).toBe('Somalia');
  });

  it('falls back to the supplied name when there is no override', () => {
    expect(displayName('DEU', 'Germany')).toBe('Germany');
    expect(displayName('JPN', 'Japan')).toBe('Japan');
  });
});

describe('matchesSearch / searchIndex (B8 — search matches name, iso3, iso2, aliases)', () => {
  const rows = {
    PSE: { name: 'West Bank and Gaza', iso3: 'PSE', iso2: 'PS' },
    TUR: { name: 'Turkiye', iso3: 'TUR', iso2: 'TR' },
    KOR: { name: 'Korea, Rep.', iso3: 'KOR', iso2: 'KR' },
    VNM: { name: 'Viet Nam', iso3: 'VNM', iso2: 'VN' },
    NRU: { name: 'Naoero', iso3: 'NRU', iso2: 'NR' },
    CZE: { name: 'Czechia', iso3: 'CZE', iso2: 'CZ' },
    CIV: { name: "Cote d'Ivoire", iso3: 'CIV', iso2: 'CI' },
    CPV: { name: 'Cabo Verde', iso3: 'CPV', iso2: 'CV' },
    LAO: { name: 'Lao PDR', iso3: 'LAO', iso2: 'LA' },
    SWZ: { name: 'Eswatini', iso3: 'SWZ', iso2: 'SZ' },
    SVK: { name: 'Slovak Republic', iso3: 'SVK', iso2: 'SK' },
    KGZ: { name: 'Kyrgyz Republic', iso3: 'KGZ', iso2: 'KG' },
    LCA: { name: 'St. Lucia', iso3: 'LCA', iso2: 'LC' },
  };

  const cases: Array<[keyof typeof rows, string]> = [
    ['PSE', 'palestine'],
    ['TUR', 'turkey'],
    ['KOR', 'south korea'],
    ['VNM', 'vietnam'],
    ['NRU', 'nauru'],
    ['CZE', 'czech republic'],
    ['CIV', 'ivory coast'],
    ['CPV', 'cape verde'],
    ['LAO', 'laos'],
    ['SWZ', 'swaziland'],
    ['SVK', 'slovakia'],
    ['KGZ', 'kyrgyzstan'],
    ['LCA', 'saint lucia'],
  ];

  it.each(cases)('%s resolves the common name "%s"', (iso3, query) => {
    expect(matchesSearch(rows[iso3], query)).toBe(true);
  });

  it('matches on iso3 and iso2 codes', () => {
    expect(matchesSearch(rows.PSE, 'pse')).toBe(true);
    expect(matchesSearch(rows.PSE, 'ps')).toBe(true);
    expect(matchesSearch(rows.KOR, 'kor')).toBe(true);
    expect(matchesSearch(rows.KOR, 'kr')).toBe(true);
  });

  it('matches on the corrected display name', () => {
    expect(matchesSearch(rows.NRU, 'nauru')).toBe(true);
    expect(matchesSearch(rows.PSE, 'palest')).toBe(true);
  });

  it('does not match unrelated queries', () => {
    expect(matchesSearch(rows.PSE, 'germany')).toBe(false);
  });

  it('searchIndex is a lowercased blob including code and alias tokens', () => {
    const idx = searchIndex(rows.TUR);
    expect(idx).toContain('turkey');
    expect(idx).toContain('tur');
    expect(idx).toContain('türkiye');
    expect(idx).toBe(idx.toLowerCase());
  });
});
