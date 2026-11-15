import { createCanvas, loadImage } from '@napi-rs/canvas';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { describe, expect, it } from 'vitest';
import {
  framePointToPdf,
  type Matrix6,
  pageDisplayFrame,
  pdfPointToFrame,
} from '../../src/core/geometry/displayFrame.js';
import { annotationsInFrame, structTreeInFrame } from '../../src/core/geometry/displayFrameInputs.js';
import { transformOcrWords } from '../../src/core/ocr/words.js';
import { processDocument } from '../../src/core/processor.js';
import type { DocumentResult, PageResult } from '../../src/types/index.js';

// One landscape page as a reader sees it: 300 × 200, two text lines, a
// black block and a link. Each fixture stores that same drawing with a
// different /Rotate, so every rotation must read exactly like rotation 0.
const DISPLAY_WIDTH = 300;
const DISPLAY_HEIGHT = 200;
// The black block in displayed top-left coordinates.
const BLOCK = { x: 200, y: 110, width: 60, height: 50 };
const LINK = { x: 30, y: 85, width: 90, height: 15 };
const ROTATIONS = [0, 90, 180, 270] as const;

interface FixtureOptions {
  rotation: (typeof ROTATIONS)[number];
  /** Draw the page upright as stored, so /Rotate turns it sideways in a viewer. */
  storedUpright?: boolean;
  originX?: number;
  originY?: number;
  userUnit?: number;
}

/**
 * Displayed y-up point (p, q) → stored PDF user space, derived from how a
 * viewer turns the stored box clockwise by `rotation`.
 */
function displayToStored({ rotation, storedUpright, originX = 0, originY = 0 }: FixtureOptions): Matrix6 {
  if (storedUpright) return [1, 0, 0, 1, originX, originY];
  switch (rotation) {
    case 0:
      return [1, 0, 0, 1, originX, originY];
    case 90:
      return [0, 1, -1, 0, originX + DISPLAY_HEIGHT, originY];
    case 180:
      return [-1, 0, 0, -1, originX + DISPLAY_WIDTH, originY + DISPLAY_HEIGHT];
    case 270:
      return [0, -1, 1, 0, originX, originY + DISPLAY_WIDTH];
  }
}

function apply(m: Matrix6, x: number, y: number): [number, number] {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}

function buildRawPdf(objects: string[]): Uint8Array {
  let body = '%PDF-1.7\n';
  const offsets: number[] = [0];
  for (const [index, object] of objects.entries()) {
    offsets[index + 1] = Buffer.byteLength(body, 'binary');
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(body, 'binary');
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) body += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(body, 'binary'));
}

