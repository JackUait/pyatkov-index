import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadSignals, parseArrivals, parseHdiCsv, parseWorldBankJson, type Override } from '../signals.ts';

describe('parseArrivals', () => {
  const body = JSON.stringify([
    { page: 1 },
    [
      // multi-year country: prefer 2019 over 2018/2017
      { countryiso3code: 'FRA', date: '2019', value: 90000 },
      { countryiso3code: 'FRA', date: '2018', value: 89000 },
      { countryiso3code: 'FRA', date: '2017', value: 88000 },
      // SVK: only 2018 present -> resolves to 2018
      { countryiso3code: 'SVK', date: '2019', value: null },
      { countryiso3code: 'SVK', date: '2018', value: 15300000 },
      { countryiso3code: 'SVK', date: '2017', value: null },
      // country present only outside the window (2020/2021) -> absent
      { countryiso3code: 'PRK', date: '2020', value: 500 },
      // aggregate rows without iso3 skipped
      { countryiso3code: '', date: '2019', value: 999 },
    ],
  ]);

  it('prefers 2019, then 2018, then 2017', () => {
    const m = parseArrivals(body);
    expect(m.get('FRA')!.value).toBe(90000);
    expect(m.get('FRA')!.year).toBe(2019);
  });

  it('falls back to 2018 for a country missing 2019 (e.g. SVK)', () => {
    const m = parseArrivals(body);
    expect(m.get('SVK')!.value).toBe(15300000);
    expect(m.get('SVK')!.year).toBe(2018);
  });

  it('omits a country present only in an out-of-window year (2020/2021)', () => {
    const m = parseArrivals(body);
    expect(m.has('PRK')).toBe(false);
  });
});

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

describe('manual-overrides.json (corrected values, nominal current-US$ basis)', () => {
  const overrides = JSON.parse(
    readFileSync(join(import.meta.dirname, '..', '..', 'data', 'raw', 'manual-overrides.json'), 'utf-8'),
  ) as Record<string, Override>;

  // O1 — Vatican GDP is a clearly-labeled revenue proxy (Holy See consolidated income),
  // not the undated ~$19.8m Wikipedia figure that used to anchor the log-GDP pool minimum.
  it('VAT.gdp is the ~US$1.43bn Holy See operating-income proxy, labeled a proxy', () => {
    expect(overrides.VAT.gdp).toBe(1430000000);
    expect(overrides.VAT.gdp).toBeGreaterThan(19800000); // no longer the artificial zero-point
    expect(overrides.VAT.source?.toLowerCase()).toContain('proxy');
  });

  // O2/O3/O4 — Taiwan: IMF WEO 2024 nominal GDP, DGBAS 2022 HDI, NIA end-2023 migrant stock.
  it('TWN carries year-consistent nominal GDP, HDI 0.925, migrants 841,627', () => {
    expect(overrides.TWN.gdp).toBe(801500000000);
    expect(overrides.TWN.hdi).toBe(0.925);
    expect(overrides.TWN.migrants).toBe(841627);
    expect(overrides.TWN.source).toContain('IMF World Economic Outlook');
    expect(overrides.TWN.source).not.toMatch(/IMF WEO 2023/);
  });

  // O5 — North Korea GDP restated to a NOMINAL (current-price) basis, matching NY.GDP.MKTP.CD.
  it('PRK.gdp is on a nominal (current-price) basis, not the BOK real-GDP figure', () => {
    expect(overrides.PRK.gdp).toBe(31500000000);
    expect(overrides.PRK.source).toMatch(/nominal/i);
    expect(overrides.PRK.source).not.toMatch(/real GDP/);
  });

  // B11 — PRK migrant stock is supplied automatically by the World Bank (SM.POP.TOTL),
  // so the override must NOT set it, and the source must not claim it is unestimable.
  it('PRK does not override migrant stock and drops the "not reliably estimable" claim', () => {
    expect(overrides.PRK.migrants).toBeUndefined();
    expect(overrides.PRK.source).not.toMatch(/not reliably estimable/);
  });

  // Merge behavior: a PRK-shaped override (gdp+arrivals only) must let migrants fall through
  // to the automated World Bank source rather than nulling it.
  it('lets PRK migrant stock fall through to the World Bank source', () => {
    const wb = {
      gdp: new Map<string, number>(),
      arrivals: new Map<string, number>(),
      hdi: new Map<string, number>(),
      migrants: new Map([['PRK', 50439]]),
    };
    const merged = loadSignals(['PRK'], wb, { PRK: overrides.PRK });
    expect(merged.get('PRK')!.migrants).toBe(50439);
    expect(merged.get('PRK')!.gdp).toBe(31500000000);
  });
});
