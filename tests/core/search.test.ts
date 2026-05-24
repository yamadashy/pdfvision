import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { processDocument } from '../../src/core/processor.js';

const SAMPLE_PDF = resolve(__dirname, '../fixtures/sample.pdf');
const SAMPLE_JA_PDF = resolve(__dirname, '../fixtures/sample-ja.pdf');

describe('processDocument search', () => {
  it('finds literal substring matches and attaches matches[] per page', async () => {
    // SAMPLE_PDF carries "Hello pdfvision" on page 1. A bare-substring
    // query for "pdfvision" must return at least one native match with
    // a usable bbox so the agent can pipe it into renderRegion.
    const result = await processDocument(SAMPLE_PDF, {
      search: 'pdfvision',
      noCache: true,
    });
    expect(result.pages[0].matches).toBeDefined();
    expect(result.pages[0].matches?.length ?? 0).toBeGreaterThan(0);
    const m = result.pages[0].matches?.[0];
    expect(m?.text).toMatch(/pdfvision/i);
    expect(m?.source).toBe('native');
    expect(m?.page).toBe(1);
    expect(m?.bbox.width).toBeGreaterThan(0);
    expect(m?.bbox.height).toBeGreaterThan(0);
    expect(m?.boxes.length).toBeGreaterThan(0);
    // Single-query call → queryIndex omitted.
    expect(m?.queryIndex).toBeUndefined();
  });

  it('returns an empty matches[] when the query is not found (vs omitting the field)', async () => {
    // Present-with-empty-array tells the agent "search ran, no hits"
    // — distinct from search being absent (no matches[] field at all).
    const result = await processDocument(SAMPLE_PDF, {
      search: 'definitely-not-in-the-fixture-xyzzy-9999',
      noCache: true,
    });
    expect(result.pages[0].matches).toBeDefined();
    expect(result.pages[0].matches?.length).toBe(0);
  });

  it('omits matches[] entirely when no search was requested', async () => {
    // Default extraction never carries a stray matches field.
    const result = await processDocument(SAMPLE_PDF, { noCache: true });
    expect(result.pages[0].matches).toBeUndefined();
  });

  it('case-insensitive by default; case-sensitive when opted in', async () => {
    // SAMPLE_PDF body has "Hello pdfvision". An uppercase "PDFVISION"
    // query must hit by default (case-insensitive recall) but miss
    // when the user opts into case-sensitive matching.
    const insensitive = await processDocument(SAMPLE_PDF, {
      search: 'PDFVISION',
      noCache: true,
    });
    expect(insensitive.pages[0].matches?.length ?? 0).toBeGreaterThan(0);

    const sensitive = await processDocument(SAMPLE_PDF, {
      search: 'PDFVISION',
      searchCaseSensitive: true,
      noCache: true,
    });
    expect(sensitive.pages[0].matches?.length ?? 0).toBe(0);
  });

  it('escapes regex special chars in literal queries (default)', async () => {
    // `.` in literal mode must match literally — not the regex "any
    // single char". SAMPLE_PDF text is "Hello pdfvision" so "pd.vision"
    // would match in regex mode but must miss in literal mode.
    const literal = await processDocument(SAMPLE_PDF, {
      search: 'pd.vision',
      noCache: true,
    });
    expect(literal.pages[0].matches?.length ?? 0).toBe(0);
  });

  it('treats query as a regular expression when searchRegex is on', async () => {
    // Same `pd.vision` pattern now interpreted as regex matches the
    // literal "pdfvision" string in the body.
    const regex = await processDocument(SAMPLE_PDF, {
      search: 'pd.vision',
      searchRegex: true,
      noCache: true,
    });
    expect(regex.pages[0].matches?.length ?? 0).toBeGreaterThan(0);
  });

  it('rejects an empty query up front (library entry point)', async () => {
    await expect(processDocument(SAMPLE_PDF, { search: '', noCache: true })).rejects.toThrow(/non-empty string/);
  });

  it('rejects an empty array of queries up front', async () => {
    await expect(processDocument(SAMPLE_PDF, { search: [], noCache: true })).rejects.toThrow(/at least one query/);
  });

  it('rejects an invalid regex up front with the bad pattern in the message', async () => {
    await expect(processDocument(SAMPLE_PDF, { search: '[bad', searchRegex: true, noCache: true })).rejects.toThrow(
      /Invalid search query .*"\[bad"/,
    );
  });

  it('attaches queryIndex on each match when multiple queries are passed', async () => {
    // Multi-query call: each match must carry the 0-based index of the
    // source query so a flat-iteration consumer can demultiplex which
    // hit came from which input.
    const result = await processDocument(SAMPLE_PDF, {
      search: ['Hello', 'pdfvision'],
      noCache: true,
    });
    const matches = result.pages[0].matches ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
    expect(matches.every((m) => m.queryIndex !== undefined)).toBe(true);
    // Both queries should have produced at least one match.
    const indices = new Set(matches.map((m) => m.queryIndex));
    expect(indices.has(0)).toBe(true);
    expect(indices.has(1)).toBe(true);
  });

  it('matches NFKC-equivalent codepoints (compatibility fold)', async () => {
    // SAMPLE_JA_PDF body has Japanese text containing `これは` and `です`.
    // Search with a fullwidth variant or compatibility form should
    // still hit because both query and text are NFKC-normalised
    // before matching. `これは` round-trips cleanly through NFKC, so
    // use the simpler guard: a query in NFKC form finds the page
    // even when the source PDF's stream uses pre-normalization
    // codepoints — same compatibility-fold logic that powers the
    // existing pages[].text normalization.
    const result = await processDocument(SAMPLE_JA_PDF, {
      search: 'これは',
      pages: '1',
      noCache: true,
    });
    expect(result.pages[0].matches?.length ?? 0).toBeGreaterThan(0);
  });

  it('mirrors matchCount on the overview when search ran on a multi-page doc', async () => {
    // SAMPLE_JA_PDF is multi-page so an overview is built. matchCount
    // is the per-page hit count and is present-with-`0` on pages
    // that the search ran across but didn't match — keeps the
    // "ran, found none" vs "didn't run" distinction at the overview
    // level too.
    const result = await processDocument(SAMPLE_JA_PDF, {
      search: 'これは',
      noCache: true,
    });
    expect(result.overview).toBeDefined();
    expect(result.overview?.[0].matchCount).toBeGreaterThanOrEqual(0);
    expect(result.overview?.every((o) => o.matchCount !== undefined)).toBe(true);
  });

  it('omits overview matchCount when no search was requested', async () => {
    const result = await processDocument(SAMPLE_JA_PDF, { noCache: true });
    expect(result.overview?.every((o) => o.matchCount === undefined)).toBe(true);
  });

  it('does not require --geometry or --layout to be on for bbox to be populated', async () => {
    // The processor enables span extraction internally when --search is
    // on, so the agent doesn't have to add --geometry just to get match
    // bbox. The public pages[].spans / pages[].layout still respect
    // their own flags — only the search bbox piggy-backs on the
    // internal pass.
    const result = await processDocument(SAMPLE_PDF, {
      search: 'pdfvision',
      noCache: true,
    });
    expect(result.pages[0].spans).toBeUndefined();
    expect(result.pages[0].layout).toBeUndefined();
    expect(result.pages[0].matches?.[0].bbox.width).toBeGreaterThan(0);
  });

  it('keeps cache entries with different search queries separate', async () => {
    // Same PDF, two different queries — distinct cache slots so a
    // second query doesn't return the first's matches.
    const a = await processDocument(SAMPLE_PDF, { search: 'Hello', noCache: false });
    const b = await processDocument(SAMPLE_PDF, { search: 'pdfvision', noCache: false });
    const aTexts = (a.pages[0].matches ?? []).map((m) => m.text.toLowerCase()).join('\n');
    const bTexts = (b.pages[0].matches ?? []).map((m) => m.text.toLowerCase()).join('\n');
    expect(aTexts).not.toBe(bTexts);
  });
});
