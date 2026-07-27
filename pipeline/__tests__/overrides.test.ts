import { describe, it, expect } from 'vitest';
import { applyVisaOverrides, type VisaOverride } from '../overrides.ts';

// A 3x3 toy matrix in the real file's shape: header starts with "Passport", the diagonal
// is "-1", and (as in the real file) the column order is NOT the row order.
const CSV = [
  'Passport,DEU,USA,AFG',
  'AFG,visa required,visa required,-1',
  'DEU,-1,eta,e-visa',
  'USA,90,-1,visa required',
].join('\n');

const ok = (o: Partial<VisaOverride> = {}): VisaOverride => ({
  origin: 'AFG',
  destination: 'DEU',
  from: 'visa required',
  to: 'e-visa',
  effective: '2026-04-01',
  source: 'https://example.gov/notice',
  note: 'test',
  ...o,
});

const asOf = '2026-07-27';

describe('applyVisaOverrides', () => {
  it('rewrites the targeted cell and leaves every other cell alone', () => {
    const { csv, applied } = applyVisaOverrides(CSV, [ok()], asOf);
    expect(applied).toBe(1);
    const rows = csv.trim().split('\n');
    expect(rows[1]).toBe('AFG,e-visa,visa required,-1');
    expect(rows[0]).toBe('Passport,DEU,USA,AFG');
    expect(rows[2]).toBe('DEU,-1,eta,e-visa');
    expect(rows[3]).toBe('USA,90,-1,visa required');
  });

  it('resolves the column by header name, not by row order', () => {
    // AFG is the last column but the first row — an index-based implementation passes
    // the test above and fails this one.
    const { csv } = applyVisaOverrides(CSV, [ok({ origin: 'USA', destination: 'AFG', from: 'visa required', to: '30' })], asOf);
    expect(csv.trim().split('\n')[3]).toBe('USA,90,-1,30');
  });

  it('throws when `from` does not match the cell the CSV actually holds', () => {
    // The whole point of `from`: if upstream refreshes and the baseline value moves, our
    // correction may no longer be a correction. It must fail loudly, not apply blindly.
    expect(() => applyVisaOverrides(CSV, [ok({ from: '90' })], asOf))
      .toThrow(/AFG->DEU.*expected "90".*found "visa required"/i);
  });

  it('throws on an unknown origin or destination code', () => {
    expect(() => applyVisaOverrides(CSV, [ok({ origin: 'XXX' })], asOf)).toThrow(/unknown origin "XXX"/i);
    expect(() => applyVisaOverrides(CSV, [ok({ destination: 'XXX' })], asOf)).toThrow(/unknown destination "XXX"/i);
  });

  it('throws on a self-pair, which would overwrite the diagonal', () => {
    expect(() => applyVisaOverrides(CSV, [ok({ origin: 'DEU', destination: 'DEU', from: '-1' })], asOf))
      .toThrow(/self/i);
  });

  it('throws on two overrides targeting the same cell', () => {
    expect(() => applyVisaOverrides(CSV, [ok(), ok({ to: '90' })], asOf)).toThrow(/duplicate.*AFG->DEU/i);
  });

  it('throws on a no-op override', () => {
    expect(() => applyVisaOverrides(CSV, [ok({ to: 'visa required' })], asOf)).toThrow(/no-op/i);
  });

  it('throws on a value outside the cell vocabulary', () => {
    expect(() => applyVisaOverrides(CSV, [ok({ to: 'visa-free' })], asOf)).toThrow(/unknown visa matrix value/i);
    expect(() => applyVisaOverrides(CSV, [ok({ to: 'free' })], asOf)).toThrow(/unknown visa matrix value/i);
  });

  it('accepts every term in the vocabulary, including bare day counts', () => {
    for (const to of ['visa free', 'visa on arrival', 'eta', 'e-visa', 'no admission', '90', '14']) {
      expect(() => applyVisaOverrides(CSV, [ok({ to })], asOf), `rejected "${to}"`).not.toThrow();
    }
  });

  it('requires a source and a real effective date', () => {
    expect(() => applyVisaOverrides(CSV, [ok({ source: '' })], asOf)).toThrow(/source/i);
    expect(() => applyVisaOverrides(CSV, [ok({ effective: 'soon' })], asOf)).toThrow(/effective/i);
  });

  it('refuses a change that has not entered into force yet', () => {
    // Announced-but-not-in-force policies are the most common bad correction. The dataset
    // describes the world as of the build, so a future date is a bug, not a feature.
    expect(() => applyVisaOverrides(CSV, [ok({ effective: '2026-09-01' })], asOf))
      .toThrow(/not in force/i);
  });

  it('is a no-op on an empty override set', () => {
    const { csv, applied } = applyVisaOverrides(CSV, [], asOf);
    expect(applied).toBe(0);
    expect(csv).toBe(CSV);
  });
});
