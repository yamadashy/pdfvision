const PREPRESS_TYPESET_PATTERN = /\bDRAFT\b.*\bTYPESET:/iu;
const PREPRESS_REVISION_TOKEN = String.raw`\d{1,2}\/\d{1,2}\/\d{2,4}_?r\d+`;
const PREPRESS_REVISION_TIMESTAMP_PATTERN = new RegExp(
  String.raw`^\s*${PREPRESS_REVISION_TOKEN}\s+\d{1,2}:\d{2}\s*(?:am|pm)\s*$`,
  'iu',
);
const PREPRESS_REVISION_NOTE_PATTERN = new RegExp(
  String.raw`^\s*${PREPRESS_REVISION_TOKEN}\s+[\p{L}\p{N}#'’.,:/_ -]{1,120}\s+\d{1,2}:\d{2}\s*(?:am|pm)\s*$`,
  'iu',
);
const PREPRESS_REVISION_SLUG_PATTERN = new RegExp(
  String.raw`^\s*REV\.\s*${PREPRESS_REVISION_TOKEN}\s+v\.\s+\d{2,4}_[A-Z]{1,5}_[\p{L}\p{N}][\p{L}\p{N}_ -]*_\d{1,3}\s*$`,
  'iu',
);
const PREPRESS_REVISION_PREFIX_PATTERN = new RegExp(String.raw`^\s*REV\.\s*${PREPRESS_REVISION_TOKEN}\s*$`, 'iu');
const PREPRESS_REVISION_VERSION_SLUG_PATTERN =
  /^\s*v\.\s+\d{2,4}_[A-Z]{1,5}_[\p{L}\p{N}][\p{L}\p{N}_ -]*_\d{1,3}\s*$/iu;
const PREPRESS_SLUG_PATTERN = /^\s*\d{2,4}_[A-Z]{1,5}_[\p{L}\p{N}][\p{L}\p{N}_ -]*_\d{1,3}\s*$/u;
const PREPRESS_MOVED_FOOTNOTES_PATTERN = /^\s*\*+\s*footnotes?\b.*\bmoved\s+to\s+back\s+page\b/iu;

export function isLikelyPrepressProductionText(text: string): boolean {
  const normalized = text.trim();
  if (normalized.length === 0) return false;
  return (
    PREPRESS_TYPESET_PATTERN.test(normalized) ||
    PREPRESS_REVISION_TIMESTAMP_PATTERN.test(normalized) ||
    PREPRESS_REVISION_NOTE_PATTERN.test(normalized) ||
    PREPRESS_REVISION_SLUG_PATTERN.test(normalized) ||
    PREPRESS_REVISION_PREFIX_PATTERN.test(normalized) ||
    PREPRESS_REVISION_VERSION_SLUG_PATTERN.test(normalized) ||
    PREPRESS_SLUG_PATTERN.test(normalized) ||
    PREPRESS_MOVED_FOOTNOTES_PATTERN.test(normalized)
  );
}
