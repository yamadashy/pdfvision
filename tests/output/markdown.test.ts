import { describe, expect, it } from 'vitest';
import { formatMarkdown } from '../../src/output/markdown.js';
import type { DocumentResult, PageResult } from '../../src/types/index.js';

// US Letter dimensions in PDF points; the formatter doesn't read width/height
// but the type now requires them, so the helper supplies a realistic default.
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
    pages: [makePage({ page: 1, text: 'hello world', charCount: 11, textCoverage: 0.123 })],
    ...overrides,
  };
}

describe('formatMarkdown', () => {
  it('renders a top-level heading with the file path and a Pages bullet', () => {
    const out = formatMarkdown(makeResult());
    expect(out).toMatch(/^# \/tmp\/x\.pdf\n/);
    expect(out).toMatch(/- \*\*Pages:\*\* 1/);
  });

  it('omits Title and Author bullets when both are absent', () => {
    const out = formatMarkdown(makeResult());
    expect(out).not.toMatch(/\*\*Title:\*\*/);
    expect(out).not.toMatch(/\*\*Author:\*\*/);
  });

  it('includes every metadata bullet that is present', () => {
    // Markdown is targeted at agent context where more metadata = more
    // grounding, so all four DocumentMetadata fields surface as bullets.
    const out = formatMarkdown(
      makeResult({
        metadata: { title: 'My Doc', author: 'Alice', subject: 'Quarterly review', creator: 'LaTeX' },
      }),
    );
    expect(out).toMatch(/- \*\*Title:\*\* My Doc/);
    expect(out).toMatch(/- \*\*Author:\*\* Alice/);
    expect(out).toMatch(/- \*\*Subject:\*\* Quarterly review/);
    expect(out).toMatch(/- \*\*Creator:\*\* LaTeX/);
  });

  it('renders each page as ## Page N with a density signal line and the text body', () => {
    const out = formatMarkdown(makeResult());
    expect(out).toMatch(/## Page 1/);
    // Coverage 0.123 → 12% (rounded). Density line uses italic + middle dot
    // so agents can pattern-match without colliding with normal page text.
    expect(out).toMatch(/_chars: 11 · images: 0 · coverage: 12% · size: 612×792pt_/);
    expect(out).toMatch(/\nhello world$/);
  });

  it('surfaces page rotation on rotated pages', () => {
    const out = formatMarkdown(
      makeResult({
        pages: [makePage({ page: 1, text: 'rotated', charCount: 7, rotation: 90 })],
      }),
    );

    expect(out).toMatch(/rotation: 90°/);
  });

  it('emits a Markdown image link when the page has a rendered PNG path', () => {
    const out = formatMarkdown(
      makeResult({
        pages: [makePage({ page: 1, text: 't', charCount: 1, image: '/tmp/p.png' })],
      }),
    );
    expect(out).toMatch(/!\[Page 1\]\(<\/tmp\/p\.png>\)/);
  });

  it('keeps image links intact when the path contains spaces or parentheses', () => {
    // --render-output may point at a directory like "./my (drafts)/", and
    // the unescaped `(` inside `![...](...)` would otherwise terminate the
    // link destination early. The angle-bracket form must survive that.
    const out = formatMarkdown(
      makeResult({
        pages: [
          makePage({
            page: 1,
            text: 't',
            charCount: 1,
            image: '/tmp/my (drafts)/page 1.png',
          }),
        ],
      }),
    );
    expect(out).toContain('![Page 1](</tmp/my (drafts)/page 1.png>)');
  });

  it('separates pages with --- so multi-page docs stay readable', () => {
    const out = formatMarkdown(
      makeResult({
        totalPages: 2,
        pages: [makePage({ page: 1, text: 'one', charCount: 3 }), makePage({ page: 2, text: 'two', charCount: 3 })],
      }),
    );
    // Two page sections separated by a horizontal rule.
    expect(out.match(/^---$/gm)?.length).toBe(2);
    expect(out.indexOf('## Page 1')).toBeLessThan(out.indexOf('## Page 2'));
  });

  it('emits an Overview density table for multi-page docs so agents can spot outliers', () => {
    // The overview is just an aggregation of the per-page density signals
    // already on every page section — no judgment ("needsVision",
    // "riskLevel", ...). The agent reads it and decides themselves.
    const out = formatMarkdown(
      makeResult({
        totalPages: 3,
        pages: [
          makePage({ page: 1, text: 'aa', charCount: 2, textCoverage: 0.4 }),
          makePage({ page: 2, text: '', charCount: 0, imageCount: 5, textCoverage: 0.02 }),
          makePage({ page: 3, text: 'b'.repeat(100), charCount: 100, imageCount: 1, textCoverage: 0.7 }),
        ],
      }),
    );
    expect(out).toMatch(/## Overview/);
    expect(out).toMatch(/\| Page \| Chars \| Images \| Coverage \|/);
    // Row for the image-flattened page surfaces zero chars, 5 images,
    // 2% coverage so the reader can recognise a likely-rasterised page.
    expect(out).toMatch(/\| 2 \| 0 \| 5 \| 2% \|/);
    // Overview comes before the per-page sections.
    expect(out.indexOf('## Overview')).toBeLessThan(out.indexOf('## Page 1'));
  });

  it('omits the Overview table when only one page was selected', () => {
    // A one-row table is just noise. With --pages 3 the section header
    // already names the page so the table adds no information.
    const out = formatMarkdown(makeResult());
    expect(out).not.toMatch(/## Overview/);
  });

  it('omits the Blocks column when no page carries a layout payload', () => {
    // Default extraction (no --layout) should not pollute the overview
    // table with an empty Blocks column.
    const out = formatMarkdown(
      makeResult({
        totalPages: 2,
        pages: [makePage({ page: 1, text: 'a', charCount: 1 }), makePage({ page: 2, text: 'b', charCount: 1 })],
      }),
    );
    expect(out).not.toMatch(/Blocks/);
  });

  it('adds a Vectors column and density fragment when pages carry vector drawing operations', () => {
    // Vector drawings cover slide shapes, form boxes, chart rules, and
    // diagrams — visible content that does not show up in imageCount.
    const out = formatMarkdown(
      makeResult({
        totalPages: 2,
        pages: [
          makePage({ page: 1, text: 'plain', charCount: 5 }),
          makePage({ page: 2, text: 'diagram', charCount: 7, vectorCount: 12 }),
        ],
      }),
    );
    expect(out).toMatch(/\| Page \| Chars \| Images \| Coverage \| Size \(pt\) \| Vectors \|/);
    expect(out).toMatch(/\| 2 \| 7 \| 0 \| 0% \| 612×792 \| 12 \|/);
    expect(out).toMatch(/vectors: 12/);
  });

  it('adds a Rotation column when any overview page is rotated', () => {
    const out = formatMarkdown(
      makeResult({
        totalPages: 2,
        pages: [
          makePage({ page: 1, text: 'plain', charCount: 5 }),
          makePage({ page: 2, text: 'rotated', charCount: 7, rotation: 270 }),
        ],
      }),
    );

    expect(out).toMatch(/\| Page \| Chars \| Images \| Coverage \| Size \(pt\) \| Rotation \|/);
    expect(out).toMatch(/\| 1 \| 5 \| 0 \| 0% \| 612×792 \| — \|/);
    expect(out).toMatch(/\| 2 \| 7 \| 0 \| 0% \| 612×792 \| 270° \|/);
  });

  it('adds vector-box counts without rendering a large bbox table in Markdown', () => {
    const out = formatMarkdown(
      makeResult({
        totalPages: 2,
        pages: [
          makePage({ page: 1, text: 'plain', charCount: 5, vectorBoxes: [] }),
          makePage({
            page: 2,
            text: 'symbols',
            charCount: 7,
            vectorCount: 12,
            vectorBoxes: [
              { x: 215.21, y: 39.48, width: 31.57, height: 20.69 },
              { x: 246.11, y: 40.07, width: 0.72, height: 0.72 },
            ],
          }),
        ],
      }),
    );

    expect(out).toMatch(/\| Page \| Chars \| Images \| Coverage \| Size \(pt\) \| Vectors \| VectorBoxes \|/);
    expect(out).toMatch(/\| 2 \| 7 \| 0 \| 0% \| 612×792 \| 12 \| 2 \|/);
    expect(out).toContain('vectorBoxes: 2');
    expect(out).not.toContain('215.21,39.48');
  });

  it('adds visual-region counts and crop-ready region tables in Markdown', () => {
    const out = formatMarkdown(
      makeResult({
        totalPages: 2,
        pages: [
          makePage({
            page: 1,
            text: 'figure page',
            charCount: 11,
            visualRegions: [
              {
                id: 'p1-vr0',
                kind: 'raster',
                x: 36,
                y: 72,
                width: 240,
                height: 180,
                areaRatio: 0.089,
                sourceCount: 18,
                sources: [
                  { type: 'imageBox', index: 0 },
                  { type: 'vectorBox', index: 2 },
                ],
                reason: 'raster image covers 8.9% of the page',
                image: '/tmp/region|crop.png',
                renderContentRatio: 0.1234,
                associatedText: [
                  {
                    text: 'Figure 1. Overview',
                    relation: 'caption',
                    x: 40,
                    y: 256,
                    width: 180,
                    height: 12,
                    blockIndex: 3,
                  },
                ],
              },
            ],
          }),
          makePage({ page: 2, text: 'plain', charCount: 5, visualRegions: [] }),
        ],
      }),
    );

    expect(out).toMatch(/\| Page \| Chars \| Images \| Coverage \| Size \(pt\) \| VisualRegions \|/);
    expect(out).toMatch(/\| 1 \| 11 \| 0 \| 0% \| 612×792 \| 1 \|/);
    expect(out).toContain('visualRegions: 1');
    expect(out).toContain('### Visual regions');
    expect(out).toContain('| ID | Kind | BBox | Area | Image | Render | Text | Sources | Reason |');
    expect(out).toContain(
      '| p1-vr0 | raster | 36,72,240,180 | 8.9% | /tmp/region\\|crop.png | 12.34% | caption: Figure 1. Overview | imageBox[0], vectorBox[2], +16 more | raster image covers 8.9% of the page |',
    );
    expect(out).toContain('_No crop-ready visual regions found._');
  });

  it('adds form field counts and a form-field table when form fields are present', () => {
    const out = formatMarkdown(
      makeResult({
        totalPages: 2,
        pages: [
          makePage({
            page: 1,
            text: 'form page',
            charCount: 9,
            formFields: [
              {
                name: 'choice',
                type: 'choice',
                x: 228.8,
                y: 48.5,
                width: 88,
                height: 11,
                value: 'A',
                displayValue: 'Alpha',
                readOnly: true,
                combo: true,
                multiSelect: false,
                options: [
                  { exportValue: 'A', displayValue: 'Alpha' },
                  { exportValue: 'B', displayValue: 'B' },
                ],
              },
              {
                name: 'agree|box',
                type: 'checkbox',
                x: 36,
                y: 62,
                width: 8,
                height: 8,
                value: 'Off',
                checked: false,
                exportValue: 'Yes',
                flags: ['hidden', 'print'],
                label: {
                  text: 'Agree | certify',
                  relation: 'right',
                  x: 48,
                  y: 61,
                  width: 80,
                  height: 10,
                },
              },
            ],
          }),
          makePage({ page: 2, text: 'plain', charCount: 5, formFields: [] }),
        ],
      }),
    );

    expect(out).toMatch(/\| Page \| Chars \| Images \| Coverage \| Size \(pt\) \| FormFields \|/);
    expect(out).toMatch(/\| 1 \| 9 \| 0 \| 0% \| 612×792 \| 2 \|/);
    expect(out).toMatch(/formFields: 2/);
    expect(out).toContain('### Form fields');
    expect(out).toContain('| Type | Name | Label | Value | Export | Options | Flags | BBox |');
    expect(out).toContain('| choice | choice |  | Alpha | A | Alpha=A, B | readOnly, combo | 228.8,48.5,88,11 |');
    expect(out).toContain(
      '| checkbox | agree\\|box | Agree \\| certify (right) | unchecked | Yes |  | hidden, print | 36,62,8,8 |',
    );
    expect(out).toContain('_No interactive form fields found._');
  });

  it('renders form field JavaScript actions', () => {
    const out = formatMarkdown(
      makeResult({
        pages: [
          makePage({
            page: 1,
            text: 'form page',
            charCount: 9,
            formFields: [
              {
                name: 'Execute',
                type: 'button',
                x: 10,
                y: 20,
                width: 80,
                height: 20,
                caption: 'Run now',
                actions: { Action: ['line1();\r\nline2();'] },
              },
            ],
          }),
        ],
      }),
    );

    expect(out).toContain('| Type | Name | Label | Value | Options | Actions | Flags | BBox |');
    expect(out).toContain('| button | Execute |  | Run now |  | Action=line1(); line2(); |  | 10,20,80,20 |');
  });

  it('renders reset form button actions', () => {
    const out = formatMarkdown(
      makeResult({
        pages: [
          makePage({
            page: 1,
            text: 'form page',
            charCount: 9,
            formFields: [
              {
                name: 'ResetAll',
                type: 'button',
                x: 10,
                y: 20,
                width: 80,
                height: 20,
                resetForm: { fields: [], include: false },
              },
              {
                name: 'ResetSome',
                type: 'button',
                x: 10,
                y: 50,
                width: 80,
                height: 20,
                resetForm: { fields: ['Text1', 'Group11'], include: true },
              },
            ],
          }),
        ],
      }),
    );

    expect(out).toContain('| Type | Name | Label | Value | Options | Reset | Flags | BBox |');
    expect(out).toContain('| button | ResetAll |  |  |  | reset all fields |  | 10,20,80,20 |');
    expect(out).toContain('| button | ResetSome |  |  |  | reset only Text1, Group11 |  | 10,50,80,20 |');
  });

  it('adds link counts and a links table when clickable links are present', () => {
    const out = formatMarkdown(
      makeResult({
        totalPages: 2,
        pages: [
          makePage({
            page: 1,
            text: 'linked page',
            charCount: 11,
            links: [
              {
                type: 'url',
                target: 'https://example.com?q=a|b',
                text: 'Example | link',
                x: 100,
                y: 72,
                width: 60,
                height: 20,
              },
              {
                type: 'destination',
                target: ['cite.transformer', { name: 'Fit' }],
                page: 3,
                text: 'Citation',
                x: 40,
                y: 180,
                width: 40,
                height: 12,
              },
            ],
          }),
          makePage({ page: 2, text: 'plain', charCount: 5, links: [] }),
        ],
      }),
    );

    expect(out).toMatch(/\| Page \| Chars \| Images \| Coverage \| Size \(pt\) \| Links \|/);
    expect(out).toMatch(/\| 1 \| 11 \| 0 \| 0% \| 612×792 \| 2 \|/);
    expect(out).toMatch(/links: 2/);
    expect(out).toContain('### Links');
    expect(out).toContain('| Type | Text | Target | TargetPage | BBox |');
    expect(out).toContain('| url | Example \\| link | https://example.com?q=a\\|b |  | 100,72,60,20 |');
    expect(out).toContain('| destination | Citation | ["cite.transformer",{"name":"Fit"}] | 3 | 40,180,40,12 |');
    expect(out).toContain('_No clickable links found._');
  });

  it('adds annotation counts and an annotations table when comments or markup are present', () => {
    const out = formatMarkdown(
      makeResult({
        totalPages: 2,
        pages: [
          makePage({
            page: 1,
            text: 'annotated',
            charCount: 9,
            annotations: [
              {
                subtype: 'Highlight',
                name: 'Highlight',
                contents: 'important|note',
                title: 'Markup',
                color: [255, 255, 11],
                flags: ['print', 'noView'],
                x: 100,
                y: 80,
                width: 80,
                height: 12,
                quadBoxes: [{ x: 100, y: 80, width: 80, height: 12 }],
              },
              {
                subtype: 'FileAttachment',
                name: 'PushPin',
                contents: 'Test.txt',
                title: 'Reviewer',
                border: { width: 1, style: 'solid' },
                line: { from: { x: 1, y: 2 }, to: { x: 3, y: 4 }, endings: ['None', 'OpenArrow'] },
                fileAttachment: { name: 'Test.txt', size: 15, description: 'Supplement' },
                x: 70,
                y: 94,
                width: 20,
                height: 24,
              },
            ],
          }),
          makePage({ page: 2, text: 'plain', charCount: 5, annotations: [] }),
        ],
      }),
    );

    expect(out).toMatch(/\| Page \| Chars \| Images \| Coverage \| Size \(pt\) \| Annotations \|/);
    expect(out).toMatch(/\| 1 \| 9 \| 0 \| 0% \| 612×792 \| 2 \|/);
    expect(out).toMatch(/annotations: 2/);
    expect(out).toContain('### Annotations');
    expect(out).toContain(
      '| Highlight | Highlight | important\\|note | Markup |  | print,noView | 100,80,80,12 | 255,255,11 |  |  | 1 |',
    );
    expect(out).toContain(
      '| FileAttachment | PushPin | Test.txt | Reviewer | Test.txt · 15 bytes · Supplement |  | 70,94,20,24 |  | width=1 solid | line 1,2->3,4 endings=None,OpenArrow | 0 |',
    );
    expect(out).toContain('_No non-link annotations found._');
  });

  it('renders the document outline when outline extraction was requested', () => {
    const out = formatMarkdown(
      makeResult({
        outline: [
          {
            title: 'Intro [draft]',
            type: 'destination',
            target: 'section.1',
            page: 1,
            items: [
              { title: 'Website', type: 'url', target: 'https://example.com' },
              { title: 'Next page', type: 'action', target: 'NextPage' },
            ],
          },
        ],
      }),
    );

    expect(out).toContain('## Outline');
    expect(out).toContain('- Intro \\[draft\\] (p. 1 · destination · section.1)');
    expect(out).toContain('  - Website (url · https://example.com)');
    expect(out).toContain('  - Next page (action · NextPage)');
  });

  it('renders an explicit empty outline message when the outline pass found no bookmarks', () => {
    const out = formatMarkdown(makeResult({ outline: [] }));
    expect(out).toContain('## Outline');
    expect(out).toContain('_No document outline found._');
  });

  it('renders viewer page labels in overview and page sections', () => {
    const out = formatMarkdown(
      makeResult({
        totalPages: 2,
        pageLabels: ['i', '1'],
        pages: [
          makePage({ page: 1, pageLabel: 'i', text: 'front', charCount: 5 }),
          makePage({ page: 2, pageLabel: '1', text: 'body', charCount: 4 }),
        ],
      }),
    );

    expect(out).toMatch(/\| Page \| Label \| Chars \| Images \| Coverage \| Size \(pt\) \|/);
    expect(out).toMatch(/\| 1 \| i \| 5 \| 0 \| 0% \| 612×792 \|/);
    expect(out).toContain('## Page 1 (i)');
    expect(out).toContain('_chars: 5 · images: 0 · coverage: 0% · label: i · size: 612×792pt_');
  });

  it('adds a Structure column to the Overview table when structure extraction ran', () => {
    const out = formatMarkdown(
      makeResult({
        totalPages: 2,
        pages: [
          makePage({
            page: 1,
            text: 'tagged',
            charCount: 6,
            structure: {
              role: 'Root',
              children: [{ role: 'Document', children: [{ type: 'content', id: 'p1_mc0' }] }],
            },
          }),
          makePage({ page: 2, text: 'plain', charCount: 5, structure: null }),
        ],
      }),
    );

    expect(out).toMatch(/\| Page \| Chars \| Images \| Coverage \| Size \(pt\) \| Structure \|/);
    expect(out).toMatch(/\| ---: \| ---: \| ---: \| ---: \| ---: \| ---: \|/);
    expect(out).toMatch(/\| 1 \| 6 \| 0 \| 0% \| 612×792 \| 2 \|/);
    expect(out).toMatch(/\| 2 \| 5 \| 0 \| 0% \| 612×792 \| 0 \|/);
  });

  it('renders tagged PDF structure trees with alternate text', () => {
    const out = formatMarkdown(
      makeResult({
        pages: [
          makePage({
            page: 1,
            text: 'hello',
            charCount: 5,
            structure: {
              role: 'Root',
              children: [
                {
                  role: 'Figure',
                  alt: 'A compass on the cover',
                  lang: 'en-US',
                  bbox: [36.5, 60, 575, 774],
                  children: [{ type: 'content', id: 'p1_mc0' }],
                },
              ],
            },
          }),
        ],
      }),
    );

    expect(out).toContain('_chars: 5 · images: 0 · coverage: 0% · structure: 2 · size: 612×792pt_');
    expect(out).toContain('### Structure');
    expect(out).toContain('- Root');
    expect(out).toContain('  - Figure · lang=en-US · bbox=36.5,60,575,774 · alt=A compass on the cover');
    expect(out).toContain('    - content p1\\_mc0');
  });

  it('escapes tagged PDF structure labels and emits MathML', () => {
    const out = formatMarkdown(
      makeResult({
        pages: [
          makePage({
            page: 1,
            structure: {
              role: 'Root',
              children: [
                {
                  role: 'Formula',
                  alt: 'A < B & C *D* _E_ `F` [G]',
                  mathML: '<math><mi>x</mi></math>',
                  children: [{ type: 'annotation', id: 'annot_p3R_1' }],
                },
              ],
            },
          }),
        ],
      }),
    );

    expect(out).toContain(
      '  - Formula · alt=A &lt; B &amp; C \\*D\\* \\_E\\_ \\`F\\` \\[G\\] · mathML=&lt;math&gt;&lt;mi&gt;x&lt;/mi&gt;&lt;/math&gt;',
    );
    expect(out).toContain('    - annotation annot\\_p3R\\_1');
  });

  it('renders an explicit empty structure message when the structure pass found no tree', () => {
    const out = formatMarkdown(makeResult({ pages: [makePage({ page: 1, structure: null })] }));
    expect(out).toContain('### Structure');
    expect(out).toContain('_No tagged PDF structure tree found._');
  });

  it('renders an explicit empty page-label message when extraction found no labels', () => {
    const out = formatMarkdown(makeResult({ pageLabels: [] }));
    expect(out).toContain('## Page Labels');
    expect(out).toContain('_No custom page labels found._');
  });

  it('renders viewer-level document settings', () => {
    const out = formatMarkdown(
      makeResult({
        viewer: {
          pageMode: 'UseOutlines',
          pageLayout: 'TwoColumnLeft',
          viewerPreferences: { DisplayDocTitle: true, PrintPageRange: [1, 2] },
          openAction: { type: 'destination', page: 3, target: '[{"name":"Fit"}]' },
          jsActions: { printMe: ['this.print(true);'] },
          permissions: { flags: [4, 16], allowed: ['print', 'copy'] },
          markInfo: { marked: true, userProperties: false, suspects: false },
        },
      }),
    );

    expect(out).toContain('## Viewer');
    expect(out).toContain('- **Page mode:** UseOutlines');
    expect(out).toContain('- **Page layout:** TwoColumnLeft');
    expect(out).toContain('- **Open action:** destination · p. 3 · \\[{"name":"Fit"}\\]');
    expect(out).toContain('- **JavaScript actions:** printMe=this.print(true);');
    expect(out).toContain('- **Permissions:** print, copy');
    expect(out).toContain('- **Mark info:** marked=true, userProperties=false, suspects=false');
    expect(out).toContain('- **Preferences:** DisplayDocTitle=true; PrintPageRange=\\[1,2\\]');
  });

  it('truncates long JavaScript action summaries in Markdown', () => {
    const out = formatMarkdown(
      makeResult({
        viewer: {
          jsActions: { bootstrap: ['x'.repeat(700)] },
        },
      }),
    );

    const line = out.split('\n').find((item) => item.startsWith('- **JavaScript actions:**'));
    expect(line).toBeDefined();
    expect(line?.length).toBeLessThan(560);
    expect(line).toContain('bootstrap=');
    expect(line).toContain('...');
  });

  it('renders page-level JavaScript actions', () => {
    const out = formatMarkdown(
      makeResult({
        totalPages: 2,
        pages: [
          makePage({
            page: 1,
            text: 'page with actions',
            charCount: 17,
            jsActions: {
              PageOpen: ['this.getField("Text1").value = "PageOpen";'],
              PageClose: ['this.getField("Text2").value = "PageClose";'],
            },
          }),
          makePage({ page: 2, text: 'plain', charCount: 5 }),
        ],
      }),
    );

    expect(out).toContain('JS Actions');
    expect(out).toContain('| 1 | 17 | 0 | 0% | 612×792 | 2 |');
    expect(out).toContain('_chars: 17 · images: 0 · coverage: 0% · jsActions: 2 · size: 612×792pt_');
    expect(out).toContain('### JavaScript actions');
    expect(out).toContain(
      '- PageOpen=this.getField("Text1").value = "PageOpen"; \\| PageClose=this.getField("Text2").value = "PageClose";',
    );
  });

  it('renders an explicit empty viewer message when the viewer pass found no settings', () => {
    const out = formatMarkdown(makeResult({ viewer: {} }));
    expect(out).toContain('## Viewer');
    expect(out).toContain('_No viewer settings found._');
  });

  it('renders PDF layers with visibility and usage states', () => {
    const out = formatMarkdown(
      makeResult({
        layers: {
          name: 'Layer config',
          creator: 'pdfvision test',
          order: ['4R', { name: 'Nested group', order: ['5R'] }],
          groups: [
            {
              id: '4R',
              name: 'Visible layer',
              visible: true,
              intent: ['View'],
              usage: { viewState: 'ON', printState: 'ON' },
              rbGroups: [['4R', '5R']],
            },
            {
              id: '5R',
              name: 'Hidden layer',
              visible: false,
              intent: ['View', 'Design'],
              usage: { viewState: 'OFF', printState: 'OFF' },
            },
          ],
        },
      }),
    );

    expect(out).toContain('## Layers');
    expect(out).toContain('- **Config:** Layer config');
    expect(out).toContain('- **Panel order:** \\["4R",{"name":"Nested group","order":\\["5R"\\]}\\]');
    expect(out).toContain('| ID | Name | Visible | Intent | View | Print | Radio groups |');
    expect(out).toContain('| 4R | Visible layer | yes | View | ON | ON | [["4R","5R"]] |');
    expect(out).toContain('| 5R | Hidden layer | no | View, Design | OFF | OFF | [] |');
  });

  it('renders an explicit empty layers message when the layer pass found no groups', () => {
    const out = formatMarkdown(makeResult({ layers: { groups: [] } }));
    expect(out).toContain('## Layers');
    expect(out).toContain('_No PDF layers found._');
  });

  it('renders document attachment metadata without content bytes', () => {
    const out = formatMarkdown(
      makeResult({
        attachments: [{ name: 'supplement|data.txt', description: 'Extra file', size: 123, path: '/tmp/a|b.txt' }],
      }),
    );

    expect(out).toContain('## Attachments');
    expect(out).toContain('| Name | Description | Size (bytes) | Path |');
    expect(out).toContain('| supplement\\|data.txt | Extra file | 123 | /tmp/a\\|b.txt |');
  });

  it('renders an explicit empty attachments message when extraction found no embedded files', () => {
    const out = formatMarkdown(makeResult({ attachments: [] }));
    expect(out).toContain('## Attachments');
    expect(out).toContain('_No embedded file attachments found._');
  });

  it('adds a Blocks column to the Overview table when --layout populated pages[].layout', () => {
    // With layout on, agents can scan the Blocks count alongside the
    // density signals to spot pages that decompose differently — a
    // 1-block page is usually a single image / quote / heading, while
    // many small blocks suggest a list or a dense slide.
    const out = formatMarkdown(
      makeResult({
        totalPages: 2,
        pages: [
          makePage({
            page: 1,
            text: 'a',
            charCount: 1,
            layout: {
              blocks: [
                {
                  text: 'a',
                  x: 0,
                  y: 0,
                  width: 10,
                  height: 10,
                  lines: [{ text: 'a', x: 0, y: 0, width: 10, height: 10, fontSize: 10 }],
                },
              ],
            },
          }),
          makePage({
            page: 2,
            text: 'b\nc\nd',
            charCount: 5,
            layout: {
              blocks: [
                {
                  text: 'b',
                  x: 0,
                  y: 0,
                  width: 10,
                  height: 10,
                  lines: [{ text: 'b', x: 0, y: 0, width: 10, height: 10, fontSize: 10 }],
                },
                {
                  text: 'c',
                  x: 0,
                  y: 30,
                  width: 10,
                  height: 10,
                  lines: [{ text: 'c', x: 0, y: 30, width: 10, height: 10, fontSize: 10 }],
                },
                {
                  text: 'd',
                  x: 0,
                  y: 60,
                  width: 10,
                  height: 10,
                  lines: [{ text: 'd', x: 0, y: 60, width: 10, height: 10, fontSize: 10 }],
                },
              ],
            },
          }),
        ],
      }),
    );
    expect(out).toMatch(/Blocks \|/);
    expect(out).toMatch(/\| 1 \| 1 \| 0 \| 0% \| 612×792 \| 1 \|/);
    expect(out).toMatch(/\| 2 \| 5 \| 0 \| 0% \| 612×792 \| 3 \|/);
  });

  it('adds a NonPrint column to the Overview table when at least one page has nonPrintableRatio > 0', () => {
    // The column exists to call out CMap-garbage pages alongside the
    // density signals. Showing it on a doc where no page is affected is
    // pure noise, so the formatter gates it on "any page > 0".
    const out = formatMarkdown(
      makeResult({
        totalPages: 2,
        pages: [
          makePage({ page: 1, text: 'clean', charCount: 5, nonPrintableRatio: 0, nonPrintableCount: 0 }),
          makePage({
            page: 2,
            text: '\x00\x01bad',
            charCount: 3,
            nonPrintableRatio: 0.667,
            nonPrintableCount: 2,
          }),
        ],
      }),
    );
    expect(out).toMatch(/\| Page \| Chars \| Images \| Coverage \| NonPrint \| Size \(pt\) \|/);
    expect(out).toMatch(/\| 1 \| 5 \| 0 \| 0% \| 0% \| 612×792 \|/);
    expect(out).toMatch(/\| 2 \| 3 \| 0 \| 0% \| 67% \| 612×792 \|/);
  });

  it('shows `<1%` instead of `0%` when nonPrintableCount > 0 but the ratio rounds to 0', () => {
    // Sparse occurrences (a couple of control bytes in a multi-thousand-char
    // body page) round to 0% but are still worth surfacing so the agent can
    // filter on "is there ANY garbage?".
    const out = formatMarkdown(
      makeResult({
        totalPages: 2,
        pages: [
          makePage({ page: 1, text: 'a'.repeat(1000), charCount: 1000, nonPrintableRatio: 0, nonPrintableCount: 0 }),
          makePage({ page: 2, text: 'b'.repeat(1000), charCount: 1000, nonPrintableRatio: 0, nonPrintableCount: 2 }),
        ],
      }),
    );
    expect(out).toMatch(/NonPrint/);
    expect(out).toMatch(/\| 2 \| 1000 \| 0 \| 0% \| <1% \| 612×792 \|/);
  });

  it('omits the NonPrint column when every page has nonPrintableRatio = 0', () => {
    const out = formatMarkdown(
      makeResult({
        totalPages: 2,
        pages: [
          makePage({ page: 1, text: 'clean', charCount: 5, nonPrintableRatio: 0 }),
          makePage({ page: 2, text: 'also clean', charCount: 10, nonPrintableRatio: 0 }),
        ],
      }),
    );
    expect(out).not.toMatch(/NonPrint/);
  });

  it('appends a nonPrint fragment with raw count to the page density line when nonPrintableRatio > 0', () => {
    const out = formatMarkdown(
      makeResult({
        pages: [makePage({ page: 1, text: '\x00', charCount: 1, nonPrintableRatio: 1, nonPrintableCount: 1 })],
      }),
    );
    expect(out).toMatch(/_chars: 1 · images: 0 · coverage: 0% · nonPrint: 100% \(1\) · size: 612×792pt_/);
  });

  it('omits the nonPrint fragment from the page density line when nonPrintableRatio = 0', () => {
    const out = formatMarkdown(makeResult());
    expect(out).not.toMatch(/nonPrint/);
  });

  it('appends a native: unusable_glyph_indices badge when quality flags cmap garbage', () => {
    // Hebrew UDHR-shaped page: usable charCount but the glyph indices are
    // garbage. JSON / XML already expose this; markdown must surface it
    // too so an agent reader can dispatch without inferring "62% means bad".
    const out = formatMarkdown(
      makeResult({
        pages: [
          makePage({
            page: 1,
            text: 'garbage text payload',
            charCount: 2760,
            nonPrintableRatio: 0.62,
            nonPrintableCount: 1706,
            quality: { nativeTextStatus: 'unusable_glyph_indices' },
          }),
        ],
      }),
    );
    expect(out).toMatch(/nonPrint: 62% \(1706\)/);
    expect(out).toMatch(/native: unusable_glyph_indices/);
  });

  it('appends a native: mixed_glyph_indices badge when only part of the page has glyph garbage', () => {
    const out = formatMarkdown(
      makeResult({
        pages: [
          makePage({
            page: 1,
            text: 'garbled prefix on connectivity readable tail',
            charCount: 1330,
            nonPrintableRatio: 0.141,
            nonPrintableCount: 188,
            quality: { nativeTextStatus: 'mixed_glyph_indices' },
          }),
        ],
      }),
    );
    expect(out).toMatch(/nonPrint: 14% \(188\)/);
    expect(out).toMatch(/native: mixed_glyph_indices/);
  });

  it('appends a native: empty_but_visual_content badge for image-only pages', () => {
    // SpeakerDeck-shaped page: no native text but visual content present.
    const out = formatMarkdown(
      makeResult({
        pages: [
          makePage({
            page: 1,
            text: '',
            charCount: 0,
            imageCount: 1,
            quality: { nativeTextStatus: 'empty_but_visual_content' },
          }),
        ],
      }),
    );
    expect(out).toMatch(/native: empty_but_visual_content/);
  });

  it('appends a native: sparse_text_with_visual_content badge for visual pages with only sparse text', () => {
    const out = formatMarkdown(
      makeResult({
        pages: [
          makePage({
            page: 1,
            text: '4',
            charCount: 1,
            imageCount: 1,
            textCoverage: 0.001,
            quality: { nativeTextStatus: 'sparse_text_with_visual_content' },
          }),
        ],
      }),
    );
    expect(out).toMatch(/native: sparse_text_with_visual_content/);
  });

  it('appends a native: sparse_text_on_blank_visual badge for hidden sparse text', () => {
    const out = formatMarkdown(
      makeResult({
        pages: [
          makePage({
            page: 1,
            text: '4\nI\n9',
            charCount: 5,
            imageCount: 1,
            textCoverage: 0.001,
            renderContentRatio: 0.000021,
            quality: { nativeTextStatus: 'sparse_text_on_blank_visual', visualStatus: 'blank' },
          }),
        ],
      }),
    );

    expect(out).toMatch(/native: sparse_text_on_blank_visual/);
    expect(out).toMatch(/visual: blank/);
  });

  it('appends a visual: blank badge when the rendered page came out blank', () => {
    // Alice dark scan: charCount=0, renderContentRatio rounds to 0.00%,
    // visualStatus="blank" tells the agent the render itself failed.
    const out = formatMarkdown(
      makeResult({
        pages: [
          makePage({
            page: 1,
            text: '',
            charCount: 0,
            imageCount: 2,
            renderContentRatio: 0.000021,
            quality: { nativeTextStatus: 'empty_but_visual_content', visualStatus: 'blank' },
          }),
        ],
      }),
    );
    expect(out).toMatch(/render: 0\.00%/);
    expect(out).toMatch(/native: empty_but_visual_content/);
    expect(out).toMatch(/visual: blank/);
  });

  it('appends a visual: sparse badge when the rendered page has only tiny marks', () => {
    const out = formatMarkdown(
      makeResult({
        pages: [
          makePage({
            page: 1,
            text: '',
            charCount: 0,
            vectorCount: 1,
            renderContentRatio: 0.0008,
            quality: { nativeTextStatus: 'empty_but_visual_content', visualStatus: 'sparse' },
          }),
        ],
      }),
    );
    expect(out).toMatch(/render: 0\.08%/);
    expect(out).toMatch(/native: empty_but_visual_content/);
    expect(out).toMatch(/visual: sparse/);
  });

  it('omits quality badges on healthy pages (nativeTextStatus=ok, no visualStatus)', () => {
    const out = formatMarkdown(
      makeResult({ pages: [makePage({ page: 1, text: 'ok', charCount: 2, quality: { nativeTextStatus: 'ok' } })] }),
    );
    expect(out).not.toMatch(/native:/);
    expect(out).not.toMatch(/visual:/);
  });

  it('omits the native badge for empty pages with no visual content (default empty case)', () => {
    // A truly blank page (nativeTextStatus="empty", no images, no render)
    // is a normal flow — the existing chars: 0 / images: 0 already
    // communicates it. Don't add a redundant "native: empty" badge.
    const out = formatMarkdown(makeResult({ pages: [makePage({ page: 1 })] }));
    expect(out).not.toMatch(/native:/);
  });

  it('renders an OCR section with lang and confidence percent below the native text', () => {
    // Native text comes first; OCR sits underneath as a separate ### block
    // so an agent reads pdfjs first and only consults OCR when needed.
    const out = formatMarkdown(
      makeResult({
        pages: [
          makePage({
            page: 1,
            text: 'Hello',
            charCount: 5,
            ocr: { text: 'Hello world', confidence: 0.91, lang: 'eng' },
          }),
        ],
      }),
    );
    expect(out).toMatch(/### OCR \(eng, confidence 91%\)/);
    expect(out).toMatch(/Hello world/);
    // Native text appears before OCR section.
    expect(out.indexOf('\nHello\n')).toBeLessThan(out.indexOf('### OCR'));
  });

  it('skips the text body for pages that had no extractable text', () => {
    // Image-only pages should still render the heading + density line so the
    // agent can see "this page had 0 chars and 3 images" instead of a silent gap.
    const out = formatMarkdown(
      makeResult({
        pages: [makePage({ page: 1, imageCount: 3 })],
      }),
    );
    expect(out).toMatch(/## Page 1/);
    expect(out).toMatch(/images: 3/);
  });

  it('drops repeated-chrome blocks from the page body when stripRepeated + layout are on', async () => {
    // Cross-page layout tags chrome (header / footer / page number) with
    // `repeated: true`. With stripRepeated enabled the Markdown body
    // rebuilds from non-repeated blocks instead of pdf.js's raw
    // `page.text`, so the rendered body does not contain footer noise
    // the agent would otherwise re-read on every page.
    const out = formatMarkdown(
      makeResult({
        pages: [
          makePage({
            page: 1,
            text: 'Real body line.\n© COLOPL, Inc.',
            charCount: 31,
            layout: {
              blocks: [
                { text: 'Real body line.', x: 0, y: 0, width: 100, height: 12, lines: [] },
                {
                  text: '© COLOPL, Inc.',
                  x: 0,
                  y: 780,
                  width: 100,
                  height: 10,
                  lines: [],
                  repeated: true,
                },
              ],
            },
          }),
        ],
      }),
      { stripRepeated: true },
    );
    expect(out).toContain('Real body line.');
    expect(out).not.toContain('© COLOPL, Inc.');
  });

  it('leaves the body untouched when stripRepeated is off (default)', async () => {
    // Sanity: opting out of strip means the existing `page.text` flow
    // is preserved verbatim, including the repeated chrome.
    const out = formatMarkdown(
      makeResult({
        pages: [
          makePage({
            page: 1,
            text: 'Body\n© Footer',
            charCount: 14,
            layout: {
              blocks: [
                { text: 'Body', x: 0, y: 0, width: 100, height: 12, lines: [] },
                {
                  text: '© Footer',
                  x: 0,
                  y: 780,
                  width: 100,
                  height: 10,
                  lines: [],
                  repeated: true,
                },
              ],
            },
          }),
        ],
      }),
    );
    expect(out).toContain('Body');
    expect(out).toContain('© Footer');
  });

  it('uses layout text for Markdown body when vertical CJK blocks are present', async () => {
    // pdf.js native text streams often expose vertical Japanese as one
    // glyph per line. When --layout already recovered the top-to-bottom
    // stack, Markdown should show that human-readable block instead of
    // the raw glyph stream.
    const out = formatMarkdown(
      makeResult({
        pages: [
          makePage({
            page: 1,
            text: '縦\n書\nき',
            charCount: 3,
            layout: {
              blocks: [
                {
                  text: '縦書き',
                  x: 36,
                  y: 194,
                  width: 88,
                  height: 299,
                  writingMode: 'vertical',
                  lines: [
                    { text: '縦書き', x: 36, y: 194, width: 88, height: 299, fontSize: 88, writingMode: 'vertical' },
                  ],
                },
              ],
            },
          }),
        ],
      }),
    );

    expect(out).toMatch(/\n縦書き$/);
    expect(out).not.toContain('縦\n書\nき');
  });

  it('throws when stripRepeated is requested but the page carries no layout', async () => {
    // `repeated: true` only exists after the cross-page layout pass, so
    // stripping without a layout payload is a misconfigured call. Fail
    // loudly rather than silently emit the unfiltered text.
    expect(() =>
      formatMarkdown(makeResult({ pages: [makePage({ page: 1, text: 'no layout', charCount: 9 })] }), {
        stripRepeated: true,
      }),
    ).toThrow(/stripRepeated requires layout/);
  });

  it('appends a warnings fragment to the page density line and a blockquote section under the page', async () => {
    // Per-page warnings surface in two places: a count fragment on
    // the density line (matches the nonPrint / render / native /
    // visual pattern) and a `### Warnings` blockquote section after
    // the body so an agent can scan severity + code at a glance.
    const out = formatMarkdown(
      makeResult({
        pages: [
          makePage({
            page: 1,
            text: 'closing line.\n© FOO',
            charCount: 19,
            warnings: [
              {
                code: 'body_near_repeated_chrome',
                severity: 'warning',
                message: 'body block ends 3.5pt above a repeated chrome block',
                blockIndex: 0,
                otherBlockIndex: 1,
              },
              {
                code: 'off_page',
                severity: 'error',
                message: 'block bbox extends past the page right edge',
                blockIndex: 2,
              },
            ],
          }),
        ],
      }),
    );
    expect(out).toMatch(/· warnings: 2/);
    expect(out).toMatch(/### Warnings/);
    expect(out).toContain('> **warning** (body_near_repeated_chrome):');
    expect(out).toContain('> **error** (off_page):');
  });

  it('omits the warnings fragment and section when the page has no warnings', async () => {
    // Clean page: no count fragment on the density line, no
    // `### Warnings` heading. Same shape as the existing nonPrint /
    // render fragments — absence means "everything OK".
    const out = formatMarkdown(makeResult());
    expect(out).not.toMatch(/warnings/);
    expect(out).not.toMatch(/### Warnings/);
  });

  it('adds a Warnings column to the Overview table when at least one page has warnings', async () => {
    // The column appears only when there's signal — keeps the
    // overview tight for the common "no anomalies" case. Mirrors
    // the show-NonPrint / show-Render gating.
    const out = formatMarkdown(
      makeResult({
        totalPages: 2,
        pages: [
          makePage({ page: 1, text: 'clean', charCount: 5 }),
          makePage({
            page: 2,
            text: 'problem',
            charCount: 7,
            warnings: [
              {
                code: 'off_page',
                severity: 'error',
                message: 'block bbox extends past the page right edge',
                blockIndex: 0,
              },
            ],
          }),
        ],
      }),
    );
    expect(out).toMatch(/\| Warnings \|/);
    // Page 2's row carries the count, page 1 shows 0.
    expect(out).toMatch(/\| 2 \| 7 \|.*\| 1 \|/);
  });
});
