import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseVisaMatrix } from '../ingest.ts';

const RAW = join(import.meta.dirname, '..', '..', 'data', 'raw');
const CSV = readFileSync(join(RAW, 'passport-index-matrix-iso3.csv'), 'utf8');

// The denominator of every score is the size of this roster, and its membership decides
// which destinations carry value at all. build.test.ts pins the CARDINALITY (199); a
// 1-for-1 upstream substitution would keep that green while silently reweighting the
// whole index. So the membership is pinned here, literally.
const ROSTER = [
  'AFG', 'AGO', 'ALB', 'AND', 'ARE', 'ARG', 'ARM', 'ATG', 'AUS', 'AUT',
  'AZE', 'BDI', 'BEL', 'BEN', 'BFA', 'BGD', 'BGR', 'BHR', 'BHS', 'BIH',
  'BLR', 'BLZ', 'BOL', 'BRA', 'BRB', 'BRN', 'BTN', 'BWA', 'CAF', 'CAN',
  'CHE', 'CHL', 'CHN', 'CIV', 'CMR', 'COD', 'COG', 'COL', 'COM', 'CPV',
  'CRI', 'CUB', 'CYP', 'CZE', 'DEU', 'DJI', 'DMA', 'DNK', 'DOM', 'DZA',
  'ECU', 'EGY', 'ERI', 'ESP', 'EST', 'ETH', 'FIN', 'FJI', 'FRA', 'FSM',
  'GAB', 'GBR', 'GEO', 'GHA', 'GIN', 'GMB', 'GNB', 'GNQ', 'GRC', 'GRD',
  'GTM', 'GUY', 'HKG', 'HND', 'HRV', 'HTI', 'HUN', 'IDN', 'IND', 'IRL',
  'IRN', 'IRQ', 'ISL', 'ISR', 'ITA', 'JAM', 'JOR', 'JPN', 'KAZ', 'KEN',
  'KGZ', 'KHM', 'KIR', 'KNA', 'KOR', 'KWT', 'LAO', 'LBN', 'LBR', 'LBY',
  'LCA', 'LIE', 'LKA', 'LSO', 'LTU', 'LUX', 'LVA', 'MAC', 'MAR', 'MCO',
  'MDA', 'MDG', 'MDV', 'MEX', 'MHL', 'MKD', 'MLI', 'MLT', 'MMR', 'MNE',
  'MNG', 'MOZ', 'MRT', 'MUS', 'MWI', 'MYS', 'NAM', 'NER', 'NGA', 'NIC',
  'NLD', 'NOR', 'NPL', 'NRU', 'NZL', 'OMN', 'PAK', 'PAN', 'PER', 'PHL',
  'PLW', 'PNG', 'POL', 'PRK', 'PRT', 'PRY', 'PSE', 'QAT', 'ROU', 'RUS',
  'RWA', 'SAU', 'SDN', 'SEN', 'SGP', 'SLB', 'SLE', 'SLV', 'SMR', 'SOM',
  'SRB', 'SSD', 'STP', 'SUR', 'SVK', 'SVN', 'SWE', 'SWZ', 'SYC', 'SYR',
  'TCD', 'TGO', 'THA', 'TJK', 'TKM', 'TLS', 'TON', 'TTO', 'TUN', 'TUR',
  'TUV', 'TWN', 'TZA', 'UGA', 'UKR', 'URY', 'USA', 'UZB', 'VAT', 'VCT',
  'VEN', 'VNM', 'VUT', 'WSM', 'XKX', 'YEM', 'ZAF', 'ZMB', 'ZWE',
];

describe('destination roster (upstream matrix)', () => {
  it('pins the exact 199-code roster, not just its size', () => {
    const { countries } = parseVisaMatrix(CSV);
    expect([...countries].sort()).toEqual(ROSTER);
  });

  it('the roster is exactly the 193 UN member states plus 6 non-member entities', () => {
    // The README's scope paragraph names this composition; if upstream's roster moves,
    // that prose goes stale silently. NON_UN is the whole of the exception list.
    const NON_UN = ['HKG', 'MAC', 'PSE', 'TWN', 'VAT', 'XKX'];
    const { countries } = parseVisaMatrix(CSV);
    expect(countries.filter((c) => NON_UN.includes(c)).sort()).toEqual(NON_UN);
    expect(countries.length - NON_UN.length).toBe(193);
  });

  it('the matrix is square: every destination column is also a passport row', () => {
    // parseVisaMatrix reads destinations off the header and countries off the first cell
    // of each row and never compares them. Asymmetric drift currently surfaces only as an
    // oblique throw from scores.ts ("destination X has no weight") or openness.ts.
    const destinations = CSV.trim().split(/\r?\n/)[0].split(',').slice(1).map((c) => c.trim());
    const { countries } = parseVisaMatrix(CSV);
    expect([...destinations].sort()).toEqual([...countries].sort());
  });

  it('columns and rows are set-equal but NOT in the same order', () => {
    // AFG is the last column and the first row. Anything that pairs a column with a row
    // by index is wrong on the real file — pinned so a refactor cannot assume otherwise.
    const destinations = CSV.trim().split(/\r?\n/)[0].split(',').slice(1).map((c) => c.trim());
    const { countries } = parseVisaMatrix(CSV);
    expect(destinations).not.toEqual(countries);
    expect(destinations.at(-1)).toBe('AFG');
    expect(countries[0]).toBe('AFG');
  });
});
