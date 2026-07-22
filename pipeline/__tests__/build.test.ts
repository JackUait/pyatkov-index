import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildMetadata, hdiLatestYear, sanityGuards, wbYearSummary } from '../build.ts';
import { parseVisaMatrix } from '../ingest.ts';
import { loadSignals, parseArrivals, parseHdiCsv, parseWorldBankJson, type Override } from '../signals.ts';
import { computeWeights } from '../weights.ts';
import { computeScores } from '../scores.ts';

// ---------------------------------------------------------------------------
// Real refreshed data, run through the real pipeline (no fixtures) so the
// guards and metadata are exercised against the actual shipped numbers (B3).
// ---------------------------------------------------------------------------
const RAW = join(import.meta.dirname, '..', '..', 'data', 'raw');
const read = (f: string) => readFileSync(join(RAW, f), 'utf8');

const matrix = parseVisaMatrix(read('passport-index-matrix-iso3.csv'));
const overrides = JSON.parse(read('manual-overrides.json')) as Record<string, Override>;
const countries = JSON.parse(read('countries.json')) as Record<string, { name: string; iso2: string }>;
for (const [iso3, o] of Object.entries(overrides)) countries[iso3] ??= { name: o.name, iso2: o.iso2 };
const names = new Map(matrix.countries.map((c) => [c, countries[c]?.name ?? c]));
const arrivalsByIso = parseArrivals(read('arrivals.json'));
const arrivals = new Map([...arrivalsByIso].map(([iso3, { value }]) => [iso3, value]));
const gdpBody = read('gdp.json');
const migrantsBody = read('migrants.json');
const hdiCsv = read('hdi.csv');
const signals = loadSignals(
  matrix.countries,
  { gdp: parseWorldBankJson(gdpBody), arrivals, hdi: parseHdiCsv(hdiCsv), migrants: parseWorldBankJson(migrantsBody) },
  overrides,
);
const weights = computeWeights(signals, names);
const rows = computeScores(matrix, weights, names);

describe('sanityGuards (B2 + B3 build-corruption guards)', () => {
  it('passes on the real refreshed data', () => {
    expect(() => sanityGuards(weights, rows, matrix.countries.length)).not.toThrow();
  });

  // B2 — the fail-open bug: findIndex returns -1 for a missing USA and `-1 > 10`
  // is false, so the guard used to PASS on the exact condition it exists to catch.
  it('throws when USA is ABSENT from the weights (the fail-open case)', () => {
    const noUsa = weights.filter((w) => w.iso3 !== 'USA');
    expect(() => sanityGuards(noUsa, rows, matrix.countries.length)).toThrow(/USA weight rank/);
  });

  it('throws when USA is present but ranks outside the top 10', () => {
    const usa = weights.find((w) => w.iso3 === 'USA')!;
    const demoted = weights.filter((w) => w.iso3 !== 'USA');
    demoted.splice(20, 0, usa); // USA now at index 20 (rank 21)
    expect(() => sanityGuards(demoted, rows, matrix.countries.length)).toThrow(/USA weight rank/);
  });

  it('throws on an out-of-range country count', () => {
    expect(() => sanityGuards(weights, rows, 150)).toThrow(/country count/);
  });

  it('throws when the top-ranked passports lose all face validity', () => {
    const scrambled = rows.map((r) => ({ ...r, iso3: 'ZZ' + r.iso3.slice(2) }));
    expect(() => sanityGuards(weights, scrambled, matrix.countries.length)).toThrow(/top 10/);
  });

  it('throws when a required large-economy weight is missing (thesis trio incomputable)', () => {
    const noDeu = weights.filter((w) => w.iso3 !== 'DEU');
    // USA still present & top-ranked, count fine, faces fine -> the DEU-missing thesis guard must fire.
    expect(() => sanityGuards(noDeu, rows, matrix.countries.length)).toThrow(/DEU|thesis/);
  });

  it('throws when a single destination is winner-take-all (> 8% weight share)', () => {
    const blown = weights.map((w) => (w.iso3 === 'USA' ? { ...w, weight: w.weight * 50 } : w));
    expect(() => sanityGuards(blown, rows, matrix.countries.length)).toThrow(/share|winner/i);
  });

  it('throws when a score falls outside [0, 100]', () => {
    const bad = rows.map((r, i) => (i === 0 ? { ...r, score: 142 } : r));
    expect(() => sanityGuards(weights, bad, matrix.countries.length)).toThrow(/score/i);
  });
});

