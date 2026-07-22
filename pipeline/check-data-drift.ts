// ---------------------------------------------------------------------------
// B3 CLI (process-level). Run AFTER `yarn pipeline` has regenerated
// site/src/data. Compares each freshly-written file (working tree) against the
// version committed at HEAD, ignoring the build date. Exits non-zero on drift
// so CI fails when the committed numbers are stale relative to a fresh build.
// ---------------------------------------------------------------------------
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DATA_FILES, driftsFrom } from './data-drift.ts';

const ROOT = join(import.meta.dirname, '..');

function main(): void {
  const drifted: string[] = [];
  for (const file of DATA_FILES) {
    const rel = `site/src/data/${file}`;
    let committed: string;
    try {
      committed = execFileSync('git', ['show', `HEAD:${rel}`], { encoding: 'utf8', cwd: ROOT });
    } catch {
      drifted.push(`${file} (missing at HEAD)`);
      continue;
    }
    const fresh = readFileSync(join(ROOT, rel), 'utf8');
    if (driftsFrom(committed, fresh)) drifted.push(file);
  }

  if (drifted.length > 0) {
    console.error(`Data drift detected in: ${drifted.join(', ')}`);
    console.error('The committed site/src/data/*.json differs from a fresh `yarn pipeline` run');
    console.error('(build date aside). Run `yarn pipeline` and commit the regenerated files.');
    process.exit(1);
  }
  console.log(`site/src/data is in sync with a fresh pipeline run (${DATA_FILES.join(', ')}).`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main();
}
