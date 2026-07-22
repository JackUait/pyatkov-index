import { describe, expect, it } from 'vitest';
import { WB_LATEST, WB_ARRIVALS, WB_POPULATION_SERIES, MATRIX_URL, HDI_URL, decodeLatin1 } from '../fetch.ts';

describe('World Bank URL builders', () => {
  it('WB_LATEST pins latest-per-country (mrnev=1) for GDP/migrants', () => {
    const url = WB_LATEST('NY.GDP.MKTP.CD');
    expect(url).toContain('/indicator/NY.GDP.MKTP.CD');
    expect(url).toContain('mrnev=1');
    expect(url).not.toContain('date=');
  });

  it('arrivals URL requests a fixed pre-COVID window (2017:2019), never mrnev, never a COVID year alone', () => {
    expect(WB_ARRIVALS).toContain('/indicator/ST.INT.ARVL');
    expect(WB_ARRIVALS).toContain('date=2017:2019');
    expect(WB_ARRIVALS).not.toContain('mrnev');
    // guard against reintroducing COVID-only vintages
    expect(WB_ARRIVALS).not.toContain('date=2020');
    expect(WB_ARRIVALS).not.toContain('date=2021');
  });

  it('population uses the total-population series, latest per country, never the migrant-stock series', () => {
    const url = WB_LATEST(WB_POPULATION_SERIES);
    expect(WB_POPULATION_SERIES).toBe('SP.POP.TOTL');
    // SM.POP.TOTL is international migrant stock and is already used as a weight
    // signal; confusing the two would silently corrupt the openness denominator.
    expect(WB_POPULATION_SERIES).not.toBe('SM.POP.TOTL');
    expect(url).toContain('/indicator/SP.POP.TOTL');
    expect(url).toContain('mrnev=1');
  });
});

describe('source URLs', () => {
  it('matrix points at the maintained successor dataset (imorte), not the archived ilyankou repo', () => {
    expect(MATRIX_URL).toContain('imorte/passport-index-data');
    expect(MATRIX_URL).toContain('passport-index-matrix-iso3.csv');
    expect(MATRIX_URL).not.toContain('ilyankou');
  });

  it('HDI points at HDR 2025', () => {
    expect(HDI_URL).toContain('2025_HDR');
    expect(HDI_URL).toContain('HDR25_Composite_indices_complete_time_series.csv');
    expect(HDI_URL).not.toContain('2023-24');
  });
});

describe('decodeLatin1', () => {
  it('decodes Latin-1 bytes for ô/ü correctly, not to U+FFFD', () => {
    // "Côte" and "Türkiye" as Latin-1 bytes (0xf4 = ô, 0xfc = ü)
    const cote = Buffer.from([0x43, 0xf4, 0x74, 0x65]); // Côte
    const turkiye = Buffer.from([0x54, 0xfc, 0x72, 0x6b, 0x69, 0x79, 0x65]); // Türkiye
    expect(decodeLatin1(cote)).toBe('Côte');
    expect(decodeLatin1(turkiye)).toBe('Türkiye');
    expect(decodeLatin1(cote)).not.toContain('�');
  });

  it('a UTF-8 decode of the same bytes WOULD corrupt them (proves latin1 is required)', () => {
    const cote = Buffer.from([0x43, 0xf4, 0x74, 0x65]);
    const utf8 = new TextDecoder('utf-8').decode(cote);
    expect(utf8).toContain('�');
  });
});
