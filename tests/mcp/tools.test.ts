import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import PDFDocument from 'pdfkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { UNTRUSTED_BANNER } from '../../src/mcp/limits.js';
import { clearRefs } from '../../src/mcp/refs.js';
import type { ImageBlock, TextBlock } from '../../src/mcp/result.js';
import { readPdf } from '../../src/mcp/tools/readPdf.js';
import { renderPdf } from '../../src/mcp/tools/renderPdf.js';
import { searchPdf } from '../../src/mcp/tools/searchPdf.js';

const SAMPLE = join(import.meta.dirname, '..', 'fixtures', 'sample.pdf');

function text(result: { content: (TextBlock | ImageBlock)[] }): string {
  return result.content
    .filter((block): block is TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('\n');
}

function images(result: { content: (TextBlock | ImageBlock)[] }): ImageBlock[] {
  return result.content.filter((block): block is ImageBlock => block.type === 'image');
}

async function buildLongPdf(pageCount: number): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  const doc = new PDFDocument({ size: [612, 792], margin: 40, autoFirstPage: false });
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<void>((resolve) => doc.on('end', resolve));
  for (let index = 1; index <= pageCount; index += 1) {
    doc.addPage();
    doc.fontSize(12).text(`Section ${index}: quarterly notes for page ${index}.`, 40, 60);
  }
  doc.end();
  await done;
  return new Uint8Array(Buffer.concat(chunks));
}

let workdir: string;
let longPdf: string;

beforeAll(async () => {
  workdir = mkdtempSync(join(tmpdir(), 'pdfvision-mcp-tools-'));
  longPdf = join(workdir, 'long.pdf');
  writeFileSync(longPdf, await buildLongPdf(25));
});

afterAll(() => {
  rmSync(workdir, { recursive: true, force: true });
  clearRefs();
});

describe('read_pdf', () => {
  it('returns the whole body for a short document, behind the untrusted banner', async () => {
    const result = await readPdf({ source: SAMPLE });
    expect(text(result)).toContain(UNTRUSTED_BANNER);
    expect(text(result)).toContain('Hello pdfvision');
    expect(result.isError).toBeUndefined();
  });

  it('omits the empty form / link / annotation sections it requested', async () => {
    const body = text(await readPdf({ source: SAMPLE }));
    expect(body).not.toContain('_No interactive form fields found._');
    expect(body).not.toContain('formFields: 0');
  });

  it('returns the document map instead of the body for a long document', async () => {
    const body = text(await readPdf({ source: longPdf }));
    expect(body).toContain('Document map');
    expect(body).toContain('- **Pages:** 25');
    expect(body).toContain('## Next step');
    expect(body).not.toContain('Section 12:');
  });

  it('returns real pages once a range is given', async () => {
    const body = text(await readPdf({ source: longPdf, pages: '12' }));
    expect(body).toContain('## Page 12');
    expect(body).toContain('Section 12');
    expect(body).not.toContain('Document map');
  });

  it('refuses to OCR more pages than the per-call budget', async () => {
    await expect(readPdf({ source: longPdf, pages: '1-10', ocr: 'eng' })).rejects.toThrow(/OCR is limited to 5 pages/);
  });

  it('refuses an unscoped OCR of a long document', async () => {
    await expect(readPdf({ source: longPdf, ocr: 'eng' })).rejects.toThrow(/Pass `pages`/);
  });
});

describe('search_pdf', () => {
  it('reports hits with a ref, page, and region and no page body', async () => {
    const body = text(await searchPdf({ source: SAMPLE, query: 'pdfvision' }));
    expect(body).toMatch(/`p1m1` p\.1 native/);
    expect(body).toContain('region ');
    expect(body).toContain('1 match on 1 of 1 searched page(s)');
  });

  it('reports zero hits without claiming absence', async () => {
    const body = text(await searchPdf({ source: SAMPLE, query: 'definitely-not-here' }));
    expect(body).toContain('0 matches');
    expect(body).not.toContain('`p1m1`');
  });

  it('supports a regular expression query', async () => {
    const body = text(await searchPdf({ source: SAMPLE, query: 'pdf.ision', regex: true }));
    expect(body).toContain('1 match');
  });

  it('scopes the search to a page range', async () => {
    const body = text(await searchPdf({ source: longPdf, query: 'Section', pages: '2-3' }));
    expect(body).toContain('of 2 searched page(s)');
  });
});

