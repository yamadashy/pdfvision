import type { FormFieldLabel, FormFieldLabelRelation } from '../../types/index.js';

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
