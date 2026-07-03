import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createCanvas } from '@napi-rs/canvas';
import PDFDocument from 'pdfkit';
import { describe, expect, it } from 'vitest';
import { processDocument } from '../../src/core/processor.js';

const SAMPLE_PDF = resolve(__dirname, '../fixtures/sample.pdf');
const SAMPLE_WITH_IMAGE_PDF = resolve(__dirname, '../fixtures/sample-with-image.pdf');

async function buildPdfWithLargeImage(): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  const doc = new PDFDocument({ size: [612, 792], margin: 0 });
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<void>((resolveDone) => doc.on('end', resolveDone));

  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
    'base64',
  );
  doc.text('Large image', 72, 48);
  doc.image(png, 72, 120, { width: 240, height: 180 });
  doc.end();

  await done;
  return new Uint8Array(Buffer.concat(chunks));
}

async function buildPdfWithSparseRasterImage(): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  const doc = new PDFDocument({ size: [612, 792], margin: 0 });
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<void>((resolveDone) => doc.on('end', resolveDone));

  const canvas = createCanvas(100, 100);
  const context = canvas.getContext('2d');
  context.fillStyle = 'white';
  context.fillRect(0, 0, 100, 100);
  context.fillStyle = 'black';
  context.fillRect(10, 20, 40, 30);
  doc.image(canvas.toBuffer('image/png'), 72, 120, { width: 240, height: 180 });
  doc.end();

  await done;
  return new Uint8Array(Buffer.concat(chunks));
}

async function buildPdfWithBlankFullPageImage(): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  const doc = new PDFDocument({ size: [612, 792], margin: 0 });
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<void>((resolveDone) => doc.on('end', resolveDone));

  const canvas = createCanvas(100, 100);
  const context = canvas.getContext('2d');
  context.fillStyle = 'white';
  context.fillRect(0, 0, 100, 100);
  doc.image(canvas.toBuffer('image/png'), 0, 0, { width: 612, height: 792 });
  doc.end();

  await done;
  return new Uint8Array(Buffer.concat(chunks));
}

async function buildRotatedPdfWithFullPageImage(): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  const doc = new PDFDocument({ size: [596, 842], margin: 0 });
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<void>((resolveDone) => doc.on('end', resolveDone));

  const canvas = createCanvas(100, 100);
  const context = canvas.getContext('2d');
  context.fillStyle = 'white';
  context.fillRect(0, 0, 100, 100);
  context.fillStyle = 'black';
  context.fillRect(20, 20, 50, 40);
  (doc.page.dictionary.data as Record<string, unknown>).Rotate = 270;
  doc.image(canvas.toBuffer('image/png'), 0, 0, { width: 596, height: 842 });
  doc.end();

  await done;
  return new Uint8Array(Buffer.concat(chunks));
}

async function buildPdfWithRepeatedCaptionLikeHeader(): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  const doc = new PDFDocument({ size: [300, 300], margin: 0 });
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<void>((resolveDone) => doc.on('end', resolveDone));

  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
    'base64',
  );
  for (let page = 1; page <= 2; page++) {
    if (page > 1) doc.addPage();
    doc.fontSize(10).text('Figure 1. Running header', 60, 40);
    doc.fontSize(12).text(`Body of page ${page}`, 60, 220);
    doc.image(png, 70, 70, { width: 80, height: 60 });
  }
  doc.end();

  await done;
  return new Uint8Array(Buffer.concat(chunks));
}

