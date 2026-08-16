import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import PDFDocument from 'pdfkit';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { UNTRUSTED_BANNER } from '../../src/mcp/limits.js';
import { clearRefs, lookupRef } from '../../src/mcp/refs.js';
import type { ImageBlock, TextBlock } from '../../src/mcp/result.js';
import { readPdf } from '../../src/mcp/tools/readPdf.js';
import { renderPdf } from '../../src/mcp/tools/renderPdf.js';
import {
  appendPageWarnings,
  appendUnsearchable,
  collapseHits,
  searchPdf,
  searchWarningCollector,
} from '../../src/mcp/tools/searchPdf.js';
import type { PageResult, SearchMatch } from '../../src/types/index.js';
import { buildMultiPageXfaPlaceholderPdf, buildXfaPlaceholderPdf } from '../helpers/xfaPdfs.js';

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

/** One page per entry, one drawn line per string. */
async function buildPdf(pages: readonly (readonly string[])[]): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  const doc = new PDFDocument({ size: [612, 792], margin: 40, autoFirstPage: false });
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<void>((resolve) => doc.on('end', resolve));
  for (const lines of pages) {
    doc.addPage();
    lines.forEach((line, index) => {
      doc.fontSize(12).text(line, 40, 60 + index * 30);
    });
  }
  doc.end();
  await done;
  return new Uint8Array(Buffer.concat(chunks));
}

/** Two figures on a page, so a full-page render mints a set of refs, not one. */
async function buildFigurePdf(): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  const doc = new PDFDocument({ size: [612, 792], margin: 0 });
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<void>((resolve) => doc.on('end', resolve));
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
    'base64',
  );
  doc.fontSize(12).text('The figure below shows the theory.', 72, 48);
  doc.image(png, 72, 120, { width: 240, height: 180 });
  doc.fontSize(12).text('The second figure follows.', 72, 360);
  doc.image(png, 72, 420, { width: 240, height: 180 });
  doc.end();
  await done;
  return new Uint8Array(Buffer.concat(chunks));
}

const SAME_LINE_PAGE = ['The theory covers the thing.', 'Another line about the topic and the rest.'];

let workdir: string;
let longPdf: string;
let backtrackPdf: string;
let sameLinePdf: string;
let repeatedPdf: string;
let manyPlacesPdf: string;
let figurePdf: string;
let xfaPlaceholderPdf: string;
let multiPageXfaPdf: string;

