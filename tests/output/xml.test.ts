import { describe, expect, it } from 'vitest';
import { formatXml } from '../../src/output/xml.js';
import type { DocumentResult, PageResult } from '../../src/types/index.js';

function makePage(overrides: Partial<PageResult> & Pick<PageResult, 'page'>): PageResult {
  return {
    text: '',
    charCount: 0,
    imageCount: 0,
    textCoverage: 0,
    nonPrintableRatio: 0,
    nonPrintableCount: 0,
    quality: { nativeTextStatus: 'empty' },
    width: 612,
    height: 792,
    ...overrides,
  };
}

function makeResult(overrides: Partial<DocumentResult> = {}): DocumentResult {
  return {
    file: '/tmp/x.pdf',
    totalPages: 1,
    metadata: { title: null, author: null, subject: null, creator: null },
    pages: [makePage({ page: 1, text: 'hello world', charCount: 11, textCoverage: 0.01 })],
    ...overrides,
  };
}

describe('formatXml', () => {
  it('wraps the result in a <document> root tag with file and totalPages attributes', () => {
    const out = formatXml(makeResult({ totalPages: 5 }));
    expect(out).toMatch(/^<document file="\/tmp\/x\.pdf" totalPages="5">/);
    expect(out.trimEnd().endsWith('</document>')).toBe(true);
  });

  it('omits the metadata block when every field is null', () => {
    const out = formatXml(makeResult());
    expect(out).not.toMatch(/<metadata/);
  });

  it('emits each present metadata field as its own child element', () => {
    const out = formatXml(
      makeResult({
        metadata: { title: 'My Doc', author: 'Alice', subject: 'Q', creator: 'LaTeX' },
      }),
    );
    expect(out).toContain('<title>My Doc</title>');
    expect(out).toContain('<author>Alice</author>');
    expect(out).toContain('<subject>Q</subject>');
    expect(out).toContain('<creator>LaTeX</creator>');
  });

  it('emits an <overview> element listing density signals when overview is present', () => {
    const out = formatXml(
      makeResult({
        totalPages: 2,
        overview: [
          {
            page: 1,
            charCount: 10,
            imageCount: 0,
            textCoverage: 0.1,
            nonPrintableRatio: 0,
            nonPrintableCount: 0,
            quality: { nativeTextStatus: 'ok' },
            width: 612,
            height: 792,
          },
          {
            page: 2,
            charCount: 0,
            imageCount: 5,
            textCoverage: 0.02,
            nonPrintableRatio: 0,
            nonPrintableCount: 0,
            quality: { nativeTextStatus: 'empty_but_visual_content' },
            width: 612,
            height: 792,
          },
        ],
        pages: [
          makePage({ page: 1, text: 'aa', charCount: 10, textCoverage: 0.1 }),
          makePage({ page: 2, text: '', charCount: 0, imageCount: 5, textCoverage: 0.02 }),
        ],
      }),
    );
    expect(out).toMatch(/<overview>/);
    expect(out).toMatch(
      /<page no="1" charCount="10" imageCount="0" textCoverage="0\.1" nonPrintableRatio="0" nonPrintableCount="0" nativeTextStatus="ok" width="612" height="792"\/>/,
    );
    expect(out).toMatch(
      /<page no="2" charCount="0" imageCount="5" textCoverage="0\.02" nonPrintableRatio="0" nonPrintableCount="0" nativeTextStatus="empty_but_visual_content" width="612" height="792"\/>/,
    );
  });

  it('puts the page text inside a <text> element with newline padding for LLM readability', () => {
    const out = formatXml(makeResult());
    expect(out).toContain('<text>\nhello world\n</text>');
  });

  it('emits a sibling <rawText> element when the page carries pre-normalization text', () => {
    const out = formatXml(
      makeResult({
        pages: [makePage({ page: 1, text: 'ABC', rawText: 'ＡＢＣ', charCount: 3 })],
      }),
    );
    expect(out).toMatch(/<text>\nABC\n<\/text>/);
    expect(out).toMatch(/<rawText>\nＡＢＣ\n<\/rawText>/);
  });

  it('emits a <spans> block with bbox attributes when spans are present', () => {
    const out = formatXml(
      makeResult({
        pages: [
          makePage({
            page: 1,
            text: 'Hi',
            charCount: 2,
            spans: [{ text: 'Hi', x: 10, y: 20, width: 30, height: 12, fontSize: 12, fontName: 'g_d0_f1' }],
          }),
        ],
      }),
    );
    expect(out).toContain('<spans>');
    expect(out).toMatch(/<span text="Hi" x="10" y="20" width="30" height="12" fontSize="12" fontName="g_d0_f1"\/>/);
  });

  it('puts the rendered image path on the page as an attribute when present', () => {
    const out = formatXml(
      makeResult({
        pages: [makePage({ page: 1, text: 't', charCount: 1, image: '/tmp/p.png' })],
      }),
    );
    expect(out).toMatch(/<page [^>]* image="\/tmp\/p\.png">/);
  });

  it('echoes renderRegion as four sibling attributes on the page when present', () => {
    // Mirrors the JSON output's `renderRegion` echo so XML consumers can
    // also tell a cropped raster from a full-page one without parsing
    // the on-disk filename.
    const out = formatXml(
      makeResult({
        pages: [
          makePage({
            page: 1,
            text: 't',
            charCount: 1,
            image: '/tmp/p.png',
            renderRegion: { x: 50, y: 100, width: 200, height: 150 },
          }),
        ],
      }),
    );
    expect(out).toMatch(
      /<page [^>]* renderRegionX="50" renderRegionY="100" renderRegionWidth="200" renderRegionHeight="150">/,
    );
  });

  it('omits the renderRegion attributes on a full-page render', () => {
    const out = formatXml(makeResult({ pages: [makePage({ page: 1, text: 't', charCount: 1, image: '/tmp/p.png' })] }));
    expect(out).not.toMatch(/renderRegion/);
  });

  it('escapes characters that would otherwise break XML attribute or text parsing', () => {
    // PDF text and titles can contain `<`, `>`, `&`, `"`. Without escaping
    // these, the output stops being parseable XML — which defeats the point
    // of choosing this format for downstream agents.
    const out = formatXml(
      makeResult({
        metadata: { title: 'A & B <x>', author: null, subject: null, creator: null },
        pages: [makePage({ page: 1, text: '<script>alert("x")</script>', charCount: 27 })],
      }),
    );
    expect(out).toContain('<title>A &amp; B &lt;x&gt;</title>');
    // Inside text content `"` is not special, so it stays literal — only
    // `&`, `<`, `>` need escaping. Inside attribute values `"` would be
    // escaped (covered by the newline-in-attribute test below).
    expect(out).toContain('&lt;script&gt;alert("x")&lt;/script&gt;');
  });

  it('emits a <layout> block with nested <block>/<line> elements when layout is present', () => {
    const out = formatXml(
      makeResult({
        pages: [
          makePage({
            page: 1,
            text: 'Hi',
            charCount: 2,
            layout: {
              blocks: [
                {
                  text: 'Hi',
                  x: 10,
                  y: 20,
                  width: 30,
                  height: 12,
                  lines: [{ text: 'Hi', x: 10, y: 20, width: 30, height: 12, fontSize: 12 }],
                },
              ],
            },
          }),
        ],
      }),
    );
    expect(out).toContain('<layout>');
    expect(out).toMatch(/<block x="10" y="20" width="30" height="12">/);
    expect(out).toMatch(/<line x="10" y="20" width="30" height="12" fontSize="12">Hi<\/line>/);
  });

  it('emits an <imageBoxes> block with one <imageBox/> per box', () => {
    const out = formatXml(
      makeResult({
        pages: [
          makePage({
            page: 1,
            text: 't',
            charCount: 1,
            imageBoxes: [
              { x: 50, y: 100, width: 50, height: 50 },
              { x: 150, y: 100, width: 50, height: 50 },
            ],
          }),
        ],
      }),
    );
    expect(out).toContain('<imageBoxes>');
    expect(out).toMatch(/<imageBox x="50" y="100" width="50" height="50"\/>/);
    expect(out).toMatch(/<imageBox x="150" y="100" width="50" height="50"\/>/);
  });

  it('emits self-closing <imageBoxes/> on a text-only page so the absence is visible', () => {
    // An empty array still surfaces — distinguishes "we looked, found none"
    // from "we did not look" the same way the JSON output does.
    const out = formatXml(makeResult({ pages: [makePage({ page: 1, text: 't', charCount: 1, imageBoxes: [] })] }));
    expect(out).toContain('<imageBoxes/>');
  });

  it('emits an <ocr> element with lang + confidence attributes when ocr is present', () => {
    const out = formatXml(
      makeResult({
        pages: [
          makePage({
            page: 1,
            text: 'Hello',
            charCount: 5,
            ocr: { text: 'Hello world', confidence: 0.91, lang: 'eng+jpn' },
          }),
        ],
      }),
    );
    expect(out).toMatch(/<ocr lang="eng\+jpn" confidence="0\.91">\nHello world\n<\/ocr>/);
  });

  it('emits a self-closing <ocr/> when OCR ran but found no text', () => {
    // Mirrors the <imageBoxes/> empty-tag pattern: distinguishes "OCR ran
    // and produced nothing" from "OCR was not requested" (omits tag).
    const out = formatXml(
      makeResult({
        pages: [makePage({ page: 1, text: 't', charCount: 1, ocr: { text: '', confidence: 0, lang: 'eng' } })],
      }),
    );
    expect(out).toMatch(/<ocr lang="eng" confidence="0"\/>/);
  });

  it('escapes newlines inside attribute values so they cannot terminate the attribute early', () => {
    const out = formatXml(
      makeResult({
        pages: [
          makePage({
            page: 1,
            text: 't',
            charCount: 1,
            spans: [{ text: 'a\nb', x: 0, y: 0, width: 10, height: 10, fontSize: 12 }],
          }),
        ],
      }),
    );
    // Span text with a newline must come through as a single attribute,
    // with the newline encoded as a numeric entity.
    expect(out).toMatch(/<span text="a&#10;b"/);
  });

  it('emits <warnings> with one <warning> per entry and includes blockIndex / otherBlockIndex when set', () => {
    // Each detector entry becomes a `<warning code=... severity=...
    // blockIndex=... otherBlockIndex=...>message</warning>`. Two-block
    // rules (text_overlap, body_near_repeated_chrome) include
    // otherBlockIndex; single-block rules (off_page) omit it.
    const out = formatXml(
      makeResult({
        pages: [
          makePage({
            page: 1,
            text: 't',
            charCount: 1,
            warnings: [
              {
                code: 'body_near_repeated_chrome',
                severity: 'warning',
                message: 'body crowds footer',
                blockIndex: 0,
                otherBlockIndex: 1,
              },
              {
                code: 'off_page',
                severity: 'error',
                message: 'past right edge',
                blockIndex: 2,
              },
            ],
          }),
        ],
      }),
    );
    expect(out).toMatch(/<warnings>/);
    expect(out).toMatch(
      /<warning code="body_near_repeated_chrome" severity="warning" blockIndex="0" otherBlockIndex="1">body crowds footer<\/warning>/,
    );
    expect(out).toMatch(/<warning code="off_page" severity="error" blockIndex="2">past right edge<\/warning>/);
    expect(out).toMatch(/<\/warnings>/);
  });

  it('omits the <warnings> tag entirely when the page has no warnings', () => {
    // Absence already means "no findings". No empty `<warnings/>` form
    // — unlike `<layout/>` or `<imageBoxes/>`, the warnings array is
    // also omitted from the structured result when empty (processor
    // strips it), so the XML emitter never sees the empty case.
    const out = formatXml(makeResult());
    expect(out).not.toMatch(/<warnings/);
  });

  it('includes warningCount on overview rows when any page has warnings', () => {
    const out = formatXml(
      makeResult({
        totalPages: 2,
        overview: [
          {
            page: 1,
            charCount: 5,
            imageCount: 0,
            textCoverage: 0,
            nonPrintableRatio: 0,
            nonPrintableCount: 0,
            quality: { nativeTextStatus: 'ok' },
            width: 612,
            height: 792,
          },
          {
            page: 2,
            charCount: 7,
            imageCount: 0,
            textCoverage: 0,
            nonPrintableRatio: 0,
            nonPrintableCount: 0,
            quality: { nativeTextStatus: 'ok' },
            warningCount: 1,
            width: 612,
            height: 792,
          },
        ],
        pages: [makePage({ page: 1, text: 'clean' }), makePage({ page: 2, text: 'problem' })],
      }),
    );
    // Page 1 lacks warningCount, page 2 has it.
    expect(out).toMatch(/<page no="2"[^>]* warningCount="1"/);
    expect(out).not.toMatch(/<page no="1"[^>]* warningCount=/);
  });
});
