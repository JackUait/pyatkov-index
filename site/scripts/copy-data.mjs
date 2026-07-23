// The Dataset JSON-LD advertises distribution URLs under /data/, so the four
// published JSON files have to exist as real static assets. public/data/ is
// generated and gitignored; this runs from `build`.
import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dest = join(root, 'public', 'data');
await mkdir(dest, { recursive: true });

for (const name of ['rankings', 'openness', 'matrix', 'weights']) {
  await copyFile(join(root, 'src', 'data', `${name}.json`), join(dest, `${name}.json`));
}
