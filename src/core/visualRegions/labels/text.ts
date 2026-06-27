import { isLikelyPrepressProductionText } from '../../text/prepress.js';
import { normalizeAssociatedText } from '../associatedText.js';

const OCR_FRAGMENT_MIN_MEANINGFUL_RATIO = 0.45;
const PANEL_MARKER_LABEL_PATTERN = /^\([A-Za-z]\)\s+\p{L}/u;
const PAGE_HEADER_LABEL_PATTERN = /^\s*report\s+no\.?\b/iu;

export function isUsefulVisualLabelText(text: string): boolean {
  const normalized = normalizeAssociatedText(text);
  if (normalized.length === 0) return false;
  if (isLikelyPrepressProductionText(normalized)) return false;
  if (PAGE_HEADER_LABEL_PATTERN.test(normalized)) return false;
  if (/^[^\p{L}\p{N}]/u.test(normalized) && !PANEL_MARKER_LABEL_PATTERN.test(normalized)) return false;

  const nonSpaceLength = normalized.replace(/\s/gu, '').length;
  if (nonSpaceLength === 0) return false;

  const letterCount = normalized.match(/\p{L}/gu)?.length ?? 0;
  const cjkCount = normalized.match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/gu)?.length ?? 0;
  if (letterCount < 2 && cjkCount === 0) return false;

  const numberCount = normalized.match(/\p{N}/gu)?.length ?? 0;
  const meaningfulRatio = (letterCount + numberCount) / nonSpaceLength;
  return meaningfulRatio >= OCR_FRAGMENT_MIN_MEANINGFUL_RATIO;
}
