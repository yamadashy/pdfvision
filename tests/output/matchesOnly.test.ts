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
    quality: { nativeTextStatus: 'empty' },
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
    expect(out).toContain('| Page | Query | Source | Text | Context | BBox |');
    expect(out).toContain(
      '| 1 | BLEU | native | BLEU | less time to train. Our model achieves 28.4 BLEU on the WMT 2014 English- | 340.31,487.37,17.86,9.96 |',
    );
    // No per-page bodies, pages[] scaffolding, or Overview table.
    expect(out).not.toContain('## Page');
    expect(out).not.toContain('Overview');
    // Exactly one table header.
    expect(out.match(/\| Page \| Query \|/g)).toHaveLength(1);
  });

  it('json: flat structure with no pages[] array', () => {
    const parsed = JSON.parse(formatMatchesOnly(THREE_HITS, 'json', ['BLEU']));
    expect(parsed).toMatchObject({ file: '/tmp/attention.pdf', totalPages: 15, queries: ['BLEU'], totalMatches: 3 });
    expect(parsed.pages).toBeUndefined();
    expect(parsed.matches).toHaveLength(3);
    expect(parsed.matches[0]).toEqual({
      page: 1,
      queryIndex: 0,
      source: 'native',
      text: 'BLEU',
      context: 'less time to train. Our model achieves 28.4 BLEU on the WMT 2014 English-',
      bbox: { x: 340.31, y: 487.37, width: 17.86, height: 9.96 },
    });
    // The query STRING is not repeated per entry — consumers key off
    // queryIndex against the top-level queries array.
    expect(parsed.matches[0]).not.toHaveProperty('query');
  });

  it('xml: mirrors the flat json shape', () => {
    const out = formatMatchesOnly(THREE_HITS, 'xml', ['BLEU']);
    expect(out).toMatch(/^<matches file="\/tmp\/attention\.pdf" totalPages="15" totalMatches="3">/);
    expect(out).toContain('<queries>');
    expect(out).toContain('<query>BLEU</query>');
    expect(out).toContain(
      '<match page="1" queryIndex="0" source="native" x="340.31" y="487.37" width="17.86" height="9.96">',
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
    const empty = makeResult([makePage({ page: 1, matches: [] })]);
    const md = formatMatchesOnly(empty, 'markdown', ['BLEU']);
    expect(md).toContain('- **Matches:** 0');
    expect(md).not.toContain('| Page | Query |');

    const json = JSON.parse(formatMatchesOnly(empty, 'json', ['BLEU']));
    expect(json.totalMatches).toBe(0);
    expect(json.matches).toEqual([]);
    expect(json.queries).toEqual(['BLEU']);
  });
});
