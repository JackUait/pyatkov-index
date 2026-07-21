# Pyatkov Index Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A static website ranking the world's passports where each destination country carries its own composite weight (GDP, tourist arrivals, HDI, migrant stock), so access to strong destinations dominates the score.

**Architecture:** A TypeScript pipeline (`pipeline/`) parses committed raw data snapshots (`data/raw/`), computes destination weights and passport scores, and emits JSON into `site/src/data/`. The site is an Astro project (`site/`) — Astro is the Vite-based static generator the spec's "Vite + TypeScript, pre-rendered static HTML" line resolves to; it ships zero client JS except one small sort/search script on the home page.

**Tech Stack:** Node 20+, TypeScript, Vitest (pipeline tests), tsx (script runner), Astro (site), GitHub Pages (deploy).

**Spec:** `docs/superpowers/specs/2026-07-21-pyatkov-index-design.md` — read it before starting any task.

## Global Constraints

- Access credits, exactly: visa-free / freedom-of-movement = **1.0**, visa-on-arrival & eTA = **0.8**, eVisa = **0.5**, visa required / no admission = **0.0**. Own country excluded.
- Composite weight = arithmetic mean of the **available** normalized signals; GDP / arrivals / migrant stock are **log-scaled then min–max normalized**; HDI used directly.
- Score = `100 × Σ_{d≠p} credit(p,d) × weight(d) / Σ_{all d} weight(d)`. Equal-weight score = `100 × Σ_{d≠p} credit(p,d) / N` where N = total number of destinations.
- The pipeline **fails the build loudly** on any unknown matrix cell value, any matrix country missing a display name, or any destination with zero available signals. Never silently drop a row.
- Raw data is committed to `data/raw/` — the site build never touches the network.
- TDD for all pipeline logic: failing test first, minimal code, then refactor. Run ONLY the new test file(s), never the whole suite. No linter is configured in this repo; `npx tsc --noEmit` is the static check.
- Commit after every task (steps include commits).

## File Structure

```
package.json, tsconfig.json          root: pipeline deps (typescript, tsx, vitest)
data/raw/
  passport-index-matrix-iso3.csv     visa matrix (ilyankou/passport-index-dataset)
  gdp.json                           World Bank NY.GDP.MKTP.CD (mrnev=1)
  arrivals.json                      World Bank ST.INT.ARVL (mrnev=1)
  migrants.json                      World Bank SM.POP.TOTL (mrnev=1)
  hdi.csv                            UNDP composite indices time series
  countries.json                     iso3 → { name, iso2 } (from World Bank + manual)
  manual-overrides.json              hand-filled signals for countries absent from sources
pipeline/
  types.ts                           shared types (no logic)
  fetch.ts                           one-off: downloads snapshots into data/raw/
  ingest.ts                          parseVisaMatrix, categorize, CREDIT
  signals.ts                         parseWorldBankJson, parseHdiCsv, loadSignals
  weights.ts                         logMinMaxNormalize, computeWeights
  scores.ts                          computeScores, assignRanks
  build.ts                           orchestrator → site/src/data/*.json
pipeline/__tests__/                  vitest unit tests, one file per module
site/                                Astro project
  src/data/{rankings,weights,matrix}.json   generated, committed
  src/layouts/Base.astro
  src/pages/index.astro              rankings table + Δ column + sort/search
  src/pages/passport/[iso3].astro    per-passport breakdown
  src/pages/destinations.astro       weight table
  src/pages/methodology.astro        formula & sources
.github/workflows/deploy.yml         GitHub Pages
```

---

### Task 1: Scaffolding + raw data snapshots

Downloads and commits every dataset the pipeline needs. This task is script-driven, not TDD (it's I/O, no logic worth unit-testing — all parsing logic is tested in Tasks 2–3).

**Files:**
- Create: `package.json`, `tsconfig.json`, `.gitignore`
- Create: `pipeline/fetch.ts`
- Create: `data/raw/manual-overrides.json`
- Create (by running fetch): `data/raw/passport-index-matrix-iso3.csv`, `data/raw/gdp.json`, `data/raw/arrivals.json`, `data/raw/migrants.json`, `data/raw/hdi.csv`, `data/raw/countries.json`

**Interfaces:**
- Produces: the six files under `data/raw/` that Tasks 2–6 read. `countries.json` shape: `{ "USA": { "name": "United States", "iso2": "US" }, ... }`. `manual-overrides.json` shape: `{ "TWN": { "name": "Taiwan", "iso2": "TW", "gdp": 756590000000, "arrivals": 6480000, "hdi": 0.926, "migrants": 936000, "source": "..." }, ... }` — every field except `name`/`iso2` optional.

- [ ] **Step 1: Root scaffolding**

`package.json`:
```json
{
  "name": "pyatkov-index",
  "private": true,
  "type": "module",
  "scripts": {
    "fetch-data": "tsx pipeline/fetch.ts",
    "pipeline": "tsx pipeline/build.ts",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  }
}
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "allowImportingTsExtensions": true,
    "types": ["node"],
    "noEmit": true
  },
  "include": ["pipeline"]
}
```

`.gitignore`:
```
node_modules/
dist/
site/dist/
site/.astro/
```

Run: `npm install -D typescript tsx vitest @types/node`

- [ ] **Step 2: Write `pipeline/fetch.ts`**

```ts
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const RAW = join(import.meta.dirname, '..', 'data', 'raw');
mkdirSync(RAW, { recursive: true });

const WB = (indicator: string) =>
  `https://api.worldbank.org/v2/country/all/indicator/${indicator}?format=json&per_page=20000&mrnev=1`;

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.text();
}

async function save(name: string, url: string): Promise<string> {
  const body = await fetchText(url);
  writeFileSync(join(RAW, name), body);
  console.log(`saved ${name} (${body.length} bytes)`);
  return body;
}

await save(
  'passport-index-matrix-iso3.csv',
  'https://raw.githubusercontent.com/ilyankou/passport-index-dataset/master/passport-index-matrix-iso3.csv',
);
const gdpBody = await save('gdp.json', WB('NY.GDP.MKTP.CD'));
await save('arrivals.json', WB('ST.INT.ARVL'));
await save('migrants.json', WB('SM.POP.TOTL'));
await save(
  'hdi.csv',
  'https://hdr.undp.org/sites/default/files/2023-24_HDR/HDR23-24_Composite_indices_complete_time_series.csv',
);

