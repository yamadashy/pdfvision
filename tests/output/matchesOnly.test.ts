import { decode } from '@toon-format/toon';
import { describe, expect, it } from 'vitest';
import { formatMatchesOnly } from '../../src/output/matchesOnly.js';
import type { DocumentResult, PageResult, SearchMatch } from '../../src/types/index.js';

function makePage(overrides: Partial<PageResult> & Pick<PageResult, 'page'>): PageResult {
  return {
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
    ...overrides,
  };
}

function match(overrides: Partial<SearchMatch> & Pick<SearchMatch, 'page'>): SearchMatch {
  return {
    query: 'BLEU',
    source: 'native',
    text: 'BLEU',
    bbox: { x: 340.31, y: 487.37, width: 17.86, height: 9.96 },
    boxes: [{ x: 340.31, y: 487.37, width: 17.86, height: 9.96 }],
    ...overrides,
  };
}

function makeResult(pages: PageResult[], totalPages = 15): DocumentResult {
  return {
    file: '/tmp/attention.pdf',
    totalPages,
    metadata: { title: null, author: null, subject: null, creator: null },
    pages,
  };
}

// A single-query result with three native BLEU hits, all on page 1 —
// mirrors the plan's markdown example.
const THREE_HITS = makeResult([
  makePage({
    page: 1,
    matches: [
      match({ page: 1, context: 'less time to train. Our model achieves 28.4 BLEU on the WMT 2014 English-' }),
      match({
        page: 1,
        bbox: { x: 231.51, y: 509.18, width: 16.69, height: 9.96 },
        context: 'ensembles, by over 2 BLEU.',
      }),
      match({
        page: 1,
        bbox: { x: 373.35, y: 520.09, width: 15.83, height: 9.96 },
        context: 'BLEU score of 41.8 after',
      }),
    ],
  }),
  // Page 2 matched nothing, so it contributes no match entry.
  makePage({ page: 2, matches: [] }),
]);

