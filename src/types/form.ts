import type { PageAnnotationFlag } from './annotations.js';

export type FormFieldType = 'text' | 'checkbox' | 'radio' | 'choice' | 'signature' | 'button' | 'unknown';

export type FormFieldLabelRelation = 'left' | 'right' | 'above' | 'below';

export interface FormFieldLabel {
  text: string;
  relation: FormFieldLabelRelation;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FormFieldChoiceOption {
  /** Value submitted/exported by the PDF form. */
  exportValue: string;
  /** Human-visible choice label shown by a PDF viewer. */
  displayValue: string;
}

export interface FormFieldResetFormAction {
  /** Field names listed by the PDF ResetForm action. */
  fields: string[];
  /** True means reset only listed fields; false means reset every field except the listed fields. */
  include: boolean;
}

export interface FormField {
  name: string;
  type: FormFieldType;
  x: number;
  y: number;
  width: number;
  height: number;
  value?: string;
  checked?: boolean;
  readOnly?: boolean;
  required?: boolean;
  multiline?: boolean;
  /** Human-visible selected choice label when it differs from the submitted value. */
  displayValue?: string;
  /** Human-visible push-button caption from Widget appearance characteristics when available. */
  caption?: string;
  /** Submitted/exported value for checkbox/radio button widgets when pdf.js exposes it. */
  exportValue?: string;
  /** Choice-field options, present when pdf.js exposes combo/list box entries. */
  options?: FormFieldChoiceOption[];
  /** True for combo boxes, false for list boxes. Present for choice fields when pdf.js exposes it. */
  combo?: boolean;
  /** True when a choice field allows selecting multiple options. */
  multiSelect?: boolean;
  /** Decoded PDF widget annotation flags, such as hidden, print, noView, or locked. */
  flags?: PageAnnotationFlag[];
  /** Widget-level JavaScript actions such as button click scripts. */
  actions?: Record<string, string[]>;
  /** Non-JavaScript ResetForm button action when pdf.js exposes it. */
  resetForm?: FormFieldResetFormAction;
  /**
   * Nearby visible text that likely labels this field, reconstructed from
   * layout lines when `--form-fields` is enabled. Stacked above/below label
   * lines and left-side checkbox/radio continuation lines can be merged into
   * one visible prompt. This helps agents map anonymous AcroForm names such
   * as `f1_01[0]` or checkbox arrays to the human-readable prompt a person
   * sees next to or above the widget.
   */
  label?: FormFieldLabel;
}
