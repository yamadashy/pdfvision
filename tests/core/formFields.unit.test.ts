import { describe, expect, it } from 'vitest';
import { buildFormFields } from '../../src/core/formFields.js';

describe('buildFormFields', () => {
  it('extracts widget fields with top-left coordinates and checkbox state', () => {
    const fields = buildFormFields(
      [
        {
          subtype: 'Widget',
          fieldName: 'topmostSubform[0].Page1[0].f1_01[0]',
          fieldType: 'Tx',
          rect: [228.8, 732.502, 316.8, 743.501],
          fieldValue: 'Alice',
          readOnly: false,
        },
        {
          subtype: 'Widget',
          fieldName: 'topmostSubform[0].Page1[0].c1_1[0]',
          fieldType: 'Btn',
          checkBox: true,
          radioButton: false,
          rect: [36, 722, 44, 730],
          fieldValue: 'Off',
        },
        {
          subtype: 'Link',
          fieldName: 'ignored',
          fieldType: 'Tx',
          rect: [0, 0, 10, 10],
        },
      ],
      792,
    );

    expect(fields).toEqual([
      {
        name: 'topmostSubform[0].Page1[0].f1_01[0]',
        type: 'text',
        x: 228.8,
        y: 48.5,
        width: 88,
        height: 11,
        value: 'Alice',
        readOnly: false,
      },
      {
        name: 'topmostSubform[0].Page1[0].c1_1[0]',
        type: 'checkbox',
        x: 36,
        y: 62,
        width: 8,
        height: 8,
        value: 'Off',
        checked: false,
      },
    ]);
  });

  it('sorts fields in visual reading order', () => {
    const fields = buildFormFields(
      [
        { subtype: 'Widget', fieldName: 'b', fieldType: 'Tx', rect: [100, 650, 120, 660] },
        { subtype: 'Widget', fieldName: 'a', fieldType: 'Tx', rect: [50, 650, 70, 660] },
        { subtype: 'Widget', fieldName: 'top', fieldType: 'Tx', rect: [50, 700, 70, 710] },
      ],
      792,
    );

    expect(fields.map((field) => field.name)).toEqual(['top', 'a', 'b']);
  });

  it('attaches nearby visible labels from layout lines', () => {
    const fields = buildFormFields(
      [
        { subtype: 'Widget', fieldName: 'name', fieldType: 'Tx', rect: [50, 670, 250, 682] },
        {
          subtype: 'Widget',
          fieldName: 'agree',
          fieldType: 'Btn',
          checkBox: true,
          radioButton: false,
          rect: [50, 650, 58, 658],
          fieldValue: 'Off',
        },
      ],
      792,
      0,
      0,
      [
        { text: 'Full legal name', x: 50, y: 94, width: 115, height: 10, fontSize: 10 },
        { text: 'I agree to the certification', x: 65, y: 134, width: 160, height: 8, fontSize: 8 },
      ],
    );

    expect(fields[0].label).toEqual({
      text: 'Full legal name',
      relation: 'above',
      x: 50,
      y: 94,
      width: 115,
      height: 10,
    });
    expect(fields[1].label).toEqual({
      text: 'I agree to the certification',
      relation: 'right',
      x: 65,
      y: 134,
      width: 160,
      height: 8,
    });
  });

  it('prefers a close above label over a side section heading', () => {
    const fields = buildFormFields(
      [{ subtype: 'Widget', fieldName: 'address', fieldType: 'Tx', rect: [94.6, 660, 474.45, 674] }],
      792,
      0,
      0,
      [
        { text: 'Information', x: 36, y: 124.14, width: 53.5, height: 10, fontSize: 10 },
        { text: 'Address', x: 97.6, y: 108, width: 25.93, height: 7, fontSize: 7 },
      ],
    );

    expect(fields[0].label).toEqual({
      text: 'Address',
      relation: 'above',
      x: 97.6,
      y: 108,
      width: 25.93,
      height: 7,
    });
  });
});