describe('formatMatchesOnly', () => {
  it('markdown: report metadata and one flat table of emitted matches', () => {
    const out = formatMatchesOnly(THREE_HITS, 'markdown', ['BLEU']);
    expect(out).toMatch(/^# \/tmp\/attention\.pdf\n/);
    expect(out).toContain('- **Pages:** 15');
    expect(out).toContain('- **Matches:** 3 ("BLEU") on page 1');
    expect(out).toContain('| Page | Query | Source | Text | Context | BBox | Region |');
    expect(out).toContain(
      '| 1 | BLEU | native | BLEU | less time to train. Our model achieves 28.4 BLEU on the WMT 2014 English- | 340.31,487.37,17.86,9.96 | 280.31,475.37,137.86,33.96 |',
    );
    // No per-page bodies, pages[] scaffolding, or Overview table.
    expect(out).not.toContain('## Page');
    expect(out).not.toContain('Overview');
    // Exactly one table header.
    expect(out.match(/\| Page \| Query \|/g)).toHaveLength(1);
  });

  it('reports a crop-ready region grown to the row the hit sits in', () => {
    const hit = { x: 70, y: 179, width: 57, height: 9 };
    const page = makePage({
      page: 1,
      matches: [match({ page: 1, query: 'Total net sales', text: 'Total net sales', bbox: hit, boxes: [hit] })],
      layout: {
        blocks: [],
        tables: [
          {
            x: 52,
            y: 100,
            width: 510,
            height: 644,
            rowCount: 1,
            columnCount: 2,
            rows: [
              {
                y: 179,
                height: 9,
                cells: [
                  { text: 'Total net sales (1)', x: 70, y: 179, width: 66, height: 9 },
                  { text: '383,285', x: 526, y: 179, width: 35, height: 9 },
                ],
              },
            ],
          },
        ],
      },
    });
    const parsed = JSON.parse(formatMatchesOnly(makeResult([page]), 'json', ['Total net sales']));

    // bbox hugs the label; region has to reach the value at x=526, or the
    // CLI's own search -> --render-region flow crops the numbers away.
    expect(parsed.matches[0].bbox).toEqual(hit);
    expect(parsed.matches[0].region.x + parsed.matches[0].region.width).toBeGreaterThanOrEqual(561);
  });

  it('json: flat structure with no pages[] array', () => {
    const parsed = JSON.parse(formatMatchesOnly(THREE_HITS, 'json', ['BLEU']));
    const { matches, ...report } = parsed;
    expect(report).toEqual({ file: '/tmp/attention.pdf', totalPages: 15, queries: ['BLEU'], totalMatches: 3 });
    expect(parsed.pages).toBeUndefined();
    expect(matches).toHaveLength(3);
    expect(matches[0]).toEqual({
      page: 1,
      queryIndex: 0,
      source: 'native',
      text: 'BLEU',
      context: 'less time to train. Our model achieves 28.4 BLEU on the WMT 2014 English-',
      bbox: { x: 340.31, y: 487.37, width: 17.86, height: 9.96 },
      region: { x: 280.31, y: 475.37, width: 137.86, height: 33.96 },
    });
    // The query STRING is not repeated per entry — consumers key off
    // queryIndex against the top-level queries array.
    expect(matches[0]).not.toHaveProperty('query');
  });

  it('xml: mirrors the flat json shape', () => {
    const out = formatMatchesOnly(THREE_HITS, 'xml', ['BLEU']);
    expect(out).toMatch(/^<matches file="\/tmp\/attention\.pdf" totalPages="15" totalMatches="3">/);
    expect(out).toContain('<queries>');
    expect(out).toContain('<query>BLEU</query>');
    expect(out).toContain(
      '<match page="1" queryIndex="0" source="native" x="340.31" y="487.37" width="17.86" height="9.96" regionX="280.31" regionY="475.37" regionWidth="137.86" regionHeight="33.96">',
    );
    expect(out).toContain('<text>BLEU</text>');
    expect(out).not.toContain('<page ');
  });

  it('toon: round-trips to the same flat data model as json', () => {
    const toonBytes = Buffer.from(formatMatchesOnly(THREE_HITS, 'toon', ['BLEU']), 'utf8');
    const decoded = decode(toonBytes.toString('utf8'));
    expect(decoded).toEqual(JSON.parse(formatMatchesOnly(THREE_HITS, 'json', ['BLEU'])));
  });

  it.each([
    { field: 'query', code: 'D800', surrogate: '\ud800', path: '$.queries[0][6]' },
    { field: 'text', code: 'DC00', surrogate: '\udc00', path: '$.matches[0].text[6]' },
    { field: 'context', code: 'DBFF', surrogate: '\udbff', path: '$.matches[0].context[6]' },
  ] as const)('toon: rejects an unpaired surrogate in matches-only $field before UTF-8 output', (testCase) => {
    const unsafe = `before${testCase.surrogate}after`;
    const queries = [testCase.field === 'query' ? unsafe : 'BLEU'];
    const result = makeResult([
      makePage({
        page: 1,
        matches: [
          match({
            page: 1,
            ...(testCase.field === 'text' && { text: unsafe }),
            ...(testCase.field === 'context' && { context: unsafe }),
          }),
        ],
      }),
    ]);

    expect(() => formatMatchesOnly(result, 'toon', queries)).toThrow(
      `TOON cannot losslessly encode unpaired UTF-16 surrogate U+${testCase.code} at ${testCase.path}`,
    );

    // The documented JSON fallback keeps the code unit through the same
    // UTF-8 byte boundary that would otherwise replace a raw surrogate.
    const jsonBytes = Buffer.from(formatMatchesOnly(result, 'json', queries), 'utf8');
    const parsed = JSON.parse(jsonBytes.toString('utf8')) as {
      queries: string[];
      matches: { text: string; context?: string }[];
    };
    const recovered =
      testCase.field === 'query' ? parsed.queries[0] : (parsed.matches[0][testCase.field] as string | undefined);
    expect(recovered).toBe(unsafe);
  });

  it('preserves only non-default page UserUnits across every compact format', () => {
    const result = makeResult([
      makePage({ page: 1, userUnit: 2, matches: [match({ page: 1 })] }),
      makePage({ page: 2, matches: [] }),
    ]);

    const json = JSON.parse(formatMatchesOnly(result, 'json', ['BLEU']));
    expect(json.pageUserUnits).toEqual([{ page: 1, userUnit: 2 }]);
    expect(decode(formatMatchesOnly(result, 'toon', ['BLEU']))).toEqual(json);
    expect(formatMatchesOnly(result, 'xml', ['BLEU'])).toContain(
      '<pageUserUnits>\n<page no="1" userUnit="2"/>\n</pageUserUnits>',
    );
    expect(formatMatchesOnly(result, 'markdown', ['BLEU'])).toContain('- **Page UserUnits:** 1=2');

    const defaultJson = JSON.parse(formatMatchesOnly(THREE_HITS, 'json', ['BLEU']));
    expect(defaultJson.pageUserUnits).toBeUndefined();
    expect(formatMatchesOnly(THREE_HITS, 'xml', ['BLEU'])).not.toContain('pageUserUnits');
    expect(formatMatchesOnly(THREE_HITS, 'markdown', ['BLEU'])).not.toContain('Page UserUnits');
    expect(decode(formatMatchesOnly(THREE_HITS, 'toon', ['BLEU']))).not.toHaveProperty('pageUserUnits');
  });

  it('multi-query: keeps queryIndex per hit and lists every query', () => {
    const result = makeResult([
      makePage({
        page: 3,
        matches: [
          match({ page: 3, query: 'GPT', queryIndex: 0, text: 'GPT' }),
          match({ page: 3, query: 'transformer', queryIndex: 1, text: 'transformer' }),
        ],
      }),
    ]);
    const parsed = JSON.parse(formatMatchesOnly(result, 'json', ['GPT', 'transformer']));
    expect(parsed.queries).toEqual(['GPT', 'transformer']);
    expect(parsed.matches.map((m: { queryIndex: number }) => m.queryIndex)).toEqual([0, 1]);
    const md = formatMatchesOnly(result, 'markdown', ['GPT', 'transformer']);
    expect(md).toContain('- **Matches:** 2 ("GPT", "transformer") on page 3');
  });

  it('zero matches: minimal output, no table, still a valid result', () => {
    const empty = makeResult([
      makePage({ page: 1, quality: { nativeTextStatus: 'ok', visualStatus: 'ok' }, matches: [] }),
    ]);
    const md = formatMatchesOnly(empty, 'markdown', ['BLEU']);
    expect(md).toContain('- **Matches:** 0');
    expect(md).not.toContain('| Page | Query |');

    const json = JSON.parse(formatMatchesOnly(empty, 'json', ['BLEU']));
    expect(json).toEqual({
      file: '/tmp/attention.pdf',
      totalPages: 15,
      queries: ['BLEU'],
      totalMatches: 0,
      matches: [],
    });
  });

  it('retains a warning on an otherwise healthy page with a native hit', () => {
    const warning = {
      code: 'invisible_text' as const,
      severity: 'error' as const,
      message: 'native text is present but not visible on the rendered page',
    };
    const result = makeResult([
      makePage({ page: 1, matches: [match({ page: 1, query: 'HIDDEN', text: 'HIDDEN' })], warnings: [warning] }),
    ]);

    const json = JSON.parse(formatMatchesOnly(result, 'json', ['HIDDEN']));
    expect(json.pageDiagnostics).toEqual([{ page: 1, quality: { nativeTextStatus: 'ok' }, warnings: [warning] }]);
    expect(json.totalMatches).toBe(1);
    expect(decode(formatMatchesOnly(result, 'toon', ['HIDDEN']))).toEqual(json);

    const markdown = formatMatchesOnly(result, 'markdown', ['HIDDEN']);
    expect(markdown).toContain('## Diagnostics');
    expect(markdown).toContain('- **Page 1** — native: `ok`');
    expect(markdown).toContain('**error** (`invisible_text`): native text is present but not visible');
  });

  it('retains diagnostics for a no-hit page alongside a healthy matched page', () => {
    const result = makeResult([
      makePage({ page: 2, matches: [match({ page: 2 })] }),
      makePage({
        page: 4,
        matches: [],
        warnings: [
          {
            code: 'reading_order_divergence',
            severity: 'warning',
            message: 'visual and extracted reading order differ',
          },
        ],
      }),
    ]);
    const json = JSON.parse(formatMatchesOnly(result, 'json', ['BLEU']));

    expect(json.totalMatches).toBe(1);
    expect(json.matches[0].page).toBe(2);
    expect(json.pageDiagnostics).toEqual([
      {
        page: 4,
        quality: { nativeTextStatus: 'ok' },
        warnings: [
          {
            code: 'reading_order_divergence',
            severity: 'warning',
            message: 'visual and extracted reading order differ',
          },
        ],
      },
    ]);
  });

  it('keeps document-wide unreadable-source scope on an all-zero XFA search', () => {
    const result = makeResult([
      makePage({
        page: 2,
        matches: [],
        warnings: [
          {
            code: 'xfa_form',
            severity: 'error',
            message: 'confirmed XFA viewer placeholder',
          },
        ],
      }),
      makePage({ page: 5, matches: [] }),
    ]);

    const json = JSON.parse(formatMatchesOnly(result, 'json', ['SPONSOR']));
    expect(json.totalMatches).toBe(0);
    expect(json.pageDiagnostics).toEqual([
      {
        page: 2,
        quality: { nativeTextStatus: 'ok' },
        warnings: [
          {
            code: 'xfa_form',
            severity: 'error',
            message: 'confirmed XFA viewer placeholder',
          },
        ],
      },
    ]);
    expect(json.unreadableSource.pages).toEqual([2, 5]);
    expect(json.unreadableSource.notes).toEqual([
      expect.stringContaining('the pages selected for this search (p.2, 5)'),
    ]);
    expect(json.unreadableSource.notes[0]).toContain('rendering shows the placeholder too');
    expect(decode(formatMatchesOnly(result, 'toon', ['SPONSOR']))).toEqual(json);

    const xml = formatMatchesOnly(result, 'xml', ['SPONSOR']);
    expect(xml).toContain('<unreadableSource>\n<pages>\n<page no="2"/>\n<page no="5"/>\n</pages>');
    expect(xml).toContain('<note>Nothing on the pages selected for this search (p.2, 5)');

    const markdown = formatMatchesOnly(result, 'markdown', ['SPONSOR']);
    expect(markdown).toContain('- **Matches:** 0');
    expect(markdown).toContain('## Diagnostics');
    expect(markdown).toContain('## Unreadable source');
    expect(markdown).toContain('- **Pages:** 2, 5');
    expect(markdown).not.toContain('| Page | Query |');
  });

  it('retains raster-backed text-layer warnings', () => {
    const result = makeResult([
      makePage({
        page: 9,
        matches: [],
        warnings: [
          {
            code: 'raster_backed_text_layer',
            severity: 'warning',
            message: 'native text appears to be an OCR layer over a raster page',
          },
        ],
      }),
    ]);

    const json = JSON.parse(formatMatchesOnly(result, 'json', ['ADVENTURES']));
    expect(json.pageDiagnostics[0].warnings[0].code).toBe('raster_backed_text_layer');
    expect(json.matches).toEqual([]);
  });

  it('retains every non-ok native status without inventing warnings', () => {
    const result = makeResult([
      makePage({ page: 1, quality: { nativeTextStatus: 'empty' }, matches: [] }),
      makePage({ page: 3, quality: { nativeTextStatus: 'mixed_glyph_indices' }, matches: [] }),
    ]);
    const json = JSON.parse(formatMatchesOnly(result, 'json', ['missing']));

    expect(json.pageDiagnostics).toEqual([
      { page: 1, quality: { nativeTextStatus: 'empty' } },
      { page: 3, quality: { nativeTextStatus: 'mixed_glyph_indices' } },
    ]);
    expect(json.pageDiagnostics.every((item: object) => !('warnings' in item))).toBe(true);
  });

  it('retains a non-ok visual status even when native text quality is ok', () => {
    const result = makeResult([
      makePage({ page: 1, quality: { nativeTextStatus: 'ok', visualStatus: 'blank' }, matches: [] }),
    ]);
    const json = JSON.parse(formatMatchesOnly(result, 'json', ['missing']));

    expect(json.pageDiagnostics).toEqual([{ page: 1, quality: { nativeTextStatus: 'ok', visualStatus: 'blank' } }]);
    expect(formatMatchesOnly(result, 'markdown', ['missing'])).toContain(
      '- **Page 1** — native: `ok`; visual: `blank`',
    );
  });

  it('maps complete warnings to XML and escapes their messages', () => {
    const result = makeResult([
      makePage({
        page: 7,
        quality: { nativeTextStatus: 'ok', visualStatus: 'sparse' },
        matches: [],
        warnings: [
          {
            code: 'text_overlap',
            severity: 'warning',
            message: 'A < B & "quoted"',
            blockIndex: 0,
            otherBlockIndex: 1,
            imageBoxIndex: 2,
          },
        ],
      }),
    ]);

    const xml = formatMatchesOnly(result, 'xml', ['missing']);
    const json = JSON.parse(formatMatchesOnly(result, 'json', ['missing']));
    expect(json.pageDiagnostics[0].warnings[0]).toEqual({
      code: 'text_overlap',
      severity: 'warning',
      message: 'A < B & "quoted"',
      blockIndex: 0,
      otherBlockIndex: 1,
      imageBoxIndex: 2,
    });
    expect(xml).toContain('<pageDiagnostics>\n<page no="7" nativeTextStatus="ok" visualStatus="sparse">');
    expect(xml).toContain(
      '<warning code="text_overlap" severity="warning" blockIndex="0" otherBlockIndex="1" imageBoxIndex="2">A &lt; B &amp; "quoted"</warning>',
    );

    const markdown = formatMatchesOnly(result, 'markdown', ['missing']);
    expect(markdown).toContain('[blockIndex=0, otherBlockIndex=1, imageBoxIndex=2]');
    expect(markdown).toContain('Warning indices refer to `layout.blocks` or `imageBoxes` in the full report');
  });

  it('does not leak full page text or layout through diagnostics', () => {
    const result = makeResult([
      makePage({
        page: 1,
        text: 'FULL PAGE BODY MUST STAY OUT',
        charCount: 28,
        layout: {
          blocks: [
            {
              text: 'FULL LAYOUT BODY MUST STAY OUT',
              x: 10,
              y: 10,
              width: 100,
              height: 20,
              lines: [],
            },
          ],
          tables: [],
        },
        quality: { nativeTextStatus: 'empty_but_visual_content' },
        matches: [],
      }),
    ]);
    const json = JSON.parse(formatMatchesOnly(result, 'json', ['missing']));

    expect(json.pages).toBeUndefined();
    expect(json.pageDiagnostics[0]).toEqual({
      page: 1,
      quality: { nativeTextStatus: 'empty_but_visual_content' },
    });
    expect(JSON.stringify(json)).not.toContain('FULL PAGE BODY');
    expect(JSON.stringify(json)).not.toContain('FULL LAYOUT BODY');
  });
});
