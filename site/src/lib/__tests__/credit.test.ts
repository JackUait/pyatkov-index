import { describe, expect, it } from 'vitest';
import { CREDIT as PIPELINE_CREDIT } from '../../../../pipeline/ingest.ts';
import { CREDIT, LABEL, TIERS } from '../credit.ts';

describe('CREDIT', () => {
  // The site once carried its own 0.8/0.5 ladder while the pipeline scored 1.0/0, so every
  // rendered contribution was a different number from the one behind the rank. This test is
  // the guard: the site table must stay byte-identical to the pipeline's.
  it('matches the pipeline ladder exactly', () => {
    expect(CREDIT).toEqual(PIPELINE_CREDIT);
  });

  it('scores each tier on the graded ladder (1.0 border / 0.2 eVisa / 0 required)', () => {
    expect(CREDIT['visa-free']).toBe(1.0);
    expect(CREDIT['visa-on-arrival']).toBe(1.0);
    expect(CREDIT['e-visa']).toBe(0.2);
    expect(CREDIT['visa-required']).toBe(0);
  });
});

describe('TIERS', () => {
  it('covers every credit key, best access first', () => {
    expect([...TIERS]).toEqual(['visa-free', 'visa-on-arrival', 'e-visa', 'visa-required']);
    expect([...TIERS].sort()).toEqual(Object.keys(CREDIT).sort());
  });

  it('has a label for every tier', () => {
    expect(TIERS.map((t) => LABEL[t])).toEqual([
      'Visa-free',
      'Visa on arrival / eTA',
      'eVisa',
      'Visa required',
    ]);
  });
});
