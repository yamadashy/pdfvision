import { describe, expect, it } from 'vitest';
import { buildAnnotations } from '../../src/core/annotations.js';

describe('buildAnnotations', () => {
  it('extracts non-link annotations with comments, colors, and quad boxes', () => {
    const annotations = buildAnnotations(
      [
        {
          subtype: 'Highlight',
          contentsObj: { str: 'Ｈｉｇｈｌｉｇｈｔ' },
          titleObj: { str: 'Markup' },
          color: { 0: 255, 1: 255, 2: 11 },
          rect: [100, 700, 180, 712],
          quadPoints: { 0: 100, 1: 712, 2: 180, 3: 712, 4: 100, 5: 700, 6: 180, 7: 700 },
          modificationDate: "D:20140401161700+02'00'",
          hasAppearance: false,
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
        contents: 'Highlight',
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
    ]);
  });

  it('returns an empty array when annotation extraction finds no non-link annotations', () => {
    const annotations = buildAnnotations([{ subtype: 'Link', rect: [0, 0, 10, 10] }], 100);
    expect(annotations).toEqual([]);
  });
});
