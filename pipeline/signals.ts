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

// Arrivals live in a 2017:2019 window (D2). Pick a single year per country, preferring
// the most recent pre-COVID year available, and record which year was used (for vintage disclosure).
export function parseArrivals(body: string, prefer: number[] = [2019, 2018, 2017]): Map<string, { value: number; year: number }> {
  const rows = (JSON.parse(body) as unknown[])[1] as Array<{
    countryiso3code: string;
    date: string;
    value: number | null;
  }>;
  const byIso = new Map<string, Map<number, number>>();
  for (const r of rows ?? []) {
    if (r.countryiso3code?.length === 3 && r.value !== null) {
      let years = byIso.get(r.countryiso3code);
      if (!years) { years = new Map(); byIso.set(r.countryiso3code, years); }
      years.set(Number(r.date), r.value);
    }
  }
  const out = new Map<string, { value: number; year: number }>();
  for (const [iso3, years] of byIso) {
    for (const y of prefer) {
      if (years.has(y)) { out.set(iso3, { value: years.get(y)!, year: y }); break; }
    }
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
