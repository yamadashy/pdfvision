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
});