// countries.json: iso3 -> { name, iso2 } from the World Bank GDP response.
// Aggregates (regions, income groups) are harmless: matrix ISO3s never match them.
const rows = (JSON.parse(gdpBody) as unknown[])[1] as Array<{
  country: { id: string; value: string };
  countryiso3code: string;
}>;
const countries: Record<string, { name: string; iso2: string }> = {};
for (const r of rows) {
  if (r.countryiso3code && r.countryiso3code.length === 3) {
    countries[r.countryiso3code] = { name: r.country.value, iso2: r.country.id };
  }
}
writeFileSync(join(RAW, 'countries.json'), JSON.stringify(countries, null, 2));
console.log(`saved countries.json (${Object.keys(countries).length} countries)`);
```

Note: if the UNDP HDI URL 404s (they move it between report editions), find the current "Composite indices complete time series" CSV link on <https://hdr.undp.org/data-center/documentation-and-downloads> and update the URL — the file format (an `iso3` column plus `hdi_<year>` columns) has been stable across editions.

- [ ] **Step 3: Run the fetch and verify**

Run: `npm run fetch-data`
Expected: five `saved ...` lines plus `saved countries.json (…)`; then verify shapes:
```bash
head -c 300 data/raw/passport-index-matrix-iso3.csv   # header row of ISO3 codes
awk -F',' 'NR==1{print NF}' data/raw/passport-index-matrix-iso3.csv  # ~200 columns
head -1 data/raw/hdi.csv | tr ',' '\n' | grep -c hdi_  # >30 hdi_<year> columns
```

- [ ] **Step 4: Seed `data/raw/manual-overrides.json`**

Taiwan is in the visa matrix but absent from World Bank and UNDP data, so it must be seeded now (values researched, ~2023 vintage; `source` is a free-text provenance note):
```json
{
  "TWN": {
    "name": "Taiwan",
    "iso2": "TW",
    "gdp": 756590000000,
    "arrivals": 6487000,
    "hdi": 0.926,
    "migrants": 936000,
    "source": "GDP: IMF WEO 2023; arrivals: Taiwan Tourism Administration 2023; HDI: DGBAS national calculation 2022; migrants: NIA foreign residents 2023"
  }
}
```
Task 3's `loadSignals` will fail loudly listing any other zero-signal or unnamed countries (likely candidates: VAT, PRK, microstates). When that happens, research each and add an entry here with at least `name`, `iso2`, and one defensible signal, citing the source. That failure loop is the intended workflow, not an error in this plan.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json tsconfig.json .gitignore pipeline/fetch.ts data/raw
git commit -m "feat: scaffolding, fetch script, committed raw data snapshots"
```

---

### Task 2: Visa matrix ingest

**Files:**
- Create: `pipeline/types.ts`, `pipeline/ingest.ts`
- Test: `pipeline/__tests__/ingest.test.ts`

**Interfaces:**
- Produces:
  - `types.ts`: `AccessCategory = 'visa-free' | 'visa-on-arrival' | 'e-visa' | 'visa-required'`; `VisaMatrix { countries: string[]; access: Map<string, Map<string, AccessCategory>> }` (access.get(passport).get(destination); self-pairs absent); `RawSignals { gdp: number|null; arrivals: number|null; hdi: number|null; migrants: number|null }`; `DestinationWeight { iso3: string; name: string; weight: number; signals: RawSignals; normalized: RawSignals; signalsUsed: number }`; `PassportRow { iso3: string; name: string; score: number; rank: number; equalScore: number; equalRank: number; delta: number; counts: Record<AccessCategory, number> }`.
  - `ingest.ts`: `CREDIT: Record<AccessCategory, number>` = `{ 'visa-free': 1.0, 'visa-on-arrival': 0.8, 'e-visa': 0.5, 'visa-required': 0 }`; `categorize(cell: string): AccessCategory | 'self'`; `parseVisaMatrix(csv: string): VisaMatrix`.

- [ ] **Step 1: Write `pipeline/types.ts`** (types only, no test needed)

```ts
export type AccessCategory = 'visa-free' | 'visa-on-arrival' | 'e-visa' | 'visa-required';

export interface VisaMatrix {
  countries: string[]; // ISO3, in matrix order; same set for passports and destinations
  access: Map<string, Map<string, AccessCategory>>; // access.get(passport).get(destination)
}

export interface RawSignals {
  gdp: number | null;
  arrivals: number | null;
  hdi: number | null;
  migrants: number | null;
}

export interface DestinationWeight {
  iso3: string;
  name: string;
  weight: number; // 0..1
  signals: RawSignals;
  normalized: RawSignals;
  signalsUsed: number; // 1..4
}

export interface PassportRow {
  iso3: string;
  name: string;
  score: number; // 0..100
  rank: number;
  equalScore: number; // 0..100
  equalRank: number;
  delta: number; // equalRank - rank; positive = rises under weighting
  counts: Record<AccessCategory, number>;
}
```

- [ ] **Step 2: Write the failing tests**

`pipeline/__tests__/ingest.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { CREDIT, categorize, parseVisaMatrix } from '../ingest.ts';

describe('categorize', () => {
  it('maps visa-free forms', () => {
    expect(categorize('90')).toBe('visa-free');
    expect(categorize('visa free')).toBe('visa-free');
  });
  it('maps visa on arrival and eta to visa-on-arrival', () => {
    expect(categorize('visa on arrival')).toBe('visa-on-arrival');
    expect(categorize('eta')).toBe('visa-on-arrival');
  });
  it('maps e-visa', () => {
    expect(categorize('e-visa')).toBe('e-visa');
  });
  it('maps refusal forms to visa-required', () => {
    expect(categorize('visa required')).toBe('visa-required');
    expect(categorize('no admission')).toBe('visa-required');
    expect(categorize('covid ban')).toBe('visa-required');
  });
  it('detects self markers', () => {
    expect(categorize('-1')).toBe('self');
    expect(categorize('-')).toBe('self');
  });
  it('throws on unknown values', () => {
    expect(() => categorize('maybe')).toThrow(/unknown visa matrix value/i);
  });
});

describe('CREDIT', () => {
  it('matches the spec exactly', () => {
    expect(CREDIT).toEqual({ 'visa-free': 1.0, 'visa-on-arrival': 0.8, 'e-visa': 0.5, 'visa-required': 0 });
  });
});

describe('parseVisaMatrix', () => {
  const csv = ['Passport,AAA,BBB,CCC', 'AAA,-1,90,visa required', 'BBB,e-visa,-1,visa on arrival', 'CCC,visa free,eta,-1'].join('\n');

  it('parses countries and access, skipping self', () => {
    const m = parseVisaMatrix(csv);
    expect(m.countries).toEqual(['AAA', 'BBB', 'CCC']);
    expect(m.access.get('AAA')!.get('BBB')).toBe('visa-free');
    expect(m.access.get('AAA')!.get('CCC')).toBe('visa-required');
    expect(m.access.get('BBB')!.get('AAA')).toBe('e-visa');
    expect(m.access.get('CCC')!.get('BBB')).toBe('visa-on-arrival');
    expect(m.access.get('AAA')!.has('AAA')).toBe(false);
  });

  it('throws when a row has the wrong number of cells', () => {
    expect(() => parseVisaMatrix('Passport,AAA,BBB\nAAA,-1\n')).toThrow(/row/i);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run pipeline/__tests__/ingest.test.ts`
Expected: FAIL — cannot resolve `../ingest.ts`.

- [ ] **Step 4: Write `pipeline/ingest.ts`**

