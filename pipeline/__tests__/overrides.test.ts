import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyVisaOverrides, type VisaOverride, type VisaOverrideFile } from '../overrides.ts';
import { parseVisaMatrix } from '../ingest.ts';

const REPO = join(import.meta.dirname, '..', '..');
const REAL_CSV = readFileSync(join(REPO, 'data', 'raw', 'passport-index-matrix-iso3.csv'), 'utf8');
const REAL: VisaOverrideFile = JSON.parse(readFileSync(join(REPO, 'data', 'visa-overrides.json'), 'utf8'));

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

  it('applies a time-limited correction while it is still in force', () => {
    const { applied } = applyVisaOverrides(CSV, [ok({ sunset: '2026-12-31' })], asOf);
    expect(applied).toBe(1);
  });

  it('refuses a time-limited correction that has expired', () => {
    // China's visa-free trials, Azerbaijan's one-year Group IV grants and the like all
    // lapse on a date. An expired override silently pins a policy that no longer exists —
    // the exact staleness this dataset exists to fix — so it must fail the build instead.
    expect(() => applyVisaOverrides(CSV, [ok({ sunset: '2026-06-30' })], asOf))
      .toThrow(/expired.*2026-06-30.*re-verify/i);
  });

  it('rejects a sunset that is not a real date, or precedes the effective date', () => {
    expect(() => applyVisaOverrides(CSV, [ok({ sunset: 'end of year' })], asOf)).toThrow(/sunset/i);
    expect(() => applyVisaOverrides(CSV, [ok({ effective: '2026-04-01', sunset: '2026-03-01' })], asOf))
      .toThrow(/sunset.*before.*effective/i);
  });

  it('is a no-op on an empty override set', () => {
    const { csv, applied } = applyVisaOverrides(CSV, [], asOf);
    expect(applied).toBe(0);
    expect(csv).toBe(CSV);
  });
});

describe('the shipped override file (our fork of the upstream matrix)', () => {
  it('applies cleanly against the real baseline — every `from` still matches upstream', () => {
    // This is the integration guard. If `yarn fetch-data` pulls a refreshed upstream and
    // any baseline value we corrected has moved, this fails with the offending pair.
    const { applied } = applyVisaOverrides(REAL_CSV, REAL.overrides, REAL.verifiedAsOf);
    expect(applied).toBe(REAL.overrides.length);
  });

  it('declares the baseline vintage it forked and the date it was verified', () => {
    expect(REAL.baseline.vintage).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(REAL.verifiedAsOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(REAL.verifiedAsOf >= REAL.baseline.vintage).toBe(true);
  });

  it('sources every correction to a URL — no unsourced opinions in the dataset', () => {
    for (const o of REAL.overrides) {
      expect(o.source, `${o.origin}->${o.destination} has no URL`).toMatch(/^https?:\/\//);
      expect(o.note.trim().length, `${o.origin}->${o.destination} has no note`).toBeGreaterThan(0);
    }
  });

  it('touches only codes that exist in the roster', () => {
    const roster = new Set(parseVisaMatrix(REAL_CSV).countries);
    for (const o of REAL.overrides) {
      expect(roster.has(o.origin), `unknown origin ${o.origin}`).toBe(true);
      expect(roster.has(o.destination), `unknown destination ${o.destination}`).toBe(true);
    }
  });

  it('keeps every time-limited correction in force, so none can rot unnoticed', () => {
    for (const o of REAL.overrides.filter((x) => x.sunset)) {
      expect(o.sunset! >= REAL.verifiedAsOf, `${o.origin}->${o.destination} lapsed ${o.sunset}`).toBe(true);
    }
  });

  it('promotes a SUNSET mentioned in prose into the enforced field', () => {
    // A sunset that lives only in the note is decoration: nothing fails when it passes.
    for (const o of REAL.overrides) {
      if (/sunset/i.test(o.note)) {
        expect(o.sunset, `${o.origin}->${o.destination} mentions a sunset but declares none`).toBeDefined();
      }
    }
  });
});
