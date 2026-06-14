import { describe, expect, it } from 'vitest';
import { buildFormFields } from '../../src/core/formFields.js';

function rectFromTopLeft(
  x: number,
  y: number,
  width: number,
  height: number,
  pageHeight = 792,
): [number, number, number, number] {
  return [x, pageHeight - y - height, x + width, pageHeight - y];
}

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
          exportValue: 'Yes',
          annotationFlags: 6,
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
        exportValue: 'Yes',
        flags: ['hidden', 'print'],
      },
    ]);
  });

  it('extracts radio button export values from buttonValue', () => {
    const fields = buildFormFields(
      [
        {
          subtype: 'Widget',
          fieldName: 'Group6',
          fieldType: 'Btn',
          checkBox: false,
          radioButton: true,
          rect: [94.78, 670.38, 112.78, 688.38],
          fieldValue: null,
          buttonValue: 'Choice1',
        },
      ],
      792,
    );

    expect(fields[0]).toMatchObject({
      name: 'Group6',
      type: 'radio',
      checked: false,
      exportValue: 'Choice1',
    });
  });

  it('extracts non-JavaScript reset form actions from button widgets', () => {
    const fields = buildFormFields(
      [
        {
          subtype: 'Widget',
          fieldName: 'ResetSelected',
          fieldType: 'Btn',
          checkBox: false,
          radioButton: false,
          rect: [10, 10, 50, 30],
          resetForm: { fields: ['Text1', 'Group11'], refs: [{ num: 1, gen: 0 }], include: true },
        },
        {
          subtype: 'Widget',
          fieldName: 'ResetAll',
          fieldType: 'Btn',
          checkBox: false,
          radioButton: false,
          rect: [60, 10, 100, 30],
          resetForm: { fields: [], refs: [], include: false },
        },
      ],
      100,
    );

    expect(fields.map((field) => field.resetForm)).toEqual([
      { fields: ['Text1', 'Group11'], include: true },
      { fields: [], include: false },
    ]);
  });

  it('serializes nested values inside choice arrays as readable JSON fragments', () => {
    const fields = buildFormFields(
      [
        {
          subtype: 'Widget',
          fieldName: 'choice',
          fieldType: 'Ch',
          rect: [10, 10, 50, 30],
          fieldValue: ['A', { exportValue: 'B' }, ['C']],
        },
      ],
      100,
    );

    expect(fields[0].value).toBe('A, {"exportValue":"B"}, ["C"]');
  });

  it('extracts choice options and selection behavior metadata', () => {
    const fields = buildFormFields(
      [
        {
          subtype: 'Widget',
          fieldName: 'choice',
          fieldType: 'Ch',
          rect: [10, 10, 50, 30],
          fieldValue: ['A'],
          combo: false,
          multiSelect: true,
          options: [
            { exportValue: 'A', displayValue: 'Alpha' },
            { exportValue: 'B', displayValue: 'Beta' },
            { exportValue: 3, displayValue: true },
            { displayValue: 'Missing export' },
            'bad',
          ],
        },
      ],
      100,
    );

    expect(fields[0]).toMatchObject({
      name: 'choice',
      type: 'choice',
      value: 'A',
      combo: false,
      multiSelect: true,
      options: [
        { exportValue: 'A', displayValue: 'Alpha' },
        { exportValue: 'B', displayValue: 'Beta' },
        { exportValue: '3', displayValue: 'true' },
      ],
    });
  });

  it('rejects invalid page geometry parameters before coordinate conversion', () => {
    expect(() => buildFormFields([], Number.NaN)).toThrow(/pageHeight/);
    expect(() => buildFormFields([], 0)).toThrow(/pageHeight/);
    expect(() => buildFormFields([], 100, Number.POSITIVE_INFINITY)).toThrow(/viewMinX and viewMinY/);
    expect(() => buildFormFields([], 100, 0, Number.NaN)).toThrow(/viewMinX and viewMinY/);
  });

  it('ignores widget annotations with non-finite rect coordinates', () => {
    const fields = buildFormFields(
      [
        { subtype: 'Widget', fieldName: 'bad', fieldType: 'Tx', rect: [10, 10, Number.NaN, 20] },
        { subtype: 'Widget', fieldName: 'good', fieldType: 'Tx', rect: [10, 10, 20, 20] },
      ],
      100,
    );

    expect(fields.map((field) => field.name)).toEqual(['good']);
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

  it('does not attach footer chrome as checkbox labels', () => {
    const fields = buildFormFields(
      [
        {
          subtype: 'Widget',
          fieldName: 'foreignTrustYes',
          fieldType: 'Btn',
          checkBox: true,
          radioButton: false,
          rect: rectFromTopLeft(539.4, 745, 10, 10),
          fieldValue: 'Off',
        },
      ],
      792,
      0,
      0,
      [
        { text: 'Created 4/23/25', x: 517.62, y: 757.71, width: 58.38, height: 8, fontSize: 8 },
        { text: 'Cat. No. 17146N', x: 312.21, y: 759, width: 62, height: 8, fontSize: 8 },
      ],
    );

    expect(fields[0].label).toBeUndefined();
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

  it('merges wrapped above-label continuation lines below the first candidate line', () => {
    const fields = buildFormFields(
      [{ subtype: 'Widget', fieldName: 'entityName', fieldType: 'Tx', rect: [58.6, 660, 576, 674] }],
      792,
      0,
      0,
      [
        {
          text: '1 Name of entity/individual. An entry is required. (For a sole proprietor or disregarded entity, enter the owner’s name on line 1, and enter the business/disregarded',
          x: 61.6,
          y: 97,
          width: 511.1,
          height: 7,
          fontSize: 7,
        },
        {
          text: 'entity’s name on line 2.)',
          x: 73.6,
          y: 105.4,
          width: 74.05,
          height: 7,
          fontSize: 7,
        },
      ],
    );

    expect(fields[0].label).toEqual({
      text: '1 Name of entity/individual. An entry is required. (For a sole proprietor or disregarded entity, enter the owner’s name on line 1, and enter the business/disregarded entity’s name on line 2.)',
      relation: 'above',
      x: 61.6,
      y: 97,
      width: 511.1,
      height: 15.4,
    });
  });

  it('keeps two-line checkbox instructions when stacked text just exceeds the single-line cap', () => {
    const fields = buildFormFields(
      [
        {
          subtype: 'Widget',
          fieldName: 'twoJobsCheckbox',
          fieldType: 'Btn',
          checkBox: true,
          rect: [564, 380, 572, 388],
          fieldValue: 'Off',
        },
      ],
      792,
      0,
      0,
      [
        {
          text: '(c) If there are only two jobs total, you may check this box. Do the same on Form W-4 for the other job. This',
          x: 122.4,
          y: 380.8,
          width: 434.2,
          height: 9,
          fontSize: 9,
        },
        {
          text: 'option is generally more accurate than Step 2(b) if pay at the lower paying job is more than half of the pay at',
          x: 136.8,
          y: 391.6,
          width: 433.4,
          height: 9,
          fontSize: 9,
        },
      ],
    );

    expect(fields[0].label).toMatchObject({
      text: '(c) If there are only two jobs total, you may check this box. Do the same on Form W-4 for the other job. This option is generally more accurate than Step 2(b) if pay at the lower paying job is more than half of the pay at',
      relation: 'above',
      x: 122.4,
      y: 380.8,
      width: 447.8,
      height: 19.8,
    });
  });

  it('merges left-side checkbox labels that continue from preceding lines', () => {
    const fields = buildFormFields(
      [
        {
          subtype: 'Widget',
          fieldName: 'foreignPartners',
          fieldType: 'Btn',
          checkBox: true,
          rect: [440.6, 521, 448.6, 529],
          fieldValue: 'Off',
        },
      ],
      792,
      0,
      0,
      [
        {
          text: '3b If on line 3a you checked “Partnership” or “Trust/estate,” or checked “LLC” and entered “P” as its tax classification,',
          x: 61.6,
          y: 246.2,
          width: 372.56,
          height: 7,
          fontSize: 7,
        },
        {
          text: '(Applies to accounts maintained',
          x: 464.88,
          y: 250.6,
          width: 99.84,
          height: 7,
          fontSize: 7,
        },
        {
          text: 'and you are providing this form to a partnership, trust, or estate in which you have an ownership interest, check',
          x: 73.6,
          y: 254.6,
          width: 360.63,
          height: 7,
          fontSize: 7,
        },
        {
          text: 'outside the United States.)',
          x: 473.44,
          y: 259,
          width: 82.72,
          height: 7,
          fontSize: 7,
        },
        {
          text: 'this box if you have any foreign partners, owners, or beneficiaries. See instructions . . . . . . . . .',
          x: 73.63,
          y: 263,
          width: 360.33,
          height: 7,
          fontSize: 7,
        },
      ],
    );

    expect(fields[0].label).toEqual({
      text: '3b If on line 3a you checked “Partnership” or “Trust/estate,” or checked “LLC” and entered “P” as its tax classification, and you are providing this form to a partnership, trust, or estate in which you have an ownership interest, check this box if you have any foreign partners, owners, or beneficiaries. See instructions',
      relation: 'left',
      x: 61.6,
      y: 246.2,
      width: 372.63,
      height: 23.8,
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

  it('uses distant same-row headers for wide document-list form grids', () => {
    const fields = buildFormFields(
      [
        {
          subtype: 'Widget',
          fieldName: 'List B Document 1 Title',
          fieldType: 'Tx',
          rect: rectFromTopLeft(276.84, 432.27, 142.36, 17.32),
        },
        {
          subtype: 'Widget',
          fieldName: 'List C Document Title 1',
          fieldType: 'Tx',
          rect: rectFromTopLeft(420.77, 432.55, 154.65, 17.04),
        },
        {
          subtype: 'Widget',
          fieldName: 'List B Document Number 1',
          fieldType: 'Tx',
          rect: rectFromTopLeft(276.84, 468.14, 142.22, 17.04),
        },
      ],
      792,
      0,
      0,
      [
        {
          text: 'documentation from List A OR a combination of documentation from List B and List C. Enter any additional',
          x: 168.4,
          y: 402.18,
          width: 378.85,
          height: 8,
          fontSize: 8,
        },
        { text: 'Document Title 1', x: 38, y: 436.22, width: 56.4, height: 7, fontSize: 7 },
        { text: 'Document Number (if any)', x: 38, y: 472.03, width: 82.08, height: 7, fontSize: 7 },
        { text: 'Additional Information', x: 267.03, y: 504.12, width: 85.34, height: 8, fontSize: 8 },
      ],
    );

    expect(fields.find((field) => field.name === 'List B Document 1 Title')?.label).toEqual({
      text: 'Document Title 1',
      relation: 'left',
      x: 38,
      y: 436.22,
      width: 56.4,
      height: 7,
    });
    expect(fields.find((field) => field.name === 'List C Document Title 1')?.label?.text).toBe('Document Title 1');
    expect(fields.find((field) => field.name === 'List B Document Number 1')?.label?.text).toBe(
      'Document Number (if any)',
    );
  });

  it('stops a checkbox label at the next checkbox on the same row', () => {
    // IRS 1040 header row: "[cb] Filed pursuant to section 301.9100-2
    // [cb] Combat zone". The layout pass merges the row into one line;
    // that line crosses the second checkbox's rect, so the per-option
    // span must win or the first checkbox absorbs both options' text.
    const fields = buildFormFields(
      [
        {
          subtype: 'Widget',
          fieldName: 'c1_1',
          fieldType: 'Btn',
          checkBox: true,
          rect: [36, 684, 44, 692],
          fieldValue: 'Off',
        },
        {
          subtype: 'Widget',
          fieldName: 'c1_2',
          fieldType: 'Btn',
          checkBox: true,
          rect: [157, 684, 165, 692],
          fieldValue: 'Off',
        },
      ],
      792,
      0,
      0,
      [
        {
          text: 'Filed pursuant to section 301.9100-2 Combat zone',
          x: 46.4,
          y: 100.5,
          width: 161.3,
          height: 7,
          fontSize: 7,
        },
        { text: 'Filed pursuant to section 301.9100-2', x: 46.4, y: 100.5, width: 108, height: 7, fontSize: 7 },
        { text: 'Combat zone', x: 165.6, y: 100.5, width: 42.1, height: 7, fontSize: 7 },
      ],
    );

    expect(fields[0].label?.text).toBe('Filed pursuant to section 301.9100-2');
    expect(fields[1].label?.text).toBe('Combat zone');
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

  it('merges stacked prompt text above a trailing inline text-field label', () => {
    const fields = buildFormFields(
      [{ subtype: 'Widget', fieldName: 'fatcaCode', fieldType: 'Tx', rect: [500.6, 552, 576, 564] }],
      792,
      0,
      0,
      [
        { text: 'Exemption from Foreign Account Tax', x: 457.6, y: 210.6, width: 116.68, height: 7, fontSize: 7 },
        { text: 'Compliance Act (FATCA) reporting', x: 457.6, y: 219, width: 108.12, height: 7, fontSize: 7 },
        { text: 'code (if any)', x: 458.05, y: 228, width: 37.98, height: 7, fontSize: 7 },
        { text: 'Other (see instructions)', x: 86.4, y: 228, width: 76, height: 7, fontSize: 7 },
      ],
    );

    expect(fields[0].label).toEqual({
      text: 'Exemption from Foreign Account Tax Compliance Act (FATCA) reporting code (if any)',
      relation: 'left',
      x: 457.6,
      y: 210.6,
      width: 116.68,
      height: 24.4,
    });
  });

  it('expands compact amount markers across same-line dot leaders', () => {
    const dotLeaders = Array.from({ length: 19 }, (_, index) => ({
      text: '.',
      x: 251.94 + index * 12,
      y: 192.42,
      width: 2.5,
      height: 9,
      fontSize: 9,
    }));
    const fields = buildFormFields(
      [{ subtype: 'Widget', fieldName: 'line1Amount', fieldType: 'Tx', rect: [511.2, 588, 576, 600] }],
      792,
      0,
      0,
      [
        {
          text: '"Lower Paying Job" column, find the value at the intersection of the two household salaries and enter',
          x: 64.81,
          y: 181.62,
          width: 410.34,
          height: 9,
          fontSize: 9,
        },
        {
          text: 'that value on line 1. Then, skip to line 3 . .',
          x: 64.75,
          y: 192.42,
          width: 177.69,
          height: 9,
          fontSize: 9,
        },
        ...dotLeaders,
        { text: '1 $', x: 490.58, y: 192.42, width: 19.52, height: 9, fontSize: 9 },
      ],
    );

    expect(fields[0].label).toMatchObject({
      text: '"Lower Paying Job" column, find the value at the intersection of the two household salaries and enter that value on line 1. Then, skip to line 3 1 $',
      relation: 'left',
      x: 64.75,
      y: 181.62,
    });
  });

  it('does not absorb nearby side headings into right-edge amount labels', () => {
    const dotLeaders = Array.from({ length: 10 }, (_, index) => ({
      text: '.',
      x: 360 + index * 12,
      y: 97.71,
      width: 2.22,
      height: 8,
      fontSize: 8,
    }));
    const fields = buildFormFields(
      [{ subtype: 'Widget', fieldName: 'standardDeduction', fieldType: 'Tx', rect: [504, 684, 576, 696] }],
      792,
      0,
      0,
      [
        { text: 'Standard', x: 31.8, y: 91.2, width: 30.47, height: 7, fontSize: 7 },
        { text: 'deduction for—', x: 31.8, y: 98.95, width: 51.72, height: 7, fontSize: 7 },
        {
          text: 'e Standard deduction or itemized deductions (from Schedule A) .',
          x: 100.8,
          y: 97.71,
          width: 249.43,
          height: 8,
          fontSize: 8,
        },
        ...dotLeaders,
        { text: '12e', x: 486.46, y: 97.71, width: 13.49, height: 8, fontSize: 8 },
      ],
    );

    expect(fields[0].label).toMatchObject({
      text: 'e Standard deduction or itemized deductions (from Schedule A). 12e',
      relation: 'left',
      x: 100.8,
      y: 97.71,
      width: 399.15,
      height: 8,
    });
  });

  it('expands compact amount markers when the same prompt is also split into spans', () => {
    const dotLeaders = Array.from({ length: 20 }, (_, index) => ({
      text: '.',
      x: 239.94 + index * 12,
      y: 192.42,
      width: 2.5,
      height: 9,
      fontSize: 9,
    }));
    const fields = buildFormFields(
      [{ subtype: 'Widget', fieldName: 'line1Amount', fieldType: 'Tx', rect: [511.2, 588, 576, 600] }],
      792,
      0,
      0,
      [
        {
          text: '"Lower Paying Job" column, find the value at the intersection of the two household salaries and enter',
          x: 64.81,
          y: 181.62,
          width: 410.34,
          height: 9,
          fontSize: 9,
        },
        {
          text: 'that value on line 1. Then, skip to line 3 . .',
          x: 64.75,
          y: 192.42,
          width: 177.69,
          height: 9,
          fontSize: 9,
        },
        { text: 'that value on line 1. Then,', x: 64.75, y: 192.42, width: 103.2, height: 9, fontSize: 9 },
        { text: 'skip', x: 170.45, y: 192.42, width: 17.82, height: 9, fontSize: 9 },
        { text: 'to line 3 .', x: 190.77, y: 192.42, width: 39.67, height: 9, fontSize: 9 },
        ...dotLeaders,
        { text: '1 $', x: 490.58, y: 192.42, width: 19.52, height: 9, fontSize: 9 },
        { text: '1', x: 490.58, y: 192.42, width: 5, height: 9, fontSize: 9 },
        { text: '$', x: 505.1, y: 192.42, width: 5, height: 9, fontSize: 9 },
      ],
    );

    expect(fields[0].label?.text).toContain('that value on line 1. Then, skip to line 3 1 $');
  });

  it('expands compact amount markers across two stacked prompt lines', () => {
    const dotLeaders = Array.from({ length: 7 }, (_, index) => ({
      text: '.',
      x: 396 + index * 12,
      y: 551.93,
      width: 2.5,
      height: 9,
      fontSize: 9,
    }));
    const fields = buildFormFields(
      [{ subtype: 'Widget', fieldName: 'otherIncome', fieldType: 'Tx', rect: [511.2, 228, 576, 240] }],
      792,
      0,
      0,
      [
        {
          text: '(a) Other income (not from jobs). If you want tax withheld for other income you',
          x: 122.4,
          y: 530.33,
          width: 352.79,
          height: 9,
          fontSize: 9,
        },
        {
          text: 'expect this year that won’t have withholding, enter the amount of other income here.',
          x: 136.79,
          y: 541.13,
          width: 338.39,
          height: 9,
          fontSize: 9,
        },
        {
          text: 'This may include interest, dividends, and retirement income .',
          x: 136.79,
          y: 551.93,
          width: 249.71,
          height: 9,
          fontSize: 9,
        },
        ...dotLeaders,
        { text: '4(a) $', x: 485.45, y: 552.42, width: 24.65, height: 9.01, fontSize: 9 },
      ],
    );

    expect(fields[0].label).toMatchObject({
      text: '(a) Other income (not from jobs). If you want tax withheld for other income you expect this year that won’t have withholding, enter the amount of other income here. This may include interest, dividends, and retirement income. 4(a) $',
      relation: 'left',
      x: 122.4,
      y: 530.33,
    });
  });

  it('does not absorb the previous numbered prompt into a new amount marker row', () => {
    const fields = buildFormFields(
      [{ subtype: 'Widget', fieldName: 'line3bAmount', fieldType: 'Tx', rect: [417.6, 288, 481.65, 300] }],
      792,
      0,
      0,
      [
        {
          text: '(a) Multiply the number of qualifying children under age 17 by',
          x: 122.36,
          y: 469.12,
          width: 259.23,
          height: 9,
          fontSize: 9,
        },
        {
          text: '$2,200 . . . . . . . . . . . . . . . . . .',
          x: 136.78,
          y: 479.92,
          width: 237.65,
          height: 9,
          fontSize: 9,
        },
        {
          text: '(b) Multiply the number of other dependents by $500 . . .',
          x: 122.4,
          y: 492.43,
          width: 252.13,
          height: 9,
          fontSize: 9,
        },
        { text: '3(b) $', x: 391.69, y: 492.43, width: 24.81, height: 9, fontSize: 9 },
      ],
    );

    expect(fields[0].label?.text).toBe('(b) Multiply the number of other dependents by $500 3(b) $');
  });

  it('ignores short offset labels above wide text fields', () => {
    const fields = buildFormFields(
      [{ subtype: 'Widget', fieldName: 'otherText', fieldType: 'Tx', rect: [68.4, 708.5, 236.6, 719.5] }],
      792,
      0,
      0,
      [
        { text: 'Combat zone', x: 165.6, y: 61.9, width: 42.13, height: 7, fontSize: 7 },
        { text: 'Other', x: 46.4, y: 73.9, width: 17.51, height: 7, fontSize: 7 },
      ],
    );

    expect(fields[0].label).toMatchObject({
      text: 'Other',
      relation: 'left',
    });
  });

  it('prefers wide descriptive above labels over tiny line numbers', () => {
    const fields = buildFormFields(
      [{ subtype: 'Widget', fieldName: 'entityName', fieldType: 'Tx', rect: [58.6, 660, 576, 674] }],
      792,
      0,
      0,
      [
        { text: '1', x: 61.6, y: 97, width: 3.89, height: 7, fontSize: 7 },
        {
          text: '1 Name of entity/individual. An entry is required.',
          x: 61.6,
          y: 97,
          width: 260,
          height: 7,
          fontSize: 7,
        },
      ],
    );

    expect(fields[0].label).toMatchObject({
      text: '1 Name of entity/individual. An entry is required.',
      relation: 'above',
    });
  });

  it('prefers same-line left prompts over wide previous-row labels', () => {
    const fields = buildFormFields(
      [{ subtype: 'Widget', fieldName: 'otherText', fieldType: 'Tx', rect: [68.4, 708.5, 236.6, 719.5] }],
      792,
      0,
      0,
      [
        {
          text: 'Filed pursuant to section 301.9100-2 Combat zone',
          x: 46.4,
          y: 61.9,
          width: 161.33,
          height: 7,
          fontSize: 7,
        },
        { text: 'Other', x: 46.4, y: 73.9, width: 17.51, height: 7, fontSize: 7 },
      ],
    );

    expect(fields[0].label).toMatchObject({
      text: 'Other',
      relation: 'left',
    });
  });
});
