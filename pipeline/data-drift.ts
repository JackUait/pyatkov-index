// ---------------------------------------------------------------------------
// B3 (process-level, defense-in-depth). Compares the committed generated data
// against a freshly regenerated `yarn pipeline` run so a silent data-source or
// formula corruption cannot ship stale numbers. The only field allowed to
// differ is the build DATE (it changes every run and is not a data vintage).
//
// Pure comparison helpers live here so they are unit-testable without git or
// the network; the CLI wrapper is pipeline/check-data-drift.ts.
// ---------------------------------------------------------------------------

/** The four files `yarn pipeline` writes into site/src/data. */
export const DATA_FILES = ['rankings.json', 'weights.json', 'matrix.json', 'openness.json'] as const;

/** Top-level metadata that is expected to change every build and is NOT drift. */
const VOLATILE_KEYS = ['builtAt', 'generatedAt'] as const;

/** Parse a data file and strip volatile top-level metadata to a stable string. */
export function canonicalize(json: string): string {
  const obj = JSON.parse(json) as unknown;
  if (obj !== null && typeof obj === 'object' && !Array.isArray(obj)) {
    const rec = obj as Record<string, unknown>;
    for (const k of VOLATILE_KEYS) delete rec[k];
  }
  return JSON.stringify(obj);
}

/** True when the committed and freshly-generated payloads differ in substance. */
export function driftsFrom(committed: string, fresh: string): boolean {
  return canonicalize(committed) !== canonicalize(fresh);
}
