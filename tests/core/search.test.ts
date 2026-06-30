import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { attachFormFieldTextAppearance } from '../../src/core/formFields/types.js';
import { processDocument } from '../../src/core/processor.js';
import { compileSearch, searchPage } from '../../src/core/search/index.js';
import type { FormField, PageAnnotation, PageLink, TextSpan } from '../../src/types/index.js';

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

  it('matches across a tight URL font-run boundary with a semantic space', () => {
    const spans: TextSpan[] = [
      {
        text: 'els are available at',
        x: 82.91,
        y: 451.93,
        width: 80.3,
        height: 10.91,
        fontSize: 10.91,
      },
      {
        text: 'https://github.com/',
        x: 165.9,
        y: 451.93,
        width: 124.36,
        height: 10.91,
        fontSize: 10.91,
      },
    ];
    const compiled = compileSearch('at https://github.com/', {});
    if (!compiled) throw new Error('expected compiled search');

    const matches = searchPage(spans, undefined, 1, 595, 842, compiled);

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      text: 'at https://github.com/',
      source: 'native',
      page: 1,
    });
    expect(matches[0].boxes.length).toBeGreaterThanOrEqual(2);
  });

  it('matches RTL Arabic phrases across tight shaped word gaps', () => {
    // Arabic CID fonts can report word boxes with a gap well below the
    // Latin 0.25x font-size threshold. Phrase search should still see the
    // source-space word boundary in right-to-left reading order.
    const spans: TextSpan[] = [
      { text: 'العربية', x: 257.55, y: 184, width: 83.92, height: 36, fontSize: 36 },
      { text: 'اخلطوط', x: 346.8, y: 184, width: 86.94, height: 36, fontSize: 36 },
      { text: 'انواع', x: 439.06, y: 184, width: 62.93, height: 36, fontSize: 36 },
    ];
    const compiled = compileSearch('انواع اخلطوط العربية', {});
    if (!compiled) throw new Error('expected compiled search');

    const matches = searchPage(spans, undefined, 1, 595, 842, compiled);

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      text: 'انواع اخلطوط العربية',
      source: 'native',
      page: 1,
    });
    expect(matches[0].boxes).toHaveLength(3);
  });

  it('matches Latin phrases across very tight body-text word gaps', () => {
    const spans: TextSpan[] = [
      {
        text: 'Hence, recording and compiling a trace',
        x: 54,
        y: 71,
        width: 139.59,
        height: 8.97,
        fontSize: 8.97,
      },
      {
        text: 'speculates',
        x: 195.46,
        y: 71,
        width: 37.35,
        height: 8.97,
        fontSize: 8.97,
      },
      {
        text: 'that the path and',
        x: 234.69,
        y: 71,
        width: 58.42,
        height: 8.97,
        fontSize: 8.97,
      },
    ];
    const compiled = compileSearch('trace speculates that', {});
    if (!compiled) throw new Error('expected compiled search');

    const matches = searchPage(spans, undefined, 1, 595, 842, compiled);

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      text: 'trace speculates that',
      source: 'native',
      page: 1,
    });
    expect(matches[0].boxes).toHaveLength(3);
  });

  it('matches Latin phrases split across vertical Japanese columns', () => {
    // TaroUTR50SortedList112 page-2-shaped case: Japanese vertical text
    // carries "Johannes Gutenberg" across two narrow vertical columns,
    // with "Jo" ending the right column and "hannes" starting the next.
    const spans: TextSpan[] = [
      {
        text: 'タイポグラフィ、すなわちtypographyの歴史は長い。Jo',
        x: 151.6,
        y: 263.62,
        width: 9.21,
        height: 294.88,
        fontSize: 9.21,
      },
      {
        text: 'hannes',
        x: 135.48,
        y: 263.62,
        width: 9.21,
        height: 56.88,
        fontSize: 9.21,
      },
      {
        text: 'Gutenbergが1440年代なかばに発明した',
        x: 135.48,
        y: 330.01,
        width: 9.21,
        height: 228.48,
        fontSize: 9.21,
      },
    ];
    const compiled = compileSearch('Johannes Gutenberg', {});
    if (!compiled) throw new Error('expected compiled search');

    const matches = searchPage(spans, undefined, 1, 595, 842, compiled);

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      text: 'Johannes Gutenberg',
      source: 'native',
      page: 1,
    });
    expect(matches[0].boxes.length).toBeGreaterThanOrEqual(3);
    expect(matches[0].bbox.width).toBeGreaterThan(0);
    expect(matches[0].bbox.height).toBeGreaterThan(0);

    const singleSpanCompiled = compileSearch('hannes', {});
    if (!singleSpanCompiled) throw new Error('expected compiled search');
    const singleSpanMatches = searchPage(spans, undefined, 1, 595, 842, singleSpanCompiled);
    expect(singleSpanMatches).toHaveLength(1);
  });

  it('matches visible text form field values with widget bboxes', () => {
    const fields: FormField[] = [
      {
        name: 'Text1',
        type: 'text',
        value: 'abcdefghijklmnopqrstuvwxyz',
        x: 145.98,
        y: 200.84,
        width: 445.48,
        height: 19.84,
        label: {
          text: 'Single line, combs',
          relation: 'left',
          x: 10,
          y: 200.84,
          width: 100,
          height: 10,
        },
      },
      {
        name: 'Check1',
        type: 'checkbox',
        value: 'Off',
        checked: false,
        x: 20,
        y: 20,
        width: 12,
        height: 12,
      },
      {
        name: 'HiddenText',
        type: 'text',
        value: 'hidden printable value',
        x: 40,
        y: 40,
        width: 100,
        height: 20,
        flags: ['hidden', 'print'],
      },
      {
        name: 'ListBox1',
        type: 'choice',
        value: 'Export1',
        x: 60,
        y: 80,
        width: 120,
        height: 80,
        options: [
          { exportValue: 'Export1', displayValue: 'Item1' },
          { exportValue: 'Export2', displayValue: 'Item2' },
        ],
      },
      {
        name: 'Button1',
        type: 'button',
        caption: 'Show',
        x: 200,
        y: 40,
        width: 72,
        height: 20,
      },
    ];
    const compiled = compileSearch(
      ['abcdefghijklmnopqrstuvwxyz', 'Off', 'hidden printable value', 'Item1', 'Export1', 'Show'],
      {},
    );
    if (!compiled) throw new Error('expected compiled search');

    const matches = searchPage([], undefined, 1, 612, 792, compiled, undefined, fields);

    expect(matches).toHaveLength(3);
    expect(matches[0]).toMatchObject({
      query: 'abcdefghijklmnopqrstuvwxyz',
      queryIndex: 0,
      text: 'abcdefghijklmnopqrstuvwxyz',
      source: 'formField',
      page: 1,
      bbox: { x: 145.98, y: 200.84, width: 445.48, height: 19.84 },
      boxes: [{ x: 145.98, y: 200.84, width: 445.48, height: 19.84 }],
      context: 'Single line, combs: abcdefghijklmnopqrstuvwxyz',
    });
    expect(matches[1]).toMatchObject({
      query: 'Item1',
      queryIndex: 3,
      text: 'Item1',
      source: 'formField',
      bbox: { x: 60, y: 80, width: 120, height: 80 },
      context: 'Item1',
    });
    expect(matches[2]).toMatchObject({
      query: 'Show',
      queryIndex: 5,
      text: 'Show',
      source: 'formField',
      bbox: { x: 200, y: 40, width: 72, height: 20 },
      context: 'Show',
    });
  });

  it('matches visible FreeText annotation contents with annotation bboxes', () => {
    const annotations: PageAnnotation[] = [
      {
        subtype: 'FreeText',
        contents: 'this is a text anotation',
        x: 169.6,
        y: 115.79,
        width: 240.01,
        height: 27.26,
      },
      {
        subtype: 'Text',
        contents: 'sticky popup contents',
        x: 191.79,
        y: 420.58,
        width: 19,
        height: 19,
      },
    ];
    const compiled = compileSearch(['this is a text anotation', 'sticky popup contents'], {});
    if (!compiled) throw new Error('expected compiled search');

    const matches = searchPage([], undefined, 1, 612, 792, compiled, undefined, undefined, annotations);

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      query: 'this is a text anotation',
      queryIndex: 0,
      text: 'this is a text anotation',
      source: 'annotation',
      page: 1,
      bbox: { x: 169.6, y: 115.79, width: 240.01, height: 27.26 },
      boxes: [{ x: 169.6, y: 115.79, width: 240.01, height: 27.26 }],
      context: 'FreeText annotation: this is a text anotation',
    });
  });

  it('matches link targets with clickable link bboxes', () => {
    const compiled = compileSearch('pdf_reference', {});
    if (!compiled) throw new Error('expected compiled search');
    const links: PageLink[] = [
      {
        type: 'url',
        target: 'https://example.com/devnet/pdf/pdf_reference.html',
        text: 'pdf ˙reference.html',
        x: 150.53,
        y: 155.63,
        width: 237.36,
        height: 10.21,
      },
    ];

    const matches = searchPage([], undefined, 16, 612, 792, compiled, undefined, undefined, undefined, links);

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      page: 16,
      query: 'pdf_reference',
      bbox: { x: 150.53, y: 155.63, width: 237.36, height: 10.21 },
      boxes: [{ x: 150.53, y: 155.63, width: 237.36, height: 10.21 }],
      text: 'pdf_reference',
      source: 'link',
      context: 'url link target: https://example.com/devnet/pdf/pdf_reference.html',
    });
  });

  it('narrows comb text form-field matches to the matched cells when appearance metadata is available', () => {
    const field: FormField = {
      name: 'CombText',
      type: 'text',
      value: 'abcdefghijklmnopqrstuvwxyz',
      x: 145.98,
      y: 200.84,
      width: 445.48,
      height: 19.84,
      label: {
        text: 'Single line, combs',
        relation: 'left',
        x: 10,
        y: 200.84,
        width: 100,
        height: 10,
      },
    };
    attachFormFieldTextAppearance(field, { comb: true, maxLen: 26 });
    const compiled = compileSearch('z', {});
    if (!compiled) throw new Error('expected compiled search');

    const matches = searchPage([], undefined, 1, 612, 792, compiled, undefined, [field]);

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      query: 'z',
      text: 'z',
      source: 'formField',
      page: 1,
      bbox: { x: 574.33, y: 200.84, width: 17.13, height: 19.84 },
      boxes: [{ x: 574.33, y: 200.84, width: 17.13, height: 19.84 }],
      context: 'Single line, combs: abcdefghijklmnopqrstuvwxyz',
    });
    expect(JSON.stringify(field)).not.toContain('maxLen');
  });

  it('keeps visible FreeText annotation matches when the same text appears elsewhere', () => {
    const spans: TextSpan[] = [
      {
        text: 'FreeText',
        x: 70.86,
        y: 70.32,
        width: 39.08,
        height: 10.98,
        fontSize: 10.98,
      },
    ];
    const annotations: PageAnnotation[] = [
      {
        subtype: 'FreeText',
        contents: 'FreeText content',
        x: 71,
        y: 94.62,
        width: 67.98,
        height: 10.04,
      },
    ];
    const compiled = compileSearch('FreeText', {});
    if (!compiled) throw new Error('expected compiled search');

    const matches = searchPage(spans, undefined, 1, 595.32, 841.92, compiled, undefined, undefined, annotations);

    expect(matches).toHaveLength(2);
    expect(matches[0]).toMatchObject({
      text: 'FreeText',
      source: 'native',
      bbox: { x: 70.86, y: 70.32, width: 39.08, height: 10.98 },
    });
    expect(matches[1]).toMatchObject({
      text: 'FreeText',
      source: 'annotation',
      bbox: { x: 71, y: 94.62, width: 67.98, height: 10.04 },
      context: 'FreeText annotation: FreeText content',
    });
  });

  it('suppresses overlapping FreeText annotation duplicates already present in native text', () => {
    const spans: TextSpan[] = [
      {
        text: 'FreeText content',
        x: 71,
        y: 94.62,
        width: 67.98,
        height: 10.04,
        fontSize: 10.04,
      },
    ];
    const annotations: PageAnnotation[] = [
      {
        subtype: 'FreeText',
        contents: 'FreeText content',
        x: 71,
        y: 94.62,
        width: 67.98,
        height: 10.04,
      },
    ];
    const compiled = compileSearch('FreeText content', {});
    if (!compiled) throw new Error('expected compiled search');

    const matches = searchPage(spans, undefined, 1, 595.32, 841.92, compiled, undefined, undefined, annotations);

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      text: 'FreeText content',
      source: 'native',
    });
  });

  it('matches Latin phrases across tight sentence-punctuation gaps', () => {
    const spans: TextSpan[] = [
      {
        text: 'Fig 2. Two particle desynchronization dynamics.',
        x: 155.74,
        y: 385.9,
        width: 180.6,
        height: 8,
        fontSize: 8,
      },
      {
        text: 'Relative position dynamics (upper panel)',
        x: 338.06,
        y: 385.9,
        width: 130,
        height: 8,
        fontSize: 8,
      },
    ];
    const compiled = compileSearch('dynamics. Relative position', {});
    if (!compiled) throw new Error('expected compiled search');

    const matches = searchPage(spans, undefined, 1, 595, 842, compiled);

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      text: 'dynamics. Relative position',
      source: 'native',
      page: 1,
    });
    expect(matches[0].boxes).toHaveLength(2);
  });

  it('matches phrases across tight number-to-Latin gaps', () => {
    const spans: TextSpan[] = [
      { text: 'Figure 1', x: 469.79, y: 33.65, width: 33.34, height: 10.5, fontSize: 10.5 },
      { text: 'on the left', x: 505.22, y: 33.65, width: 40.12, height: 10.5, fontSize: 10.5 },
    ];
    const compiled = compileSearch('Figure 1 on', {});
    if (!compiled) throw new Error('expected compiled search');

    const matches = searchPage(spans, undefined, 1, 595, 842, compiled);

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      text: 'Figure 1 on',
      source: 'native',
      page: 1,
    });
    expect(matches[0].boxes).toHaveLength(2);
  });

  it('matches phrases across tight Latin-to-number gaps', () => {
    const spans: TextSpan[] = [
      { text: 'Appendix', x: 222.67, y: 100.54, width: 28.05, height: 7.31, fontSize: 7.31 },
      { text: 'Table', x: 252.38, y: 100.54, width: 16.2, height: 7.31, fontSize: 7.31 },
      { text: '1.', x: 270.24, y: 100.54, width: 5.55, height: 7.31, fontSize: 7.31 },
    ];
    const compiled = compileSearch('Appendix Table 1', {});
    if (!compiled) throw new Error('expected compiled search');

    const matches = searchPage(spans, undefined, 1, 612, 792, compiled);

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      text: 'Appendix Table 1',
      source: 'native',
      page: 1,
    });
    expect(matches[0].boxes).toHaveLength(3);
  });

  it('matches phrases across tight Latin-to-Greek symbol gaps', () => {
    const spans: TextSpan[] = [
      { text: 'if', x: 200.01, y: 454.83, width: 5.47, height: 10, fontSize: 10 },
      { text: 'γ', x: 207.55, y: 454.83, width: 4.65, height: 10, fontSize: 10 },
      { text: '= 1 the fixed point', x: 214.19, y: 454.83, width: 76, height: 10, fontSize: 10 },
    ];
    const compiled = compileSearch('if γ= 1', {});
    if (!compiled) throw new Error('expected compiled search');

    const matches = searchPage(spans, undefined, 1, 595, 842, compiled);

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      text: 'if γ= 1',
      source: 'native',
      page: 1,
    });
    expect(matches[0].boxes).toHaveLength(3);
  });

  it('matches hyphenated terms across adjacent line breaks', () => {
    const spans: TextSpan[] = [
      { text: 'according to exam-', x: 122.94, y: 664.47, width: 80, height: 8.97, fontSize: 9.15 },
      { text: 'specific rubrics', x: 122.94, y: 674.03, width: 70, height: 8.97, fontSize: 8.97 },
    ];
    const compiled = compileSearch('exam-specific', {});
    if (!compiled) throw new Error('expected compiled search');

    const matches = searchPage(spans, undefined, 1, 595, 842, compiled);

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      text: 'exam-specific',
      source: 'native',
      page: 1,
    });
    expect(matches[0].boxes).toHaveLength(2);
  });

  it('only emits stacked synthetic-line hits that cross the stacked boundary', () => {
    const spans: TextSpan[] = [
      { text: '図3', x: 456.72, y: 168.94, width: 28.08, height: 14.04, fontSize: 14.04 },
      { text: '若年就業者(', x: 493.92, y: 168.94, width: 84.24, height: 14.04, fontSize: 14.04 },
      { text: '34', x: 578.18, y: 168.94, width: 18.99, height: 14.04, fontSize: 14.04 },
      { text: '歳以下)数の推移', x: 597.14, y: 168.94, width: 111.14, height: 14.04, fontSize: 14.04 },
      { text: '34', x: 585.67, y: 193.56, width: 11.23, height: 9, fontSize: 9 },
      { text: '歳以下の就業者数(製造業)', x: 596.95, y: 193.56, width: 115.34, height: 9, fontSize: 9 },
    ];

    const topOnly = compileSearch('図3 若年就業者', {});
    const crossStack = compileSearch('推移 34歳以下の就業者数', {});
    if (!topOnly || !crossStack) throw new Error('expected compiled search');

    expect(searchPage(spans, undefined, 1, 792, 612, topOnly)).toHaveLength(1);
    const crossStackMatches = searchPage(spans, undefined, 1, 792, 612, crossStack);

    expect(crossStackMatches).toHaveLength(1);
    expect(crossStackMatches[0]).toMatchObject({
      text: '推移 34歳以下の就業者数',
      source: 'native',
      page: 1,
    });
    expect(crossStackMatches[0].boxes.length).toBeGreaterThanOrEqual(3);
  });

  it('matches phrases across Type3-style wide word spacing rows', () => {
    const spans: TextSpan[] = [
      { text: 'ab', x: 50, y: 60, width: 20, height: 10, fontSize: 10 },
      { text: 'ba', x: 120, y: 60, width: 20, height: 10, fontSize: 10 },
      { text: 'abba', x: 190, y: 60, width: 40, height: 10, fontSize: 10 },
    ];
    const compiled = compileSearch('ab ba abba', {});
    if (!compiled) throw new Error('expected compiled search');

    const matches = searchPage(spans, undefined, 1, 300, 80, compiled);

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      text: 'ab ba abba',
      source: 'native',
      page: 1,
    });
    expect(matches[0].boxes).toHaveLength(3);
  });

  it('matches compact table header phrases across small column gaps', () => {
    const spans: TextSpan[] = [
      { text: 'Advance Estimate', x: 275.42, y: 290.72, width: 79.79, height: 10.98, fontSize: 10.98 },
      { text: 'Second Estimate', x: 369.94, y: 290.72, width: 74.08, height: 10.98, fontSize: 10.98 },
      { text: 'Third Estimate', x: 459.94, y: 290.72, width: 64.84, height: 10.98, fontSize: 10.98 },
    ];
    const compiled = compileSearch('Advance Estimate Second Estimate Third Estimate', {});
    if (!compiled) throw new Error('expected compiled search');

    const matches = searchPage(spans, undefined, 1, 612, 792, compiled);

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      text: 'Advance Estimate Second Estimate Third Estimate',
      source: 'native',
      page: 1,
    });
    expect(matches[0].boxes).toHaveLength(3);
    expect(matches[0].bbox).toEqual({ x: 275.42, y: 290.72, width: 249.36, height: 10.98 });
  });

  it('matches compact table header phrases across wider short-label column gaps', () => {
    const spans: TextSpan[] = [
      { text: 'Layer Type', x: 124.55, y: 114.23, width: 45.4, height: 9.96, fontSize: 9.96 },
      { text: 'Complexity per Layer', x: 239.7, y: 114.23, width: 87.84, height: 9.96, fontSize: 9.96 },
      { text: 'Sequential', x: 340.33, y: 114.23, width: 42.06, height: 9.96, fontSize: 9.96 },
      { text: 'Maximum Path Length', x: 395.17, y: 114.23, width: 92.28, height: 9.96, fontSize: 9.96 },
    ];
    const compiled = compileSearch('Layer Type Complexity per Layer Sequential', {});
    if (!compiled) throw new Error('expected compiled search');

    const matches = searchPage(spans, undefined, 1, 612, 792, compiled);

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      text: 'Layer Type Complexity per Layer Sequential',
      source: 'native',
      page: 1,
    });
    expect(matches[0].boxes).toHaveLength(3);
    expect(matches[0].bbox).toEqual({ x: 124.55, y: 114.23, width: 257.84, height: 9.96 });
  });

  it('matches short stacked table header labels across adjacent lines', () => {
    const spans: TextSpan[] = [
      { text: 'Total', x: 371.3, y: 96.48, width: 18.2, height: 8, fontSize: 8 },
      { text: 'Boston', x: 421.28, y: 96.48, width: 25.34, height: 8, fontSize: 8 },
      { text: 'Chicago', x: 512.2, y: 96.48, width: 30.24, height: 8, fontSize: 8 },
      { text: 'Minneapolis', x: 560.1, y: 96.48, width: 44.8, height: 8, fontSize: 8 },
      { text: 'Kansas', x: 622.16, y: 91.43, width: 26.68, height: 8, fontSize: 8 },
      { text: 'Dallas', x: 674.19, y: 96.48, width: 21.8, height: 8, fontSize: 8 },
      { text: 'San', x: 733.2, y: 91.43, width: 13.34, height: 8, fontSize: 8 },
      { text: 'City', x: 628.61, y: 102.08, width: 13.78, height: 8, fontSize: 8 },
      { text: 'Francisco', x: 724.1, y: 102.08, width: 35.12, height: 8, fontSize: 8 },
    ];
    const compiled = compileSearch('Kansas City', {});
    if (!compiled) throw new Error('expected compiled search');

    const matches = searchPage(spans, undefined, 1, 792, 612, compiled);

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      text: 'Kansas City',
      source: 'native',
      page: 1,
    });
    expect(matches[0].boxes).toHaveLength(2);
  });

  it('does not duplicate single-token matches from stacked table header labels', () => {
    const spans: TextSpan[] = [
      { text: 'Kansas', x: 622.16, y: 91.43, width: 26.68, height: 8, fontSize: 8 },
      { text: 'City', x: 628.61, y: 102.08, width: 13.78, height: 8, fontSize: 8 },
    ];
    const compiled = compileSearch('Kansas', {});
    if (!compiled) throw new Error('expected compiled search');

    const matches = searchPage(spans, undefined, 1, 792, 612, compiled);

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      text: 'Kansas',
      source: 'native',
      page: 1,
    });
  });

  it('does not duplicate multi-word labels that only hit one side of a stacked line', () => {
    const spans: TextSpan[] = [
      { text: 'Investment banking fees', x: 34.5, y: 83.21, width: 78.91, height: 8, fontSize: 8 },
      { text: 'Principal transactions', x: 34.5, y: 94.02, width: 76.2, height: 8, fontSize: 8 },
    ];
    const compiled = compileSearch('Investment banking fees', {});
    if (!compiled) throw new Error('expected compiled search');

    const matches = searchPage(spans, undefined, 1, 576, 790, compiled);

    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      text: 'Investment banking fees',
      source: 'native',
      page: 1,
    });
    expect(matches[0].boxes).toHaveLength(1);
  });

  it('does not match phrases across narrow recurring column gutters', () => {
    const spans: TextSpan[] = [
      {
        text: 'recommendation for Kreate following the Q4 report. In 2024,',
        x: 27,
        y: 74.47,
        width: 293.09,
        height: 11.04,
        fontSize: 11.04,
      },
      {
        text: 'earnings forecasts were moderate. The outlook for infrastructure',
        x: 334.85,
        y: 74.47,
        width: 285.67,
        height: 11.04,
        fontSize: 11.04,
      },
    ];

    const crossColumn = compileSearch('2024, earnings', {});
    const leftColumn = compileSearch('Q4 report. In 2024', {});
    const rightColumn = compileSearch('earnings forecasts', {});
    if (!crossColumn || !leftColumn || !rightColumn) throw new Error('expected compiled search');

    expect(searchPage(spans, undefined, 1, 960, 540, crossColumn)).toHaveLength(0);
    expect(searchPage(spans, undefined, 1, 960, 540, leftColumn)).toHaveLength(1);
    expect(searchPage(spans, undefined, 1, 960, 540, rightColumn)).toHaveLength(1);
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

  it('does NOT NFKC-normalize regex queries (compatibility chars stay literal)', async () => {
    // Regression guard: a regex query containing a fullwidth char like
    // `．` (FULLWIDTH FULL STOP, U+FF0E) would, if NFKC-normalised
    // before RegExp compilation, collapse to `.` and silently match
    // any character. Document text is still normalised (so the
    // fullwidth `．` in the PDF becomes `.`), but the regex engine
    // sees the raw `．` codepoint and won't match the normalised `.`.
    // The expected behaviour: regex mode is literal-codepoint;
    // mismatches are the user's responsibility once they opt into
    // regex semantics.
    // Use `pd．vision` so the buggy path would have collapsed to the
    // regex `pd.vision`, which DOES match `pdfvision` (pd + f + vision)
    // in the fixture body. The fixed path keeps the fullwidth `．`
    // verbatim, which doesn't appear in normalised page text, so no
    // match. Asymmetric query/document by design: regex mode is the
    // user's opt-in into literal-codepoint semantics.
    const fullwidthDot = '．';
    const result = await processDocument(SAMPLE_PDF, {
      search: `pd${fullwidthDot}vision`,
      searchRegex: true,
      noCache: true,
    });
    expect(result.pages[0].matches?.length ?? 0).toBe(0);
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

  it('matches CJK literal queries across display-spaced glyphs', () => {
    const compiled = compileSearch('科学', {});
    if (!compiled) throw new Error('expected compiled search');

    const matches = searchPage(
      [
        { text: '科', x: 265.44, y: 161.04, width: 15.96, height: 15.96, fontSize: 15.96 },
        { text: '学', x: 313.68, y: 161.04, width: 15.96, height: 15.96, fontSize: 15.96 },
      ],
      undefined,
      1,
      595,
      842,
      compiled,
    );

    expect(matches).toHaveLength(1);
    expect(matches[0].text).toBe('科 学');
    expect(matches[0].boxes).toEqual([
      { x: 265.44, y: 161.04, width: 15.96, height: 15.96 },
      { x: 313.68, y: 161.04, width: 15.96, height: 15.96 },
    ]);
    expect(matches[0].bbox).toEqual({ x: 265.44, y: 161.04, width: 64.2, height: 15.96 });
  });

  it('does not match CJK literals across dense glyph column gutters', () => {
    const compiled = compileSearch('海道', {});
    if (!compiled) throw new Error('expected compiled search');

    const matches = searchPage(
      [
        { text: '北', x: 50, y: 80, width: 10, height: 10, fontSize: 10 },
        { text: '海', x: 62, y: 80, width: 10, height: 10, fontSize: 10 },
        { text: '道', x: 110, y: 80, width: 10, height: 10, fontSize: 10 },
        { text: '東', x: 122, y: 80, width: 10, height: 10, fontSize: 10 },
      ],
      undefined,
      1,
      300,
      200,
      compiled,
    );

    expect(matches).toHaveLength(0);
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

  it('finds native phrase matches that cross pdf.js span boundaries', async () => {
    // Real PDFs often split adjacent words into separate glyph runs
    // because the font, style, or text matrix changes. Search should
    // still find the phrase and return a bbox union suitable for
    // renderRegion zoom.
    const { compileSearch, searchPage } = await import('../../src/core/search/index.js');
    const compiled = compileSearch('Hello World', {});
    if (!compiled) throw new Error('compileSearch returned undefined for a non-undefined query');
    const matches = searchPage(
      [
        { text: 'Hello', x: 10, y: 20, width: 30, height: 10, fontSize: 10 },
        { text: 'World', x: 46, y: 20, width: 35, height: 10, fontSize: 10 },
      ],
      undefined,
      1,
      612,
      792,
      compiled,
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].text).toBe('Hello World');
    expect(matches[0].boxes).toHaveLength(2);
    expect(matches[0].bbox).toEqual({ x: 10, y: 20, width: 71, height: 10 });
  });

  it('narrows native match boxes to the matched substring inside a span', async () => {
    // Search bboxes feed directly into --render-region. A substring
    // match should not return the whole pdf.js span when only two
    // characters inside that span matched.
    const { compileSearch, searchPage } = await import('../../src/core/search/index.js');
    const compiled = compileSearch('cd', {});
    if (!compiled) throw new Error('compileSearch returned undefined for a non-undefined query');
    const matches = searchPage(
      [{ text: 'abcdef', x: 10, y: 20, width: 60, height: 10, fontSize: 10 }],
      undefined,
      1,
      612,
      792,
      compiled,
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].boxes).toEqual([{ x: 30, y: 20, width: 20, height: 10 }]);
    expect(matches[0].bbox).toEqual({ x: 30, y: 20, width: 20, height: 10 });
  });

  it('does not under-size table-label matches in dot-leader spans', async () => {
    // BLS statistical tables can emit the row label and dot leaders as
    // one wide span. Uniformly slicing that span by character count
    // clips the label when the bbox is used as a render region.
    const { compileSearch, searchPage } = await import('../../src/core/search/index.js');
    const compiled = compileSearch('Total nonfarm', {});
    if (!compiled) throw new Error('compileSearch returned undefined for a non-undefined query');
    const matches = searchPage(
      [
        {
          text: 'Total nonfarm. . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . . .',
          x: 44.9,
          y: 111.65,
          width: 277.75,
          height: 6.99,
          fontSize: 6.99,
        },
      ],
      undefined,
      1,
      612,
      792,
      compiled,
    );

    expect(matches).toHaveLength(1);
    expect(matches[0].boxes[0].x).toBe(44.9);
    expect(matches[0].boxes[0].width).toBeGreaterThan(40);
    expect(matches[0].boxes[0].width).toBeLessThan(80);
  });

  it('narrows only the matching slice of a span-boundary phrase', async () => {
    // JICA report-shaped case: "JICA" is its own span and the CJK
    // suffix starts a longer span. Searching "JICA債" should include
    // only the first character of the second span, not the whole
    // "債への投資家..." run.
    const { compileSearch, searchPage } = await import('../../src/core/search/index.js');
    const compiled = compileSearch('JICA債', {});
    if (!compiled) throw new Error('compileSearch returned undefined for a non-undefined query');
    const matches = searchPage(
      [
        { text: 'JICA', x: 100, y: 20, width: 40, height: 10, fontSize: 10 },
        { text: '債への投資家', x: 142, y: 20, width: 60, height: 10, fontSize: 10 },
      ],
      undefined,
      1,
      612,
      792,
      compiled,
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].boxes).toEqual([
      { x: 100, y: 20, width: 40, height: 10 },
      { x: 142, y: 20, width: 10, height: 10 },
    ]);
    expect(matches[0].bbox).toEqual({ x: 100, y: 20, width: 52, height: 10 });
  });

  it('slices vertical CJK span matches along the y axis', async () => {
    const { compileSearch, searchPage } = await import('../../src/core/search/index.js');
    const compiled = compileSearch('縦中横', {});
    if (!compiled) throw new Error('compileSearch returned undefined for a non-undefined query');
    const matches = searchPage(
      [{ text: '縦中横は便利です', x: 180, y: 45, width: 9, height: 90, fontSize: 9 }],
      undefined,
      1,
      612,
      792,
      compiled,
    );

    expect(matches).toHaveLength(1);
    expect(matches[0].boxes).toEqual([{ x: 180, y: 45, width: 9, height: 33.75 }]);
    expect(matches[0].bbox).toEqual({ x: 180, y: 45, width: 9, height: 33.75 });
  });

  it('slices rotated Latin span matches along the y axis', async () => {
    const { compileSearch, searchPage } = await import('../../src/core/search/index.js');
    const compiled = compileSearch('cd', {});
    if (!compiled) throw new Error('compileSearch returned undefined for a non-undefined query');
    const matches = searchPage(
      [{ text: 'abcdef', x: 90, y: 20, width: 12, height: 60, fontSize: 12 }],
      undefined,
      1,
      612,
      792,
      compiled,
    );

    expect(matches).toHaveLength(1);
    expect(matches[0].boxes).toEqual([{ x: 90, y: 40, width: 12, height: 20 }]);
    expect(matches[0].bbox).toEqual({ x: 90, y: 40, width: 12, height: 20 });
  });

  it('does not double-insert a synthetic space when adjacent spans already carry whitespace', async () => {
    const { compileSearch, searchPage } = await import('../../src/core/search/index.js');
    const compiled = compileSearch('Hello World', {});
    if (!compiled) throw new Error('compileSearch returned undefined for a non-undefined query');
    const matches = searchPage(
      [
        { text: 'Hello ', x: 10, y: 20, width: 34, height: 10, fontSize: 10 },
        { text: 'World', x: 50, y: 20, width: 35, height: 10, fontSize: 10 },
      ],
      undefined,
      1,
      612,
      792,
      compiled,
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].text).toBe('Hello World');
  });

  it('uses the CJK-aware gap threshold when matching across glyph spans', async () => {
    const { compileSearch, searchPage } = await import('../../src/core/search/index.js');
    const compiled = compileSearch('背景・目的', {});
    if (!compiled) throw new Error('compileSearch returned undefined for a non-undefined query');
    const spans = Array.from('背景・目的').map((text, i) => ({
      text,
      x: 10 + i * 12.7,
      y: 20,
      width: 10,
      height: 10,
      fontSize: 10,
    }));
    const matches = searchPage(spans, undefined, 1, 612, 792, compiled);
    expect(matches).toHaveLength(1);
    expect(matches[0].text).toBe('背景・目的');
  });

  it('does not match phrases across large same-baseline column gaps', async () => {
    const { compileSearch, searchPage } = await import('../../src/core/search/index.js');
    const compiled = compileSearch('left right', {});
    if (!compiled) throw new Error('compileSearch returned undefined for a non-undefined query');
    const matches = searchPage(
      [
        { text: 'left', x: 10, y: 20, width: 22, height: 10, fontSize: 10 },
        { text: 'right', x: 240, y: 20, width: 28, height: 10, fontSize: 10 },
      ],
      undefined,
      1,
      612,
      792,
      compiled,
    );
    expect(matches).toEqual([]);
  });

  it('does not stitch nearby magazine columns into one search line', async () => {
    // JICA report page 50-shaped case: two body columns can sit on the
    // same baseline with only ~23pt of gutter. A human reads these as
    // separate columns, so search context and phrase matching should
    // not join the left line to the right line.
    const { compileSearch, searchPage } = await import('../../src/core/search/index.js');
    const compiled = compileSearch('domestic investors', {});
    if (!compiled) throw new Error('compileSearch returned undefined for a non-undefined query');
    const matches = searchPage(
      [
        { text: 'domestic', x: 66, y: 204, width: 220, height: 10, fontSize: 10 },
        { text: 'investors', x: 309, y: 204, width: 80, height: 10, fontSize: 10 },
      ],
      undefined,
      1,
      612,
      792,
      compiled,
    );
    expect(matches).toEqual([]);
  });

  it('does not stitch ACL-style two-column body lines across narrow gutters', async () => {
    // BERT / ACL paper-shaped case: same-baseline left and right body
    // columns can have only ~17pt of gutter. Search context should not
    // join the left column tail to the right column hit.
    const { compileSearch, searchPage } = await import('../../src/core/search/index.js');
    const compiled = compileSearch('inference approaches', {});
    if (!compiled) throw new Error('compileSearch returned undefined for a non-undefined query');
    const matches = searchPage(
      [
        { text: 'natural language inference', x: 72, y: 643, width: 218, height: 10.91, fontSize: 10.91 },
        { text: 'approaches', x: 307, y: 643, width: 49, height: 10.91, fontSize: 10.91 },
      ],
      undefined,
      1,
      612,
      792,
      compiled,
    );
    expect(matches).toEqual([]);
  });

  it('suppresses OCR search duplicates already covered by precise native matches', async () => {
    // Scan-with-hidden-text-layer case: --ocr can find the same word as
    // the native text layer. Emitting both makes find-then-zoom
    // ambiguous, so the precise native match wins.
    const { compileSearch, searchPage } = await import('../../src/core/search/index.js');
    const compiled = compileSearch('Switzerland', {});
    if (!compiled) throw new Error('compileSearch returned undefined for a non-undefined query');
    const matches = searchPage(
      [{ text: 'Switzerland', x: 120, y: 220, width: 70, height: 12, fontSize: 12 }],
      { text: 'Switzerland', confidence: 0.94, lang: 'eng' },
      1,
      612,
      792,
      compiled,
    );
    expect(matches).toHaveLength(1);
    expect(matches[0].source).toBe('native');
    expect(matches[0].bbox).toEqual({ x: 120, y: 220, width: 70, height: 12 });
  });

  it('keeps OCR-only extra search hits after native duplicate suppression', async () => {
    // Suppression is counted, not all-or-nothing. If OCR sees another
    // occurrence that the native layer did not expose, keep it for
    // recall. Older OCR cache entries without word boxes still fall
    // back to a page-level bbox.
    const { compileSearch, searchPage } = await import('../../src/core/search/index.js');
    const compiled = compileSearch('Switzerland', {});
    if (!compiled) throw new Error('compileSearch returned undefined for a non-undefined query');
    const matches = searchPage(
      [{ text: 'Switzerland', x: 120, y: 220, width: 70, height: 12, fontSize: 12 }],
      { text: 'Switzerland near Geneva. Switzerland near Zurich.', confidence: 0.92, lang: 'eng' },
      1,
      612,
      792,
      compiled,
    );
    expect(matches).toHaveLength(2);
    expect(matches.map((m) => m.source)).toEqual(['native', 'ocr']);
    expect(matches[1].bbox).toEqual({ x: 0, y: 0, width: 612, height: 792 });
  });

  it('uses OCR word boxes for OCR-only search hits when available', async () => {
    const { compileSearch, searchPage } = await import('../../src/core/search/index.js');
    const compiled = compileSearch('near Geneva', {});
    if (!compiled) throw new Error('compileSearch returned undefined for a non-undefined query');
    const matches = searchPage(
      undefined,
      {
        text: 'Switzerland near Geneva.',
        confidence: 0.92,
        lang: 'eng',
        words: [
          { text: 'Switzerland', confidence: 0.9, x: 10, y: 20, width: 60, height: 12 },
          { text: 'near', confidence: 0.9, x: 80, y: 20, width: 24, height: 12 },
          { text: 'Geneva.', confidence: 0.9, x: 112, y: 20, width: 42, height: 12 },
        ],
      },
      1,
      612,
      792,
      compiled,
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      page: 1,
      query: 'near Geneva',
      bbox: { x: 80, y: 20, width: 68, height: 12 },
      boxes: [
        { x: 80, y: 20, width: 24, height: 12 },
        { x: 112, y: 20, width: 36, height: 12 },
      ],
      text: 'near Geneva',
      source: 'ocr',
    });
  });

  it('matches dehyphenated OCR words across adjacent line breaks', async () => {
    const { compileSearch, searchPage } = await import('../../src/core/search/index.js');
    const compiled = compileSearch('WONDERFUL', {});
    if (!compiled) throw new Error('compileSearch returned undefined for a non-undefined query');
    const matches = searchPage(
      undefined,
      {
        text: 'Ihe WONDER-\nFUL WIZARD',
        confidence: 0.9,
        lang: 'eng',
        words: [
          { text: 'Ihe', confidence: 0.69, x: 0, y: 24, width: 136, height: 84.5 },
          { text: 'WONDER-', confidence: 0.91, x: 169.5, y: 31.5, width: 287.5, height: 62 },
          { text: 'FUL', confidence: 0.88, x: 0, y: 100, width: 150.5, height: 72.5 },
          { text: 'WIZARD', confidence: 0.93, x: 196, y: 99, width: 266, height: 75 },
        ],
      },
      1,
      465,
      618,
      compiled,
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      page: 1,
      query: 'WONDERFUL',
      bbox: { x: 0, y: 31.5, width: 415.93, height: 141 },
      boxes: [
        { x: 169.5, y: 31.5, width: 246.43, height: 62 },
        { x: 0, y: 100, width: 150.5, height: 72.5 },
      ],
      text: 'WONDERFUL',
      source: 'ocr',
    });
  });

  it('does not insert OCR search spaces between CJK word boxes', async () => {
    const { compileSearch, searchPage } = await import('../../src/core/search/index.js');
    const compiled = compileSearch('東京大学', {});
    if (!compiled) throw new Error('compileSearch returned undefined for a non-undefined query');
    const matches = searchPage(
      undefined,
      {
        text: '東京大学',
        confidence: 0.92,
        lang: 'jpn',
        words: [
          { text: '東京', confidence: 0.9, x: 10, y: 20, width: 30, height: 12 },
          { text: '大学', confidence: 0.9, x: 42, y: 20, width: 30, height: 12 },
        ],
      },
      1,
      612,
      792,
      compiled,
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      page: 1,
      query: '東京大学',
      bbox: { x: 10, y: 20, width: 62, height: 12 },
      boxes: [
        { x: 10, y: 20, width: 30, height: 12 },
        { x: 42, y: 20, width: 30, height: 12 },
      ],
      text: '東京大学',
      source: 'ocr',
    });
  });

  it('falls back to OCR text when word-level reconstruction misses the query', async () => {
    const { compileSearch, searchPage } = await import('../../src/core/search/index.js');
    const compiled = compileSearch('HelloWorld', {});
    if (!compiled) throw new Error('compileSearch returned undefined for a non-undefined query');
    const matches = searchPage(
      undefined,
      {
        text: 'HelloWorld',
        confidence: 0.92,
        lang: 'eng',
        words: [
          { text: 'Hello', confidence: 0.9, x: 10, y: 20, width: 30, height: 12 },
          { text: 'World', confidence: 0.9, x: 45, y: 20, width: 35, height: 12 },
        ],
      },
      1,
      612,
      792,
      compiled,
    );
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      page: 1,
      query: 'HelloWorld',
      bbox: { x: 0, y: 0, width: 612, height: 792 },
      boxes: [],
      text: 'HelloWorld',
      source: 'ocr',
      context: 'HelloWorld',
    });
  });

  it('keeps raw OCR fallback hits when word-level reconstruction only covers some occurrences', async () => {
    const { compileSearch, searchPage } = await import('../../src/core/search/index.js');
    const compiled = compileSearch('東京大学', {});
    if (!compiled) throw new Error('compileSearch returned undefined for a non-undefined query');
    const matches = searchPage(
      undefined,
      {
        text: '東京大学\n東京大学',
        confidence: 0.92,
        lang: 'jpn',
        words: [
          { text: '東京', confidence: 0.9, x: 10, y: 20, width: 30, height: 12 },
          { text: '大学', confidence: 0.9, x: 42, y: 20, width: 30, height: 12 },
          { text: '東京', confidence: 0.9, x: 10, y: 48, width: 30, height: 12 },
          { text: '大学', confidence: 0.9, x: 10, y: 66, width: 30, height: 12 },
        ],
      },
      1,
      612,
      792,
      compiled,
    );
    expect(matches).toHaveLength(2);
    expect(matches[0]).toMatchObject({
      page: 1,
      query: '東京大学',
      bbox: { x: 10, y: 20, width: 62, height: 12 },
      boxes: [
        { x: 10, y: 20, width: 30, height: 12 },
        { x: 42, y: 20, width: 30, height: 12 },
      ],
      text: '東京大学',
      source: 'ocr',
    });
    expect(matches[1]).toMatchObject({
      page: 1,
      query: '東京大学',
      bbox: { x: 0, y: 0, width: 612, height: 792 },
      boxes: [],
      text: '東京大学',
      source: 'ocr',
      context: '東京大学 東京大学',
    });
  });

  it('suppresses OCR duplicates when native and OCR search passes run separately', async () => {
    // processDocument searches native spans before OCR exists, then
    // searches OCR text later. Keep the separate-pass path equivalent
    // to a single searchPage(spans, ocr, ...) call.
    const { compileSearch, searchPage, suppressDuplicateOcrMatches } = await import('../../src/core/search/index.js');
    const compiled = compileSearch('Switzerland', {});
    if (!compiled) throw new Error('compileSearch returned undefined for a non-undefined query');
    const nativeMatches = searchPage(
      [{ text: 'Switzerland', x: 120, y: 220, width: 70, height: 12, fontSize: 12 }],
      undefined,
      1,
      612,
      792,
      compiled,
    );
    const ocrMatches = searchPage(
      undefined,
      { text: 'Switzerland', confidence: 0.94, lang: 'eng' },
      1,
      612,
      792,
      compiled,
    );
    const merged = nativeMatches.concat(suppressDuplicateOcrMatches(nativeMatches, ocrMatches, compiled));
    expect(merged).toHaveLength(1);
    expect(merged[0].source).toBe('native');
  });

  it('caps matches per page per query at MAX_MATCHES_PER_QUERY_PER_PAGE and surfaces a warning', async () => {
    // Defence-in-depth against a degenerate regex (or a bad literal
    // query that happens to match every span). Test directly against
    // searchPage with a synthesised span so we don't need a fixture
    // big enough to hit the cap — easier to assert exact cap value
    // (10000) than to ship a > 10k-char PDF.
    const { compileSearch, searchPage } = await import('../../src/core/search/index.js');
    const compiled = compileSearch('.', { regex: true });
    if (!compiled) throw new Error('compileSearch returned undefined for a non-undefined query');
    // 20k characters: easily exceeds the 10k cap and gives plenty of
    // headroom so the cap message is unambiguous.
    const longText = 'x'.repeat(20000);
    const span = { text: longText, x: 0, y: 0, width: 100, height: 12, fontSize: 12 };
    const warnings: string[] = [];
    const matches = searchPage([span], undefined, 1, 612, 792, compiled, (m) => warnings.push(m));
    expect(matches.length).toBe(10000);
    expect(warnings.some((m) => m.includes('per-page native match cap'))).toBe(true);
  });

  it('keeps cache entries with different search queries separate', async () => {
    // Same PDF, two different queries — distinct cache slots so a
    // second query doesn't return the first's matches. Isolate
    // PDFVISION_CACHE_DIR so this never races SAMPLE_PDF's shared
    // cache directory contended by the chmod / corruption tests
    // running in parallel under vitest.
    const { mkdtempSync, rmSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const cacheRoot = mkdtempSync(join(tmpdir(), 'pdfvision-search-cache-isolation-'));
    const originalCache = process.env.PDFVISION_CACHE_DIR;
    process.env.PDFVISION_CACHE_DIR = cacheRoot;
    try {
      const a = await processDocument(SAMPLE_PDF, { search: 'Hello', noCache: false });
      const b = await processDocument(SAMPLE_PDF, { search: 'pdfvision', noCache: false });
      const aTexts = (a.pages[0].matches ?? []).map((m) => m.text.toLowerCase()).join('\n');
      const bTexts = (b.pages[0].matches ?? []).map((m) => m.text.toLowerCase()).join('\n');
      expect(aTexts).not.toBe(bTexts);
    } finally {
      if (originalCache === undefined) delete process.env.PDFVISION_CACHE_DIR;
      else process.env.PDFVISION_CACHE_DIR = originalCache;
      rmSync(cacheRoot, { recursive: true, force: true });
    }
  });
});
