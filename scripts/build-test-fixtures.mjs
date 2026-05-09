#!/usr/bin/env node
// Generates Japanese-text PDF fixtures used by the integration tests.
//
//   node --run build-fixtures
//
// The font (Noto Sans JP Regular) is sourced from the
// @expo-google-fonts/noto-sans-jp devDependency rather than fetched from
// the network, so this script is fully reproducible from the lockfile and
// runs offline.
//
// The generated PDF (tests/fixtures/sample-ja.pdf) is committed to the
// repo. Tests don't run this script; they consume the committed PDF
// directly. Re-run this script when you intentionally want to update the
// fixture content or pick up a font version bump.

import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');

// Resolve the bundled TTF via the package's own subpath. createRequire is
// the official ESM way to use require.resolve for non-imported assets.
const require = createRequire(import.meta.url);
const FONT_PATH = require.resolve('@expo-google-fonts/noto-sans-jp/400Regular/NotoSansJP_400Regular.ttf');

const FIXTURE_OUT = join(REPO_ROOT, 'tests', 'fixtures', 'sample-ja.pdf');
const FIXTURE_IMAGES_OUT = join(REPO_ROOT, 'tests', 'fixtures', 'sample-with-image.pdf');
const FIXTURE_COMPAT_OUT = join(REPO_ROOT, 'tests', 'fixtures', 'sample-compat.pdf');
const FIXTURE_HEADERS_OUT = join(REPO_ROOT, 'tests', 'fixtures', 'sample-headers.pdf');

// Smallest standard valid PNG (1×1 red pixel). Embedded into the fixture
// so pdfjs emits a paintImageXObject opcode and density tests can verify
// imageCount > 0.
const TINY_RED_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

// Pinning timestamps + a deterministic trailer /ID makes the generated
// PDF byte-identical across runs. Without this, every
// `node --run build-fixtures` would dirty the committed fixture even
// when the content hasn't actually changed.
const FIXED_DATE = new Date('2026-01-01T00:00:00Z');
const FIXED_FILE_ID = Buffer.from('pdfvision-test-fixture-id-2026!!');

async function buildJapanesePdf() {
  const doc = new PDFDocument({
    info: {
      Title: 'pdfvision テストフィクスチャ',
      Author: 'pdfvision build-fixtures',
      Subject: '日本語抽出と複数ページのテスト',
      Creator: 'pdfvision',
      CreationDate: FIXED_DATE,
      ModDate: FIXED_DATE,
    },
    autoFirstPage: false,
  });

  // pdfkit derives the trailer /ID from Math.random(); replace
  // _id with a fixed buffer so the bytes don't shift each run.
  doc._id = FIXED_FILE_ID;

  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolveDone, rejectDone) => {
    doc.on('end', resolveDone);
    doc.on('error', rejectDone);
  });

  doc.registerFont('NotoJP', FONT_PATH);

  doc.addPage().font('NotoJP').fontSize(20).text('これは pdfvision のテスト用 PDF です。');
  doc.moveDown().fontSize(14).text('日本語のテキスト抽出と複数ページの動作を確認します。');

  doc.addPage().fontSize(20).text('2 ページ目');
  doc.moveDown().fontSize(14).text('カタカナ・ひらがな・漢字、すべて含みます。');

  doc.addPage().fontSize(20).text('3 ページ目');
  doc.moveDown().fontSize(14).text('最後のページです。');

  doc.end();
  await done;

  const out = Buffer.concat(chunks);
  writeFileSync(FIXTURE_OUT, out);
  console.log(`Wrote ${FIXTURE_OUT} (${out.byteLength} bytes)`);
}

async function buildImagePdf() {
  const doc = new PDFDocument({
    info: {
      Title: 'pdfvision image fixture',
      Author: 'pdfvision build-fixtures',
      Subject: 'Embedded image for density-metadata tests',
      Creator: 'pdfvision',
      CreationDate: FIXED_DATE,
      ModDate: FIXED_DATE,
    },
    autoFirstPage: false,
  });
  doc._id = FIXED_FILE_ID;

  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolveDone, rejectDone) => {
    doc.on('end', resolveDone);
    doc.on('error', rejectDone);
  });

  doc.addPage().fontSize(20).text('Image fixture');
  // Embed the same tiny PNG twice so paintImageXObject is present and we
  // can exercise the imageCount > 1 path as well.
  doc.image(TINY_RED_PNG, 50, 100, { width: 50, height: 50 });
  doc.image(TINY_RED_PNG, 150, 100, { width: 50, height: 50 });

  doc.end();
  await done;

  const out = Buffer.concat(chunks);
  writeFileSync(FIXTURE_IMAGES_OUT, out);
  console.log(`Wrote ${FIXTURE_IMAGES_OUT} (${out.byteLength} bytes)`);
}

// Builds a fixture exercising Unicode NFKC normalization: title + body
// contain compatibility codepoints (fullwidth ASCII, fullwidth digits,
// halfwidth katakana) that must collapse to canonical forms when
// `normalize: true` is the default.
async function buildCompatPdf() {
  const doc = new PDFDocument({
    info: {
      // Fullwidth Latin "Compat" + fullwidth digits "２０２６".
      Title: 'Ｃｏｍｐａｔ ２０２６',
      Author: 'pdfvision build-fixtures',
      Subject: 'NFKC normalization fixture',
      Creator: 'pdfvision',
      CreationDate: FIXED_DATE,
      ModDate: FIXED_DATE,
    },
    autoFirstPage: false,
  });
  doc._id = FIXED_FILE_ID;

  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolveDone, rejectDone) => {
    doc.on('end', resolveDone);
    doc.on('error', rejectDone);
  });

  doc.registerFont('NotoJP', FONT_PATH);
  // Body mixes fullwidth ASCII letters/digits and halfwidth katakana so
  // the test can assert NFKC produced 'ABC123 カナ' (canonical) and the
  // raw form contained the compatibility codepoints.
  doc.addPage().font('NotoJP').fontSize(20).text('ＡＢＣ１２３ ｶﾅ');

  doc.end();
  await done;

  const out = Buffer.concat(chunks);
  writeFileSync(FIXTURE_COMPAT_OUT, out);
  console.log(`Wrote ${FIXTURE_COMPAT_OUT} (${out.byteLength} bytes)`);
}

// Builds a fixture for the running-header / footer detection in --layout.
// Three pages, each with the same header line at the same y position so
// the cross-page detection can flag it as `repeated: true`. Bodies differ.
async function buildHeadersPdf() {
  const doc = new PDFDocument({
    info: {
      Title: 'pdfvision headers fixture',
      Author: 'pdfvision build-fixtures',
      Subject: 'Repeated-block detection fixture',
      Creator: 'pdfvision',
      CreationDate: FIXED_DATE,
      ModDate: FIXED_DATE,
    },
    autoFirstPage: false,
  });
  doc._id = FIXED_FILE_ID;

  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolveDone, rejectDone) => {
    doc.on('end', resolveDone);
    doc.on('error', rejectDone);
  });

  for (let i = 1; i <= 3; i++) {
    doc.addPage().fontSize(10).text('pdfvision headers fixture', 50, 30);
    doc.fontSize(20).text(`Body of page ${i}`, 50, 200);
  }

  doc.end();
  await done;

  const out = Buffer.concat(chunks);
  writeFileSync(FIXTURE_HEADERS_OUT, out);
  console.log(`Wrote ${FIXTURE_HEADERS_OUT} (${out.byteLength} bytes)`);
}

await buildJapanesePdf();
await buildImagePdf();
await buildCompatPdf();
await buildHeadersPdf();
