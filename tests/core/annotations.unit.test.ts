import { describe, expect, it } from 'vitest';
import { buildAnnotations, hasVisibleAnnotationAppearance } from '../../src/core/annotations.js';

describe('buildAnnotations', () => {
  it('extracts non-link annotations with comments, colors, and quad boxes', () => {
    const annotations = buildAnnotations(
      [
        {
          subtype: 'Highlight',
          name: 'Ｈｉｇｈｌｉｇｈｔ',
          contentsObj: { str: 'Ｈｉｇｈｌｉｇｈｔ' },
          titleObj: { str: 'Markup' },
          color: { 0: 255, 1: 255, 2: 11 },
          rect: [100, 700, 180, 712],
          quadPoints: { 0: 100, 1: 712, 2: 180, 3: 712, 4: 100, 5: 700, 6: 180, 7: 700 },
          modificationDate: "D:20140401161700+02'00'",
          hasAppearance: false,
          annotationFlags: 36,
        },
        { subtype: 'Link', rect: [0, 0, 10, 10], contentsObj: { str: 'ignored' } },
        { subtype: 'Widget', rect: [0, 0, 10, 10], contentsObj: { str: 'ignored' } },
        { subtype: 'Popup', rect: [0, 0, 10, 10], contentsObj: { str: 'ignored' } },
      ],
      792,
      0,
      0,
      { normalizeText: (value) => value.normalize('NFKC') },
    );

    expect(annotations).toEqual([
      {
        subtype: 'Highlight',
        name: 'Highlight',
        contents: 'Highlight',
        title: 'Markup',
        color: [255, 255, 11],
        modified: "D:20140401161700+02'00'",
        hasAppearance: false,
        flags: ['print', 'noView'],
        x: 100,
        y: 80,
        width: 80,
        height: 12,
        quadBoxes: [{ x: 100, y: 80, width: 80, height: 12 }],
      },
    ]);
  });

  it('returns an empty array when annotation extraction finds no non-link annotations', () => {
    const annotations = buildAnnotations([{ subtype: 'Link', rect: [0, 0, 10, 10] }], 100);
    expect(annotations).toEqual([]);
  });

  it('surfaces file attachment annotation metadata without embedding bytes', () => {
    const annotations = buildAnnotations(
      [
        {
          subtype: 'FileAttachment',
          name: 'PushPin',
          contentsObj: { str: 'Ｆｉｌｅ attachment' },
          rect: [70, 724, 90, 748],
          file: {
            filename: 'Ｔｅｓｔ.txt',
            description: 'Ｓｕｐｐｌｅｍｅｎｔ',
            content: new Uint8Array([84, 101, 115, 116]),
          },
        },
      ],
      792,
      0,
      0,
      { normalizeText: (value) => value.normalize('NFKC') },
    );

    expect(annotations).toEqual([
      {
        subtype: 'FileAttachment',
        name: 'PushPin',
        contents: 'File attachment',
        fileAttachment: {
          name: 'Test.txt',
          description: 'Supplement',
          size: 4,
        },
        x: 70,
        y: 44,
        width: 20,
        height: 24,
      },
    ]);
    expect(JSON.stringify(annotations)).not.toContain('Test attachment');
  });

  it('surfaces shape annotation geometry in top-left coordinates', () => {
    const annotations = buildAnnotations(
      [
        {
          subtype: 'Line',
          rect: [70, 683, 251, 735],
          lineCoordinates: [75, 688, 246, 730],
          lineEndings: ['None', 'OpenArrow'],
          borderStyle: { width: 4, style: 2, dashArray: { 0: 3, 1: 2 } },
        },
        {
          subtype: 'Polygon',
          rect: [60, 640, 200, 752],
          vertices: { 0: 72, 1: 713, 2: 103, 3: 747, 4: 158, 5: 646 },
        },
        {
          subtype: 'Ink',
          rect: [67, 645, 165, 687],
          inkLists: [
            { 0: 79, 1: 683, 2: 80, 3: 675 },
            { 0: 74, 1: 651, 2: 96, 3: 652 },
          ],
        },
      ],
      792,
    );

    expect(annotations).toEqual([
      expect.objectContaining({
        subtype: 'Polygon',
        vertices: [
          { x: 72, y: 79 },
          { x: 103, y: 45 },
          { x: 158, y: 146 },
        ],
      }),
      expect.objectContaining({
        subtype: 'Line',
        border: { width: 4, style: 'dashed', dashArray: [3, 2] },
        line: {
          from: { x: 75, y: 104 },
          to: { x: 246, y: 62 },
          endings: ['None', 'OpenArrow'],
        },
      }),
      expect.objectContaining({
        subtype: 'Ink',
        inkPaths: [
          [
            { x: 79, y: 109 },
            { x: 80, y: 117 },
          ],
          [
            { x: 74, y: 141 },
            { x: 96, y: 140 },
          ],
        ],
      }),
    ]);
  });

  it('decodes hidden and print annotation flags', () => {
    const annotations = buildAnnotations(
      [
        {
          subtype: 'Ink',
          titleObj: { str: 'Reviewer' },
          rect: [174, 632, 286, 729],
          annotationFlags: 6,
        },
      ],
      792,
    );

    expect(annotations).toEqual([
      {
        subtype: 'Ink',
        title: 'Reviewer',
        flags: ['hidden', 'print'],
        x: 174,
        y: 63,
        width: 112,
        height: 97,
      },
    ]);
  });

  it('detects visible annotation appearances for page-quality hints', () => {
    expect(
      hasVisibleAnnotationAppearance([
        { subtype: 'FreeText', rect: [10, 10, 20, 20], hasAppearance: true, annotationFlags: 4 },
      ]),
    ).toBe(true);

    expect(
      hasVisibleAnnotationAppearance([
        { subtype: 'FreeText', rect: [10, 10, 20, 20], hasAppearance: true, annotationFlags: 2 },
        { subtype: 'Link', rect: [10, 10, 20, 20], hasAppearance: true, annotationFlags: 4 },
        { subtype: 'Text', rect: [10, 10, 20, 20], hasAppearance: false, annotationFlags: 4 },
      ]),
    ).toBe(false);
  });
});
