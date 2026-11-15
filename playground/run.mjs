#!/usr/bin/env node
// Builds the playground cases and snapshots what pdfvision returns for them.
//
//   node --run playground               every case: case.pdf, truth.md, read.md, page PNGs, index.html
//   node --run playground -- <name>...  only the named cases (the gallery still lists all of them)
//   node --run playground -- --check    re-read the committed case.pdf files and fail if read.md or
//                                       COVERAGE.md differs
//
// Always rebuilds dist/ first (sub-second), the same way .mcp.json and
// scripts/run-local-cli.mjs do, so a snapshot can never come from a stale bundle.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { renderCoverage, statusLabel, validateMeta } from './lib/coverage.mjs';
import { renderGallery } from './lib/gallery.mjs';
import { startMcpServer } from './lib/mcpClient.mjs';
import { buildCasePdf } from './lib/pdf.mjs';

const PLAYGROUND = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(PLAYGROUND, '..');
const CASES_DIR = join(PLAYGROUND, 'cases');
const COVERAGE_PATH = join(PLAYGROUND, 'COVERAGE.md');

class PlaygroundError extends Error {}

function fail(message) {
  throw new PlaygroundError(message);
}

function parseArgs(argv) {
  const check = argv.includes('--check');
  const unknown = argv.filter((arg) => arg.startsWith('-') && arg !== '--check');
  if (unknown.length > 0) fail(`unknown option ${unknown.join(', ')}`);
  return { check, names: argv.filter((arg) => !arg.startsWith('-')) };
}

function buildDist() {
  const build = spawnSync(process.execPath, ['--run', 'build'], { cwd: REPO_ROOT, encoding: 'utf8' });
  if (build.status !== 0) {
    process.stderr.write(build.stdout ?? '');
    process.stderr.write(build.stderr ?? '');
    fail('`node --run build` failed; the playground needs a fresh dist/.');
  }
}

async function loadCases() {
  const names = readdirSync(CASES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(CASES_DIR, entry.name, 'build.mjs')))
    .map((entry) => entry.name)
    .sort();
  const cases = [];
  for (const name of names) {
    const dir = join(CASES_DIR, name);
    const module = await import(pathToFileURL(join(dir, 'build.mjs')).href);
    for (const key of ['meta', 'truth', 'draw']) {
      if (module[key] === undefined) fail(`cases/${name}/build.mjs does not export \`${key}\``);
    }
    validateMeta(name, module.meta, fail);
    if (module.postprocess !== undefined && typeof module.postprocess !== 'function') {
      fail(`cases/${name}/build.mjs: \`postprocess\` must be a function (pdfBytes) => pdfBytes`);
    }
    cases.push({
      name,
      dir,
      meta: module.meta,
      truth: module.truth,
      draw: module.draw,
      postprocess: module.postprocess,
    });
  }
  return cases;
}

