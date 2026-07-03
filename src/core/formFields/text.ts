import type { FormField } from '../../types/index.js';
import {
  FIELD_NAME_STOP_WORDS,
  FIELD_NAME_TOKEN_MIN_CHARS,
  LABEL_MAX_CHARS,
  MIN_SEMANTIC_FIELD_NAME_TOKENS,
  STRONG_SINGLE_FIELD_NAME_TOKENS,
} from './constants.js';

export function isChoiceLikeField(field: FormField): boolean {
  return field.type === 'checkbox' || field.type === 'radio' || field.type === 'button';
}

export function normalizeLabelText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function normalizePromptLabelText(text: string): string {
  return text
    .replace(/(?:\s*\.\s*){2,}/g, ' ')
    .replace(/\s+([,.;:])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeChoicePromptLabelText(text: string): string {
  return normalizePromptLabelText(text.replace(/\s+\.\s*$/u, ''));
}

export function isUsableLabelText(text: string, maxChars = LABEL_MAX_CHARS): boolean {
  if (text.length === 0 || text.length > maxChars) return false;
  return /[\p{Letter}\p{Number}]/u.test(text);
}

export function isFormLabelChromeText(text: string): boolean {
  return (
    /^(?:created|revised)\s+\d{1,2}\/\d{1,2}\/\d{2,4}$/iu.test(text) ||
    /\bcat\.?\s+no\.?\s+[A-Z0-9-]+/iu.test(text) ||
    /^schedule\s+[A-Z0-9-]*\s*\(form\s+\d+/iu.test(text)
  );
}

export function isUsablePromptFragment(text: string): boolean {
  if (text.length === 0 || text.length > LABEL_MAX_CHARS) return false;
  return isDotLeaderText(text) || /[\p{Letter}\p{Number}]/u.test(text);
}

export function isDotLeaderText(text: string): boolean {
  return /^[.\s]+$/u.test(text);
}

export function isCompactFieldMarker(text: string): boolean {
  const normalized = normalizePromptLabelText(text);
  if (normalized.length > 16) return false;
  return /^(?:\d+(?:\([a-z]\)|[a-z])?|\([a-z]\))\s*\$?$/iu.test(normalized);
}

export function isBareNumericFieldMarker(text: string): boolean {
  const normalized = normalizePromptLabelText(text);
  return /^\d+\s*\$?$/u.test(normalized);
}

export function isBareLineNumberClusterText(text: string): boolean {
  const normalized = normalizePromptLabelText(text);
  return /^\d+[a-z]?(?:\s+\d+[a-z]?)+$/iu.test(normalized);
}

export function isTrailingPromptFragment(text: string): boolean {
  const normalized = normalizePromptLabelText(text);
  if (normalized.length > 60) return false;
  return /^(?:code|number|classification|name|address|date|amount|total|identifier)(?:\s*\([^)]{1,40}\))?\.?$/iu.test(
    normalized,
  );
}

export function isStandaloneInstructionReference(text: string): boolean {
  const normalized = normalizePromptLabelText(text)
    .replace(/^\((.*)\)$/u, '$1')
    .trim();
  return /^see\s+(?:inst\.?|instructions)\.?$/iu.test(normalized);
}

export function isLikelyWrappedContinuationText(text: string): boolean {
  return /^(?:[a-z]|and\b|or\b|the\b|this\b|that\b|otherwise\b)/u.test(normalizePromptLabelText(text));
}

export function isShortStandaloneFieldLabel(text: string): boolean {
  const normalized = normalizePromptLabelText(text);
  if (normalized.length === 0 || normalized.length > 60) return false;
  if (isStandaloneInstructionReference(normalized)) return false;
  if (isLikelyWrappedContinuationText(normalized) || startsWithPromptItemMarker(normalized)) return false;
  const withoutCommonAbbreviations = normalized.replace(/\b(?:no|apt)\./giu, (match) => match.slice(0, -1));
  if (/[,!?;:]/u.test(withoutCommonAbbreviations)) return false;
  if (/\.(?!\s*$)/u.test(withoutCommonAbbreviations)) return false;
  return /[\p{Letter}\p{Number}]/u.test(normalized);
}

export function isWideRowHeaderLabelText(text: string): boolean {
  return /^(?:Document Title(?:\s+\d+)?(?:\s+\(if any\))?|Issuing Authority|Document Number(?:\s+\(if any\))?|Expiration Date(?:\s+\(if any\))?)$/iu.test(
    normalizePromptLabelText(text),
  );
}

export function isFormSectionHeadingText(text: string): boolean {
  return /^(?:section|part)\s+(?:\d+|[ivxlcdm]+)\b[.:]?/iu.test(normalizePromptLabelText(text));
}

export function isExplanatoryFormParagraphStart(text: string): boolean {
  return /^(?:note|caution|warning|reminder)\s*:/iu.test(normalizePromptLabelText(text));
}

export function startsWithPromptItemMarker(text: string): boolean {
  const normalized = normalizePromptLabelText(text);
  return /^(?:\d+(?:\([a-z]\)|[a-z])?|\([a-z]\)|[a-z]\s+[A-Z])/u.test(normalized);
}

export function isSemanticFieldNameMismatch(field: FormField, labelText: string): boolean {
  if (isChoiceLikeField(field) && isLikelyWrappedContinuationText(labelText)) return false;
  if (isCompactFieldMarker(labelText) || isBareNumericFieldMarker(labelText) || isTrailingPromptFragment(labelText)) {
    return false;
  }
  const tokens = semanticFieldNameTokens(field.name);
  if (!hasEnoughSemanticFieldNameTokens(tokens)) return false;
  return !labelTextMatchesFieldNameTokens(labelText, tokens);
}

export function hasSemanticFieldNameMatch(field: FormField, labelText: string): boolean {
  const tokens = semanticFieldNameTokens(field.name);
  if (!hasEnoughSemanticFieldNameTokens(tokens)) return false;
  return labelTextMatchesFieldNameTokens(labelText, tokens);
}

export function hasEnoughSemanticFieldNameTokens(tokens: readonly string[]): boolean {
  return (
    tokens.length >= MIN_SEMANTIC_FIELD_NAME_TOKENS ||
    tokens.some((token) => STRONG_SINGLE_FIELD_NAME_TOKENS.has(token))
  );
}

export function labelTextMatchesFieldNameTokens(labelText: string, tokens: readonly string[]): boolean {
  const label = normalizePromptLabelText(labelText).toLocaleLowerCase();
  if (tokens.includes('dob') && /\b(?:mm|dd|yyyy|date)\b/iu.test(label)) return true;
  return tokens.some((token) => label.includes(token));
}

export function semanticFieldNameTokens(name: string): string[] {
  if (/[\][.]/u.test(name)) return [];
  const spaced = name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Za-z])(\d)/g, '$1 $2')
    .replace(/(\d)([A-Za-z])/g, '$1 $2');
  const seen = new Set<string>();
  const tokens: string[] = [];
  for (const raw of spaced.split(/[^\p{Letter}\p{Number}]+/u)) {
    const token = raw.toLocaleLowerCase();
    if (token.length < FIELD_NAME_TOKEN_MIN_CHARS) continue;
    if (FIELD_NAME_STOP_WORDS.has(token)) continue;
    if (/^\d+$/u.test(token)) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    tokens.push(token);
  }
  return tokens;
}

export function lengthPenalty(text: string): number {
  return Math.max(0, text.length - 80) * 0.25;
}
