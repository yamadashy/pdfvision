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
  // Page 2 matched nothing — must not appear in matches-only output.
  makePage({ page: 2, matches: [] }),
]);

describe('formatMatchesOnly', () => {
  it('markdown: header, summary line, and one flat table of every hit', () => {
    const out = formatMatchesOnly(THREE_HITS, 'markdown', ['BLEU']);
    expect(out).toMatch(/^# \/tmp\/attention\.pdf\n/);
    expect(out).toContain('- **Pages:** 15');
    expect(out).toContain('- **Matches:** 3 ("BLEU") on page 1');
    expect(out).toContain('| Page | Query | Source | Text | Context | BBox |');
    expect(out).toContain(
      '| 1 | BLEU | native | BLEU | less time to train. Our model achieves 28.4 BLEU on the WMT 2014 English- | 340.31,487.37,17.86,9.96 |',
    );
    // No per-page bodies, no Overview table, and pages with zero matches
    // never appear.
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
    const toon = formatMatchesOnly(THREE_HITS, 'toon', ['BLEU']);
    const decoded = decode(toon) as { totalMatches: number; matches: unknown[]; pages?: unknown };
    expect(decoded.totalMatches).toBe(3);
    expect(decoded.matches).toHaveLength(3);
    expect(decoded.pages).toBeUndefined();
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
