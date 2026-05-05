import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function getVersion(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const candidate of [join(here, '..', '..', 'package.json'), join(here, '..', 'package.json')]) {
    try {
      const pkg = JSON.parse(readFileSync(candidate, 'utf-8')) as { version?: string };
      if (pkg.version) return pkg.version;
    } catch {
      // try next
    }
  }
  return 'unknown';
}