describe('processDocument visualRegions: true', () => {
  it('omits visualRegions by default', async () => {
    const result = await processDocument(SAMPLE_WITH_IMAGE_PDF, { noCache: true });
    expect(result.pages[0].visualRegions).toBeUndefined();
  });

  it('emits an empty visualRegions array on a text-only page', async () => {
    const result = await processDocument(SAMPLE_PDF, { noCache: true, visualRegions: true });
    expect(result.pages[0].visualRegions).toEqual([]);
  });

  it('emits crop-ready raster regions without exposing raw helper fields', async () => {
    const result = await processDocument('memory://large-image.pdf', {
      sourceData: await buildPdfWithLargeImage(),
      noCache: true,
      visualRegions: true,
    });
    const page = result.pages[0];
    const region = page.visualRegions?.[0];

    expect(region).toMatchObject({
      id: 'p1-vr0',
      kind: 'raster',
      sourceCount: 1,
      sources: [{ type: 'imageBox', index: 0 }],
    });
    expect(region).toBeDefined();
    if (!region) return;
    expect(region.width).toBeGreaterThan(0);
    expect(region.height).toBeGreaterThan(0);
    expect(region.x).toBeGreaterThanOrEqual(0);
    expect(region.y).toBeGreaterThanOrEqual(0);
    expect(region.x + region.width).toBeLessThanOrEqual(page.width);
    expect(region.y + region.height).toBeLessThanOrEqual(page.height);

    expect(page.imageBoxes).toBeUndefined();
    expect(page.vectorBoxes).toBeUndefined();
    expect(page.layout).toBeUndefined();
    expect(page.formFields).toBeUndefined();
  });

  it('renders visual region crops without rendering full pages', async () => {
    const result = await processDocument('memory://large-image-render-regions.pdf', {
      sourceData: await buildPdfWithLargeImage(),
      noCache: true,
      renderVisualRegions: true,
    });
    const page = result.pages[0];
    const region = page.visualRegions?.[0];

    expect(page.image).toBeUndefined();
    expect(region).toBeDefined();
    if (!region) return;
    expect(region.image).toBeDefined();
    expect(region.image).toMatch(/page-1_x/);
    expect(region.image && existsSync(region.image)).toBe(true);
    expect(region.renderContentRatio).toBeTypeOf('number');
    expect(page.imageBoxes).toBeUndefined();
    expect(page.layout).toBeUndefined();
  });

  it('reports tight rendered content boxes for sparse raster crops', async () => {
    const result = await processDocument('memory://sparse-raster-render-regions.pdf', {
      sourceData: await buildPdfWithSparseRasterImage(),
      noCache: true,
      renderVisualRegions: true,
      renderScale: 2,
    });
    const region = result.pages[0].visualRegions?.[0];

    expect(region).toBeDefined();
    if (!region) return;
    expect(region).toMatchObject({ kind: 'raster' });
    expect(region.renderedContentBox).toBeDefined();
    const contentBox = region.renderedContentBox;
    if (!contentBox) return;
    expect(contentBox.x).toBeGreaterThan(region.x);
    expect(contentBox.y).toBeGreaterThan(region.y);
    expect(contentBox.width).toBeLessThan(region.width);
    expect(contentBox.height).toBeLessThan(region.height);
    expect(contentBox.x + contentBox.width).toBeLessThanOrEqual(region.x + region.width);
    expect(contentBox.y + contentBox.height).toBeLessThanOrEqual(region.y + region.height);
  });

  it('uses rendered full-page region evidence to suppress blank raster pages', async () => {
    const result = await processDocument('memory://blank-full-page-image.pdf', {
      sourceData: await buildPdfWithBlankFullPageImage(),
      noCache: true,
      renderVisualRegions: true,
      renderScale: 1,
    });
    const page = result.pages[0];

    expect(page.image).toBeUndefined();
    expect(page.renderContentRatio).toBeTypeOf('number');
    expect(page.quality).toEqual({ nativeTextStatus: 'empty', visualStatus: 'blank' });
    expect(page.visualRegions).toEqual([]);
    expect(page.warnings?.map((warning) => warning.code) ?? []).not.toContain('raster_image_no_native_text');
    expect(page.warnings?.map((warning) => warning.code) ?? []).not.toContain('large_raster_low_text_overlap');
  });

  it('emits and renders visual regions for rotated image-only pages', async () => {
    const { loadImage } = await import('@napi-rs/canvas');
    const result = await processDocument('memory://rotated-full-page-image.pdf', {
      sourceData: await buildRotatedPdfWithFullPageImage(),
      noCache: true,
      renderVisualRegions: true,
      renderScale: 1,
    });
    const page = result.pages[0];
    const region = page.visualRegions?.[0];

    expect(page).toMatchObject({ width: 596, height: 842 });
    expect(page.image).toBeUndefined();
    expect(region).toMatchObject({
      id: 'p1-vr0',
      kind: 'raster',
      x: 0,
      y: 0,
      width: 596,
      height: 842,
      areaRatio: 1,
    });
    expect(region?.image).toBeDefined();
    const img = await loadImage(region?.image as string);
    expect(img.width).toBe(842);
    expect(img.height).toBe(596);
  });

  it('suppresses repeated caption-like chrome without exposing layout', async () => {
    const result = await processDocument('memory://repeated-caption-like-header.pdf', {
      sourceData: await buildPdfWithRepeatedCaptionLikeHeader(),
      noCache: true,
      visualRegions: true,
    });

    expect(result.pages).toHaveLength(2);
    for (const page of result.pages) {
      const region = page.visualRegions?.[0];
      expect(page.layout).toBeUndefined();
      expect(region).toBeDefined();
      expect(region?.associatedText).toBeUndefined();
    }
  });
});