```ts
import type { AccessCategory, VisaMatrix } from './types.ts';

export const CREDIT: Record<AccessCategory, number> = {
  'visa-free': 1.0,
  'visa-on-arrival': 0.8,
  'e-visa': 0.5,
  'visa-required': 0,
};

export function categorize(cell: string): AccessCategory | 'self' {
  const v = cell.trim().toLowerCase();
  if (v === '-1' || v === '-') return 'self';
  if (/^\d+$/.test(v) || v === 'visa free') return 'visa-free';
  if (v === 'visa on arrival' || v === 'eta') return 'visa-on-arrival';
  if (v === 'e-visa') return 'e-visa';
  if (v === 'visa required' || v === 'no admission' || v === 'covid ban') return 'visa-required';
  throw new Error(`unknown visa matrix value: "${cell}"`);
}

export function parseVisaMatrix(csv: string): VisaMatrix {
  const lines = csv.trim().split(/\r?\n/);
  const destinations = lines[0].split(',').slice(1).map((c) => c.trim());
  const access = new Map<string, Map<string, AccessCategory>>();
  const countries: string[] = [];

  for (const line of lines.slice(1)) {
    const cells = line.split(',').map((c) => c.trim());
    if (cells.length !== destinations.length + 1) {
      throw new Error(`row for "${cells[0]}" has ${cells.length - 1} cells, expected ${destinations.length}`);
    }
    const passport = cells[0];
    countries.push(passport);
    const row = new Map<string, AccessCategory>();
    destinations.forEach((dest, i) => {
      const cat = categorize(cells[i + 1]);
      if (cat !== 'self') row.set(dest, cat);
    });
    access.set(passport, row);
  }
  return { countries, access };
}
```

