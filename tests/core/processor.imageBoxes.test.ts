import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { processDocument } from '../../src/core/processor.js';

const SAMPLE_PDF = resolve(__dirname, '../fixtures/sample.pdf');
const SAMPLE_WITH_IMAGE_PDF = resolve(__dirname, '../fixtures/sample-with-image.pdf');
const SAMPLE_TILED_PDF = resolve(__dirname, '../fixtures/sample-tiled.pdf');

describe('processDocument imageBoxes: true', () => {
  it('omits imageBoxes by default', async () => {
    const result = await processDocument(SAMPLE_PDF, { noCache: true });
    expect(result.pages[0].imageBoxes).toBeUndefined();
  });

  it('emits an empty imageBoxes array on a text-only page', async () => {
    // A page with no raster draws still gets an explicit empty array,
    // which is more useful for downstream code than an undefined: it
    // tells the agent "we looked, there were zero" instead of "we did
    // not look".
    const result = await processDocument(SAMPLE_PDF, { noCache: true, imageBoxes: true });
    expect(result.pages[0].imageBoxes).toEqual([]);
  });

  it('reports the bounding box of every raster image draw', async () => {
    // sample-with-image.pdf places two 50×50pt PNGs at (50,100) and
    // (150,100) on a 612×792pt page (top-down origin). The fixture
    // builder pins those coordinates, so the bboxes must come back
    // pixel-accurate — drift here means the CTM tracker miscounted.
    const result = await processDocument(SAMPLE_WITH_IMAGE_PDF, { noCache: true, imageBoxes: true });
    const boxes = result.pages[0].imageBoxes ?? [];
    expect(boxes.length).toBe(2);
    expect(boxes).toEqual(
      expect.arrayContaining([
        { x: 50, y: 100, width: 50, height: 50 },
        { x: 150, y: 100, width: 50, height: 50 },
      ]),
    );
  });

  it('matches imageCount with the number of imageBoxes', async () => {
    const result = await processDocument(SAMPLE_WITH_IMAGE_PDF, { noCache: true, imageBoxes: true });
    expect(result.pages[0].imageBoxes?.length).toBe(result.pages[0].imageCount);
  });

  it('emits one bbox per image even when the page contains multiple draws', async () => {
    // sample-tiled.pdf places four 50×50pt copies of the same PNG in a
    // 2×2 grid at (50, 50), (150, 50), (50, 150), (150, 150). The
    // optimizer-collapse path in pdf.js 5.x doesn't trigger on this
    // input (alpha PNGs gain an SMask wrapper that breaks the 4-op
    // pattern), so the fixture exercises four distinct paintImageXObject
    // ops; we still expect imageCount and imageBoxes.length to agree.
    const result = await processDocument(SAMPLE_TILED_PDF, { noCache: true, imageBoxes: true });
    const boxes = result.pages[0].imageBoxes ?? [];
    expect(boxes.length).toBe(4);
    expect(result.pages[0].imageCount).toBe(4);
    const corners = boxes.map((b) => `${b.x},${b.y}`).sort();
    expect(corners).toEqual(['150,150', '150,50', '50,150', '50,50']);
  });

  it('keeps cache entries with vs without imageBoxes separate', async () => {
    const noBoxes = await processDocument(SAMPLE_WITH_IMAGE_PDF, { noCache: false });
    const withBoxes = await processDocument(SAMPLE_WITH_IMAGE_PDF, { noCache: false, imageBoxes: true });
    expect(noBoxes.pages[0].imageBoxes).toBeUndefined();
    expect(withBoxes.pages[0].imageBoxes).toBeDefined();
  });
});
