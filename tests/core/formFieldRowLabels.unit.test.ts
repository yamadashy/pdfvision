import { describe, expect, it } from 'vitest';
import { buildFormFields } from '../../src/core/formFields/index.js';

function rect(x: number, y: number, width: number, height: number): [number, number, number, number] {
  return [x, 792 - y - height, x + width, 792 - y];
}

function textField(name: string, x: number, y: number, width = 358, height = 18) {
  return { subtype: 'Widget', fieldName: name, fieldType: 'Tx', rect: rect(x, y, width, height) };
}

function line(text: string, x: number, y: number, width: number, height = 10) {
  return { text, x, y, width, height, fontSize: 9 };
}

function labels(fields: ReturnType<typeof buildFormFields>): Record<string, string | undefined> {
  return Object.fromEntries(
    fields.map((field) => [field.name, field.label ? `${field.label.text} (${field.label.relation})` : undefined]),
  );
}

describe('form field labels far left of an aligned field column', () => {
  it('pairs each field with the label on its row at the left margin', () => {
    const fields = buildFormFields(
      [textField('a1', 200, 148.5), textField('a2', 200, 175.5), textField('a3', 200, 202.5)],
      792,
      0,
      0,
      [line('Full name *', 54, 152.5, 45.5), line('Organization', 54, 179.5, 51), line('Email *', 54, 206.5, 28.5)],
    );

    expect(labels(fields)).toEqual({ a1: 'Full name * (left)', a2: 'Organization (left)', a3: 'Email * (left)' });
  });

  it('does not reach past text or another widget between the label and the field', () => {
    const fields = buildFormFields(
      [
        textField('blocked_by_text', 300, 148.5, 200),
        textField('Text2', 160, 235.5, 80),
        textField('Text3', 320, 235.5, 80),
      ],
      792,
      0,
      0,
      [line('Reference', 54, 152.5, 40), line('see note 4', 200, 152.5, 40), line('Account', 54, 239.5, 34)],
    );

    expect(labels(fields)).toEqual({
      blocked_by_text: undefined,
      Text2: 'Account (left)',
      Text3: undefined,
    });
  });

  it('ignores a line off the field row and the option text of a checkbox', () => {
    const fields = buildFormFields(
      [
        textField('off_row', 200, 148.5),
        { subtype: 'Widget', fieldName: 'agree', fieldType: 'Btn', checkBox: true, rect: rect(54, 200, 10, 10) },
        textField('after_option', 260, 196, 200),
      ],
      792,
      0,
      0,
      [line('Heading', 54, 133, 40), line('Yes, send updates', 68, 200, 70)],
    );

    expect(labels(fields).off_row).toBeUndefined();
    expect(labels(fields).after_option).toBeUndefined();
  });
});

describe('split boxes share the label before the first box', () => {
  it('gives the day and year boxes of a split date the date label', () => {
    const fields = buildFormFields(
      [textField('month', 200, 371.5, 28), textField('day', 238, 371.5, 28), textField('year', 276, 371.5, 46)],
      792,
      0,
      0,
      [line('Project start date *', 54, 375.5, 74), line('/', 231.5, 375.5, 3), line('/', 269.5, 375.5, 3)],
    );

    expect(labels(fields)).toEqual({
      month: 'Project start date * (left)',
      day: 'Project start date * (left)',
      year: 'Project start date * (left)',
    });
  });

  it('does not pass a label across a word between adjacent boxes', () => {
    const fields = buildFormFields([textField('Text1', 120, 300, 100), textField('Text2', 236, 300, 40)], 792, 0, 0, [
      line('City', 54, 304, 20),
      line('ST', 224, 304, 10),
    ]);

    expect(labels(fields).Text2).toBe('ST (left)');
  });

  it('does not pass a label to an adjacent box of another height', () => {
    const fields = buildFormFields(
      [textField('Text1', 120, 300, 100), textField('Text2', 228, 296, 60, 26)],
      792,
      0,
      0,
      [line('City', 54, 304, 20)],
    );

    expect(labels(fields)).toEqual({ Text1: 'City (left)', Text2: undefined });
  });
});