function buildRotatedFixture(options: FixtureOptions): Uint8Array {
  const { rotation, originX = 0, originY = 0, userUnit = 1 } = options;
  const quarter = !options.storedUpright && (rotation === 90 || rotation === 270);
  const storedWidth = quarter ? DISPLAY_HEIGHT : DISPLAY_WIDTH;
  const storedHeight = quarter ? DISPLAY_WIDTH : DISPLAY_HEIGHT;
  const m = displayToStored(options);
  const blockBottom = DISPLAY_HEIGHT - BLOCK.y - BLOCK.height;
  const stream = [
    `${m.join(' ')} cm`,
    'BT /F1 12 Tf 30 160 Td (Alpha line) Tj ET',
    'BT /F1 12 Tf 30 140 Td (Beta line) Tj ET',
    `0 0 0 rg ${BLOCK.x} ${blockBottom} ${BLOCK.width} ${BLOCK.height} re f`,
  ].join('\n');
  const [lx1, ly1] = apply(m, LINK.x, DISPLAY_HEIGHT - LINK.y - LINK.height);
  const [lx2, ly2] = apply(m, LINK.x + LINK.width, DISPLAY_HEIGHT - LINK.y);
  const linkRect = [Math.min(lx1, lx2), Math.min(ly1, ly2), Math.max(lx1, lx2), Math.max(ly1, ly2)];
  return buildRawPdf([
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [${originX} ${originY} ${originX + storedWidth} ${originY + storedHeight}] /Rotate ${rotation}${
      userUnit === 1 ? '' : ` /UserUnit ${userUnit}`
    } /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R /Annots [6 0 R] >>`,
    `<< /Length ${Buffer.byteLength(stream, 'binary')} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Type /Annot /Subtype /Link /Rect [${linkRect.join(' ')}] /Border [0 0 0] /A << /S /URI /URI (https://example.com/) >> >>`,
  ]);
}

async function read(options: FixtureOptions, extra: Record<string, unknown> = {}): Promise<DocumentResult> {
  return processDocument(
    `memory://rotation-${options.rotation}-${options.storedUpright ? 'stored' : 'displayed'}-${options.originX ?? 0}-${options.userUnit ?? 1}.pdf`,
    {
      sourceData: buildRotatedFixture(options),
      noCache: true,
      ...extra,
    },
  );
}

function geometryOf(page: PageResult) {
  return {
    text: page.text,
    width: page.width,
    height: page.height,
    spans: page.spans,
    blocks: page.layout?.blocks.map(({ text, x, y, width, height }) => ({ text, x, y, width, height })),
    vectorBoxes: page.vectorBoxes,
    links: page.links?.map(({ x, y, width, height }) => ({ x, y, width, height })),
    matches: page.matches?.map((match) => match.bbox),
  };
}

const GEOMETRY_OPTIONS = { layout: true, geometry: true, vectorBoxes: true, links: true, search: 'Beta' };

async function darkFraction(image: string): Promise<number> {
  const img = await loadImage(image);
  const canvas = createCanvas(img.width, img.height);
  const context = canvas.getContext('2d');
  context.drawImage(img, 0, 0);
  const { data } = context.getImageData(0, 0, img.width, img.height);
  let dark = 0;
  for (let i = 0; i < data.length; i += 4) if (data[i] < 64 && data[i + 1] < 64 && data[i + 2] < 64) dark++;
  return dark / (data.length / 4);
}

describe('pageDisplayFrame', () => {
  it.each(ROTATIONS)('maps the stored box corners onto the displayed page for /Rotate %i', (rotation) => {
    const view = [-40, 25, rotation % 180 === 0 ? 260 : 160, rotation % 180 === 0 ? 225 : 325];
    const frame = pageDisplayFrame(view, rotation);
    expect({ width: frame.width, height: frame.height }).toEqual({ width: DISPLAY_WIDTH, height: DISPLAY_HEIGHT });
    const m = displayToStored({ rotation, originX: -40, originY: 25 });
    // Displayed top-left / bottom-right corners, from the independent fixture matrix.
    const [tlx, tly] = apply(m, 0, DISPLAY_HEIGHT);
    const [brx, bry] = apply(m, DISPLAY_WIDTH, 0);
    expect(pdfPointToFrame(frame, tlx, tly).map((n) => Math.round(n * 1e9) / 1e9)).toEqual([0, 0]);
    expect(pdfPointToFrame(frame, brx, bry).map((n) => Math.round(n * 1e9) / 1e9)).toEqual([
      DISPLAY_WIDTH,
      DISPLAY_HEIGHT,
    ]);
    const [px, py] = framePointToPdf(frame, 123, 45);
    expect(pdfPointToFrame(frame, px, py).map((n) => Math.round(n * 1e9) / 1e9)).toEqual([123, 45]);
  });

  it('leaves unrotated pages on the page.view offsets with no transform', () => {
    const frame = pageDisplayFrame([10, 20, 110, 220], 0);
    expect(frame).toEqual({
      rotation: 0,
      width: 100,
      height: 200,
      pageHeight: 200,
      viewMinX: 10,
      viewMinY: 20,
      viewMaxY: 220,
    });
    const annotations = [{ rect: [1, 2, 3, 4] }];
    expect(annotationsInFrame(annotations, frame)).toBe(annotations);
  });

  it('rotates every annotation and struct-tree geometry field pdfvision reads', () => {
    const frame = pageDisplayFrame([0, 0, 200, 300], 90);
    const [annotation] = annotationsInFrame(
      [
        {
          rect: [10, 20, 30, 60],
          quadPoints: new Float32Array([10, 60, 30, 60, 10, 20, 30, 20]),
          lineCoordinates: [10, 20, 30, 60],
          vertices: new Float32Array([10, 20, 30, 60]),
          inkLists: [new Float32Array([10, 20, 30, 60])],
        },
      ],
      frame,
    ) as Record<string, unknown>[];
    // Under /Rotate 90 on a 200 × 300 box, stored (x, y) becomes upright y-up (y, 200 - x).
    expect(annotation.rect).toEqual([20, 170, 60, 190]);
    expect(annotation.quadPoints).toEqual([60, 190, 60, 170, 20, 190, 20, 170]);
    expect(annotation.lineCoordinates).toEqual([20, 190, 60, 170]);
    expect(annotation.vertices).toEqual([20, 190, 60, 170]);
    expect(annotation.inkLists).toEqual([[20, 190, 60, 170]]);
    const tree = structTreeInFrame({ role: 'Root', children: [{ role: 'Figure', bbox: [10, 20, 30, 60] }] }, frame);
    expect(tree.children[0].bbox).toEqual([20, 170, 60, 190]);
  });
});

describe('processDocument on /Rotate pages', () => {
  it.each(ROTATIONS)('reads /Rotate %i in the displayed frame, identical to the upright page', async (rotation) => {
    const upright = await read({ rotation: 0 }, GEOMETRY_OPTIONS);
    const rotated = await read({ rotation }, GEOMETRY_OPTIONS);
    const page = rotated.pages[0];

    expect(page.rotation).toBe(rotation === 0 ? undefined : rotation);
    expect(page.text).toBe('Alpha line\n\nBeta line');
    expect(geometryOf(page)).toEqual(geometryOf(upright.pages[0]));
    expect(page.vectorBoxes).toEqual([expect.objectContaining(BLOCK)]);
    expect(page.links?.[0]).toMatchObject(LINK);
    expect(page.layout?.blocks.map((block) => block.text)).toEqual(['Alpha line\nBeta line']);
  });

  it.each(ROTATIONS)(
    'keeps /Rotate %i geometry in raw units with a shifted MediaBox and UserUnit 2',
    async (rotation) => {
      const upright = await read({ rotation: 0 }, GEOMETRY_OPTIONS);
      const rotated = await read({ rotation, originX: -40, originY: 25, userUnit: 2 }, GEOMETRY_OPTIONS);
      expect(rotated.pages[0].userUnit).toBe(2);
      expect(geometryOf(rotated.pages[0])).toEqual(geometryOf(upright.pages[0]));
    },
  );

  it.each(ROTATIONS)('crops a /Rotate %i region from displayed-frame coordinates', async (rotation) => {
    for (const fixture of [{ rotation }, { rotation, originX: -40, originY: 25, userUnit: 2 }]) {
      const full = await read(fixture, { render: true, renderScale: 1 });
      const fullImage = await loadImage(full.pages[0].image as string);
      const unit = fixture.userUnit ?? 1;
      expect({ width: fullImage.width, height: fullImage.height }).toEqual({
        width: DISPLAY_WIDTH * unit,
        height: DISPLAY_HEIGHT * unit,
      });

      // The vector box the read reports is the region to crop, and it
      // must come back as the black block.
      const block = await read(fixture, { render: true, renderScale: 1, renderRegion: BLOCK });
      expect(block.pages[0].renderRegion).toEqual(BLOCK);
      expect(await darkFraction(block.pages[0].image as string)).toBeGreaterThan(0.97);

      const blank = await read(fixture, {
        render: true,
        renderScale: 1,
        renderRegion: { x: 20, y: 120, width: 150, height: 60 },
      });
      expect(await darkFraction(blank.pages[0].image as string)).toBe(0);
    }
  });

  it('accepts a region that spans the displayed width of a quarter-turned page', async () => {
    const result = await read(
      { rotation: 90 },
      { render: true, renderScale: 1, renderRegion: { x: 0, y: 0, width: DISPLAY_WIDTH, height: DISPLAY_HEIGHT } },
    );
    const img = await loadImage(result.pages[0].image as string);
    expect({ width: img.width, height: img.height }).toEqual({ width: DISPLAY_WIDTH, height: DISPLAY_HEIGHT });
    await expect(
      read(
        { rotation: 90 },
        { render: true, renderRegion: { x: 0, y: 0, width: DISPLAY_HEIGHT, height: DISPLAY_WIDTH } },
      ),
    ).rejects.toThrow(/falls outside page 1 bounds 300×200/);
  });

  it.each(ROTATIONS)('places OCR word boxes for /Rotate %i in the displayed frame', async (rotation) => {
    const data = buildRotatedFixture({ rotation, originX: -40, originY: 25 });
    const loadingTask = getDocument({ data, verbosity: 0 });
    const doc = await loadingTask.promise;
    try {
      const page = await doc.getPage(1);
      const viewport = page.getViewport({ scale: 2 });
      // Where the block lands on the rendered pixels, via pdf.js's own viewport.
      const m = displayToStored({ rotation, originX: -40, originY: 25 });
      const corners = [
        apply(m, BLOCK.x, DISPLAY_HEIGHT - BLOCK.y),
        apply(m, BLOCK.x + BLOCK.width, DISPLAY_HEIGHT - BLOCK.y - BLOCK.height),
      ].map(([x, y]) => viewport.convertToViewportPoint(x, y));
      const bbox = {
        x0: Math.min(corners[0][0], corners[1][0]),
        y0: Math.min(corners[0][1], corners[1][1]),
        x1: Math.max(corners[0][0], corners[1][0]),
        y1: Math.max(corners[0][1], corners[1][1]),
      };
      const words = transformOcrWords(
        { blocks: [{ paragraphs: [{ lines: [{ words: [{ text: 'block', confidence: 90, bbox }] }] }] }] },
        { scale: 2, pageView: page.view, rotation: page.rotate, viewport },
      );
      expect(words[0]).toMatchObject(BLOCK);
    } finally {
      await loadingTask.destroy();
    }
  });

  it.each([90, 180, 270] as const)(
    'reads a /Rotate %i page whose text is upright only as stored in its stored orientation, and says so',
    async (rotation) => {
      const upright = await read({ rotation: 0 }, GEOMETRY_OPTIONS);
      const fixture = { rotation, storedUpright: true, originX: -40, originY: 25 };
      const page = (await read(fixture, GEOMETRY_OPTIONS)).pages[0];
      expect(page.rotation).toBe(rotation);
      expect(geometryOf(page)).toEqual(geometryOf(upright.pages[0]));
      expect(page.warnings?.map((warning) => warning.code)).toContain('rotated_page_read_unrotated');

      // The render follows the same unrotated frame, so the reported box crops the block.
      const full = await read(fixture, { render: true, renderScale: 1 });
      const fullImage = await loadImage(full.pages[0].image as string);
      expect({ width: fullImage.width, height: fullImage.height }).toEqual({
        width: DISPLAY_WIDTH,
        height: DISPLAY_HEIGHT,
      });
      const block = await read(fixture, { render: true, renderScale: 1, renderRegion: BLOCK });
      expect(await darkFraction(block.pages[0].image as string)).toBeGreaterThan(0.97);
    },
  );

  it('keeps the displayed frame, with no warning, on a /Rotate page that has no text', async () => {
    const stream = '0 0 0 rg 10 10 50 50 re f';
    const result = await processDocument('memory://rotated-no-text.pdf', {
      sourceData: buildRawPdf([
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 300] /Rotate 90 /Contents 4 0 R >>',
        `<< /Length ${Buffer.byteLength(stream, 'binary')} >>\nstream\n${stream}\nendstream`,
      ]),
      vectorBoxes: true,
      noCache: true,
    });
    const page = result.pages[0];
    expect({ width: page.width, height: page.height }).toEqual({ width: 300, height: 200 });
    // Stored (10, 10)-(60, 60) under /Rotate 90 on a 200 × 300 box displays at x 10..60, y 10..60.
    expect(page.vectorBoxes?.[0]).toMatchObject({ x: 10, y: 10, width: 50, height: 50 });
    expect(page.warnings?.map((warning) => warning.code) ?? []).not.toContain('rotated_page_read_unrotated');
  });

  it('still reports text that is itself turned on an unrotated page as a vertical run', async () => {
    const stream = 'BT /F1 12 Tf 0 1 -1 0 100 40 Tm (Sideways label) Tj ET';
    const result = await processDocument('memory://rotated-text-upright-page.pdf', {
      sourceData: buildRawPdf([
        '<< /Type /Catalog /Pages 2 0 R >>',
        '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
        '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
        `<< /Length ${Buffer.byteLength(stream, 'binary')} >>\nstream\n${stream}\nendstream`,
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
      ]),
      geometry: true,
      noCache: true,
    });
    const span = result.pages[0].spans?.[0];
    expect(result.pages[0].rotation).toBeUndefined();
    expect(span?.text).toBe('Sideways label');
    expect(span?.height ?? 0).toBeGreaterThan(span?.width ?? 0);
    expect(span?.x).toBe(88);
  });
});
