#!/usr/bin/env node
// Regenerate the README "Usage" block from the CLI `--help` output so the
// two never drift. The block between the `<!-- usage:start -->` /
// `<!-- usage:end -->` markers in README.md is replaced with a fenced code
// block holding the exact `pdfvision --help` text (Usage + Options +
// Output formats + Examples + Exit codes).
//
// CI runs this then `git diff --exit-code README.md`, so any change to the
// help text that isn't reflected in the README fails the build.
//
// Reads the built CLI at dist/bin/pdfvision.mjs — run `npm run build`
// first (CI does). Kept build-free itself so it works on every Node in the
// support matrix without relying on TypeScript type-stripping.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const readmePath = resolve(repoRoot, 'README.md');
const cliPath = resolve(repoRoot, 'dist/bin/pdfvision.mjs');

const START = '<!-- usage:start -->';
const END = '<!-- usage:end -->';
const NOTE =
  '<!-- Generated from `pdfvision --help` by scripts/sync-readme-usage.mjs. Do not edit by hand; run `node scripts/sync-readme-usage.mjs`. -->';

function fail(message) {
  console.error(`sync-readme-usage: ${message}`);
  process.exit(1);
}

if (!existsSync(cliPath)) {
  fail(`built CLI not found at ${cliPath}. Run \`npm run build\` first.`);
}

const help = spawnSync(process.execPath, [cliPath, '--help'], { cwd: repoRoot, encoding: 'utf8' });
if (help.error) fail(`failed to run the CLI: ${help.error.message}`);
if (help.status !== 0) fail(`\`pdfvision --help\` exited with status ${help.status}`);
const helpText = (help.stdout ?? '').replace(/\s+$/, '');
if (!helpText) fail('`pdfvision --help` produced no output');

const readme = readFileSync(readmePath, 'utf8');
const startIdx = readme.indexOf(START);
const endIdx = readme.indexOf(END);
if (startIdx === -1 || endIdx === -1) {
  fail(`could not find the ${START} / ${END} markers in README.md`);
}
if (endIdx < startIdx) fail(`${END} appears before ${START} in README.md`);

const block = `${START}\n${NOTE}\n\n\`\`\`\n${helpText}\n\`\`\`\n\n${END}`;
const next = readme.slice(0, startIdx) + block + readme.slice(endIdx + END.length);

if (next === readme) {
  console.log('README usage block already up to date.');
  process.exit(0);
}

writeFileSync(readmePath, next);
console.log('README usage block updated from `pdfvision --help`.');
