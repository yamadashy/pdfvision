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

  it('merges stacked above-label lines for narrow form fields', () => {
    const fields = buildFormFields(
      [{ subtype: 'Widget', fieldName: 'ein', fieldType: 'Tx', rect: [100, 88, 180, 100] }],
      200,
      0,
      0,
      [
        { text: 'Employer identification', x: 102, y: 72, width: 82, height: 8, fontSize: 8 },
        { text: 'number (EIN)', x: 102, y: 81, width: 47, height: 8, fontSize: 8 },
        { text: 'Unrelated adjacent label', x: 190, y: 72, width: 86, height: 8, fontSize: 8 },
      ],
    );

    expect(fields[0].label).toEqual({
      text: 'Employer identification number (EIN)',
      relation: 'above',
      x: 102,
      y: 72,
      width: 82,
      height: 17,
    });
  });

  it('prefers fine-grained label spans over merged adjacent label lines', () => {
    const fields = buildFormFields(
      [
        { subtype: 'Widget', fieldName: 'middle', fieldType: 'Tx', rect: [100, 88, 150, 100] },
        { subtype: 'Widget', fieldName: 'other', fieldType: 'Tx', rect: [160, 88, 260, 100] },
      ],
      200,
      0,
      0,
      [
        { text: 'Middle Initial Other Last Names Used', x: 100, y: 90, width: 160, height: 7, fontSize: 7 },
        { text: 'Middle Initial', x: 100, y: 90, width: 48, height: 7, fontSize: 7 },
        { text: 'Other Last Names Used', x: 160, y: 90, width: 82, height: 7, fontSize: 7 },
      ],
    );

    expect(fields[0].label?.text).toBe('Middle Initial');
    expect(fields[1].label?.text).toBe('Other Last Names Used');
  });

  it('prefers left-side instruction labels for narrow inline text fields', () => {
    const fields = buildFormFields(
      [
        {
          subtype: 'Widget',
          fieldName: 'llcClassification',
          fieldType: 'Tx',
          rect: [417.6, 589, 446.4, 600],
          fieldValue: '',
        },
        {
          subtype: 'Widget',
          fieldName: 'exemptPayeeCode',
          fieldType: 'Tx',
          rect: [543.6, 588, 576, 600],
          fieldValue: '',
        },
      ],
      792,
      0,
      0,
      [
        { text: 'Trust/estate', x: 402.4, y: 180, width: 37.46, height: 7, fontSize: 7 },
        {
          text: 'LLC. Enter the tax classification (C = C corporation, S = S corporation, P = Partnership)',
          x: 86.4,
          y: 193.5,
          width: 272.14,
          height: 7,
          fontSize: 7,
        },
        { text: 'Exempt payee code (if any)', x: 457.6, y: 192.5, width: 82.25, height: 7, fontSize: 7 },
      ],
    );

    expect(fields.find((field) => field.name === 'llcClassification')?.label).toMatchObject({
      text: 'LLC. Enter the tax classification (C = C corporation, S = S corporation, P = Partnership)',
      relation: 'left',
    });
    expect(fields.find((field) => field.name === 'exemptPayeeCode')?.label).toMatchObject({
      text: 'Exempt payee code (if any)',
      relation: 'left',
    });
  });
});
