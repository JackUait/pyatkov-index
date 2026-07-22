import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const RAW = join(import.meta.dirname, '..', 'data', 'raw');

// --- Source URLs (exported for regression tests) ---

// GDP + migrants: latest available per country (mrnev=1).
export const WB_LATEST = (indicator: string) =>
  `https://api.worldbank.org/v2/country/all/indicator/${indicator}?format=json&per_page=20000&mrnev=1`;

// Arrivals: fixed pre-COVID vintage window (D2). signals.ts prefers 2019, then 2018, then 2017.
// A single common year avoids the mrnev=1 degeneracy that pinned most countries to COVID-2020.
export const WB_ARRIVALS =
  'https://api.worldbank.org/v2/country/all/indicator/ST.INT.ARVL?format=json&per_page=20000&date=2017:2019';

// D1: maintained successor of the archived ilyankou dataset (default branch `main`).
export const MATRIX_URL =
  'https://raw.githubusercontent.com/imorte/passport-index-data/main/passport-index-matrix-iso3.csv';

// D4: HDR 2025 composite indices (latest HDI column resolves to hdi_2023).
export const HDI_URL =
  'https://hdr.undp.org/sites/default/files/2025_HDR/HDR25_Composite_indices_complete_time_series.csv';

// --- Decode helper (B4): the UNDP CSV is Latin-1, not UTF-8. ---
export function decodeLatin1(buf: ArrayBuffer | Buffer): string {
  return Buffer.from(buf as ArrayBuffer).toString('latin1');
}

// --- Fetch/save plumbing ---

async function fetchText(url: string, decode: 'utf-8' | 'latin1' = 'utf-8'): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  if (decode === 'latin1') return decodeLatin1(await res.arrayBuffer()); // B4: UNDP CSV is Latin-1
  return res.text();
}

async function save(name: string, url: string, decode: 'utf-8' | 'latin1' = 'utf-8'): Promise<string> {
  const body = await fetchText(url, decode);
  writeFileSync(join(RAW, name), body);
  console.log(`saved ${name} (${body.length} bytes)`);
  return body;
}

async function main(): Promise<void> {
  mkdirSync(RAW, { recursive: true });

  await save('passport-index-matrix-iso3.csv', MATRIX_URL); // D1 (matrix CSV is UTF-8 clean)
  const gdpBody = await save('gdp.json', WB_LATEST('NY.GDP.MKTP.CD'));
  await save('arrivals.json', WB_ARRIVALS); // D2
  await save('migrants.json', WB_LATEST('SM.POP.TOTL'));
  await save('hdi.csv', HDI_URL, 'latin1'); // D4 + B4

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
}

// Only run the network side-effects when executed directly (not when imported by tests).
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main();
}
