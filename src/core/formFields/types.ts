import type { FormField, FormFieldLabel, FormFieldLabelRelation } from '../../types/index.js';

const FORM_FIELD_TEXT_APPEARANCE = Symbol('pdfvision.formFieldTextAppearance');

export interface FormFieldTextAppearance {
  comb?: boolean;
  maxLen?: number;
  /**
   * Clockwise turn from the widget's stored x axis to the reported frame, so
   * comb cells run down (90), right to left (180) or up (270) the page.
   */
  rotation?: 0 | 90 | 180 | 270;
}

export type FormFieldWithTextAppearance = FormField & {
  [FORM_FIELD_TEXT_APPEARANCE]?: FormFieldTextAppearance;
};

export function attachFormFieldTextAppearance(field: FormField, appearance: FormFieldTextAppearance): void {
  Object.defineProperty(field, FORM_FIELD_TEXT_APPEARANCE, {
    value: appearance,
    enumerable: false,
  });
}

export function getFormFieldTextAppearance(field: FormField): FormFieldTextAppearance | undefined {
  return (field as FormFieldWithTextAppearance)[FORM_FIELD_TEXT_APPEARANCE];
}

export interface LabelLine {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize?: number;
}

export interface LabelCandidate {
  label: FormFieldLabel;
  score: number;
  line: LabelLine;
  text: string;
  relation: FormFieldLabelRelation;
}
