#!/usr/bin/env node
// Prove the embedded documentation is not in the CLI's startup path.
//
// The topics are ~150 KB of prose. They are imported dynamically so a normal
// extraction, `--version`, or `--help` never parses them, and rolldown emits
// them as their own chunk. That property is invisible in review and easy to
// lose to a stray static import, so CI checks the built output for it.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = resolve(repoRoot, 'dist');
const entry = join(distDir, 'bin/pdfvision.mjs');

// A phrase that only ever appears inside a topic body — never in a topic
// description, which does belong in the entry chunk via the index.
const SENTINEL = 'Bbox overlay on rendered PNG';
const BODIES_SOURCE = resolve(repoRoot, 'src/cli/docs/topicBodies.generated.ts');

function fail(message) {
  console.error(`check-topic-laziness: ${message}`);
  process.exit(1);
}

if (!readFileSync(BODIES_SOURCE, 'utf8').includes(SENTINEL)) {
  fail(`the sentinel is stale: ${BODIES_SOURCE} no longer contains it`);
}

const chunks = readdirSync(distDir, { recursive: true })
  .filter((name) => typeof name === 'string' && name.endsWith('.mjs'))
  .map((name) => join(distDir, name));

const carrying = chunks.filter((path) => readFileSync(path, 'utf8').includes(SENTINEL));
if (carrying.length === 0) fail('no built chunk carries the topic bodies');
if (carrying.includes(entry)) {
  fail('the CLI entry chunk carries the topic bodies — something imports them statically');
}

console.log(`Topic bodies live in ${carrying.length} separate chunk(s), not the CLI entry.`);
