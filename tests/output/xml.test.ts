import { describe, expect, it } from 'vitest';
import { formatXml } from '../../src/output/xml.js';
import type { DocumentResult, PageResult } from '../../src/types/index.js';

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
            vectorCount: 2,
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
            vectorCount: 0,
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
      /<page no="1" charCount="10" imageCount="0" vectorCount="2" textCoverage="0\.1" nonPrintableRatio="0" nonPrintableCount="0" nativeTextStatus="ok" width="612" height="792"\/>/,
    );
    expect(out).toMatch(
      /<page no="2" charCount="0" imageCount="5" vectorCount="0" textCoverage="0\.02" nonPrintableRatio="0" nonPrintableCount="0" nativeTextStatus="empty_but_visual_content" width="612" height="792"\/>/,
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

  it('emits a <matches> block with <match><text/>...<box/></match> per hit when search ran', () => {
    const out = formatXml(
      makeResult({
        pages: [
          makePage({
            page: 1,
            text: 't',
            charCount: 1,
            matches: [
              {
                page: 1,
                query: 'foo',
                bbox: { x: 10, y: 20, width: 30, height: 12 },
                boxes: [{ x: 10, y: 20, width: 30, height: 12 }],
                text: 'foo',
                source: 'native',
                context: 'this is foo context',
              },
            ],
          }),
        ],
      }),
    );
    expect(out).toContain('<matches>');
    expect(out).toMatch(/<match page="1" query="foo" source="native" x="10" y="20" width="30" height="12">/);
    expect(out).toContain('<text>foo</text>');
    expect(out).toContain('<box x="10" y="20" width="30" height="12"/>');
    expect(out).toContain('<context>this is foo context</context>');
    expect(out).toContain('</matches>');
  });

  it('emits self-closing <matches/> when search ran but the page had no hits', () => {
    // Mirrors the <imageBoxes/> empty-tag pattern: distinguishes
    // "search ran, no hits" from "search wasn't requested" (omitted).
    const out = formatXml(makeResult({ pages: [makePage({ page: 1, text: 't', charCount: 1, matches: [] })] }));
    expect(out).toContain('<matches/>');
  });

  it('omits the <matches> tag entirely when no search ran on the page', () => {
    const out = formatXml(makeResult());
    expect(out).not.toMatch(/<matches/);
  });

  it('includes queryIndex on match elements when set (multi-query searches)', () => {
    const out = formatXml(
      makeResult({
        pages: [
          makePage({
            page: 1,
            text: 't',
            charCount: 1,
            matches: [
              {
                page: 1,
                query: 'foo',
                queryIndex: 1,
                bbox: { x: 0, y: 0, width: 10, height: 10 },
                boxes: [],
                text: 'foo',
                source: 'native',
              },
            ],
          }),
        ],
      }),
    );
    expect(out).toMatch(/<match page="1" query="foo" queryIndex="1" source="native"/);
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

  it('emits vertical writing mode attributes on layout blocks and lines', () => {
    const out = formatXml(
      makeResult({
        pages: [
          makePage({
            page: 1,
            text: '縦書き',
            charCount: 3,
            layout: {
              blocks: [
                {
                  text: '縦書き',
                  x: 36,
                  y: 194,
                  width: 72,
                  height: 283,
                  writingMode: 'vertical',
                  lines: [
                    {
                      text: '縦書き',
                      x: 36,
                      y: 194,
                      width: 72,
                      height: 283,
                      fontSize: 76,
                      writingMode: 'vertical',
                    },
                  ],
                },
              ],
            },
          }),
        ],
      }),
    );

    expect(out).toMatch(/<block x="36" y="194" width="72" height="283" writingMode="vertical">/);
    expect(out).toMatch(
      /<line x="36" y="194" width="72" height="283" fontSize="76" writingMode="vertical">縦書き<\/line>/,
    );
  });

  it('emits detected layout tables as row-major XML cells', () => {
    const out = formatXml(
      makeResult({
        pages: [
          makePage({
            page: 1,
            text: 'table',
            charCount: 5,
            layout: {
              blocks: [],
              tables: [
                {
                  x: 10,
                  y: 20,
                  width: 200,
                  height: 24,
                  rowCount: 2,
                  columnCount: 3,
                  rows: [
                    {
                      y: 20,
                      height: 10,
                      cells: [
                        { text: 'Products', x: 10, y: 20, width: 40, height: 10 },
                        { text: '298,085', x: 100, y: 20, width: 40, height: 10 },
                        { text: '316,199', x: 160, y: 20, width: 40, height: 10 },
                      ],
                    },
                    {
                      y: 34,
                      height: 10,
                      cells: [
                        { text: 'Services', x: 10, y: 34, width: 40, height: 10 },
                        { text: '85,200', x: 100, y: 34, width: 40, height: 10 },
                        { text: '78,129', x: 160, y: 34, width: 40, height: 10 },
                      ],
                    },
                  ],
                },
              ],
            },
          }),
        ],
      }),
    );
    expect(out).toContain('<tables>');
    expect(out).toContain('<table x="10" y="20" width="200" height="24" rowCount="2" columnCount="3">');
    expect(out).toContain('<row y="20" height="10">');
    expect(out).toContain('<cell x="10" y="20" width="40" height="10">Products</cell>');
    expect(out).toContain('<cell x="160" y="34" width="40" height="10">78,129</cell>');
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

  it('emits vector path boxes with overview counts', () => {
    const out = formatXml(
      makeResult({
        totalPages: 2,
        overview: [
          {
            page: 1,
            charCount: 1,
            imageCount: 0,
            vectorCount: 10,
            textCoverage: 0.1,
            nonPrintableRatio: 0,
            nonPrintableCount: 0,
            quality: { nativeTextStatus: 'ok' },
            vectorBoxCount: 2,
            width: 612,
            height: 792,
          },
        ],
        pages: [
          makePage({
            page: 1,
            text: 't',
            charCount: 1,
            vectorBoxes: [
              { x: 215.21, y: 39.48, width: 31.57, height: 20.69 },
              { x: 246.11, y: 40.07, width: 0.72, height: 0.72 },
            ],
          }),
        ],
      }),
    );

    expect(out).toContain('vectorBoxCount="2"');
    expect(out).toContain('<vectorBoxes>');
    expect(out).toContain('<vectorBox x="215.21" y="39.48" width="31.57" height="20.69"/>');
    expect(out).toContain('<vectorBox x="246.11" y="40.07" width="0.72" height="0.72"/>');
  });

  it('emits self-closing <vectorBoxes/> when extraction ran but found no path bboxes', () => {
    const out = formatXml(makeResult({ pages: [makePage({ page: 1, text: 't', charCount: 1, vectorBoxes: [] })] }));
    expect(out).toContain('<vectorBoxes/>');
  });

  it('emits interactive form fields with values and bboxes', () => {
    const out = formatXml(
      makeResult({
        totalPages: 2,
        overview: [
          {
            page: 1,
            charCount: 1,
            imageCount: 0,
            vectorCount: 10,
            textCoverage: 0.1,
            nonPrintableRatio: 0,
            nonPrintableCount: 0,
            quality: { nativeTextStatus: 'ok' },
            formFieldCount: 2,
            width: 612,
            height: 792,
          },
        ],
        pages: [
          makePage({
            page: 1,
            text: 't',
            charCount: 1,
            formFields: [
              {
                name: 'name|field',
                type: 'text',
                x: 10,
                y: 20,
                width: 100,
                height: 12,
                value: 'Alice & Bob',
              },
              {
                name: 'agree',
                type: 'checkbox',
                x: 10,
                y: 40,
                width: 8,
                height: 8,
                value: 'Off',
                checked: false,
              },
            ],
          }),
        ],
      }),
    );

    expect(out).toContain('formFieldCount="2"');
    expect(out).toContain('<formFields>');
    expect(out).toContain(
      '<field name="name|field" type="text" x="10" y="20" width="100" height="12" value="Alice &amp; Bob"/>',
    );
    expect(out).toContain(
      '<field name="agree" type="checkbox" x="10" y="40" width="8" height="8" value="Off" checked="false"/>',
    );
  });

  it('emits self-closing <formFields/> when extraction ran but found no widgets', () => {
    const out = formatXml(makeResult({ pages: [makePage({ page: 1, text: 't', charCount: 1, formFields: [] })] }));
    expect(out).toContain('<formFields/>');
  });

  it('emits clickable PDF links with escaped targets and overview counts', () => {
    const out = formatXml(
      makeResult({
        totalPages: 2,
        overview: [
          {
            page: 1,
            charCount: 1,
            imageCount: 0,
            vectorCount: 0,
            textCoverage: 0.1,
            nonPrintableRatio: 0,
            nonPrintableCount: 0,
            quality: { nativeTextStatus: 'ok' },
            linkCount: 2,
            width: 612,
            height: 792,
          },
        ],
        pages: [
          makePage({
            page: 1,
            text: 't',
            charCount: 1,
            links: [
              {
                type: 'url',
                target: 'https://example.com?q=a&title="PDF"',
                x: 100,
                y: 72,
                width: 60,
                height: 20,
              },
              {
                type: 'destination',
                target: 'cite.transformer',
                x: 40,
                y: 180,
                width: 40,
                height: 12,
              },
            ],
          }),
        ],
      }),
    );

    expect(out).toContain('linkCount="2"');
    expect(out).toContain('<links>');
    expect(out).toContain(
      '<link type="url" target="https://example.com?q=a&amp;title=&quot;PDF&quot;" x="100" y="72" width="60" height="20"/>',
    );
    expect(out).toContain('<link type="destination" target="cite.transformer" x="40" y="180" width="40" height="12"/>');
  });

  it('emits self-closing <links/> when extraction ran but found no links', () => {
    const out = formatXml(makeResult({ pages: [makePage({ page: 1, text: 't', charCount: 1, links: [] })] }));
    expect(out).toContain('<links/>');
  });

  it('emits non-link annotations with quad boxes and overview counts', () => {
    const out = formatXml(
      makeResult({
        totalPages: 2,
        overview: [
          {
            page: 1,
            charCount: 1,
            imageCount: 0,
            vectorCount: 0,
            textCoverage: 0.1,
            nonPrintableRatio: 0,
            nonPrintableCount: 0,
            quality: { nativeTextStatus: 'ok' },
            annotationCount: 1,
            width: 612,
            height: 792,
          },
        ],
        pages: [
          makePage({
            page: 1,
            text: 't',
            charCount: 1,
            annotations: [
              {
                subtype: 'Highlight',
                contents: 'A & B',
                title: 'Markup',
                color: [255, 255, 11],
                modified: "D:20140401161700+02'00'",
                hasAppearance: false,
                x: 100,
                y: 80,
                width: 80,
                height: 12,
                quadBoxes: [{ x: 100, y: 80, width: 80, height: 12 }],
              },
            ],
          }),
        ],
      }),
    );

    expect(out).toContain('annotationCount="1"');
    expect(out).toContain('<annotations>');
    expect(out).toContain(
      '<annotation subtype="Highlight" x="100" y="80" width="80" height="12" contents="A &amp; B" title="Markup" color="255,255,11" modified="D:20140401161700+02\'00\'" hasAppearance="false">',
    );
    expect(out).toContain('<quadBox x="100" y="80" width="80" height="12"/>');
  });

  it('emits self-closing <annotations/> when extraction ran but found no non-link annotations', () => {
    const out = formatXml(makeResult({ pages: [makePage({ page: 1, text: 't', charCount: 1, annotations: [] })] }));
    expect(out).toContain('<annotations/>');
  });

  it('emits document outline items with nested children', () => {
    const out = formatXml(
      makeResult({
        outline: [
          {
            title: 'Intro & Setup',
            type: 'destination',
            target: 'section.1',
            page: 1,
            items: [{ title: 'Website', type: 'url', target: 'https://example.com?q=1&b=2' }],
          },
        ],
      }),
    );

    expect(out).toContain('<outline>');
    expect(out).toContain('<item title="Intro &amp; Setup" type="destination" target="section.1" page="1">');
    expect(out).toContain('<item title="Website" type="url" target="https://example.com?q=1&amp;b=2"/>');
    expect(out).toContain('</outline>');
  });

  it('emits self-closing <outline/> when outline extraction ran but found no bookmarks', () => {
    const out = formatXml(makeResult({ outline: [] }));
    expect(out).toContain('<outline/>');
  });

  it('emits document page labels and mirrors them on page attributes', () => {
    const out = formatXml(
      makeResult({
        totalPages: 2,
        pageLabels: ['i', '1'],
        overview: [
          {
            page: 1,
            pageLabel: 'i',
            charCount: 1,
            imageCount: 0,
            vectorCount: 0,
            textCoverage: 0.01,
            nonPrintableRatio: 0,
            nonPrintableCount: 0,
            quality: { nativeTextStatus: 'ok' },
            width: 612,
            height: 792,
          },
        ],
        pages: [makePage({ page: 1, pageLabel: 'i', text: 't', charCount: 1 })],
      }),
    );

    expect(out).toContain('<pageLabels>');
    expect(out).toContain('<pageLabel page="1" label="i"/>');
    expect(out).toContain('<pageLabel page="2" label="1"/>');
    expect(out).toContain('<page no="1" charCount="1" imageCount="0" vectorCount="0" textCoverage="0.01"');
    expect(out).toContain('label="i"');
  });

  it('emits self-closing <pageLabels/> when extraction ran but found no labels', () => {
    const out = formatXml(makeResult({ pageLabels: [] }));
    expect(out).toContain('<pageLabels/>');
  });

  it('emits viewer-level document settings', () => {
    const out = formatXml(
      makeResult({
        viewer: {
          pageMode: 'UseOutlines',
          pageLayout: 'TwoColumnLeft',
          viewerPreferences: { DisplayDocTitle: true, PrintPageRange: [1, 2] },
          openAction: { type: 'destination', page: 3, target: '[{"name":"Fit"}]' },
          permissions: { flags: [4, 16], allowed: ['print', 'copy'] },
          markInfo: { marked: true, userProperties: false, suspects: false },
        },
      }),
    );

    expect(out).toContain('<viewer pageMode="UseOutlines" pageLayout="TwoColumnLeft">');
    expect(out).toContain('<openAction type="destination" page="3" target="[{&quot;name&quot;:&quot;Fit&quot;}]"/>');
    expect(out).toContain('<permissions flags="4,16" allowed="print,copy"/>');
    expect(out).toContain('<markInfo marked="true" userProperties="false" suspects="false"/>');
    expect(out).toContain('<preference name="DisplayDocTitle" value="true"/>');
    expect(out).toContain('<preference name="PrintPageRange" value="[1,2]"/>');
  });

  it('emits self-closing <viewer/> when extraction ran but found no viewer settings', () => {
    const out = formatXml(makeResult({ viewer: {} }));
    expect(out).toContain('<viewer/>');
  });

  it('emits document attachment metadata without content bytes', () => {
    const out = formatXml(
      makeResult({
        attachments: [
          {
            name: 'supplement & data.txt',
            rawName: 'raw.txt',
            description: 'Extra <file>',
            size: 123,
            path: '/tmp/supplement.txt',
          },
        ],
      }),
    );

    expect(out).toContain('<attachments>');
    expect(out).toContain(
      '<attachment name="supplement &amp; data.txt" size="123" rawName="raw.txt" description="Extra &lt;file&gt;" path="/tmp/supplement.txt"/>',
    );
  });

  it('emits self-closing <attachments/> when extraction ran but found no embedded files', () => {
    const out = formatXml(makeResult({ attachments: [] }));
    expect(out).toContain('<attachments/>');
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

  it('emits <warnings> with one <warning> per entry and includes blockIndex / otherBlockIndex / imageBoxIndex when set', () => {
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
              {
                code: 'large_raster_low_text_overlap',
                severity: 'warning',
                message: 'large image needs visual inspection',
                imageBoxIndex: 0,
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
    expect(out).toMatch(
      /<warning code="large_raster_low_text_overlap" severity="warning" imageBoxIndex="0">large image needs visual inspection<\/warning>/,
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
            vectorCount: 0,
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
            vectorCount: 0,
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