beforeAll(async () => {
  workdir = mkdtempSync(join(tmpdir(), 'pdfvision-mcp-tools-'));
  longPdf = join(workdir, 'long.pdf');
  writeFileSync(
    longPdf,
    await buildPdf(Array.from({ length: 25 }, (_, i) => [`Section ${i + 1}: quarterly notes for page ${i + 1}.`])),
  );
  backtrackPdf = join(workdir, 'backtrack.pdf');
  writeFileSync(backtrackPdf, await buildPdf([[`${'a'.repeat(40)}b`]]));
  sameLinePdf = join(workdir, 'same-line.pdf');
  writeFileSync(sameLinePdf, await buildPdf([SAME_LINE_PAGE]));
  repeatedPdf = join(workdir, 'repeated.pdf');
  writeFileSync(repeatedPdf, await buildPdf(Array.from({ length: 55 }, () => ['alpha and alpha again'])));
  manyPlacesPdf = join(workdir, 'many-places.pdf');
  writeFileSync(
    manyPlacesPdf,
    await buildPdf(Array.from({ length: 6 }, () => Array.from({ length: 20 }, () => 'alpha and alpha again'))),
  );
  figurePdf = join(workdir, 'figure.pdf');
  writeFileSync(figurePdf, await buildFigurePdf());
  xfaPlaceholderPdf = join(workdir, 'xfa-placeholder.pdf');
  writeFileSync(xfaPlaceholderPdf, buildXfaPlaceholderPdf());
  multiPageXfaPdf = join(workdir, 'xfa-placeholder-3p.pdf');
  writeFileSync(multiPageXfaPdf, buildMultiPageXfaPlaceholderPdf());
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

describe('read_pdf attachments', () => {
  // The fixture is an e-invoice in miniature: the page is a rendering,
  // the embedded XML is the authoritative payload, and the other two
  // attachments cover the image and opaque-binary branches.
  const ATTACHMENTS = join(import.meta.dirname, '..', 'fixtures', 'sample-attachments.pdf');

  it('inlines a text attachment, which is the whole point on an e-invoice', async () => {
    const body = text(await readPdf({ source: ATTACHMENTS, attachment: 'invoice.xml' }));
    expect(body).toContain('Attachment `invoice.xml`');
    expect(body).toContain('Authoritative invoice data');
    expect(body).toContain('<Total currency="EUR">1234.56</Total>');
  });

  it('resolves an attachment by 1-based index in the listed order', async () => {
    // Sorted by name: 1 bundle.zip, 2 invoice.xml, 3 stamp.png.
    const body = text(await readPdf({ source: ATTACHMENTS, attachment: '2' }));
    expect(body).toContain('Attachment `invoice.xml`');
  });

  it('returns an image attachment as an image block', async () => {
    const result = await readPdf({ source: ATTACHMENTS, attachment: 'stamp.png' });
    const blocks = images(result);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]?.mimeType).toBe('image/png');
    expect(text(result)).toContain('Attachment stamp.png:');
  });

  it('refuses an opaque binary and names the command that does deliver it', async () => {
    const body = text(await readPdf({ source: ATTACHMENTS, attachment: 'bundle.zip' }));
    expect(body).toContain('neither text nor a displayable image');
    expect(body).toContain('--attachments --attachment-output');
    // The bytes must not be smuggled in as an image block or base64.
    expect(images(await readPdf({ source: ATTACHMENTS, attachment: 'bundle.zip' }))).toHaveLength(0);
  });

  it('lists what is actually there when the selector misses', async () => {
    await expect(readPdf({ source: ATTACHMENTS, attachment: 'nope.txt' })).rejects.toThrow(
      /This document has 3: 1\. bundle\.zip .*2\. invoice\.xml .*3\. stamp\.png/,
    );
  });

  it('says so plainly when the document carries no embedded files', async () => {
    await expect(readPdf({ source: SAMPLE, attachment: 'anything' })).rejects.toThrow(/has no embedded files/);
  });

  it('matches a name case-insensitively', async () => {
    const body = text(await readPdf({ source: ATTACHMENTS, attachment: 'INVOICE.XML' }));
    expect(body).toContain('Attachment `invoice.xml`');
  });

  it('never points a shell-less caller at a CLI flag it cannot run', async () => {
    // The presence bullets defaulted to naming --attachments / --viewer.
    // Reporting a count and then advising an impossible command is the
    // dead end this parameter exists to remove.
    const body = text(await readPdf({ source: ATTACHMENTS }));
    expect(body).toContain('3 embedded files');
    expect(body).toContain('read_pdf(attachment:');
    expect(body).not.toContain('use --attachments');
    expect(body).not.toContain('use --viewer');
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

  it('collapses occurrences that share a line into one row, while the headline still counts them', async () => {
    // The crop grows to the containing line, so hits on one line resolve
    // to one region — a row per hit would be the same handle twice.
    const body = text(await searchPdf({ source: SAMPLE, query: 'l' }));
    expect(body).toContain('2 matches on 1 of 1 searched page(s)');
    expect(body.split('\n').filter((line) => line.startsWith('- `p'))).toHaveLength(1);
    expect(body).toMatch(/`p1m1` p\.1 native · `l` ×2/);
  });

  it('numbers refs densely over the collapsed rows, each resolving to its own line', async () => {
    const body = text(await searchPdf({ source: sameLinePdf, query: 'the' }));
    expect(body).toContain('6 matches');
    expect(body).toMatch(/`p1m1`.*×3/);
    expect(body).toMatch(/`p1m2`.*×3/);
    expect(body).not.toContain('`p1m3`');

    const first = lookupRef(sameLinePdf, 'p1m1');
    const second = lookupRef(sameLinePdf, 'p1m2');
    expect(first?.region).toBeDefined();
    // Second line sits lower on the page, so the two refs are not aliases.
    expect(second?.region.y ?? 0).toBeGreaterThan(first?.region.y ?? 0);
    expect(images(await renderPdf({ source: sameLinePdf, ref: 'p1m2' }))).toHaveLength(1);
  });

  it('keeps the distinct strings a collapsed row stands for', async () => {
    const body = text(await searchPdf({ source: sameLinePdf, query: 'the' }));
    expect(body).toMatch(/`p1m1` p\.1 native · `The` \/ `the` ×3/);
  });

  it('bounds how many distinct strings one row names', async () => {
    const body = text(await searchPdf({ source: sameLinePdf, query: '[a-z]{4,}', regex: true }));
    const row = body.split('\n').find((line) => line.startsWith('- `p1m2`')) ?? '';
    expect(row.match(/`[A-Za-z]+`/g)).toHaveLength(4);
    expect(row).toContain('/ … ×5');
  });

  it('spends the match cap on places rather than occurrences', async () => {
    // 110 occurrences over 55 lines: capping the raw hits would have
    // dropped ten pages and advised narrowing a search with room left.
    const body = text(await searchPdf({ source: repeatedPdf, query: 'alpha' }));
    expect(body).toContain('110 matches on 55 of 55 searched page(s)');
    expect(body.split('\n').filter((line) => line.startsWith('- `p'))).toHaveLength(55);
    expect(body).not.toContain('omitted at the');
  });

  it('reports the overflow past the cap in places, not occurrences', async () => {
    // 240 occurrences over 120 places: the notice must speak in the same
    // unit the cap was spent in, or it doubles what was actually omitted.
    const body = text(await searchPdf({ source: manyPlacesPdf, query: 'alpha' }));
    expect(body).toContain('240 matches on 6 of 6 searched page(s)');
    expect(body.split('\n').filter((line) => line.startsWith('- `p'))).toHaveLength(100);
    expect(body).toContain('20 further place(s) omitted at the 100-place cap');
  });

  it('keeps hits from different sources apart even when their crops coincide', () => {
    // A link match can resolve to the same crop as a native match on its
    // line; merging them would label the row with the first hit's source
    // and drop the context that set the link apart.
    const page = { page: 1, width: 612, height: 792 } as PageResult;
    const bbox = { x: 100, y: 100, width: 30, height: 12 };
    const hit = (source: SearchMatch['source']) => ({ page, match: { text: 'alpha', bbox, source } as SearchMatch });
    const rows = collapseHits([hit('native'), hit('native'), hit('link')]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ index: 0, count: 2, source: 'native' });
    expect(rows[1]).toMatchObject({ index: 1, count: 1, source: 'link' });
    expect(rows[1]?.region).toEqual(rows[0]?.region);
  });

  it('collapses one place whose crops disagree in the last hundredths of a point', () => {
    // The crop pads by a fraction of the *match* box, so two hits on one
    // line produce regions that differ below any distinction a render
    // could show. Exact-equality grouping emitted those as separate rows.
    const page = { page: 1, width: 612, height: 792 } as PageResult;
    const hit = (bbox: SearchMatch['bbox']) => ({
      page,
      match: { text: 'alpha', bbox, source: 'native' } as SearchMatch,
    });
    const jitter = collapseHits([
      hit({ x: 100, y: 100, width: 100.2, height: 10 }),
      hit({ x: 100.05, y: 100, width: 100.1, height: 10 }),
    ]);
    expect(jitter).toHaveLength(1);
    expect(jitter[0]).toMatchObject({ count: 2 });

    // Whole-point rounding must not swallow places that genuinely differ.
    const apart = collapseHits([
      hit({ x: 100, y: 100, width: 100.2, height: 10 }),
      hit({ x: 102, y: 100, width: 100.2, height: 10 }),
    ]);
    expect(apart).toHaveLength(2);
    expect(apart.map((row) => row.index)).toEqual([0, 1]);
  });

  it('surfaces the regex time-limit warning instead of a silent zero, even on a repeat call', async () => {
    // A catastrophic pattern that hits the per-page budget produces the
    // same "0 matches" as a term that is absent. The model choosing the
    // pattern has no stderr, so the warning must ride the response.
    const body = text(await searchPdf({ source: backtrackPdf, query: '(a+)+$', regex: true }));
    expect(body).toContain('0 matches');
    expect(body).toContain('regex time limit');
    // The interrupted result must not be cached: a repeat of the same
    // call has to re-run the search and warn again, not serve a cached
    // silent zero.
    const again = text(await searchPdf({ source: backtrackPdf, query: '(a+)+$', regex: true }));
    expect(again).toContain('regex time limit');
  }, 40_000);
});

describe('search_pdf ref lifetime', () => {
  it('a later search that finds nothing still retires the previous refs', async () => {
    await searchPdf({ source: SAMPLE, query: 'pdfvision' });
    expect(lookupRef(SAMPLE, 'p1m1')).toBeDefined();

    await searchPdf({ source: SAMPLE, query: 'definitely-not-here' });

    // The zero-hit search is the answer now; a ref from the previous one
    // would render evidence for a question no longer being asked.
    expect(lookupRef(SAMPLE, 'p1m1')).toBeUndefined();
  });
});

describe('render_pdf ref lifetime', () => {
  it('keeps the rest of a search alive after one of its refs is rendered', async () => {
    // The advertised workflow is "search, then look at the hits that
    // matter". Rendering the first ref used to retire every other one.
    const body = text(await searchPdf({ source: sameLinePdf, query: 'the' }));
    expect(body).toContain('`p1m1`');
    expect(body).toContain('`p1m2`');

    expect(images(await renderPdf({ source: sameLinePdf, ref: 'p1m1' }))).toHaveLength(1);
    expect(lookupRef(sameLinePdf, 'p1m2')).toBeDefined();
    expect(images(await renderPdf({ source: sameLinePdf, ref: 'p1m2' }))).toHaveLength(1);
    // And rendering the second leaves the first resolvable too.
    expect(lookupRef(sameLinePdf, 'p1m1')).toBeDefined();
  });

  it('replaces the previous set when a full-page render files its own refs', async () => {
    await searchPdf({ source: figurePdf, query: 'theory' });
    expect(lookupRef(figurePdf, 'p1m1')).toBeDefined();

    const body = text(await renderPdf({ source: figurePdf, pages: '1' }));
    expect(body).toContain('Visual regions on page 1');
    expect(lookupRef(figurePdf, 'p1r1')).toBeDefined();
    // The page render is the answer now; the search's handles are retired.
    expect(lookupRef(figurePdf, 'p1m1')).toBeUndefined();
  });

  it('keeps a page render sibling regions alive after one of them is rendered', async () => {
    // The same guarantee as a search's hits, for the refs a full-page
    // render mints: zooming the first figure must not retire the second.
    const body = text(await renderPdf({ source: figurePdf, pages: '1' }));
    expect(body).toContain('`p1r1`');
    expect(body).toContain('`p1r2`');

    expect(images(await renderPdf({ source: figurePdf, ref: 'p1r1' }))).toHaveLength(1);
    expect(lookupRef(figurePdf, 'p1r2')).toBeDefined();
    expect(images(await renderPdf({ source: figurePdf, ref: 'p1r2' }))).toHaveLength(1);
    expect(lookupRef(figurePdf, 'p1r1')).toBeDefined();
  });

  it('leaves the previous set alone when a full-page render finds no visual region', async () => {
    // Forgetting here would file nothing in place of what it dropped —
    // the same failure as the region-render case, one page further on.
    await searchPdf({ source: SAMPLE, query: 'pdfvision' });
    expect(lookupRef(SAMPLE, 'p1m1')).toBeDefined();

    const body = text(await renderPdf({ source: SAMPLE, pages: '1' }));
    expect(body).not.toContain('Visual regions on page');
    expect(lookupRef(SAMPLE, 'p1m1')).toBeDefined();
  });
});

describe('search_pdf on a document whose text is not the document', () => {
  it('says so on a zero-hit response', async () => {
    const body = text(await searchPdf({ source: xfaPlaceholderPdf, query: 'sponsor' }));
    expect(body).toContain('0 matches');
    expect(body).toContain('The text searched on p.1 is the XFA (LiveCycle) viewer placeholder');
    expect(body).toContain('neither a hit nor a miss there is evidence about the form');
    expect(body).toContain('Adobe Acrobat/Reader');
  });

  it('says it once, not twice, when a hit lands on the placeholder', async () => {
    const body = text(await searchPdf({ source: xfaPlaceholderPdf, query: 'Adobe' }));
    expect(body).not.toContain('0 matches');
    expect(body.match(/viewer placeholder, not this document's content/g)).toHaveLength(1);
    expect(body).not.toContain('> - p.1: xfa_form');
  });

  it('speaks for every searched page, not just the one the warning is pinned to', async () => {
    const body = text(await searchPdf({ source: multiPageXfaPdf, query: 'sponsor' }));
    expect(body).toContain('0 matches on 0 of 3 searched page(s)');
    expect(body).toContain('The text searched on p.1-3 is the XFA (LiveCycle) viewer placeholder');
  });
});

describe('appendUnsearchable', () => {
  const scanned = (no: number) =>
    ({
      page: no,
      text: '',
      charCount: 0,
      imageCount: 1,
      vectorCount: 0,
      textCoverage: 0,
      nonPrintableRatio: 0,
      nonPrintableCount: 0,
      quality: { nativeTextStatus: 'empty_but_visual_content' },
      width: 612,
      height: 792,
      // biome-ignore lint/suspicious/noExplicitAny: minimal PageResult stand-in
    }) as any;

  it('does not offer OCR on a page already reported as an unreadable source', () => {
    const lines: string[] = [];
    appendUnsearchable(lines, [scanned(1), scanned(2)], new Set([1]));
    const body = lines.join('\n');
    expect(body).toContain('1 of the searched pages have no usable native text (2)');
    expect(body).not.toContain('(1-2)');
  });

  it('says nothing at all when every suspect page is already covered', () => {
    const lines: string[] = [];
    appendUnsearchable(lines, [scanned(1), scanned(2)], new Set([1, 2]));
    expect(lines).toEqual([]);
  });
});

describe('appendPageWarnings', () => {
  const page = (no: number, codes: { code: string; severity: 'warning' | 'error' }[]) =>
    ({
      page: no,
      text: '',
      charCount: 0,
      imageCount: 0,
      vectorCount: 0,
      textCoverage: 0,
      nonPrintableRatio: 0,
      nonPrintableCount: 0,
      quality: { nativeTextStatus: 'ok' },
      width: 612,
      height: 792,
      warnings: codes.map((c) => ({ ...c, message: `${c.code} happened` })),
      // biome-ignore lint/suspicious/noExplicitAny: minimal PageResult stand-in
    }) as any;

  it('names the codes on pages a hit landed on, errors first', () => {
    const lines: string[] = [];
    appendPageWarnings(
      lines,
      [
        page(1, [
          { code: 'reading_order_divergence', severity: 'warning' },
          { code: 'invisible_text', severity: 'error' },
        ]),
      ],
      new Set([1]),
    );
    expect(lines.join('\n')).toContain('> - p.1: invisible_text, reading_order_divergence');
  });

  it('says nothing about a page no hit landed on', () => {
    const lines: string[] = [];
    appendPageWarnings(lines, [page(2, [{ code: 'invisible_text', severity: 'error' }])], new Set([1]));
    expect(lines).toEqual([]);
  });

  it('leaves unreadable-source codes to the response-level note', () => {
    const lines: string[] = [];
    appendPageWarnings(
      lines,
      [
        page(1, [{ code: 'xfa_form', severity: 'error' }]),
        page(2, [
          { code: 'xfa_form', severity: 'error' },
          { code: 'invisible_text', severity: 'error' },
        ]),
      ],
      new Set([1, 2]),
    );
    const body = lines.join('\n');
    expect(body).not.toContain('p.1');
    expect(body).toContain('> - p.2: invisible_text');
  });

  it('caps the list and says how many pages it left out', () => {
    const pages = Array.from({ length: 9 }, (_, i) => page(i + 1, [{ code: 'invisible_text', severity: 'error' }]));
    const lines: string[] = [];
    appendPageWarnings(lines, pages, new Set(pages.map((p) => p.page)));
    expect(lines.filter((line) => line.startsWith('> - p.'))).toHaveLength(5);
    expect(lines.join('\n')).toContain('4 further page(s) with warnings omitted');
  });
});

describe('searchWarningCollector', () => {
  const timeout = (page: number) => `regex search on page ${page} exceeded the 1000ms per-page regex time limit`;
  const cap = (page: number) => `search query "x" exceeded the per-page native match cap on page ${page}`;
  const summary =
    'regex search stopped: the 12000ms budget for regex search time across this request was exhausted after searching 8 of 40 selected page(s). ' +
    'Matches found so far are kept; 32 page(s) were not searched, so a zero result here is not evidence of absence.';

  it('keeps timeout warnings ahead of the cap when other warnings came first', () => {
    // Six match-cap warnings before the timeout would have sliced the
    // one warning that keeps "0 matches" honest right out of the
    // response.
    const log = searchWarningCollector();
    for (let page = 1; page <= 6; page++) log.onWarning(cap(page));
    log.onWarning(timeout(7));
    const lines = log.lines();

    expect(lines[1]).toBe(`> [pdfvision] ${timeout(7)}`);
    expect(lines.filter((line) => line.includes('[pdfvision]'))).toHaveLength(6);
    expect(lines.at(-1)).toBe('> [pdfvision] 2 further warning(s) omitted.');
  });

  it('bounds retention per class while still counting every warning', () => {
    const log = searchWarningCollector();
    for (let page = 1; page <= 1000; page++) log.onWarning(timeout(page));
    const lines = log.lines();

    expect(lines.filter((line) => line.includes('exceeded'))).toHaveLength(5);
    expect(lines.at(-1)).toBe('> [pdfvision] 995 further warning(s) omitted.');
  });

  it('emits nothing when there were no warnings', () => {
    expect(searchWarningCollector().lines()).toEqual([]);
  });

  it('keeps the request-budget summary even behind a full cap of per-page timeouts', () => {
    // The summary is emitted last, after every page has warned, and it is
    // the only warning that says which pages went unsearched — a
    // first-come cap would drop it on exactly the document that needs it.
    const log = searchWarningCollector();
    for (let page = 1; page <= 8; page++) log.onWarning(timeout(page));
    log.onWarning(summary);
    const lines = log.lines();

    expect(lines[1]).toBe(`> [pdfvision] ${summary}`);
    expect(lines.filter((line) => line.includes('[pdfvision]'))).toHaveLength(6);
    // It evicts a per-page timeout rather than widening the cap.
    expect(lines.filter((line) => line.includes('per-page regex time limit'))).toHaveLength(4);
    expect(lines.at(-1)).toBe('> [pdfvision] 4 further warning(s) omitted.');
  });

  it('counts the summary once and keeps the first when repeated', () => {
    const log = searchWarningCollector();
    log.onWarning(summary);
    log.onWarning(`${summary} (second)`);
    const lines = log.lines();

    expect(lines.filter((line) => line.includes('[pdfvision]'))).toHaveLength(2);
    expect(lines[1]).toBe(`> [pdfvision] ${summary}`);
    expect(lines.at(-1)).toBe('> [pdfvision] 1 further warning(s) omitted.');
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
    // Every call that files a set renumbers from `p1m1`, so a ref held
    // over from an *earlier* such call silently resolves to the newer
    // result. Echoing the origin is what lets the caller notice.
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

  it('rejects a `ref` given together with `pages`', async () => {
    await searchPdf({ source: SAMPLE, query: 'pdfvision' });
    await expect(renderPdf({ source: SAMPLE, ref: 'p1m1', pages: '1' })).rejects.toThrow(
      /`ref` already names its own page and region, so `pages` cannot also apply/,
    );
  });

  it('rejects a `ref` given together with `region`', async () => {
    await searchPdf({ source: SAMPLE, query: 'pdfvision' });
    await expect(renderPdf({ source: SAMPLE, ref: 'p1m1', region: [0, 0, 100, 100] })).rejects.toThrow(
      /`ref` already names its own page and region, so `region` cannot also apply/,
    );
  });

  it('rejects the conflict before resolving the source', async () => {
    // Resolving first would download a remote PDF only to refuse the
    // call, and a fetch failure would report itself in place of the
    // argument error that actually caused it.
    await expect(renderPdf({ source: join(workdir, 'no-such-file.pdf'), ref: 'p1m1', pages: '1' })).rejects.toThrow(
      /`ref` already names its own page and region/,
    );
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
