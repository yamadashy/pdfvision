import type { FormFieldLabel } from '../../types/index.js';
import { isCompactFieldMarker, normalizeLabelText } from './text.js';
import type { LabelCandidate } from './types.js';

export function chooseCurrencyAwareLabel(
  candidate: LabelCandidate,
  markerPromptLabel: FormFieldLabel | undefined,
  currencyPrompt: FormFieldLabel,
): FormFieldLabel {
  if (!markerPromptLabel || candidate.relation !== 'left' || !isCompactFieldMarker(candidate.text)) {
    return currencyPrompt;
  }
  const markerTokens = informativeTokenCount(markerPromptLabel.text);
  const currencyTokens = informativeTokenCount(currencyPrompt.text);
  return markerTokens >= Math.max(4, currencyTokens + 2) ? markerPromptLabel : currencyPrompt;
}

function informativeTokenCount(text: string): number {
  const tokens = normalizeLabelText(text).match(/[\p{Letter}\p{Number}]+(?:['’][\p{Letter}\p{Number}]+)?/gu);
  return tokens?.filter((token) => !/^\d+(?:\([a-z]\)|[a-z])?$/iu.test(token)).length ?? 0;
}