function truthMarkdown({ meta, truth }) {
  const status = meta.status === 'known-gap' ? `known-gap${meta.issue ? ` (#${meta.issue})` : ''}` : meta.status;
  return [
    `# ${meta.title}`,
    '',
    `- **Stresses:** ${meta.stresses}`,
    `- **Families:** ${meta.families.join(', ')}`,
    `- **Status:** ${status}`,
    ...(meta.showcase ? [`- **Showcase:** ${meta.hard.trim()}`] : []),
    '',
    truth.trim(),
    '',
  ].join('\n');
}

/**
 * The response embeds the absolute path the server resolved the source to;
 * rewrite it back to the repo-relative path so the snapshot is the same on
 * every machine. The cache root is a fresh temp dir per run, so any mention
 * of it is replaced as well.
 */
function normalise(text, cacheRoot) {
  const variants = (path) => [...new Set([path, path.replaceAll('\\', '/')])];
  let out = text;
  for (const root of variants(cacheRoot)) out = out.replaceAll(root, '<cache>');
  for (const root of variants(REPO_ROOT)) out = out.replaceAll(`${root}/`, '').replaceAll(`${root}\\`, '');
  return `${out.replace(/\s+$/u, '')}\n`;
}

async function snapshotRead(server, testCase, cacheRoot) {
  const source = relative(REPO_ROOT, join(testCase.dir, 'case.pdf')).replaceAll('\\', '/');
  const result = await server.callTool('read_pdf', { source });
  const text = (result.content ?? [])
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n\n');
  if (result.isError) fail(`read_pdf failed for ${testCase.name}: ${text}`);
  return normalise(text, cacheRoot);
}

function renderPages(testCase, env) {
  for (const file of readdirSync(testCase.dir)) {
    if (/^page-.*\.png$/u.test(file)) rmSync(join(testCase.dir, file));
  }
  const render = spawnSync(
    process.execPath,
    [
      'dist/bin/pdfvision.mjs',
      join(testCase.dir, 'case.pdf'),
      '--no-cache',
      '--render',
      '--render-output',
      testCase.dir,
    ],
    { cwd: REPO_ROOT, env, encoding: 'utf8' },
  );
  if (render.status !== 0) fail(`rendering ${testCase.name} failed:\n${render.stderr}`);
}

function readOrEmpty(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

function diffSummary(path, expected, actual) {
  const scratch = mkdtempSync(join(tmpdir(), 'pdfvision-playground-diff-'));
  try {
    const committed = join(scratch, 'committed.md');
    const current = join(scratch, 'current.md');
    writeFileSync(committed, expected);
    writeFileSync(current, actual);
    const diff = spawnSync('git', ['diff', '--no-index', '--no-color', '--', committed, current], {
      encoding: 'utf8',
    });
    const body = diff.stdout?.split('\n').slice(4).join('\n') || '(git diff unavailable; contents differ)';
    return `--- ${path} (committed)\n+++ ${path} (current)\n${body}`;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

async function main() {
  const { check, names } = parseArgs(process.argv.slice(2));
  const cases = await loadCases();
  const missing = names.filter((name) => !cases.some((testCase) => testCase.name === name));
  if (missing.length > 0) fail(`no such case: ${missing.join(', ')} (have: ${cases.map((c) => c.name).join(', ')})`);
  const selected = names.length > 0 ? cases.filter((testCase) => names.includes(testCase.name)) : cases;

  buildDist();

  // A private cache root per run: a cache entry left by an older build can
  // never end up in a snapshot, and the user's own cache is not touched.
  const cacheRoot = mkdtempSync(join(tmpdir(), 'pdfvision-playground-cache-'));
  const env = { ...process.env, PDFVISION_CACHE_DIR: cacheRoot };
  const server = await startMcpServer({ cwd: REPO_ROOT, env });

  try {
    if (check) {
      const stale = [];
      for (const testCase of selected) {
        const committedPath = join(testCase.dir, 'read.md');
        const committed = readOrEmpty(committedPath);
        const current = await snapshotRead(server, testCase, cacheRoot);
        if (current !== committed) stale.push(diffSummary(`cases/${testCase.name}/read.md`, committed, current));
      }
      const coverage = renderCoverage(cases);
      if (!existsSync(COVERAGE_PATH) || readFileSync(COVERAGE_PATH, 'utf8') !== coverage) {
        stale.push(diffSummary('COVERAGE.md', readOrEmpty(COVERAGE_PATH), coverage));
      }
      if (stale.length > 0) {
        console.error(stale.join('\n\n'));
        fail(
          `${stale.length} snapshot(s) differ (read.md: what pdfvision now returns; COVERAGE.md: the cases' meta). ` +
            'Review the change; if it is intended, run `node --run playground` and commit the new snapshots.',
        );
      }
      console.log(`playground: ${selected.length} read.md snapshot(s) and COVERAGE.md match.`);
      return;
    }

    for (const testCase of selected) {
      writeFileSync(
        join(testCase.dir, 'case.pdf'),
        await buildCasePdf(testCase.meta, testCase.draw, { dir: testCase.dir, postprocess: testCase.postprocess }),
      );
      writeFileSync(join(testCase.dir, 'truth.md'), truthMarkdown(testCase));
      writeFileSync(join(testCase.dir, 'read.md'), await snapshotRead(server, testCase, cacheRoot));
      renderPages(testCase, env);
      console.log(`playground: built ${testCase.name} (${statusLabel(testCase.meta)})`);
    }
    writeFileSync(COVERAGE_PATH, renderCoverage(cases));
    console.log(`playground: wrote ${relative(REPO_ROOT, COVERAGE_PATH)}`);
    writeFileSync(join(PLAYGROUND, 'index.html'), renderGallery(cases));
    console.log(`playground: wrote ${relative(REPO_ROOT, join(PLAYGROUND, 'index.html'))}`);
  } finally {
    await server.close();
    rmSync(cacheRoot, { recursive: true, force: true });
  }
}

try {
  await main();
} catch (error) {
  if (!(error instanceof PlaygroundError)) throw error;
  console.error(`playground: ${error.message}`);
  process.exitCode = 1;
}