describe('render_pdf', () => {
  it('returns a PNG image block for a page', async () => {
    const result = await renderPdf({ source: SAMPLE, pages: '1' });
    const blocks = images(result);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.mimeType).toBe('image/png');
    expect(
      Buffer.from(blocks[0]?.data ?? '', 'base64')
        .subarray(1, 4)
        .toString(),
    ).toBe('PNG');
  });

  it('renders the region behind a ref produced by search', async () => {
    await searchPdf({ source: SAMPLE, query: 'pdfvision' });
    const result = await renderPdf({ source: SAMPLE, ref: 'p1m1' });
    expect(text(result)).toContain('rendered region');
    expect(images(result)).toHaveLength(1);
  });

  it('names what a ref resolved to, so a stale one is visible', async () => {
    // Every call renumbers refs from `p1m1`, so a ref held over from an
    // earlier search silently resolves to the newer result. Echoing the
    // origin is what lets the caller notice.
    await searchPdf({ source: SAMPLE, query: 'pdfvision' });
    // A second search re-issues `p1m1` for a different hit. The ref the
    // caller is holding now points at the newer one, so the response has
    // to name which search it came from.
    await searchPdf({ source: SAMPLE, query: 'Hello' });
    const body = text(await renderPdf({ source: SAMPLE, ref: 'p1m1' }));
    expect(body).toContain('Ref `p1m1` → search hit for Hello');
    expect(body).not.toContain('search hit for pdfvision');
  });

  it('resolves a ref whose source is spelled with stray whitespace', async () => {
    await searchPdf({ source: SAMPLE, query: 'pdfvision' });
    const body = text(await renderPdf({ source: ` ${SAMPLE} `, ref: 'p1m1' }));
    expect(body).toContain('rendered region');
  });

  it('reports the pages it rendered, not the range it was asked for', async () => {
    const body = text(await renderPdf({ source: SAMPLE, pages: '1-2' }));
    expect(body).toContain('page(s) 1');
    expect(body).not.toContain('page(s) 1-2');
    expect(body).toContain('past the end of this 1-page document');
  });

  it('explains how to recover from an unknown ref', async () => {
    await expect(renderPdf({ source: SAMPLE, ref: 'p9m9' })).rejects.toThrow(/Unknown ref "p9m9"/);
  });

  it('requires pages or a ref', async () => {
    await expect(renderPdf({ source: SAMPLE })).rejects.toThrow(/Pass `pages`/);
  });

  it('caps the pages one call may rasterise', async () => {
    await expect(renderPdf({ source: longPdf, pages: '1-10' })).rejects.toThrow(/at most 4 pages per call/);
  });

  it('rejects a multi-page region render', async () => {
    await expect(renderPdf({ source: longPdf, pages: '1-2', region: [0, 0, 100, 100] })).rejects.toThrow(/single-page/);
  });

  it('rejects a malformed region', async () => {
    await expect(renderPdf({ source: SAMPLE, pages: '1', region: [0, 0, 100] })).rejects.toThrow(/four finite numbers/);
  });

  it('rejects a region with a non-finite or non-positive extent', async () => {
    // `region` is typed `number[]`, so a `typeof` check never fired and
    // these reached the rasteriser, which failed without naming the
    // argument that caused it.
    await expect(renderPdf({ source: SAMPLE, pages: '1', region: [0, 0, Number.NaN, 10] })).rejects.toThrow(
      /four finite numbers/,
    );
    await expect(
      renderPdf({ source: SAMPLE, pages: '1', region: [0, 0, Number.POSITIVE_INFINITY, 10] }),
    ).rejects.toThrow(/four finite numbers/);
    await expect(renderPdf({ source: SAMPLE, pages: '1', region: [0, 0, 0, 10] })).rejects.toThrow(/positive `width`/);
    await expect(renderPdf({ source: SAMPLE, pages: '1', region: [-1, 0, 10, 10] })).rejects.toThrow(/non-negative/);
  });

  it('labels each rendered image with its page', async () => {
    const result = await renderPdf({ source: SAMPLE, pages: '1' });
    const blocks = result.content.filter((block): block is TextBlock => block.type === 'text');
    expect(blocks.some((block) => block.text === 'Page 1:')).toBe(true);
  });

  it('keeps the rendered image within the vision-model pixel budget', async () => {
    const result = await renderPdf({ source: SAMPLE, pages: '1' });
    const png = Buffer.from(images(result)[0]?.data ?? '', 'base64');
    // PNG IHDR: width and height are big-endian uint32 at bytes 16 and 20.
    expect(Math.max(png.readUInt32BE(16), png.readUInt32BE(20))).toBeLessThanOrEqual(1568);
  });
});
