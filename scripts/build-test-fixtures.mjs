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
const FIXTURE_TILED_OUT = join(REPO_ROOT, 'tests', 'fixtures', 'sample-tiled.pdf');
const FIXTURE_COLUMNS_OUT = join(REPO_ROOT, 'tests', 'fixtures', 'sample-columns.pdf');

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

// Builds a fixture that triggers pdf.js's QueueOptimizer into emitting
// `paintImageXObjectRepeat`. The optimizer requires at least three
// consecutive `save / transform / paintImageXObject / restore` blocks
// referencing the same XObject and the same scale, with zero skew. We
// place four copies of the same 1×1 PNG at different positions, all
// 50×50pt, so the optimizer collapses them into a single Repeat op
// carrying a positions array of length 8 (4 × [x, y]).
async function buildTiledPdf() {
  const doc = new PDFDocument({
    info: {
      Title: 'pdfvision tiled fixture',
      Author: 'pdfvision build-fixtures',
      Subject: 'paintImageXObjectRepeat fixture',
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

  doc.addPage();
  // Open the image once and reuse the same XObject for every draw —
  // pdfkit's `image()` otherwise allocates a fresh /Im for each Buffer
  // call, which keeps pdf.js's QueueOptimizer from collapsing them.
  const sharedImage = doc.openImage(TINY_RED_PNG);
  // Four instances of the same image at the same size — the optimizer
  // folds the four draws into one Repeat op carrying a positions array.
  doc.image(sharedImage, 50, 50, { width: 50, height: 50 });
  doc.image(sharedImage, 150, 50, { width: 50, height: 50 });
  doc.image(sharedImage, 50, 150, { width: 50, height: 50 });
  doc.image(sharedImage, 150, 150, { width: 50, height: 50 });

  doc.end();
  await done;

  const out = Buffer.concat(chunks);
  writeFileSync(FIXTURE_TILED_OUT, out);
  console.log(`Wrote ${FIXTURE_TILED_OUT} (${out.byteLength} bytes)`);
}

// Builds a two-column fixture for multi-column reading-order tests. Both
// columns sit at the same y but the left column's text comes first in the
// document stream after the right column's, so a naive top-down sort
// would interleave them. The reader should output left column top-to-
// bottom first, then right column top-to-bottom.
async function buildColumnsPdf() {
  const doc = new PDFDocument({
    size: 'A4',
    info: {
      Title: 'pdfvision columns fixture',
      Author: 'pdfvision build-fixtures',
      Subject: 'Multi-column reading order fixture',
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

  // A4 is 595×842pt. Use two ~240pt-wide columns separated by a gutter.
  // Right column written first to ensure detection cannot rely on stream
  // order.
  doc.addPage();
  // A heading spanning both columns, drawn above to exercise the
  // span-the-page heuristic later (we don't drag it into either column).
  doc.fontSize(24).text('Two-column heading', 50, 50, { width: 495 });
  // Right column.
  doc.fontSize(12).text('Right column line one.', 320, 110, { width: 225 });
  doc.fontSize(12).text('Right column line two.', 320, 140, { width: 225 });
  // Left column.
  doc.fontSize(12).text('Left column line one.', 50, 110, { width: 225 });
  doc.fontSize(12).text('Left column line two.', 50, 140, { width: 225 });

  doc.end();
  await done;

  const out = Buffer.concat(chunks);
  writeFileSync(FIXTURE_COLUMNS_OUT, out);
  console.log(`Wrote ${FIXTURE_COLUMNS_OUT} (${out.byteLength} bytes)`);
}

await buildJapanesePdf();
await buildImagePdf();
await buildCompatPdf();
await buildHeadersPdf();
await buildTiledPdf();
await buildColumnsPdf();
