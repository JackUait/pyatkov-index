import { categorize } from './ingest.ts';

/**
 * Our fork of the upstream visa matrix.
 *
 * The upstream dataset (imorte/passport-index-data) is a 2026-02-17 vintage and has not
 * moved since. Rather than hand-edit the baseline CSV — which would silently destroy our
 * ability to diff against upstream, and lose every reason for every edit — corrections are
 * kept as an additive, sourced layer applied at build time.
 *
 * Every override carries `from`: the value the baseline is expected to hold. If upstream
 * ever refreshes and that value moves, the override stops being a correction and the build
 * fails loudly rather than pinning a stale opinion over fresh data.
 */
export type VisaOverride = {
  origin: string;
  destination: string;
  from: string;
  to: string;
  effective: string;
  source: string;
  note: string;
};

export type VisaOverrideFile = {
  baseline: { source: string; vintage: string };
  verifiedAsOf: string;
  overrides: VisaOverride[];
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function assertVocabulary(value: string, label: string): void {
  // categorize() is the single source of truth for what a cell may say; it throws
  // "unknown visa matrix value" on anything else. '-1' is the diagonal, never a target.
  if (value.trim() === '-1' || value.trim() === '-') {
    throw new Error(`${label}: "-1" is the self cell and cannot be an override target`);
  }
  categorize(value);
}

export function applyVisaOverrides(
  csv: string,
  overrides: VisaOverride[],
  asOf: string,
): { csv: string; applied: number } {
  const lines = csv.trim().split(/\r?\n/);
  const header = lines[0].split(',').map((c) => c.trim());
  const colOf = new Map(header.slice(1).map((code, i) => [code, i + 1]));
  const rowOf = new Map(lines.slice(1).map((line, i) => [line.slice(0, line.indexOf(',')).trim(), i + 1]));
  const cells = lines.map((line) => line.split(',').map((c) => c.trim()));

  const seen = new Set<string>();
  for (const o of overrides) {
    const pair = `${o.origin}->${o.destination}`;
    if (o.origin === o.destination) {
      throw new Error(`override ${pair}: self-pair — the diagonal is not a travel decision`);
    }
    if (seen.has(pair)) throw new Error(`duplicate override for ${pair}`);
    seen.add(pair);

    if (!o.source?.trim()) throw new Error(`override ${pair}: a source is required`);
    if (!ISO_DATE.test(o.effective ?? '')) {
      throw new Error(`override ${pair}: effective must be YYYY-MM-DD, got "${o.effective}"`);
    }
    if (o.effective > asOf) {
      throw new Error(`override ${pair}: not in force — effective ${o.effective} is after ${asOf}`);
    }

    const row = rowOf.get(o.origin);
    if (row === undefined) throw new Error(`override ${pair}: unknown origin "${o.origin}"`);
    const col = colOf.get(o.destination);
    if (col === undefined) throw new Error(`override ${pair}: unknown destination "${o.destination}"`);

    const actual = cells[row][col];
    if (actual !== o.from) {
      throw new Error(
        `override ${pair}: baseline moved — expected "${o.from}", found "${actual}". ` +
          `Re-verify against the current source before re-applying.`,
      );
    }
    if (o.to === o.from) throw new Error(`override ${pair}: no-op — "${o.to}" is already the baseline`);
    assertVocabulary(o.to, `override ${pair}`);

    cells[row][col] = o.to;
  }

  return { csv: cells.map((r) => r.join(',')).join('\n'), applied: overrides.length };
}
