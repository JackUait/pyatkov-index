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
