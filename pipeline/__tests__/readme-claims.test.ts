import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseVisaMatrix } from '../ingest.ts';
import { loadSignals, parseArrivals, parseHdiCsv, parseWorldBankJson, type Override } from '../signals.ts';
import { computeWeights } from '../weights.ts';

const REPO = join(import.meta.dirname, '..', '..');
const RAW = join(REPO, 'data', 'raw');
const README = readFileSync(join(REPO, 'README.md'), 'utf8');

const read = (f: string) => readFileSync(join(RAW, f), 'utf8');

function realWeights() {
  const matrix = parseVisaMatrix(read('passport-index-matrix-iso3.csv'));
  const overrides = JSON.parse(read('manual-overrides.json')) as Record<string, Override>;
  const countries = JSON.parse(read('countries.json')) as Record<string, { name: string; iso2: string }>;
  const arrivalsByIso = parseArrivals(read('arrivals.json'));
  const arrivals = new Map([...arrivalsByIso].map(([iso3, { value }]) => [iso3, value]));
  for (const [iso3, o] of Object.entries(overrides)) countries[iso3] ??= { name: o.name, iso2: o.iso2 };
  const names = new Map(matrix.countries.map((c) => [c, countries[c]?.name ?? c]));
  const signals = loadSignals(
    matrix.countries,
    {
      gdp: parseWorldBankJson(read('gdp.json')),
      arrivals,
      hdi: parseHdiCsv(read('hdi.csv')),
      migrants: parseWorldBankJson(read('migrants.json')),
    },
    overrides,
  );
  return { signals, weights: computeWeights(signals, names) };
}

const WORD: Record<number, string> = { 4: 'four', 5: 'five', 6: 'six', 7: 'seven' };

describe('README claims match the real data + the current pipeline (docs subsystem)', () => {
  it('B6: the "orders of magnitude" GDP claim matches round(log10 span) on real data', () => {
    const { signals } = realWeights();
    const gdps = [...signals.values()].map((s) => s.gdp).filter((v): v is number => v !== null);
    const span = Math.log10(Math.max(...gdps) / Math.min(...gdps));
    const rounded = Math.round(span); // 5.73 -> 6

    // README must not keep the stale "five orders of magnitude" claim.
    expect(README).not.toMatch(/five orders of\s+magnitude/i);
    // README must state the correct (rounded) magnitude, in words, tied to GDP.
    const word = WORD[rounded];
    expect(word, `no numeral word for magnitude ${rounded}`).toBeDefined();
    expect(README).toMatch(new RegExp(`${word} orders of\\s+magnitude`, 'i'));
  });

  it('M1 thesis: DEU+JPN+USA really outweigh the 50 weakest, and the README asserts it', () => {
    const { weights } = realWeights();
    const wBy = new Map(weights.map((w) => [w.iso3, w.weight]));
    const trio = wBy.get('DEU')! + wBy.get('JPN')! + wBy.get('USA')!;
    const bot50 = [...weights].sort((a, b) => a.weight - b.weight).slice(0, 50).reduce((a, w) => a + w.weight, 0);
    expect(trio).toBeGreaterThan(bot50); // thesis is TRUE on shipped weights

    // README keeps the thesis (Germany/Japan/USA outranks fifty small islands).
    expect(README).toMatch(/Germany, Japan, and the United States/);
    expect(README).toMatch(/fifty\s+small islands/);
  });

  it('M1: the score section describes the z-score + exp redesign, not the old mean-of-signals formula', () => {
    // Stale formulas that must be gone.
    expect(README).not.toMatch(/mean of the available normalized signals/);
    expect(README).not.toMatch(/min-max normalized to 0-1/);
    // New formula present.
    expect(README).toMatch(/exp\(1\.25/);
    expect(README).toMatch(/z-score/i);
  });

  it('M3: the score formula documents self-INCLUSION (home country counts as visa-free)', () => {
    // Both sums now run over the full pool INCLUDING the passport's own country, so the
    // country's own destination value accrues to its score. The stale "except the
    // passport's own country" / "198 other destinations" wording must be gone.
    expect(README).not.toMatch(/except the passport's own country/);
    expect(README).not.toMatch(/198 other destinations/);
    expect(README).toMatch(/including the passport's own country/);
    // The self-inclusion consequence (own value accrues; USA gains most) must be stated.
    expect(README).toMatch(/United States[\s\S]{0,60}(gains|most valuable)/);
  });

  it('B11: overrides prose does not claim North Korea is absent from the World Bank', () => {
    // Old wording: "Taiwan, North Korea, and Vatican City are not in the standard World Bank".
    expect(README).not.toMatch(/North Korea[\s\S]{0,60}not in the standard World Bank/);
    // Must state PRK migrant stock is pulled automatically from the World Bank.
    expect(README).toMatch(/SM\.POP\.TOTL/);
    expect(README).toMatch(/North Korea[\s\S]{0,400}automatically/i);
  });

  it('B7: README does not overclaim typecheck coverage and documents site checking', () => {
    expect(README).not.toMatch(/type-checks the whole repo/);
    expect(README).toMatch(/astro\s+check/);
  });

  it('D1/D4/D2: refresh docs point at the successor matrix, HDR 2025, and the arrivals window', () => {
    expect(README).toMatch(/imorte\/passport-index-data/);
    expect(README).toMatch(/HDR 2025|Human Development Report 2025/);
    expect(README).toMatch(/2017.?2019|2019/);
  });

  it('B10: README qualifies the "destination value" scope (sovereign states + SARs; dependent territories out of scope)', () => {
    // The headline "share of the world's destination value" must not be stated
    // without disclosing that the 199-destination denominator excludes dependent
    // territories with their own visa regimes (inherited from the upstream dataset).
    expect(README).toMatch(/sovereign[- ]state[\s\S]{0,40}SAR/i);
    expect(README).toMatch(/dependent territor(y|ies)[\s\S]{0,120}(out of scope|excluded)/i);
  });

  it('D3: README labels the arrivals series accurately and keeps the mixed-construct caveat', () => {
    // The series is "International tourism, number of arrivals" — not a pure
    // "international tourist arrivals" count. The caveat about mixed constructs
    // (overnight tourists vs same-day visitors) must remain.
    expect(README).toMatch(/International tourism, number of arrivals/);
    expect(README).not.toMatch(/International tourist arrivals/i);
    expect(README).toMatch(/same-day visitors/i);
  });
});
