import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { buildFormFields } from '../../src/core/formFields/index.js';
import { extractWidgetAppearanceCaptions } from '../../src/core/widgetAppearance/index.js';

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
  it('extracts push-button captions from widget appearance characteristics', () => {
    const pdfBytes = Buffer.from(
      [
        '11 0 obj',
        '<< /Subtype /Widget /FT /Btn /Ff 65536 /MK << /BG [ 0.75293 ] /CA (Show \\(now\\)) >> /T (Button1) >>',
        'endobj',
      ].join('\n'),
      'latin1',
    );
    const captions = extractWidgetAppearanceCaptions(pdfBytes);
    expect(captions.get('11R')).toBe('Show (now)');
  });

  it('extracts push-button captions from uncompressed object streams', () => {
    const first = 5;
    const objectBody = '<< /Subtype /Widget /FT /Btn /Ff 65536 /MK << /BG [ 0.75293 ] /CA (Show) >> /T (Button1) >>';
    const objectStream = `11 0\n${objectBody}`;
    const pdfBytes = Buffer.from(
      [
        '4 0 obj',
        `<< /Type /ObjStm /Length ${objectStream.length} /N 1 /First ${first} >>`,
        'stream',
        objectStream,
        'endstream',
        'endobj',
      ].join('\n'),
      'latin1',
    );

    const captions = extractWidgetAppearanceCaptions(pdfBytes);
    expect(captions.get('11R')).toBe('Show');
  });

  it('extracts push-button captions from FlateDecode object streams', () => {
    const first = 5;
    const objectBody =
      '<< /AP << /N 67 0 R >> /FT /Btn /Ff 65536 /MK << /BG [ 0.75293 ] /CA (Action) >> /Subtype /Widget /T (Button3) >>';
    const objectStream = `97 0\n${objectBody}`;
    const compressed = deflateSync(Buffer.from(objectStream, 'latin1'));
    const pdfBytes = Buffer.concat([
      Buffer.from(
        [
          '68 0 obj',
          `<< /Type /ObjStm /Filter[/FlateDecode] /Length ${compressed.length} /N 1 /First ${first} >>`,
          'stream',
        ].join('\n'),
        'latin1',
      ),
      Buffer.from('\n', 'latin1'),
      compressed,
      Buffer.from('\nendstream\nendobj', 'latin1'),
    ]);

    const captions = extractWidgetAppearanceCaptions(pdfBytes);
    expect(captions.get('97R')).toBe('Action');
  });

  it('attaches push-button captions from appearance maps', () => {
    const fields = buildFormFields(
      [
        {
          id: '11R',
          subtype: 'Widget',
          fieldName: 'Button1',
          fieldType: 'Btn',
          pushButton: true,
          rect: [285.317, 733.065, 357.317, 753.065],
        },
      ],
      792,
      0,
      0,
      [],
      { widgetAppearanceCaptions: new Map([['11R', 'Show']]) },
    );

    expect(fields[0]).toMatchObject({
      name: 'Button1',
      type: 'button',
      caption: 'Show',
      x: 285.32,
      y: 38.93,
      width: 72,
      height: 20,
    });
  });

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

  it('keeps widget JavaScript source raw', () => {
    const fields = buildFormFields(
      [
        {
          subtype: 'Widget',
          fieldName: 'RunScript',
          fieldType: 'Btn',
          checkBox: false,
          radioButton: false,
          rect: [10, 10, 50, 30],
          actions: {
            ＭｏｕｓｅＵｐ: ['var Ａ = "Ｆｕｌｌｗｉｄｔｈ"; app.alert(Ａ);'],
          },
        },
      ],
      100,
    );

    expect(fields[0].actions).toEqual({
      ＭｏｕｓｅＵｐ: ['var Ａ = "Ｆｕｌｌｗｉｄｔｈ"; app.alert(Ａ);'],
    });
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
      displayValue: 'Alpha',
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

  it('merges stacked side labels for checkbox options', () => {
    const fields = buildFormFields(
      [
        {
          subtype: 'Widget',
          fieldName: 'topmostSubform[0].Page3[0].Line3_ReadOrder[0].c4_1[0]',
          fieldType: 'Btn',
          checkBox: true,
          rect: rectFromTopLeft(50.4, 651, 12, 12),
          fieldValue: 'Off',
          exportValue: '1',
        },
        {
          subtype: 'Widget',
          fieldName: 'topmostSubform[0].Page3[0].Line3_ReadOrder[0].c4_1[1]',
          fieldType: 'Btn',
          checkBox: true,
          rect: rectFromTopLeft(50.4, 683, 12, 12),
          fieldValue: 'Off',
          exportValue: '2',
        },
        {
          subtype: 'Widget',
          fieldName: 'topmostSubform[0].Page3[0].Line3_ReadOrder[0].c4_1[2]',
          fieldType: 'Btn',
          checkBox: true,
          rect: rectFromTopLeft(136.8, 653, 12, 12),
          fieldValue: 'Off',
          exportValue: '3',
        },
        {
          subtype: 'Widget',
          fieldName: 'topmostSubform[0].Page3[0].Line3_ReadOrder[0].c4_1[3]',
          fieldType: 'Btn',
          checkBox: true,
          rect: rectFromTopLeft(136.8, 683, 12, 12),
          fieldValue: 'Off',
          exportValue: '4',
        },
      ],
      792,
      0,
      0,
      [
        { text: '1st', x: 84.58, y: 645.91, width: 10.97, height: 8, fontSize: 8 },
        { text: '3rd', x: 177.74, y: 647.91, width: 11.86, height: 8, fontSize: 8 },
        { text: 'Quarter', x: 76.58, y: 655.51, width: 26.97, height: 8, fontSize: 8 },
        { text: 'Quarter', x: 170.18, y: 657.51, width: 26.97, height: 8, fontSize: 8 },
        { text: '2nd', x: 83.24, y: 677.91, width: 13.64, height: 8, fontSize: 8 },
        { text: '4th', x: 177.96, y: 677.91, width: 11.42, height: 8, fontSize: 8 },
        { text: 'Quarter', x: 76.58, y: 687.51, width: 26.97, height: 8, fontSize: 8 },
        { text: 'Quarter', x: 170.18, y: 687.51, width: 26.97, height: 8, fontSize: 8 },
      ],
    );

    expect(fields.map((field) => [field.exportValue, field.label?.text])).toEqual([
      ['1', '1st Quarter'],
      ['3', '3rd Quarter'],
      ['2', '2nd Quarter'],
      ['4', '4th Quarter'],
    ]);
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

  it('keeps wrapped checkbox instructions that finish on the checkbox row', () => {
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
        {
          text: 'the higher paying job. Otherwise, Step 2(b) is more accurate . . . . . . . . . .',
          x: 136.8,
          y: 402.4,
          width: 405.2,
          height: 9,
          fontSize: 9,
        },
      ],
    );

    expect(fields[0].label).toMatchObject({
      text: '(c) If there are only two jobs total, you may check this box. Do the same on Form W-4 for the other job. This option is generally more accurate than Step 2(b) if pay at the lower paying job is more than half of the pay at the higher paying job. Otherwise, Step 2(b) is more accurate',
      relation: 'above',
      x: 122.4,
      y: 380.8,
      width: 447.8,
      height: 30.6,
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

  it('does not attach semantically unrelated nearby labels to named text fields', () => {
    const fields = buildFormFields(
      [
        {
          subtype: 'Widget',
          fieldName: 'Applicant Last Name',
          fieldType: 'Tx',
          rect: rectFromTopLeft(70.95, 126.26, 322.91, 20.2),
        },
        {
          subtype: 'Widget',
          fieldName: 'Applicant Middle Name',
          fieldType: 'Tx',
          rect: rectFromTopLeft(338.05, 158.2, 246.78, 21.51),
        },
        {
          subtype: 'Widget',
          fieldName: 'Applicant Place of Birth',
          fieldType: 'Tx',
          rect: rectFromTopLeft(308.53, 190.53, 277.05, 21.51),
        },
        {
          subtype: 'Widget',
          fieldName: 'Applicant Email',
          fieldType: 'Tx',
          rect: rectFromTopLeft(397.38, 225.36, 187.62, 22.32),
        },
        {
          subtype: 'Widget',
          fieldName: 'Applicant DOB D',
          fieldType: 'Tx',
          rect: rectFromTopLeft(105.66, 189.29, 31.53, 22),
        },
        {
          subtype: 'Widget',
          fieldName: 'Gender',
          fieldType: 'Btn',
          checkBox: true,
          rect: rectFromTopLeft(242.21, 200.23, 12.76, 12.11),
          fieldValue: 'Off',
        },
        {
          subtype: 'Widget',
          fieldName: 'Alien Number',
          fieldType: 'Tx',
          rect: rectFromTopLeft(239.99, 223.81, 146.76, 22),
        },
      ],
      792,
      0,
      0,
      [
        { text: 'Regular Book (Standard)', x: 126.39, y: 89.54, width: 79.63, height: 9, fontSize: 9 },
        {
          text: 'The large book is for frequent international travelers who need more visa pages',
          x: 116.15,
          y: 101.84,
          width: 224.81,
          height: 8,
          fontSize: 8,
        },
        { text: 'Sex', x: 253.04, y: 180.49, width: 12.1, height: 8.5, fontSize: 8.5 },
        { text: 'Place of Birth', x: 322.16, y: 181.3, width: 48.34, height: 7.5, fontSize: 7.5 },
        { text: '(MM/DD/YYYY)', x: 134.51, y: 180.84, width: 44.8, height: 8, fontSize: 8 },
        { text: 'Social Security Number', x: 81.46, y: 214.01, width: 80.83, height: 9, fontSize: 9 },
        {
          text: 'USCIS Registration A-Number',
          x: 223.8,
          y: 213.17,
          width: 114.23,
          height: 8,
          fontSize: 8,
        },
        {
          text: '(see application status at passportstatus.state.gov)',
          x: 437.38,
          y: 216.89,
          width: 141.93,
          height: 5.5,
          fontSize: 5.5,
        },
        {
          text: 'USCIS Registration A-Number (if applicable) Email (see application status at passportstatus.state.gov)',
          x: 223.8,
          y: 213.17,
          width: 327.31,
          height: 8.91,
          fontSize: 8,
        },
        { text: 'Email', x: 406.07, y: 214.08, width: 17.08, height: 8, fontSize: 8 },
      ],
    );

    expect(fields.find((field) => field.name === 'Applicant Last Name')?.label).toBeUndefined();
    expect(fields.find((field) => field.name === 'Applicant Middle Name')?.label).toBeUndefined();
    expect(fields.find((field) => field.name === 'Applicant Place of Birth')?.label?.text).toBe('Place of Birth');
    expect(fields.find((field) => field.name === 'Applicant Email')?.label?.text).toBe('Email');
    expect(fields.find((field) => field.name === 'Applicant DOB D')?.label?.text).toBe('(MM/DD/YYYY)');
    expect(fields.find((field) => field.name === 'Gender')?.label).toBeUndefined();
    expect(fields.find((field) => field.name === 'Alien Number')?.label?.text).toBe('USCIS Registration A-Number');
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

  it('keeps stacked filing status checkbox labels on their own option rows', () => {
    const fields = buildFormFields(
      [
        {
          subtype: 'Widget',
          fieldName: 'single',
          fieldType: 'Btn',
          checkBox: true,
          rect: rectFromTopLeft(97.6, 206, 8, 8),
          fieldValue: 'Off',
        },
        {
          subtype: 'Widget',
          fieldName: 'marriedJointly',
          fieldType: 'Btn',
          checkBox: true,
          rect: rectFromTopLeft(97.6, 218, 8, 8),
          fieldValue: 'Off',
        },
        {
          subtype: 'Widget',
          fieldName: 'marriedSeparately',
          fieldType: 'Btn',
          checkBox: true,
          rect: rectFromTopLeft(97.6, 230, 8, 8),
          fieldValue: 'Off',
        },
      ],
      792,
      0,
      0,
      [
        { text: 'Single', x: 110, y: 205.71, width: 22.07, height: 8, fontSize: 8 },
        {
          text: 'Married filing jointly (even if only one had income)',
          x: 110,
          y: 217.71,
          width: 176.02,
          height: 8,
          fontSize: 8,
        },
        {
          text: 'Married filing separately (MFS). Enter spouse’s SSN above',
          x: 110,
          y: 229.71,
          width: 208.9,
          height: 8,
          fontSize: 8,
        },
        { text: 'and full name here:', x: 110, y: 240.71, width: 68.32, height: 8, fontSize: 8 },
      ],
    );

    expect(fields.map((field) => field.label?.text)).toEqual([
      'Single',
      'Married filing jointly (even if only one had income)',
      'Married filing separately (MFS). Enter spouse’s SSN above and full name here:',
    ]);
  });

  it('does not absorb a following caution paragraph into a checkbox option label', () => {
    const fields = buildFormFields(
      [
        {
          subtype: 'Widget',
          fieldName: 'headOfHousehold',
          fieldType: 'Btn',
          checkBox: true,
          rect: rectFromTopLeft(115.2, 181.75, 8, 8),
          fieldValue: 'Off',
        },
      ],
      792,
      0,
      0,
      [
        { text: 'Head of household', x: 126.05, y: 181.5, width: 61.45, height: 7, fontSize: 7 },
        {
          text: '(Check only if you’re unmarried and pay more than half the costs of keeping up a home.)',
          x: 189.41,
          y: 181.5,
          width: 300,
          height: 7,
          fontSize: 7,
        },
        { text: 'Caution:', x: 96.6, y: 193.6, width: 28, height: 7, fontSize: 7 },
        {
          text: 'To claim certain credits or deductions on your tax return, you are required to have a social security',
          x: 126.55,
          y: 193.6,
          width: 442.48,
          height: 7,
          fontSize: 7,
        },
      ],
    );

    expect(fields[0].label?.text).toBe('Head of household');
  });

  it('attaches right-edge checkbox prompts across dot leaders without using line-number gutters', () => {
    const fields = buildFormFields(
      [
        {
          subtype: 'Widget',
          fieldName: 'clergyScheduleSe',
          fieldType: 'Btn',
          checkBox: true,
          rect: rectFromTopLeft(467.2, 374, 8, 8),
          fieldValue: 'Off',
        },
        {
          subtype: 'Widget',
          fieldName: 'skipEic',
          fieldType: 'Btn',
          checkBox: true,
          rect: rectFromTopLeft(467.2, 386, 8, 8),
          fieldValue: 'Off',
        },
        {
          subtype: 'Widget',
          fieldName: 'skipActc',
          fieldType: 'Btn',
          checkBox: true,
          rect: rectFromTopLeft(373.6, 410, 8, 8),
          fieldValue: 'Off',
        },
      ],
      792,
      0,
      0,
      [
        { text: 'b Clergy filing Schedule SE (see instructions) .', x: 100.8, y: 373.71, width: 177.42, height: 8 },
        { text: '. . . . . . . . . . .', x: 336, y: 385.71, width: 122.22, height: 8 },
        { text: 'c If you do not want to claim the EIC, check here .', x: 100.8, y: 385.71, width: 189.42, height: 8 },
        {
          text: '28 Additional child tax credit (ACTC) from Schedule 8812. If you do not want',
          x: 91.9,
          y: 399.11,
          width: 289.68,
          height: 8,
        },
        { text: 'to claim the ACTC, check here .', x: 115.18, y: 408.71, width: 115.02, height: 8 },
        { text: '. . . . . .', x: 239.98, y: 408.71, width: 122.22, height: 8 },
        { text: '28', x: 395.15, y: 409.71, width: 8.9, height: 8 },
        { text: '28 29 30', x: 395.15, y: 409.71, width: 8.9, height: 32 },
      ],
    );

    expect(fields.find((field) => field.name === 'clergyScheduleSe')?.label?.text).toBe(
      'b Clergy filing Schedule SE (see instructions)',
    );
    expect(fields.find((field) => field.name === 'skipEic')?.label?.text).toBe(
      'c If you do not want to claim the EIC, check here',
    );
    expect(fields.find((field) => field.name === 'skipActc')?.label?.text).toBe(
      '28 Additional child tax credit (ACTC) from Schedule 8812. If you do not want to claim the ACTC, check here',
    );
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
          text: 'LLC. Enter the tax classification (C = C corporation, S = S corporation, P = Partnership) . . . .',
          x: 86.4,
          y: 193.5,
          width: 302.14,
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

  it('does not absorb W-9 note paragraphs into checkbox option labels', () => {
    const fields = buildFormFields(
      [
        {
          subtype: 'Widget',
          fieldName: 'llc',
          fieldType: 'Btn',
          checkBox: true,
          rect: rectFromTopLeft(73, 193.5, 8, 8),
          fieldValue: 'Off',
        },
        {
          subtype: 'Widget',
          fieldName: 'other',
          fieldType: 'Btn',
          checkBox: true,
          rect: rectFromTopLeft(73, 230, 8, 8),
          fieldValue: 'Off',
        },
      ],
      792,
      0,
      0,
      [
        {
          text: 'LLC. Enter the tax classification (C = C corporation, S = S corporation, P = Partnership)',
          x: 86.4,
          y: 193.5,
          width: 283.14,
          height: 7,
          fontSize: 7,
        },
        { text: 'Note:', x: 86.4, y: 203.37, width: 17.71, height: 7, fontSize: 7 },
        {
          text: 'Check the “LLC” box above and, in the entry space, enter the appropriate code (C, S, or P) for the tax',
          x: 106.04,
          y: 203.37,
          width: 314.61,
          height: 7,
          fontSize: 7,
        },
        {
          text: 'classification of the LLC, unless it is a disregarded entity. A disregarded entity should instead check the appropriate',
          x: 86.4,
          y: 211.12,
          width: 357.6,
          height: 7,
          fontSize: 7,
        },
        {
          text: 'box for the tax classification of its owner.',
          x: 86.4,
          y: 218.87,
          width: 127.04,
          height: 7,
          fontSize: 7,
        },
        { text: 'Other (see instructions)', x: 86.4, y: 230, width: 72.35, height: 7, fontSize: 7 },
      ],
    );

    expect(fields.find((field) => field.name === 'llc')?.label?.text).toBe(
      'LLC. Enter the tax classification (C = C corporation, S = S corporation, P = Partnership)',
    );
    expect(fields.find((field) => field.name === 'other')?.label?.text).toBe('Other (see instructions)');
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
          text: '1 Two jobs. If you have two jobs or you’re married filing jointly and you and your spouse each have one',
          x: 45.4,
          y: 160.02,
          width: 429.82,
          height: 9,
          fontSize: 9,
        },
        {
          text: 'job, find the amount from the appropriate table on page 5. Using the “Higher Paying Job” row and the',
          x: 64.78,
          y: 170.82,
          width: 410.41,
          height: 9,
          fontSize: 9,
        },
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
      text: '1 Two jobs. If you have two jobs or you’re married filing jointly and you and your spouse each have one job, find the amount from the appropriate table on page 5. Using the “Higher Paying Job” row and the "Lower Paying Job" column, find the value at the intersection of the two household salaries and enter that value on line 1. Then, skip to line 3 1 $',
      relation: 'left',
      x: 45.4,
      y: 160.02,
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

  it('uses same-marker prompt bands when distant dot leaders separate amount labels', () => {
    const fields = buildFormFields(
      [
        {
          subtype: 'Widget',
          fieldName: 'topmostSubform[0].Page4[0].f4_19[0]',
          fieldType: 'Tx',
          rect: rectFromTopLeft(511.2, 552, 64.8, 12),
          fieldValue: '',
          readOnly: false,
          required: false,
          annotationFlags: 4,
        },
      ],
      792,
      0,
      0,
      [
        { text: '11 Standard deduction.{', x: 40.39, y: 528.43, width: 111.58, height: 39.43, fontSize: 9 },
        { text: '11', x: 40.39, y: 528.43, width: 10.01, height: 9, fontSize: 9 },
        { text: 'Standard deduction.', x: 64.8, y: 528.43, width: 87.17, height: 9, fontSize: 9 },
        { text: '{', x: 97.06, y: 531.46, width: 7.49, height: 36.4, fontSize: 36.4 },
        { text: '}', x: 399.46, y: 531.46, width: 7.49, height: 36.4, fontSize: 36.4 },
        {
          text: '• $32,200 if you’re married filing jointly or a qualifying surviving spouse',
          x: 108,
          y: 540.42,
          width: 283.72,
          height: 9,
          fontSize: 9,
        },
        { text: 'Enter:', x: 64.8, y: 552.42, width: 23.67, height: 9, fontSize: 9 },
        {
          text: '• $24,150 if you’re head of household',
          x: 108,
          y: 552.42,
          width: 151.55,
          height: 9,
          fontSize: 9,
        },
        ...Array.from({ length: 5 }, (_, index) => ({
          text: '.',
          x: 420 + index * 12,
          y: 552.42,
          width: 2.5,
          height: 9,
          fontSize: 9,
        })),
        { text: '11 $', x: 488.18, y: 552.42, width: 21.92, height: 9, fontSize: 9 },
        { text: '11', x: 488.18, y: 552.42, width: 10.01, height: 9, fontSize: 9 },
        { text: '$', x: 505.1, y: 552.42, width: 5, height: 9, fontSize: 9 },
        {
          text: '• $16,100 if you’re single or married filing separately',
          x: 108,
          y: 564.43,
          width: 209.37,
          height: 9,
          fontSize: 9,
        },
      ],
    );

    expect(fields[0].label?.text).toBe(
      '11 Standard deduction. • $32,200 if you’re married filing jointly or a qualifying surviving spouse Enter: • $24,150 if you’re head of household • $16,100 if you’re single or married filing separately 11 $',
    );
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
          text: '1 Two jobs. If you have two jobs or you’re married filing jointly and you and your spouse each have one',
          x: 45.4,
          y: 160.02,
          width: 429.82,
          height: 9,
          fontSize: 9,
        },
        {
          text: 'job, find the amount from the appropriate table on page 5. Using the “Higher Paying Job” row and the',
          x: 64.78,
          y: 170.82,
          width: 410.41,
          height: 9,
          fontSize: 9,
        },
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

    expect(fields[0].label?.text).toContain(
      '1 Two jobs. If you have two jobs or you’re married filing jointly and you and your spouse each have one job, find',
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

  it('does not absorb previous subitem rows into bare total amount markers', () => {
    const dotLeaders = Array.from({ length: 8 }, (_, index) => ({
      text: '.',
      x: 383.99 + index * 12,
      y: 515.93,
      width: 2.5,
      height: 9,
      fontSize: 9,
    }));
    const fields = buildFormFields(
      [{ subtype: 'Widget', fieldName: 'line3Total', fieldType: 'Tx', rect: [511.2, 264, 576, 276] }],
      792,
      0,
      0,
      [
        {
          text: '(b) Multiply the number of other dependents by $500 .',
          x: 122.4,
          y: 492.43,
          width: 228.13,
          height: 9,
          fontSize: 9,
        },
        {
          text: 'Add the amounts from Steps 3(a) and 3(b), plus the amount for other credits. Enter the',
          x: 122.4,
          y: 505.13,
          width: 352.84,
          height: 9,
          fontSize: 9,
        },
        {
          text: 'total here . . . . . . . . . . . . . . . . . .',
          x: 122.44,
          y: 515.93,
          width: 252.05,
          height: 9,
          fontSize: 9,
        },
        ...dotLeaders,
        { text: '3', x: 490.7, y: 516.42, width: 5, height: 9, fontSize: 9 },
      ],
    );

    expect(fields[0].label?.text).toBe(
      'Add the amounts from Steps 3(a) and 3(b), plus the amount for other credits. Enter the total here 3',
    );
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

  it('captures left labels for tall multiline text fields across a wider gap', () => {
    const fields = buildFormFields(
      [
        {
          subtype: 'Widget',
          fieldName: 'multilineText',
          fieldType: 'Tx',
          rect: [145.6, 506.83, 591.47, 555.16],
          fieldValue: 'Line one\rLine two',
        },
      ],
      792,
      0,
      0,
      [{ text: 'Multiline', x: 20.68, y: 240.51, width: 36.12, height: 10, fontSize: 10 }],
    );

    expect(fields[0].label).toEqual({
      text: 'Multiline',
      relation: 'left',
      x: 20.68,
      y: 240.51,
      width: 36.12,
      height: 10,
    });
  });

  it('prefers wide descriptive above labels over tiny line numbers', () => {
    const fields = buildFormFields(
      [{ subtype: 'Widget', fieldName: 'entityName', fieldType: 'Tx', rect: [58.6, 660, 576, 674] }],
      792,
      0,
      0,
      [
        {
          text: 'For guidance related to the purpose of Form W-9, see',
          x: 107.2,
          y: 87,
          width: 195,
          height: 8,
          fontSize: 8,
        },
        { text: '1', x: 61.6, y: 97, width: 3.89, height: 7, fontSize: 7 },
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

    expect(fields[0].label).toMatchObject({
      text: '1 Name of entity/individual. An entry is required. (For a sole proprietor or disregarded entity, enter the owner’s name on line 1, and enter the business/disregarded entity’s name on line 2.)',
      relation: 'above',
    });
  });

  it('prefixes split same-row line numbers onto above text prompts', () => {
    const fields = buildFormFields(
      [
        {
          subtype: 'Widget',
          fieldName: 'businessName',
          fieldType: 'Tx',
          rect: rectFromTopLeft(58.6, 142, 517.4, 14),
        },
      ],
      792,
      0,
      0,
      [
        { text: '2', x: 61.6, y: 133, width: 3.89, height: 7, fontSize: 7 },
        {
          text: 'Business name/disregarded entity name, if different from above.',
          x: 73.28,
          y: 133,
          width: 200.58,
          height: 7,
          fontSize: 7,
        },
      ],
    );

    expect(fields[0].label).toMatchObject({
      text: '2 Business name/disregarded entity name, if different from above.',
      relation: 'above',
    });
  });

  it('expands line-number labels from same-row prompts with stray leading text', () => {
    const fields = buildFormFields(
      [{ subtype: 'Widget', fieldName: 'addressLine', fieldType: 'Tx', rect: rectFromTopLeft(58.6, 286, 329.45, 14) }],
      792,
      0,
      0,
      [
        { text: '5', x: 61.6, y: 277, width: 3.89, height: 7, fontSize: 7 },
        {
          text: 'See 5 Address (number, street, and apt. or suite no.). See instructions.',
          x: 44.31,
          y: 275.57,
          width: 228.91,
          height: 13.78,
          fontSize: 7,
        },
      ],
    );

    expect(fields[0].label).toMatchObject({
      text: '5 Address (number, street, and apt. or suite no.). See instructions.',
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

  it('does not use a previous row amount marker for the next amount field', () => {
    const fields = buildFormFields(
      [{ subtype: 'Widget', fieldName: 'line8b', fieldType: 'Tx', rect: rectFromTopLeft(511.2, 456, 64.8, 12) }],
      792,
      0,
      0,
      [
        {
          text: 'a Enter your total income . . . . . . . . . . . . . . . . . . .',
          x: 64.8,
          y: 444.42,
          width: 445.3,
          height: 9,
          fontSize: 9,
        },
        { text: '8a $', x: 488.04, y: 444.42, width: 22.06, height: 9, fontSize: 9 },
        {
          text: 'b Subtract line 4 from line 8a. If line 4 is greater than line 8a, enter -0- here and on line 10. Skip line 9',
          x: 64.8,
          y: 456.43,
          width: 410.22,
          height: 9,
          fontSize: 9,
        },
        { text: '8b $', x: 487.95, y: 456.43, width: 22.15, height: 9, fontSize: 9 },
      ],
    );

    expect(fields.find((field) => field.name === 'line8b')?.label?.text).toBe(
      'b Subtract line 4 from line 8a. If line 4 is greater than line 8a, enter -0- here and on line 10. Skip line 9 8b $',
    );
  });

  it('prefers the actual prompt over standalone instruction-reference text', () => {
    const fields = buildFormFields(
      [
        {
          subtype: 'Widget',
          fieldName: 'identityProtectionPin',
          fieldType: 'Tx',
          rect: rectFromTopLeft(504, 654, 72, 12),
        },
      ],
      792,
      0,
      0,
      [
        { text: 'If the IRS sent you an Identity', x: 464.8, y: 636.5, width: 92.06, height: 7, fontSize: 7 },
        { text: 'Protection PIN, enter it here', x: 464.8, y: 645, width: 86.86, height: 7, fontSize: 7 },
        { text: '(see inst.)', x: 464.8, y: 653.49, width: 29.69, height: 7, fontSize: 7 },
      ],
    );

    expect(fields[0].label).toMatchObject({
      text: 'If the IRS sent you an Identity Protection PIN, enter it here',
      relation: 'above',
    });
  });

  it('uses a currency marker to connect far-left amount prompts to text fields', () => {
    const fields = buildFormFields(
      [
        {
          subtype: 'Widget',
          fieldName: 'P7_Line6_BalanceofAccounts',
          fieldType: 'Tx',
          rect: rectFromTopLeft(480, 120, 96, 18),
        },
      ],
      792,
      0,
      0,
      [
        {
          text: 'Only include the assets if the principal immigrant',
          x: 373.71,
          y: 88.84,
          width: 198.04,
          height: 10,
          fontSize: 10,
        },
        { text: '6.', x: 36, y: 117.84, width: 7.5, height: 10, fontSize: 10 },
        {
          text: "Enter the balance of the principal immigrant's savings and checking accounts.",
          x: 60,
          y: 117.84,
          width: 310.91,
          height: 10,
          fontSize: 10,
        },
        { text: '$', x: 471.5, y: 121.84, width: 5, height: 10, fontSize: 10 },
      ],
    );

    expect(fields[0].label).toMatchObject({
      text: "Enter the balance of the principal immigrant's savings and checking accounts.",
      relation: 'left',
    });
  });

  it('prefers close above column labels over offset labels from the next row', () => {
    const fields = buildFormFields(
      [
        {
          subtype: 'Widget',
          fieldName: 'middleInitial',
          fieldType: 'Tx',
          rect: rectFromTopLeft(395.01, 145.41, 22.72, 16.56),
        },
      ],
      792,
      0,
      0,
      [
        {
          text: 'Section 1. Employee Information and Verification',
          x: 36,
          y: 120.72,
          width: 212.77,
          height: 10,
          fontSize: 10,
        },
        {
          text: '(To be completed and signed by employee at the time employment begins.)',
          x: 251.26,
          y: 120.72,
          width: 297.72,
          height: 10,
          fontSize: 10,
        },
        { text: 'Middle Initial', x: 373.95, y: 134.37, width: 44.22, height: 8, fontSize: 8 },
        { text: 'Apt. #', x: 357.73, y: 162.69, width: 20, height: 8, fontSize: 8 },
      ],
    );

    expect(fields[0].label).toMatchObject({
      text: 'Middle Initial',
      relation: 'above',
    });
  });

  it('prefers a close above text-field label over right-side wrapped instruction text', () => {
    const fields = buildFormFields(
      [
        {
          subtype: 'Widget',
          fieldName: 'topmostSubform[0].Page1[0].Address_ReadOrder[0].f1_21[0]',
          fieldType: 'Tx',
          rect: rectFromTopLeft(418.6, 142, 48.65, 14),
        },
      ],
      792,
      0,
      0,
      [
        { text: 'Apt. no.', x: 421.6, y: 133, width: 24.64, height: 7, fontSize: 7 },
        { text: 'the U.S. for more than half of 2025.', x: 470, y: 146.89, width: 91.78, height: 7, fontSize: 7 },
      ],
    );

    expect(fields[0].label).toMatchObject({
      text: 'Apt. no.',
      relation: 'above',
    });
  });

  it('prefers a wide text field own above label over the adjacent column label', () => {
    const fields = buildFormFields(
      [
        {
          subtype: 'Widget',
          fieldName: 'Signature of Preparer or Translator 0',
          fieldType: 'Tx',
          rect: rectFromTopLeft(39.32, 228.28, 373.84, 22.92),
        },
        {
          subtype: 'Widget',
          fieldName: 'Sig Date mmddyyyy 0',
          fieldType: 'Tx',
          rect: rectFromTopLeft(417.56, 228.28, 150.38, 22.92),
        },
        {
          subtype: 'Widget',
          fieldName: 'Preparer or Translator Last Name (Family Name) 0',
          fieldType: 'Tx',
          rect: rectFromTopLeft(39.64, 265.2, 229.52, 16),
        },
      ],
      792,
      0,
      0,
      [
        {
          text: 'Signature of Preparer or Translator',
          x: 38.84,
          y: 217.15,
          width: 124.05,
          height: 8,
          fontSize: 8,
        },
        { text: 'Date (mm/dd/yyyy)', x: 417.12, y: 217.18, width: 67.12, height: 8, fontSize: 8 },
        { text: 'Last Name (Family Name)', x: 38.84, y: 254.52, width: 93.34, height: 8, fontSize: 8 },
      ],
    );

    expect(fields[0].label?.text).toBe('Signature of Preparer or Translator');
    expect(fields[1].label?.text).toBe('Date (mm/dd/yyyy)');
  });
});
