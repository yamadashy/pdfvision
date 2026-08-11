#!/usr/bin/env node
// Prove the embedded documentation is not in either entry's startup path.
//
// The topics are ~170 KB of prose. They are imported dynamically so a normal
// extraction, `--version`, or `--help` never parses them, and rolldown emits
// them as their own chunk. That property is invisible in review and easy to
// lose to a stray static import, so CI checks the built output for it.
//
// Checking only the entry file is not enough: a shared chunk carrying the
// bodies, statically imported by the entry, would pass that. So this walks
// the static import graph from each entry and asserts nothing reachable that
// way carries them.
import { init, parse } from 'es-module-lexer';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = resolve(repoRoot, 'dist');
const entries = [join(distDir, 'bin/pdfvision.mjs'), join(distDir, 'index.mjs')];

// A phrase that only ever appears inside a topic body — never in a topic
// description, which does belong in the entry chunk via the index.
const SENTINEL = 'Bbox overlay on rendered PNG';
const BODIES_SOURCE = resolve(repoRoot, 'src/cli/docs/topicBodies.generated.ts');

function fail(message) {
  console.error(`check-topic-laziness: ${message}`);
  process.exit(1);
}

/**
 * Lexed rather than pattern-matched: the distinction that matters here is
 * exactly the one a regex cannot make reliably, since a topic body is a
 * string literal that can contain anything, including import syntax.
 * `d === -1` marks a static import or re-export; a dynamic one carries the
 * offset of its `import(`.
 */
function resolveSpecifier(file, specifier) {
  // URL resolution rather than path joining, so a `?query` or `#fragment`
  // suffix does not turn into a filename that exists nowhere and gets
  // skipped — a silent skip is indistinguishable from "not imported".
  const url = new URL(specifier, pathToFileURL(file));
  url.search = '';
  url.hash = '';
  return fileURLToPath(url);
}

function staticallyReachable(entry) {
  const seen = new Set();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    if (!existsSync(file)) fail(`${file} is statically imported but does not exist`);
    seen.add(file);
    const [imports] = parse(readFileSync(file, 'utf8'), file);
    for (const record of imports) {
      if (record.d !== -1 || !record.n?.startsWith('.')) continue;
      queue.push(resolveSpecifier(file, record.n));
    }
  }
  return seen;
}

await init;

if (!readFileSync(BODIES_SOURCE, 'utf8').includes(SENTINEL)) {
  fail(`the sentinel is stale: ${BODIES_SOURCE} no longer contains it`);
}

const built = readdirSync(distDir, { recursive: true })
  .filter((name) => typeof name === 'string' && name.endsWith('.mjs'))
  .map((name) => join(distDir, name));
const carrying = built.filter((path) => readFileSync(path, 'utf8').includes(SENTINEL));
if (carrying.length === 0) fail('no built chunk carries the topic bodies');

for (const entry of entries) {
  if (!existsSync(entry)) fail(`expected built entry ${entry} is missing`);
  const reachable = staticallyReachable(entry);
  const leaked = carrying.filter((path) => reachable.has(path));
  if (leaked.length > 0) {
    fail(`${entry} statically reaches the topic bodies through ${leaked.join(', ')}`);
  }
}

console.log(`Topic bodies stay out of the static graph of ${entries.length} built entries.`);
