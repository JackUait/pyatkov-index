import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseVisaMatrix } from './ingest.ts';
import { loadPopulations, loadSignals, parseArrivals, parseHdiCsv, parseWorldBankJson, type Override } from './signals.ts';
import { computeWeights } from './weights.ts';
import { computeScores } from './scores.ts';
import { computeOpenness } from './openness.ts';
import type { DestinationOpenness, DestinationWeight, PassportRow } from './types.ts';

const RAW = join(import.meta.dirname, '..', 'data', 'raw');
const OUT = join(import.meta.dirname, '..', 'site', 'src', 'data');

// ---------------------------------------------------------------------------
// Sanity guards (B2 + B3). Ratio/share based so they survive the BETA-scaled
// exp weights and the successor-dataset / HDR-2025 / override refreshes. Every
// guard throws — the build fails rather than publishing corrupted numbers.
// ---------------------------------------------------------------------------
export function sanityGuards(weights: DestinationWeight[], rows: PassportRow[], countryCount: number): void {
  // 1. Country count in the expected band.
  if (countryCount < 190 || countryCount > 210) {
    throw new Error(`unexpected country count: ${countryCount}`);
  }

  // 2. Face-validity of the RANKED passports: the strongest passports must be
  //    large high-mobility economies, not noise.
  const top10 = rows.slice(0, 10).map((r) => r.iso3);
  if (!['DEU', 'FRA', 'SGP', 'JPN', 'ITA', 'ESP', 'KOR', 'SWE', 'FIN'].some((c) => top10.includes(c))) {
    throw new Error(`top 10 passports look wrong: ${top10.join(', ')}`);
  }

  // 3. USA destination-weight rank. B2: throw when USA is ABSENT (findIndex === -1,
  //    the old fail-open case, since -1 > 10 was false) OR ranks outside the top 10
  //    (idx > 9 for a 0-based index / "top 10" claim; the old `> 10` was off-by-one).
  const usaIdx = weights.findIndex((w) => w.iso3 === 'USA');
  if (usaIdx === -1 || usaIdx > 9) {
    throw new Error(`USA weight rank ${usaIdx === -1 ? 'absent' : usaIdx + 1} — weighting looks broken`);
  }

  // 4. The README thesis as a hard build guard: access to Germany + Japan + USA
  //    must outweigh access to the fifty weakest destinations (verified 1.94x; a
  //    1.30x floor catches regression from the data switch with headroom).
  const wByIso = new Map(weights.map((w) => [w.iso3, w.weight]));
  const need = (iso: string): number => {
    const v = wByIso.get(iso);
    if (v === undefined) throw new Error(`thesis guard: ${iso} missing from weights — cannot verify quality-dominates-count`);
    return v;
  };
  const trio = need('DEU') + need('JPN') + need('USA');
  const bot50 = [...weights]
    .sort((a, b) => a.weight - b.weight)
    .slice(0, 50)
    .reduce((a, w) => a + w.weight, 0);
  if (!(trio >= 1.3 * bot50)) {
    throw new Error(`thesis guard: DEU+JPN+USA weight (${trio.toFixed(3)}) does not exceed 1.30x the 50 weakest (${bot50.toFixed(3)})`);
  }

  // 5. Runaway / winner-take-all guard for the unbounded-in-principle exp(): no
  //    single destination may hold more than 8% of total weight (verified ~4.3%).
  const total = weights.reduce((a, w) => a + w.weight, 0);
  const maxShare = Math.max(...weights.map((w) => w.weight)) / total;
  if (maxShare > 0.08) {
    throw new Error(`winner-take-all guard: top destination holds ${(maxShare * 100).toFixed(1)}% of weight (> 8%)`);
  }

  // 6. Scores are bounded credit-averages: assert finite and within [0, 100]
  //    (self-inclusion keeps the ceiling at 100 — full visa-free coverage of the pool).
  for (const r of rows) {
    if (!Number.isFinite(r.score) || r.score < 0 || r.score > 100) {
      throw new Error(`score out of range for ${r.iso3}: ${r.score}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Openness guards. Same contract as sanityGuards: throw rather than publish.
// Face validity is asserted against MEMBERSHIP in generous candidate lists, not
// exact positions, so an upstream data refresh that reshuffles neighbours does
// not fail the build while a formula corruption still does.
// ---------------------------------------------------------------------------

// Destinations that admit most of the world with no prior visa (visa-free, visa
// on arrival, or eVisa). At least one must rank in the top 15.
const BROADLY_OPEN = [
  'TUR', 'MYS', 'IDN', 'THA', 'RWA', 'ETH', 'KEN', 'TZA', 'UGA', 'MDV', 'QAT',
  'ALB', 'GEO', 'ARM', 'CPV', 'JOR', 'EGY', 'LKA', 'NPL', 'KHM', 'LAO', 'BOL',
];

export function opennessGuards(openness: DestinationOpenness[]): void {
  // 1. Bounded credit-share: finite and within [0, 100].
  for (const d of openness) {
    if (!Number.isFinite(d.score) || d.score < 0 || d.score > 100) {
      throw new Error(`openness out of range for ${d.iso3}: ${d.score}`);
    }
  }

  // 2. The per-tier split must reconstruct the score exactly (float tolerance).
  for (const d of openness) {
    const sum = Object.values(d.points).reduce((a, b) => a + b, 0);
    if (Math.abs(sum - d.score) > 1e-9) {
      throw new Error(`openness points for ${d.iso3} sum to ${sum}, not the score ${d.score}`);
    }
  }

  // 3. Face validity, open end: at least one broadly-visa-free destination must
  //    rank in the top 15. If none does, the inversion or the credits are wrong.
  const top15 = openness.slice(0, 15).map((d) => d.iso3);
  if (!BROADLY_OPEN.some((c) => top15.includes(c))) {
    throw new Error(`most open destinations look wrong: ${top15.join(', ')}`);
  }

  // 4. Face validity, closed end: North Korea admits essentially no one and must
  //    sit in the least-open quartile.
  const prkIdx = openness.findIndex((d) => d.iso3 === 'PRK');
  if (prkIdx === -1 || prkIdx < Math.floor(openness.length * 0.75)) {
    throw new Error(
      `PRK openness rank ${prkIdx === -1 ? 'absent' : prkIdx + 1} of ${openness.length} — openness looks broken`,
    );
  }
}

// ---------------------------------------------------------------------------
// Vintage disclosure (B9). The pipeline run date is a BUILD date, not the data
// vintage; publish each signal's own observation year(s) instead of one label.
// ---------------------------------------------------------------------------
export interface SignalVintages {
  matrix: { source: string; note: string };
  gdp: { series: string; label: string; selection: string; years: string; modalYear: number };
  arrivals: { series: string; label: string; window: string; preferredYear: number; yearsUsed: string };
  migrants: { series: string; label: string; selection: string; years: string; modalYear: number };
  population: { series: string; label: string; selection: string; years: string; modalYear: number };
  hdi: { source: string; year: number };
}

export interface BuildMetadata {
  builtAt: string; // YYYY-MM-DD — when the pipeline last ran (NOT a data vintage)
  totalDestinations: number;
  vintages: SignalVintages;
}

/** Min / max / modal observation year across a World Bank indicator payload. */
export function wbYearSummary(body: string): { min: number; max: number; modal: number } {
  const rows = (JSON.parse(body) as unknown[])[1] as Array<{ countryiso3code: string; date: string; value: number | null }>;
  const years = (rows ?? [])
    .filter((r) => r.countryiso3code?.length === 3 && r.value !== null)
    .map((r) => Number(r.date))
    .filter((y) => Number.isFinite(y));
  if (years.length === 0) throw new Error('wbYearSummary: no dated observations');
  const counts = new Map<number, number>();
  for (const y of years) counts.set(y, (counts.get(y) ?? 0) + 1);
  const modal = [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0][0];
  return { min: Math.min(...years), max: Math.max(...years), modal };
}

/** Latest hdi_<year> column present in an HDR composite-indices CSV header. */
export function hdiLatestYear(csv: string): number {
  const header = csv.slice(0, csv.indexOf('\n')).split(',');
  const years = header
    .map((h) => /^hdi_(\d{4})$/.exec(h.trim()))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => Number(m[1]));
  if (years.length === 0) throw new Error('hdiLatestYear: no hdi_<year> column in header');
  return Math.max(...years);
}

export function buildMetadata(opts: {
  totalDestinations: number;
  gdpBody: string;
  migrantsBody: string;
  populationBody: string;
  hdiCsv: string;
  arrivalsByIso: Map<string, { value: number; year: number }>;
}): BuildMetadata {
  const gdp = wbYearSummary(opts.gdpBody);
  const migrants = wbYearSummary(opts.migrantsBody);
  const population = wbYearSummary(opts.populationBody);
  const arrivalYears = [...opts.arrivalsByIso.values()].map((a) => a.year);
  const arrMin = Math.min(...arrivalYears);
  const arrMax = Math.max(...arrivalYears);

  return {
    builtAt: new Date().toISOString().slice(0, 10),
    totalDestinations: opts.totalDestinations,
    vintages: {
      matrix: {
        source: 'imorte/passport-index-data (main)',
        note: 'maintained successor to the archived ilyankou/passport-index-dataset',
      },
      gdp: {
        series: 'NY.GDP.MKTP.CD',
        label: 'GDP (current US$)',
        selection: 'latest available per country',
        years: gdp.min === gdp.max ? `${gdp.min}` : `${gdp.min}–${gdp.max}`,
        modalYear: gdp.modal,
      },
      arrivals: {
        series: 'ST.INT.ARVL',
        // D3: the World Bank's own name for the series (it mixes overnight tourists
        // and same-day visitors, with definitions varying by country).
        label: 'International tourism, number of arrivals',
        window: '2017–2019',
        preferredYear: 2019,
        yearsUsed: arrMin === arrMax ? `${arrMin}` : `${arrMin}–${arrMax}`,
      },
      migrants: {
        series: 'SM.POP.TOTL',
        label: 'International migrant stock, total',
        selection: 'latest available per country',
        years: migrants.min === migrants.max ? `${migrants.min}` : `${migrants.min}–${migrants.max}`,
        modalYear: migrants.modal,
      },
      population: {
        series: 'SP.POP.TOTL',
        label: 'Population, total',
        selection: 'latest available per country',
        years: population.min === population.max ? `${population.min}` : `${population.min}–${population.max}`,
        modalYear: population.modal,
      },
      hdi: {
        source: 'UNDP Human Development Report 2025',
        year: hdiLatestYear(opts.hdiCsv),
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Pipeline orchestration (side effects). Gated behind a main guard so importing
// this module in tests exercises the pure guards/metadata without any I/O (B3).
// ---------------------------------------------------------------------------
function main(): void {
  const read = (f: string) => readFileSync(join(RAW, f), 'utf8');

  const matrix = parseVisaMatrix(read('passport-index-matrix-iso3.csv'));
  const overrides = JSON.parse(read('manual-overrides.json')) as Record<string, Override>;
  const countries = JSON.parse(read('countries.json')) as Record<string, { name: string; iso2: string }>;

  // Arrivals: single pre-COVID year per country (D2). Keep the selected year for vintage disclosure.
  const arrivalsByIso = parseArrivals(read('arrivals.json'));
  const arrivals = new Map([...arrivalsByIso].map(([iso3, { value }]) => [iso3, value]));

  // Merge override names/iso2 into the countries map, then demand full name coverage.
  for (const [iso3, o] of Object.entries(overrides)) countries[iso3] ??= { name: o.name, iso2: o.iso2 };
  const unnamed = matrix.countries.filter((c) => !countries[c]);
  if (unnamed.length > 0) {
    throw new Error(
      `matrix countries with no name/iso2: ${unnamed.join(', ')}\n` +
        `Add them to data/raw/manual-overrides.json with "name" and "iso2".`,
    );
  }
  const names = new Map(matrix.countries.map((c) => [c, countries[c].name]));

  const gdpBody = read('gdp.json');
  const migrantsBody = read('migrants.json');
  const hdiCsv = read('hdi.csv');
  const signals = loadSignals(
    matrix.countries,
    {
      gdp: parseWorldBankJson(gdpBody),
      arrivals,
      hdi: parseHdiCsv(hdiCsv),
      migrants: parseWorldBankJson(migrantsBody),
    },
    overrides,
  );
  const weights = computeWeights(signals, names);
  const rows = computeScores(matrix, weights, names);

  // The openness rating: the same matrix inverted, weighted by the people behind
  // each passport instead of the value of each destination.
  const populationBody = read('population.json');
  const populations = loadPopulations(matrix.countries, parseWorldBankJson(populationBody), overrides);
  const openness = computeOpenness(matrix, populations, names);

  // Fail the build rather than publish nonsense.
  sanityGuards(weights, rows, matrix.countries.length);
  opennessGuards(openness);

  const meta = buildMetadata({ totalDestinations: matrix.countries.length, gdpBody, migrantsBody, populationBody, hdiCsv, arrivalsByIso });

  mkdirSync(OUT, { recursive: true });
  const withIso2 = <T extends { iso3: string }>(r: T) => ({ ...r, iso2: countries[r.iso3].iso2 });
  writeFileSync(
    join(OUT, 'rankings.json'),
    JSON.stringify(
      { builtAt: meta.builtAt, totalDestinations: meta.totalDestinations, vintages: meta.vintages, passports: rows.map(withIso2) },
      null,
      1,
    ),
  );
  writeFileSync(join(OUT, 'weights.json'), JSON.stringify({ destinations: weights.map(withIso2) }, null, 1));
  const matrixOut: Record<string, Record<string, string>> = {};
  for (const [p, row] of matrix.access) matrixOut[p] = Object.fromEntries(row);
  writeFileSync(join(OUT, 'matrix.json'), JSON.stringify(matrixOut));
  writeFileSync(join(OUT, 'openness.json'), JSON.stringify({ destinations: openness.map(withIso2) }, null, 1));

  console.log(`${rows.length} passports scored over ${matrix.countries.length} destinations`);
  console.log('top 5:', rows.slice(0, 5).map((r) => `${r.iso3} ${r.score.toFixed(1)}`).join('  '));
  console.log('biggest risers:', [...rows].sort((a, b) => b.delta - a.delta).slice(0, 3).map((r) => `${r.iso3} +${r.delta}`).join('  '));
  console.log('biggest fallers:', [...rows].sort((a, b) => a.delta - b.delta).slice(0, 3).map((r) => `${r.iso3} ${r.delta}`).join('  '));
  console.log('most open:', openness.slice(0, 5).map((d) => `${d.iso3} ${d.score.toFixed(1)}`).join('  '));
}

// Only run the pipeline side-effects when executed directly (not when imported by tests).
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main();
}
