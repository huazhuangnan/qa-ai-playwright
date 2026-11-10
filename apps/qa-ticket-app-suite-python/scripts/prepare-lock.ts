import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const source = join(root, 'requirements.in');
const metadata = join(root, 'requirements.lock.meta.json');
const digest = createHash('sha256').update(readFileSync(source)).digest('hex');

/** Records the requirements input consumed by the generated hash lock. */
writeFileSync(
  metadata,
  `${JSON.stringify({ schema: 1, requirements_in_sha256: digest }, null, 2)}\n`,
  'utf8',
);
