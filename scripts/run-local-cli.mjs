#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function forwardToStderr(output) {
  if (output) process.stderr.write(output);
}

const build = spawnSync(process.execPath, ['--run', 'build'], {
  cwd: repoRoot,
  encoding: 'utf8',
  stdio: ['ignore', 'pipe', 'pipe'],
});

forwardToStderr(build.stdout);
forwardToStderr(build.stderr);

if (build.error) {
  console.error(build.error.message);
  process.exit(1);
}

if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const cli = spawnSync(process.execPath, ['dist/bin/pdfvision.mjs', ...process.argv.slice(2)], {
  cwd: repoRoot,
  stdio: 'inherit',
});

if (cli.error) {
  console.error(cli.error.message);
  process.exit(1);
}

process.exit(cli.status ?? 1);