describe('shipped invariants snapshot (B3)', () => {
  it('pins the structural invariants of the shipped outputs', () => {
    expect(matrix.countries.length).toBe(199);
    expect(weights.length).toBe(matrix.countries.length);
    // USA is the single most valuable destination on the redesigned weights.
    expect(weights[0].iso3).toBe('USA');
    // The strongest passports are the Henley-like high-mobility set.
    const top10 = rows.slice(0, 10).map((r) => r.iso3);
    for (const c of ['KOR', 'SGP', 'JPN']) expect(top10).toContain(c);
  });

  it('every passport reaches all n counted cells (self counted visa-free) and a bounded score', () => {
    const n = matrix.countries.length;
    for (const r of rows) {
      const counted = Object.values(r.counts).reduce((a, b) => a + b, 0);
      expect(counted).toBe(n); // self counted as visa-free (self-inclusion)
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
      expect(r.delta).toBe(r.equalRank - r.rank);
    }
  });

  it('every weighted destination is a real matrix country and carries >= 1 signal', () => {
    const set = new Set(matrix.countries);
    for (const w of weights) {
      expect(set.has(w.iso3)).toBe(true);
      expect(w.signalsUsed).toBeGreaterThanOrEqual(1);
    }
  });
});

describe('buildMetadata (B9 — honest labels + per-signal vintages)', () => {
  const meta = buildMetadata({
    totalDestinations: matrix.countries.length,
    gdpBody,
    migrantsBody,
    hdiCsv,
    arrivalsByIso,
  });

  it('labels the pipeline run date as a BUILD date, not a data snapshot', () => {
    expect(meta.builtAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // The misleading single "generatedAt/snapshot" vintage field is gone.
    expect((meta as unknown as Record<string, unknown>).generatedAt).toBeUndefined();
  });

  it('discloses a per-signal vintage for every signal', () => {
    expect(Object.keys(meta.vintages).sort()).toEqual(['arrivals', 'gdp', 'hdi', 'matrix', 'migrants']);
    // HDI comes from the HDR 2025 file, whose latest composite column is hdi_2023.
    expect(meta.vintages.hdi.year).toBe(2023);
    // Arrivals are a single pre-COVID year per country, preferring 2019.
    expect(meta.vintages.arrivals.preferredYear).toBe(2019);
    // GDP/migrants disclose their own observation years, not the build date.
    expect(meta.vintages.gdp.modalYear).toBeGreaterThanOrEqual(2011);
    expect(meta.vintages.migrants.modalYear).toBe(2024);
    // The matrix vintage names the successor source, not the archived repo.
    expect(meta.vintages.matrix.source).toMatch(/imorte/);
  });

  it('carries totalDestinations through unchanged', () => {
    expect(meta.totalDestinations).toBe(matrix.countries.length);
  });
});

describe('wbYearSummary (World Bank observation-year disclosure)', () => {
  it('summarizes the min / max / modal observation year of a WB indicator payload', () => {
    const body = JSON.stringify([
      { page: 1 },
      [
        { countryiso3code: 'AAA', date: '2020', value: 1 },
        { countryiso3code: 'BBB', date: '2024', value: 2 },
        { countryiso3code: 'CCC', date: '2024', value: 3 },
        { countryiso3code: 'DDD', date: '2019', value: null }, // nulls ignored
        { countryiso3code: 'XX', date: '2024', value: 9 }, // non-ISO3 ignored
      ],
    ]);
    expect(wbYearSummary(body)).toEqual({ min: 2020, max: 2024, modal: 2024 });
  });
});

describe('hdiLatestYear (HDR column-year disclosure)', () => {
  it('reads the latest hdi_<year> column from the HDR header', () => {
    const csv = 'iso3,country,hdi_2021,hdi_2022,hdi_2023,hdi_m_2023\nXXX,Foo,0.5,0.6,0.7,0.7\n';
    expect(hdiLatestYear(csv)).toBe(2023);
  });
});
