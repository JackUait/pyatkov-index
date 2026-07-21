import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseVisaMatrix } from './ingest.ts';
import { loadSignals, parseHdiCsv, parseWorldBankJson, type Override } from './signals.ts';
import { computeWeights } from './weights.ts';
import { computeScores } from './scores.ts';

const RAW = join(import.meta.dirname, '..', 'data', 'raw');
const OUT = join(import.meta.dirname, '..', 'site', 'src', 'data');
const read = (f: string) => readFileSync(join(RAW, f), 'utf8');

const matrix = parseVisaMatrix(read('passport-index-matrix-iso3.csv'));
const overrides = JSON.parse(read('manual-overrides.json')) as Record<string, Override>;
const countries = JSON.parse(read('countries.json')) as Record<string, { name: string; iso2: string }>;

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

const signals = loadSignals(
  matrix.countries,
  {
    gdp: parseWorldBankJson(read('gdp.json')),
    arrivals: parseWorldBankJson(read('arrivals.json')),
    hdi: parseHdiCsv(read('hdi.csv')),
    migrants: parseWorldBankJson(read('migrants.json')),
  },
  overrides,
);
const weights = computeWeights(signals, names);
const rows = computeScores(matrix, weights, names);

// Sanity checks — fail the build rather than publish nonsense.
if (matrix.countries.length < 190 || matrix.countries.length > 210)
  throw new Error(`unexpected country count: ${matrix.countries.length}`);
const top10 = rows.slice(0, 10).map((r) => r.iso3);
if (!['DEU', 'FRA', 'SGP', 'JPN', 'ITA', 'ESP'].some((c) => top10.includes(c)))
  throw new Error(`top 10 looks wrong: ${top10.join(', ')}`);
const usaWeightRank = weights.findIndex((w) => w.iso3 === 'USA');
if (usaWeightRank > 10) throw new Error(`USA weight rank ${usaWeightRank + 1} — weighting looks broken`);

mkdirSync(OUT, { recursive: true });
const withIso2 = <T extends { iso3: string }>(r: T) => ({ ...r, iso2: countries[r.iso3].iso2 });
writeFileSync(
  join(OUT, 'rankings.json'),
  JSON.stringify({ generatedAt: new Date().toISOString().slice(0, 10), totalDestinations: matrix.countries.length, passports: rows.map(withIso2) }, null, 1),
);
writeFileSync(join(OUT, 'weights.json'), JSON.stringify({ destinations: weights.map(withIso2) }, null, 1));
const matrixOut: Record<string, Record<string, string>> = {};
for (const [p, row] of matrix.access) matrixOut[p] = Object.fromEntries(row);
writeFileSync(join(OUT, 'matrix.json'), JSON.stringify(matrixOut));

console.log(`${rows.length} passports scored over ${matrix.countries.length} destinations`);
console.log('top 5:', rows.slice(0, 5).map((r) => `${r.iso3} ${r.score.toFixed(1)}`).join('  '));
console.log('biggest risers:', [...rows].sort((a, b) => b.delta - a.delta).slice(0, 3).map((r) => `${r.iso3} +${r.delta}`).join('  '));
console.log('biggest fallers:', [...rows].sort((a, b) => a.delta - b.delta).slice(0, 3).map((r) => `${r.iso3} ${r.delta}`).join('  '));
