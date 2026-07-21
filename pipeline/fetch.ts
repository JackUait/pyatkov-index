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
