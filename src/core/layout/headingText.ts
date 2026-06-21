const CAPTION_IDENTIFIER_ATOM = '[A-Za-z\\p{N}０-９一二三四五六七八九十]+';
const CAPTION_NUMBER_PATTERN = `${CAPTION_IDENTIFIER_ATOM}(?:(?:[.-]${CAPTION_IDENTIFIER_ATOM})|(?:-?\\(${CAPTION_IDENTIFIER_ATOM}\\)))*\\.?`;
const CAPTION_HEADING_PATTERN = new RegExp(
  `^\\s*(?:fig(?:ure)?\\.?|table|plate|図表|図|表)\\s*(${CAPTION_NUMBER_PATTERN})(?=\\s|[:：．、]|$)`,
  'iu',
);

export function isHeadingCandidateText(text: string): boolean {
  const trimmed = text.trim();
  if (!/[\p{L}\p{N}]/u.test(trimmed)) return false;
  if (/^[\p{N}\s.-]{1,12}$/u.test(trimmed)) return false;
  if (/^@[A-Za-z0-9_.-]{2,}$/u.test(trimmed)) return false;
  if (isReferenceMetadataText(trimmed)) return false;
  if (isCaptionHeadingText(trimmed)) return false;
  return !/^[•●◦▪■‣]\s*/u.test(trimmed);
}

export function isNumberedHeadingText(text: string): boolean {
  return /^\s*\d+(?:\.\d+)*\.?\s+\S/u.test(text);
}

export function isDecimalSectionHeadingText(text: string): boolean {
  return /^\s*\d+(?:\.\d+)+\.?\s+\p{L}/u.test(text.trim());
}

export function isLetteredSectionHeadingText(text: string): boolean {
  const trimmed = text.trim();
  if (!/^[A-Z]\.\s+\p{Lu}/u.test(trimmed)) return false;
  if (!/[.!?]$/u.test(trimmed)) return false;
  return trimmed.split(/\s+/u).filter(Boolean).length >= 3;
}

export function isLikelyBodyFragmentForLevel3(text: string): boolean {
  if (isLikelyBodySentenceFragment(text)) return true;
  const trimmed = text.trim();
  if (isNumberedHeadingText(trimmed)) return false;
  if (/[,;:]/u.test(trimmed)) return true;
  return trimmed.split(/\s+/u).filter(Boolean).length > 7;
}

export function isLikelyBodySentenceFragment(text: string): boolean {
  const trimmed = text.trim();
  if (isNumberedHeadingText(trimmed) || isLetteredSectionHeadingText(trimmed)) return false;
  if (/^\p{Ll}/u.test(trimmed)) return true;
  if (/\bet al\./iu.test(trimmed)) return true;
  if (/[\p{L}\p{N}]-$/u.test(trimmed)) return true;
  if (/[.!?。！？]$/u.test(trimmed)) return true;
  const cjkChars = trimmed.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu)?.length ?? 0;
  if (/[,;、。，；]/u.test(trimmed) && (trimmed.length > 24 || cjkChars >= 12)) return true;
  return trimmed.split(/\s+/u).filter(Boolean).length > 16;
}

function isCaptionHeadingText(text: string): boolean {
  return CAPTION_HEADING_PATTERN.test(text);
}

function isReferenceMetadataText(text: string): boolean {
  return (
    /\b(?:https?:\/\/|www\.|doi:|arxiv:)/iu.test(text) ||
    /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu.test(text) ||
    /\bOMB\s+No\.?\s+\d/iu.test(text)
  );
}