(The real CSV has no quoted/comma-containing cells — every cell is an ISO3 code or a known category token — so naive `split(',')` is safe; `categorize`'s throw is the backstop if that ever changes.)

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run pipeline/__tests__/ingest.test.ts` → all PASS.
Run: `npm run typecheck` → clean.

- [ ] **Step 6: Commit**

```bash
git add pipeline/types.ts pipeline/ingest.ts pipeline/__tests__/ingest.test.ts
git commit -m "feat: visa matrix ingest with graded access categories"
```

---

### Task 3: Signal parsing & loading

**Files:**
- Create: `pipeline/signals.ts`
- Test: `pipeline/__tests__/signals.test.ts`

**Interfaces:**
- Consumes: `RawSignals` from `types.ts`.
- Produces (`signals.ts`):
  - `parseWorldBankJson(body: string): Map<string, number>` — iso3 → value, skipping null values and non-3-letter codes.
  - `parseHdiCsv(csv: string): Map<string, number>` — iso3 → latest available `hdi_<year>` value per row.
  - `Override = { name: string; iso2: string; gdp?: number; arrivals?: number; hdi?: number; migrants?: number; source?: string }`
  - `loadSignals(iso3List: string[], sources: { gdp: Map<string, number>; arrivals: Map<string, number>; hdi: Map<string, number>; migrants: Map<string, number> }, overrides: Record<string, Override>): Map<string, RawSignals>` — throws listing ALL zero-signal countries at once.

- [ ] **Step 1: Write the failing tests**

`pipeline/__tests__/signals.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { loadSignals, parseHdiCsv, parseWorldBankJson } from '../signals.ts';

describe('parseWorldBankJson', () => {
  it('extracts iso3 -> value, skipping nulls and aggregates without iso3', () => {
    const body = JSON.stringify([
      { page: 1 },
      [
        { country: { id: 'US', value: 'United States' }, countryiso3code: 'USA', date: '2023', value: 27000 },
        { country: { id: 'X1', value: 'Some aggregate' }, countryiso3code: '', date: '2023', value: 999 },
        { country: { id: 'AF', value: 'Afghanistan' }, countryiso3code: 'AFG', date: '2022', value: null },
      ],
    ]);
    const m = parseWorldBankJson(body);
    expect(m.get('USA')).toBe(27000);
    expect(m.has('AFG')).toBe(false);
    expect(m.size).toBe(1);
  });
});

describe('parseHdiCsv', () => {
  it('takes the latest non-empty hdi_<year> column per row', () => {
    const csv = ['iso3,country,hdi_2021,hdi_2022', 'NOR,Norway,0.960,0.966', 'XYZ,Nowhere,0.5,', 'ZZZ,Empty,,'].join('\n');
    const m = parseHdiCsv(csv);
    expect(m.get('NOR')).toBe(0.966);
    expect(m.get('XYZ')).toBe(0.5); // falls back to 2021
    expect(m.has('ZZZ')).toBe(false);
  });

  it('handles quoted country names containing commas', () => {
    const csv = ['iso3,country,hdi_2022', 'VEN,"Venezuela, RB",0.699'].join('\n');
    expect(parseHdiCsv(csv).get('VEN')).toBe(0.699);
  });
});

describe('loadSignals', () => {
  const sources = {
    gdp: new Map([['AAA', 100]]),
    arrivals: new Map([['AAA', 10], ['BBB', 5]]),
    hdi: new Map([['AAA', 0.9]]),
    migrants: new Map<string, number>(),
  };

  it('assembles per-country signals with nulls for gaps', () => {
    const m = loadSignals(['AAA', 'BBB'], sources, {});
    expect(m.get('AAA')).toEqual({ gdp: 100, arrivals: 10, hdi: 0.9, migrants: null });
    expect(m.get('BBB')).toEqual({ gdp: null, arrivals: 5, hdi: null, migrants: null });
  });

  it('applies manual overrides on top of sources', () => {
    const m = loadSignals(['BBB'], sources, { BBB: { name: 'Beeland', iso2: 'BB', hdi: 0.7 } });
    expect(m.get('BBB')).toEqual({ gdp: null, arrivals: 5, hdi: 0.7, migrants: null });
  });

  it('throws listing every zero-signal country', () => {
    expect(() => loadSignals(['CCC', 'DDD'], sources, {})).toThrow(/CCC.*DDD|DDD.*CCC/s);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run pipeline/__tests__/signals.test.ts` → FAIL (module not found).

- [ ] **Step 3: Write `pipeline/signals.ts`**

```ts
import type { RawSignals } from './types.ts';

export interface Override {
  name: string;
  iso2: string;
  gdp?: number;
  arrivals?: number;
  hdi?: number;
  migrants?: number;
  source?: string;
}

export function parseWorldBankJson(body: string): Map<string, number> {
  const rows = (JSON.parse(body) as unknown[])[1] as Array<{
    countryiso3code: string;
    value: number | null;
  }>;
  const out = new Map<string, number>();
  for (const r of rows ?? []) {
    if (r.countryiso3code?.length === 3 && r.value !== null) out.set(r.countryiso3code, r.value);
  }
  return out;
}

// Minimal CSV line splitter honoring double quotes (the HDI file quotes names with commas).
function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') inQuotes = !inQuotes;
    else if (ch === ',' && !inQuotes) { cells.push(cur); cur = ''; }
    else cur += ch;
  }
  cells.push(cur);
  return cells;
}

export function parseHdiCsv(csv: string): Map<string, number> {
  const lines = csv.trim().split(/\r?\n/);
  const header = splitCsvLine(lines[0]);
  const iso3Col = header.indexOf('iso3');
  const hdiCols = header
    .map((h, i) => ({ h, i }))
    .filter(({ h }) => /^hdi_\d{4}$/.test(h))
    .sort((a, b) => b.h.localeCompare(a.h)); // latest year first
  if (iso3Col === -1 || hdiCols.length === 0) throw new Error('hdi.csv: expected iso3 and hdi_<year> columns');

  const out = new Map<string, number>();
  for (const line of lines.slice(1)) {
    const cells = splitCsvLine(line);
    const iso3 = cells[iso3Col];
    if (iso3?.length !== 3) continue; // UNDP file also has region aggregate rows
    for (const { i } of hdiCols) {
      const v = parseFloat(cells[i]);
      if (!Number.isNaN(v)) { out.set(iso3, v); break; }
    }
  }
  return out;
}

export function loadSignals(
  iso3List: string[],
  sources: { gdp: Map<string, number>; arrivals: Map<string, number>; hdi: Map<string, number>; migrants: Map<string, number> },
  overrides: Record<string, Override>,
): Map<string, RawSignals> {
  const out = new Map<string, RawSignals>();
  const empty: string[] = [];
  for (const iso3 of iso3List) {
    const o = overrides[iso3];
    const s: RawSignals = {
      gdp: o?.gdp ?? sources.gdp.get(iso3) ?? null,
      arrivals: o?.arrivals ?? sources.arrivals.get(iso3) ?? null,
      hdi: o?.hdi ?? sources.hdi.get(iso3) ?? null,
      migrants: o?.migrants ?? sources.migrants.get(iso3) ?? null,
    };
    if (s.gdp === null && s.arrivals === null && s.hdi === null && s.migrants === null) {
      empty.push(iso3);
      continue;
    }
    out.set(iso3, s);
  }
  if (empty.length > 0) {
    throw new Error(
      `destinations with zero available signals: ${empty.join(', ')}\n` +
        `Add each to data/raw/manual-overrides.json with researched values (see plan Task 1 Step 4).`,
    );
  }
  return out;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run pipeline/__tests__/signals.test.ts` → all PASS.
Run: `npm run typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add pipeline/signals.ts pipeline/__tests__/signals.test.ts
git commit -m "feat: signal parsing for World Bank, HDI, and manual overrides"
```

---

### Task 4: Destination weights

**Files:**
- Create: `pipeline/weights.ts`
- Test: `pipeline/__tests__/weights.test.ts`

**Interfaces:**
- Consumes: `RawSignals`, `DestinationWeight` from `types.ts`.
- Produces (`weights.ts`):
  - `logMinMaxNormalize(values: Map<string, number>): Map<string, number>` — `(ln x − ln min) / (ln max − ln min)`; if max === min, every value maps to 1.
  - `computeWeights(signals: Map<string, RawSignals>, names: Map<string, string>): DestinationWeight[]` — sorted by weight descending. HDI passes through un-normalized (already 0–1); the other three go through `logMinMaxNormalize` computed over the countries that have that signal.

- [ ] **Step 1: Write the failing tests**

`pipeline/__tests__/weights.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { computeWeights, logMinMaxNormalize } from '../weights.ts';
import type { RawSignals } from '../types.ts';

const sig = (p: Partial<RawSignals>): RawSignals => ({ gdp: null, arrivals: null, hdi: null, migrants: null, ...p });

describe('logMinMaxNormalize', () => {
  it('maps min to 0, max to 1, log-spaced midpoint to 0.5', () => {
    const m = logMinMaxNormalize(new Map([['A', 1], ['B', 100], ['C', 10]]));
    expect(m.get('A')).toBeCloseTo(0);
    expect(m.get('B')).toBeCloseTo(1);
    expect(m.get('C')).toBeCloseTo(0.5); // ln10 is the midpoint of ln1..ln100
  });
  it('maps everything to 1 when all values are equal', () => {
    const m = logMinMaxNormalize(new Map([['A', 7], ['B', 7]]));
    expect(m.get('A')).toBe(1);
    expect(m.get('B')).toBe(1);
  });
});

describe('computeWeights', () => {
  const names = new Map([['AAA', 'Aland'], ['BBB', 'Beeland'], ['CCC', 'Ceeland']]);

  it('averages available normalized signals only', () => {
    const signals = new Map([
      ['AAA', sig({ gdp: 100, hdi: 0.8 })], // gdp normalizes to 1 (max), hdi direct
      ['BBB', sig({ gdp: 1, hdi: 0.4 })],   // gdp normalizes to 0 (min)
      ['CCC', sig({ hdi: 0.6 })],           // only one signal
    ]);
    const w = computeWeights(signals, names);
    const byIso = Object.fromEntries(w.map((d) => [d.iso3, d]));
    expect(byIso.AAA.weight).toBeCloseTo((1 + 0.8) / 2);
    expect(byIso.BBB.weight).toBeCloseTo((0 + 0.4) / 2);
    expect(byIso.CCC.weight).toBeCloseTo(0.6);
    expect(byIso.CCC.signalsUsed).toBe(1);
    expect(byIso.AAA.signalsUsed).toBe(2);
  });

  it('sorts by weight descending and carries names', () => {
    const signals = new Map([['AAA', sig({ hdi: 0.9 })], ['BBB', sig({ hdi: 0.2 })]]);
    const w = computeWeights(signals, names);
    expect(w.map((d) => d.iso3)).toEqual(['AAA', 'BBB']);
    expect(w[0].name).toBe('Aland');
  });

  it('records normalized values per signal', () => {
    const signals = new Map([['AAA', sig({ arrivals: 10 })], ['BBB', sig({ arrivals: 1000 })]]);
    const w = computeWeights(signals, names);
    const byIso = Object.fromEntries(w.map((d) => [d.iso3, d]));
    expect(byIso.BBB.normalized.arrivals).toBeCloseTo(1);
    expect(byIso.AAA.normalized.arrivals).toBeCloseTo(0);
    expect(byIso.AAA.normalized.gdp).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run pipeline/__tests__/weights.test.ts` → FAIL (module not found).

- [ ] **Step 3: Write `pipeline/weights.ts`**

```ts
import type { DestinationWeight, RawSignals } from './types.ts';

export function logMinMaxNormalize(values: Map<string, number>): Map<string, number> {
  const logs = new Map([...values].map(([k, v]) => [k, Math.log(v)]));
  const nums = [...logs.values()];
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const range = max - min;
  return new Map([...logs].map(([k, v]) => [k, range === 0 ? 1 : (v - min) / range]));
}

const LOG_SIGNALS = ['gdp', 'arrivals', 'migrants'] as const;

export function computeWeights(signals: Map<string, RawSignals>, names: Map<string, string>): DestinationWeight[] {
  const normalizedBySignal = new Map<string, Map<string, number>>();
  for (const key of LOG_SIGNALS) {
    const present = new Map<string, number>();
    for (const [iso3, s] of signals) if (s[key] !== null) present.set(iso3, s[key]!);
    normalizedBySignal.set(key, logMinMaxNormalize(present));
  }

  const out: DestinationWeight[] = [];
  for (const [iso3, s] of signals) {
    const normalized: RawSignals = {
      gdp: normalizedBySignal.get('gdp')!.get(iso3) ?? null,
      arrivals: normalizedBySignal.get('arrivals')!.get(iso3) ?? null,
      migrants: normalizedBySignal.get('migrants')!.get(iso3) ?? null,
      hdi: s.hdi, // already 0..1
    };
    const available = Object.values(normalized).filter((v): v is number => v !== null);
    out.push({
      iso3,
      name: names.get(iso3) ?? iso3,
      weight: available.reduce((a, b) => a + b, 0) / available.length,
      signals: s,
      normalized,
      signalsUsed: available.length,
    });
  }
  return out.sort((a, b) => b.weight - a.weight);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run pipeline/__tests__/weights.test.ts` → all PASS.
Run: `npm run typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add pipeline/weights.ts pipeline/__tests__/weights.test.ts
git commit -m "feat: composite destination weights with log-min-max normalization"
```

---

### Task 5: Passport scores & ranking

**Files:**
- Create: `pipeline/scores.ts`
- Test: `pipeline/__tests__/scores.test.ts`

**Interfaces:**
- Consumes: `VisaMatrix`, `DestinationWeight`, `PassportRow`, `CREDIT` from earlier tasks.
- Produces (`scores.ts`):
  - `assignRanks<T>(rows: T[], score: (r: T) => number): Map<T, number>` — standard competition ranking (1, 2, 2, 4) on descending score.
  - `computeScores(matrix: VisaMatrix, weights: DestinationWeight[], names: Map<string, string>): PassportRow[]` — sorted by rank ascending, per the Global Constraints formulas.

- [ ] **Step 1: Write the failing tests**

`pipeline/__tests__/scores.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { assignRanks, computeScores } from '../scores.ts';
import { parseVisaMatrix } from '../ingest.ts';
import type { DestinationWeight } from '../types.ts';

const dw = (iso3: string, weight: number): DestinationWeight => ({
  iso3, name: iso3, weight,
  signals: { gdp: null, arrivals: null, hdi: weight, migrants: null },
  normalized: { gdp: null, arrivals: null, hdi: weight, migrants: null },
  signalsUsed: 1,
});

describe('assignRanks', () => {
  it('uses standard competition ranking on descending score', () => {
    const rows = [{ s: 10 }, { s: 30 }, { s: 30 }, { s: 5 }];
    const ranks = assignRanks(rows, (r) => r.s);
    expect(ranks.get(rows[1])).toBe(1);
    expect(ranks.get(rows[2])).toBe(1);
    expect(ranks.get(rows[0])).toBe(3);
    expect(ranks.get(rows[3])).toBe(4);
  });
});

describe('computeScores', () => {
  // AAA: visa-free to BBB (w .9), required to CCC (w .1)
  // BBB: visa-free everywhere
  // CCC: e-visa to AAA (w .5), voa to BBB
  const csv = ['Passport,AAA,BBB,CCC', 'AAA,-1,visa free,visa required', 'BBB,visa free,-1,visa free', 'CCC,e-visa,visa on arrival,-1'].join('\n');
  const matrix = parseVisaMatrix(csv);
  const weights = [dw('BBB', 0.9), dw('AAA', 0.5), dw('CCC', 0.1)];
  const names = new Map([['AAA', 'Aland'], ['BBB', 'Beeland'], ['CCC', 'Ceeland']]);
  const totalW = 0.9 + 0.5 + 0.1; // 1.5

  it('computes weighted score per the spec formula', () => {
    const rows = computeScores(matrix, weights, names);
    const byIso = Object.fromEntries(rows.map((r) => [r.iso3, r]));
    expect(byIso.AAA.score).toBeCloseTo((100 * (1.0 * 0.9 + 0 * 0.1)) / totalW); // 60
    expect(byIso.BBB.score).toBeCloseTo((100 * (1.0 * 0.5 + 1.0 * 0.1)) / totalW); // 40
    expect(byIso.CCC.score).toBeCloseTo((100 * (0.5 * 0.5 + 0.8 * 0.9)) / totalW); // 64.67
  });

  it('computes equal-weight score, ranks, and delta', () => {
    const rows = computeScores(matrix, weights, names);
    const byIso = Object.fromEntries(rows.map((r) => [r.iso3, r]));
    // equal: AAA = 100*(1+0)/3 = 33.3; BBB = 100*2/3 = 66.7; CCC = 100*1.3/3 = 43.3
    expect(byIso.BBB.equalScore).toBeCloseTo(66.667, 2);
    expect(byIso.BBB.equalRank).toBe(1);
    expect(byIso.BBB.rank).toBe(3); // weighted: CCC 64.7 > AAA 60 > BBB 40
    expect(byIso.BBB.delta).toBe(-2);
    expect(byIso.CCC.rank).toBe(1);
    expect(byIso.CCC.delta).toBe(1); // equalRank 2 -> rank 1
  });

  it('counts destinations per access category', () => {
    const rows = computeScores(matrix, weights, names);
    const ccc = rows.find((r) => r.iso3 === 'CCC')!;
    expect(ccc.counts).toEqual({ 'visa-free': 0, 'visa-on-arrival': 1, 'e-visa': 1, 'visa-required': 0 });
  });

  it('returns rows sorted by rank ascending with names attached', () => {
    const rows = computeScores(matrix, weights, names);
    expect(rows[0].iso3).toBe('CCC');
    expect(rows[0].name).toBe('Ceeland');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run pipeline/__tests__/scores.test.ts` → FAIL (module not found).

- [ ] **Step 3: Write `pipeline/scores.ts`**

```ts
import { CREDIT } from './ingest.ts';
import type { AccessCategory, DestinationWeight, PassportRow, VisaMatrix } from './types.ts';

export function assignRanks<T>(rows: T[], score: (r: T) => number): Map<T, number> {
  const sorted = [...rows].sort((a, b) => score(b) - score(a));
  const ranks = new Map<T, number>();
  sorted.forEach((row, i) => {
    ranks.set(row, i > 0 && score(row) === score(sorted[i - 1]) ? ranks.get(sorted[i - 1])! : i + 1);
  });
  return ranks;
}

export function computeScores(
  matrix: VisaMatrix,
  weights: DestinationWeight[],
  names: Map<string, string>,
): PassportRow[] {
  const weightByIso = new Map(weights.map((w) => [w.iso3, w.weight]));
  const totalWeight = weights.reduce((a, w) => a + w.weight, 0);
  const n = matrix.countries.length;

  const partial = matrix.countries.map((iso3) => {
    const row = matrix.access.get(iso3)!;
    let weighted = 0;
    let equal = 0;
    const counts: Record<AccessCategory, number> = { 'visa-free': 0, 'visa-on-arrival': 0, 'e-visa': 0, 'visa-required': 0 };
    for (const [dest, cat] of row) {
      const credit = CREDIT[cat];
      const w = weightByIso.get(dest);
      if (w === undefined) throw new Error(`destination ${dest} has no weight`);
      weighted += credit * w;
      equal += credit;
      counts[cat] += 1;
    }
    return { iso3, name: names.get(iso3) ?? iso3, score: (100 * weighted) / totalWeight, equalScore: (100 * equal) / n, counts };
  });

  const ranks = assignRanks(partial, (r) => r.score);
  const equalRanks = assignRanks(partial, (r) => r.equalScore);
  return partial
    .map((r) => ({
      ...r,
      rank: ranks.get(r)!,
      equalRank: equalRanks.get(r)!,
      delta: equalRanks.get(r)! - ranks.get(r)!,
    }))
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run pipeline/__tests__/scores.test.ts` → all PASS.
Run: `npm run typecheck` → clean.

- [ ] **Step 5: Commit**

```bash
git add pipeline/scores.ts pipeline/__tests__/scores.test.ts
git commit -m "feat: weighted and equal-weight passport scoring with ranks and delta"
```

---

### Task 6: Build orchestrator on real data

**Files:**
- Create: `pipeline/build.ts`
- Create (generated, committed): `site/src/data/rankings.json`, `site/src/data/weights.json`, `site/src/data/matrix.json`
- Possibly modify: `data/raw/manual-overrides.json` (the expected loud-failure loop)

**Interfaces:**
- Consumes: everything from Tasks 2–5.
- Produces JSON shapes the site (Tasks 7–10) imports:
  - `rankings.json`: `{ "generatedAt": "<ISO date>", "totalDestinations": <n>, "passports": PassportRow[] }` (sorted by rank), plus `iso2` added to each row: `PassportRow & { iso2: string }`.
  - `weights.json`: `{ "destinations": (DestinationWeight & { iso2: string })[] }` sorted by weight desc.
  - `matrix.json`: `{ [passportIso3]: { [destIso3]: AccessCategory } }`.

- [ ] **Step 1: Write `pipeline/build.ts`**

Orchestration over real files — no unit test; verification is the sanity checks it runs itself plus inspection of its output:
```ts
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
```

- [ ] **Step 2: Run it — expect the loud-failure loop**

Run: `npm run pipeline`
Expected on first run: an error listing zero-signal or unnamed countries (VAT, PRK, and some microstates are likely). For each listed ISO3: research values, add an entry to `data/raw/manual-overrides.json` with `name`, `iso2`, at least one signal, and a `source` note. Re-run until the build passes. Do NOT weaken the validation to get past this.

- [ ] **Step 3: Verify the output is sane**

Run: `npm run pipeline` (passing) and inspect the console summary: ~199 passports; top 5 plausibly European/East Asian; fallers should feature passports strong in small-state access. Spot-check `site/src/data/weights.json`: USA/CHN/DEU near the top, microstates near the bottom.

- [ ] **Step 4: Verify pipeline tests still pass**

Run: `npx vitest run pipeline` → all PASS (this scoped run covers only the pipeline test files written in this plan).

- [ ] **Step 5: Commit**

```bash
git add pipeline/build.ts data/raw/manual-overrides.json site/src/data
git commit -m "feat: build orchestrator emitting rankings, weights, and matrix JSON"
```

---

### Task 7: Astro site + home rankings page

**Files:**
- Create: `site/package.json`, `site/astro.config.mjs`, `site/tsconfig.json`
- Create: `site/src/layouts/Base.astro`, `site/src/lib/format.ts`, `site/src/pages/index.astro`

**Interfaces:**
- Consumes: `site/src/data/rankings.json` (Task 6 shape).
- Produces:
  - `Base.astro` layout with props `{ title: string; description: string }`, site-wide nav (Rankings / Destinations / Methodology) and a global stylesheet slot — every later page uses it.
  - `site/src/lib/format.ts`: `flagEmoji(iso2: string): string`, `fmt(n: number): string` (score to 1 decimal), `deltaLabel(d: number): string` (`"+12"`, `"−4"`, `"="`).

- [ ] **Step 1: Scaffold the Astro project**

```bash
cd site
npm create astro@latest . -- --template minimal --no-install --no-git --typescript strict --yes
npm install
```
Then set `site/astro.config.mjs`:
```js
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://example.github.io', // updated when a real Pages URL exists
  base: process.env.BASE_PATH ?? '/',
});
```

- [ ] **Step 2: Write `site/src/lib/format.ts`**

```ts
export function flagEmoji(iso2: string): string {
  return [...iso2.toUpperCase()].map((c) => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65)).join('');
}

export function fmt(n: number): string {
  return n.toFixed(1);
}

export function deltaLabel(d: number): string {
  if (d === 0) return '=';
  return d > 0 ? `+${d}` : `−${Math.abs(d)}`;
}
```

- [ ] **Step 3: Write `site/src/layouts/Base.astro`**

```astro
---
interface Props { title: string; description: string }
const { title, description } = Astro.props;
const base = import.meta.env.BASE_URL;
---
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>{title}</title>
    <meta name="description" content={description} />
  </head>
  <body>
    <header>
      <a href={base} class="brand">Pyatkov Index</a>
      <nav>
        <a href={base}>Rankings</a>
        <a href={`${base}destinations/`}>Destinations</a>
        <a href={`${base}methodology/`}>Methodology</a>
      </nav>
    </header>
    <main><slot /></main>
    <footer>
      <p>Not all destinations are equal. <a href={`${base}methodology/`}>How this index works</a>.</p>
    </footer>
  </body>
</html>
```
(Global styles are intentionally deferred to Task 11's design pass; keep markup semantic and class names stable.)

- [ ] **Step 4: Write `site/src/pages/index.astro`**

```astro
---
import Base from '../layouts/Base.astro';
import rankings from '../data/rankings.json';
import { deltaLabel, flagEmoji, fmt } from '../lib/format.ts';
const base = import.meta.env.BASE_URL;
---
<Base title="Pyatkov Index — weighted passport ranking" description="A passport index where strong destinations count more than weak ones.">
  <h1>The Pyatkov Index</h1>
  <p class="lede">
    Every passport, scored 0–100 by the share of the world's destination <em>value</em> it can reach.
    Destinations are weighted by GDP, tourist arrivals, HDI, and migrant stock — the Δ column shows how far
    each passport moves compared with counting every country equally.
  </p>
  <input type="search" id="filter" placeholder="Filter countries…" aria-label="Filter countries" />
  <table id="rankings">
    <thead>
      <tr>
        <th data-sort="rank" aria-sort="ascending">#</th>
        <th data-sort="name">Passport</th>
        <th data-sort="score">Score</th>
        <th data-sort="delta">Δ vs equal</th>
        <th data-sort="equalRank">Equal-weight #</th>
      </tr>
    </thead>
    <tbody>
      {rankings.passports.map((p) => (
        <tr data-name={p.name.toLowerCase()} data-rank={p.rank} data-score={p.score} data-delta={p.delta} data-equalrank={p.equalRank}>
          <td>{p.rank}</td>
          <td><a href={`${base}passport/${p.iso3.toLowerCase()}/`}>{flagEmoji(p.iso2)} {p.name}</a></td>
          <td>{fmt(p.score)}</td>
          <td class={p.delta > 0 ? 'up' : p.delta < 0 ? 'down' : ''}>{deltaLabel(p.delta)}</td>
          <td>{p.equalRank}</td>
        </tr>
      ))}
    </tbody>
  </table>
  <p class="meta">Data snapshot: {rankings.generatedAt} · {rankings.totalDestinations} destinations</p>

  <script>
    const input = document.getElementById('filter') as HTMLInputElement;
    const tbody = document.querySelector('#rankings tbody')!;
    const rows = [...tbody.querySelectorAll('tr')];

    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      for (const r of rows) (r as HTMLElement).hidden = !r.dataset.name!.includes(q);
    });

    let sortKey = 'rank';
    let asc = true;
    document.querySelectorAll('th[data-sort]').forEach((th) => {
      th.addEventListener('click', () => {
        const key = (th as HTMLElement).dataset.sort!;
        asc = key === sortKey ? !asc : key === 'name';
        sortKey = key;
        const val = (r: Element) =>
          key === 'name' ? r.getAttribute('data-name')! : parseFloat(r.getAttribute(`data-${key.toLowerCase()}`)!);
        rows
          .sort((a, b) => {
            const [x, y] = [val(a), val(b)];
            return (x < y ? -1 : x > y ? 1 : 0) * (asc ? 1 : -1);
          })
          .forEach((r) => tbody.appendChild(r));
      });
    });
  </script>
</Base>
```

- [ ] **Step 5: Build and verify**

Run: `cd site && npm run build`
Expected: build succeeds; `site/dist/index.html` exists and contains a ~199-row table.
Run: `cd site && npm run preview` and use the playwright-cli skill to open the preview URL, verify the table renders, filter narrows rows, and clicking "Score" re-sorts. (Passport links 404 until Task 8 — expected.)

- [ ] **Step 6: Commit**

```bash
git add site
git commit -m "feat: Astro site with sortable, filterable weighted rankings table"
```

---

### Task 8: Passport pages

**Files:**
- Create: `site/src/pages/passport/[iso3].astro`

**Interfaces:**
- Consumes: all three JSON files; `Base.astro`; `format.ts` helpers (Task 7 signatures).

- [ ] **Step 1: Write `site/src/pages/passport/[iso3].astro`**

```astro
---
import Base from '../../layouts/Base.astro';
import rankings from '../../data/rankings.json';
import weightsData from '../../data/weights.json';
import matrix from '../../data/matrix.json';
import { deltaLabel, flagEmoji, fmt } from '../../lib/format.ts';

export function getStaticPaths() {
  return rankings.passports.map((p) => ({ params: { iso3: p.iso3.toLowerCase() }, props: { passport: p } }));
}

const { passport: p } = Astro.props;
const access = (matrix as Record<string, Record<string, string>>)[p.iso3];
const CREDIT: Record<string, number> = { 'visa-free': 1.0, 'visa-on-arrival': 0.8, 'e-visa': 0.5, 'visa-required': 0 };
const LABEL: Record<string, string> = { 'visa-free': 'Visa-free', 'visa-on-arrival': 'Visa on arrival / eTA', 'e-visa': 'eVisa', 'visa-required': 'Visa required' };

const dests = weightsData.destinations
  .filter((d) => d.iso3 !== p.iso3)
  .map((d) => ({ ...d, category: access[d.iso3], contribution: CREDIT[access[d.iso3]] * d.weight }));
const reachable = dests.filter((d) => d.category !== 'visa-required');
const topReachable = [...reachable].sort((a, b) => b.contribution - a.contribution).slice(0, 15);
const topMissing = dests.filter((d) => d.category === 'visa-required').slice(0, 15); // already weight-desc
const totalWeight = weightsData.destinations.reduce((a, d) => a + d.weight, 0);
const tierContribution = Object.keys(LABEL).map((cat) => ({
  cat,
  points: (100 * dests.filter((d) => d.category === cat).reduce((a, d) => a + d.contribution, 0)) / totalWeight,
  count: p.counts[cat as keyof typeof p.counts],
}));
---
<Base title={`${p.name} passport — Pyatkov Index`} description={`${p.name}: rank ${p.rank}, score ${fmt(p.score)} on the weighted passport index.`}>
  <h1>{flagEmoji(p.iso2)} {p.name}</h1>
  <dl class="stats">
    <div><dt>Rank</dt><dd>#{p.rank}</dd></div>
    <div><dt>Score</dt><dd>{fmt(p.score)}</dd></div>
    <div><dt>Equal-weight rank</dt><dd>#{p.equalRank}</dd></div>
    <div><dt>Δ from weighting</dt><dd>{deltaLabel(p.delta)}</dd></div>
  </dl>

  <h2>Where the score comes from</h2>
  <table>
    <thead><tr><th>Access tier</th><th>Destinations</th><th>Points</th></tr></thead>
    <tbody>
      {tierContribution.map((t) => (
        <tr><td>{LABEL[t.cat]}</td><td>{t.count}</td><td>{fmt(t.points)}</td></tr>
      ))}
    </tbody>
  </table>

  <h2>Most valuable destinations reachable</h2>
  <ol>
    {topReachable.map((d) => (
      <li>{flagEmoji(d.iso2)} {d.name} <span class="meta">{LABEL[d.category]} · weight {d.weight.toFixed(3)}</span></li>
    ))}
  </ol>

  <h2>Most valuable destinations missing</h2>
  {topMissing.length === 0 ? <p>None — this passport reaches every weighted destination.</p> : (
    <ol>
      {topMissing.map((d) => (
        <li>{flagEmoji(d.iso2)} {d.name} <span class="meta">weight {d.weight.toFixed(3)}</span></li>
      ))}
    </ol>
  )}
</Base>
```

- [ ] **Step 2: Build and verify**

Run: `cd site && npm run build`
Expected: ~199 pages under `site/dist/passport/`. Spot-check with the playwright-cli skill on `npm run preview`: open `/passport/usa/` and `/passport/afg/` — USA shows a high score with EU destinations reachable; AFG shows top missing destinations dominated by USA/CHN/DEU-class countries.

- [ ] **Step 3: Commit**

```bash
git add site/src/pages/passport
git commit -m "feat: per-passport breakdown pages"
```

---

### Task 9: Destinations page

**Files:**
- Create: `site/src/pages/destinations.astro`

**Interfaces:**
- Consumes: `weights.json`, `Base.astro`, `format.ts`.

- [ ] **Step 1: Write `site/src/pages/destinations.astro`**

```astro
---
import Base from '../layouts/Base.astro';
import weightsData from '../data/weights.json';
import { flagEmoji } from '../lib/format.ts';
const pct = (v: number | null) => (v === null ? '—' : v.toFixed(2));
---
<Base title="Destination weights — Pyatkov Index" description="How much each destination is worth in the Pyatkov Index, and why.">
  <h1>Destination weights</h1>
  <p class="lede">
    Each destination's weight is the mean of its available normalized signals: log-scaled GDP,
    log-scaled tourist arrivals, HDI, and log-scaled migrant stock. This table is the entire
    "secret sauce" — nothing is hidden.
  </p>
  <table>
    <thead>
      <tr><th>#</th><th>Destination</th><th>Weight</th><th>GDP</th><th>Arrivals</th><th>HDI</th><th>Migrants</th><th>Signals</th></tr>
    </thead>
    <tbody>
      {weightsData.destinations.map((d, i) => (
        <tr>
          <td>{i + 1}</td>
          <td>{flagEmoji(d.iso2)} {d.name}</td>
          <td>{d.weight.toFixed(3)}</td>
          <td>{pct(d.normalized.gdp)}</td>
          <td>{pct(d.normalized.arrivals)}</td>
          <td>{pct(d.normalized.hdi)}</td>
          <td>{pct(d.normalized.migrants)}</td>
          <td>{d.signalsUsed}/4</td>
        </tr>
      ))}
    </tbody>
  </table>
</Base>
```

- [ ] **Step 2: Build and verify**

Run: `cd site && npm run build` → succeeds; `site/dist/destinations/index.html` lists every destination, heavyweights first, `—` for missing signals.

- [ ] **Step 3: Commit**

```bash
git add site/src/pages/destinations.astro
git commit -m "feat: destination weights transparency page"
```

---

### Task 10: Methodology page

**Files:**
- Create: `site/src/pages/methodology.astro`

**Interfaces:**
- Consumes: `rankings.json` (for snapshot date and destination count), `Base.astro`.

- [ ] **Step 1: Write `site/src/pages/methodology.astro`**

```astro
---
import Base from '../layouts/Base.astro';
import rankings from '../data/rankings.json';
---
<Base title="Methodology — Pyatkov Index" description="The formula, data sources, and snapshot dates behind the Pyatkov Index.">
  <h1>Methodology</h1>

  <h2>The idea</h2>
  <p>
    Classic passport indexes count destinations: visa-free access to a micronation is worth exactly as much
    as visa-free access to the United States. The Pyatkov Index weights every destination by how valuable
    access to it actually is, so weak destinations fade toward zero and strong destinations dominate.
  </p>

  <h2>Destination weights</h2>
  <p>Each of the {rankings.totalDestinations} destinations gets a weight from four signals:</p>
  <ul>
    <li><strong>GDP</strong> (World Bank, current US$) — log-scaled, min–max normalized to 0–1</li>
    <li><strong>International tourist arrivals</strong> (UNWTO via World Bank) — log-scaled, normalized</li>
    <li><strong>HDI</strong> (UNDP) — already 0–1, used directly</li>
    <li><strong>International migrant stock</strong> (via World Bank) — log-scaled, normalized</li>
  </ul>
  <p>
    Weight = the mean of the signals that exist for that destination (microstates often miss some).
    Log scaling matters: GDP spans five orders of magnitude, and without it only the US and China would count.
  </p>

  <h2>Access credit</h2>
  <ul>
    <li>Visa-free / freedom of movement — <strong>1.0</strong></li>
    <li>Visa on arrival / eTA — <strong>0.8</strong></li>
    <li>eVisa — <strong>0.5</strong></li>
    <li>Visa required / no admission — <strong>0</strong></li>
  </ul>

  <h2>The score</h2>
  <p>
    <code>score = 100 × Σ credit(passport, d) × weight(d) / Σ weight(d)</code> over all destinations
    except the passport's own country. It reads as "percent of the world's destination value this
    passport can reach." The Δ column compares against an equal-weight ranking computed with the same
    graded credits but every destination worth 1.
  </p>

  <h2>Sources & snapshot</h2>
  <p>
    Visa matrix: the open <a href="https://github.com/ilyankou/passport-index-dataset">passport-index-dataset</a>
    (PassportIndex.org data). Economic and social signals: World Bank API and UNDP HDR downloads.
    A few destinations absent from those sources (e.g. Taiwan) use hand-researched values documented in the
    repository. Data snapshot: {rankings.generatedAt}. All raw data and code are in the repo — the entire
    index is reproducible with one command.
  </p>
</Base>
```

- [ ] **Step 2: Build and verify**

Run: `cd site && npm run build` → succeeds; `site/dist/methodology/index.html` renders.

- [ ] **Step 3: Commit**

```bash
git add site/src/pages/methodology.astro
git commit -m "feat: methodology page"
```

---

### Task 11: Visual design pass + deploy workflow + README

**Files:**
- Create: `site/src/styles/global.css` (imported from `Base.astro`)
- Modify: `site/src/layouts/Base.astro` and any page markup the design pass requires (keep data/logic untouched)
- Create: `.github/workflows/deploy.yml`, `README.md`

**Interfaces:**
- Consumes: all four pages as built.
- Produces: the final look; a Pages workflow; project README.

- [ ] **Step 1: Design pass**

REQUIRED SUB-SKILL: invoke the `design-taste-frontend` skill (fall back to `frontend-design` if unavailable) with this brief: "Data-product site for a weighted passport index. Four pages exist and work (rankings table with Δ column, passport detail, destination weights, methodology). Style them: dense, credible, editorial-statistical feel — an index publication, not a dashboard toy. Dark-mode aware. The Δ column (rise/fall vs equal weighting) is the signature element — make .up/.down read instantly. No JS additions beyond the existing sort/search script; no framework additions." Apply the resulting styles in `site/src/styles/global.css` + minimal markup tweaks.

- [ ] **Step 2: Verify visually**

Run: `cd site && npm run build && npm run preview`, then use the playwright-cli skill to screenshot all four page types (/, /destinations/, /methodology/, /passport/usa/) at desktop and 390px mobile widths. Check: no horizontal page scroll on mobile (tables scroll in their own container), Δ colors legible, nav works on every page.

- [ ] **Step 3: Write `.github/workflows/deploy.yml`**

```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [master]
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm test
      - run: npm run pipeline
      - run: npm ci && npm run build
        working-directory: site
        env:
          BASE_PATH: /${{ github.event.repository.name }}/
      - uses: actions/upload-pages-artifact@v3
        with: { path: site/dist }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```
(The workflow can't run until the user creates a GitHub repo and enables Pages — committing it is the deliverable; do not create a remote or push without the user.)

- [ ] **Step 4: Write `README.md`**

Cover: what the index is (2 paragraphs, the weighting idea), the score formula, repo layout, `npm run fetch-data` → `npm run pipeline` → `cd site && npm run build` flow, how to refresh data snapshots, how manual-overrides.json works, data source credits and licenses (ilyankou dataset is MIT; World Bank CC-BY 4.0; UNDP open data — credit all three).

- [ ] **Step 5: Full verification**

Run, and confirm output before claiming success (verification-before-completion):
```bash
npm run typecheck            # clean
npx vitest run pipeline      # all pipeline tests pass
npm run pipeline             # sanity checks pass, summary prints
cd site && npm run build     # static build succeeds
```

- [ ] **Step 6: Commit**

```bash
git add site/src .github README.md
git commit -m "feat: visual design pass, Pages deploy workflow, README"
```
