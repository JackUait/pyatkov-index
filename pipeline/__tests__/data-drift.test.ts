import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canonicalize, driftsFrom, DATA_FILES } from '../data-drift.ts';

const ROOT = join(import.meta.dirname, '..', '..');

// ---------------------------------------------------------------------------
// B3 (process-level, defense-in-depth). The committed site/src/data/*.json must
// equal a fresh `yarn pipeline` run so a silent data/formula corruption cannot
// ship stale numbers. The only legitimate difference is the build DATE, which
// changes on every run and must NOT count as drift.
// ---------------------------------------------------------------------------
describe('data-drift detection (B3)', () => {
  it('enumerates the four generated data files', () => {
    expect(DATA_FILES).toEqual(['rankings.json', 'weights.json', 'matrix.json', 'openness.json']);
  });

  it('does NOT flag drift when only the build date differs (builtAt)', () => {
    const committed = JSON.stringify({ builtAt: '2026-07-20', totalDestinations: 199, passports: [{ iso3: 'USA', score: 84.1 }] });
    const fresh = JSON.stringify({ builtAt: '2026-07-22', totalDestinations: 199, passports: [{ iso3: 'USA', score: 84.1 }] });
    expect(driftsFrom(committed, fresh)).toBe(false);
  });

  it('does NOT flag drift when only the legacy generatedAt label differs', () => {
    const committed = JSON.stringify({ generatedAt: '2026-07-20', passports: [{ iso3: 'USA', score: 84.1 }] });
    const fresh = JSON.stringify({ generatedAt: '2026-07-22', passports: [{ iso3: 'USA', score: 84.1 }] });
    expect(driftsFrom(committed, fresh)).toBe(false);
  });

  it('FLAGS drift when a shipped score changes (the corruption B3 must catch)', () => {
    const committed = JSON.stringify({ builtAt: '2026-07-20', passports: [{ iso3: 'USA', score: 84.1 }] });
    const fresh = JSON.stringify({ builtAt: '2026-07-20', passports: [{ iso3: 'USA', score: 91.7 }] });
    expect(driftsFrom(committed, fresh)).toBe(true);
  });

  it('FLAGS drift when the structure changes (a passport is added/removed)', () => {
    const committed = JSON.stringify({ builtAt: '2026-07-20', passports: [{ iso3: 'USA', score: 84.1 }] });
    const fresh = JSON.stringify({ builtAt: '2026-07-20', passports: [{ iso3: 'USA', score: 84.1 }, { iso3: 'DEU', score: 90 }] });
    expect(driftsFrom(committed, fresh)).toBe(true);
  });

  it('handles files with no volatile metadata (weights.json / matrix.json shape)', () => {
    const same = JSON.stringify({ destinations: [{ iso3: 'USA', weight: 0.9 }] });
    expect(driftsFrom(same, same)).toBe(false);
    const changed = JSON.stringify({ destinations: [{ iso3: 'USA', weight: 1.2 }] });
    expect(driftsFrom(same, changed)).toBe(true);
    // matrix.json is a bare ISO3->row map with no volatile key.
    const matrix = JSON.stringify({ AFG: { ALB: 'e-visa' } });
    expect(driftsFrom(matrix, matrix)).toBe(false);
  });

  it('canonicalize strips only volatile top-level keys, preserving payload', () => {
    const c = canonicalize(JSON.stringify({ builtAt: 'x', generatedAt: 'y', totalDestinations: 199 }));
    expect(JSON.parse(c)).toEqual({ totalDestinations: 199 });
  });
});

// The B3 process gate is only real if it is actually wired into package.json and
// CI. This guards against someone silently deleting the regenerate-and-diff /
// type-check steps and letting the suite go green over corrupt data again.
describe('B3 process gate is wired into package.json + CI', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { scripts: Record<string, string> };
  const workflow = readFileSync(join(ROOT, '.github', 'workflows', 'deploy.yml'), 'utf8');

  it('exposes a check-data-drift script that runs the drift CLI', () => {
    expect(pkg.scripts['check-data-drift']).toMatch(/check-data-drift/);
  });

  it('CI regenerates the data then runs the drift gate, in that order', () => {
    const pipelineAt = workflow.indexOf('yarn pipeline');
    const driftAt = workflow.indexOf('yarn check-data-drift');
    expect(pipelineAt).toBeGreaterThanOrEqual(0);
    expect(driftAt).toBeGreaterThan(pipelineAt); // drift check must run AFTER regeneration
  });

  it('CI type-checks both the pipeline and the site', () => {
    expect(workflow).toMatch(/yarn typecheck-all/);
    expect(pkg.scripts['typecheck-all']).toMatch(/tsc --noEmit.*cd site.*yarn typecheck/s);
  });
});

describe('DATA_FILES covers every generated file', () => {
  it('includes openness.json so a corrupted openness rating cannot ship stale', () => {
    expect(DATA_FILES).toContain('openness.json');
  });
});
