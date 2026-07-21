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
