export interface LabelLine {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BoxLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

const LINK_TEXT_MAX_CHARS = 240;
const LINK_CLIPPED_TEXT_MAX_WIDTH_RATIO = 3;
const LINK_CLIPPED_TEXT_MAX_EXTRA_WIDTH_PT = 12;

export function linkText(link: BoxLike, lines: readonly LabelLine[]): string | undefined {
  const parts = lines
    .filter((line) => line.text.trim().length > 0)
    .filter((line) => isLineCoveredByLink(line, link))
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((line) => line.text.trim());
  const text = normalizeLinkText(parts);
  if (text.length > 0) return truncateLinkText(text);

  const clippedText = normalizeLinkText(
    lines
      .map((line) => clippedLineText(line, link))
      .filter((part): part is LabelLine => part !== undefined)
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .map((part) => part.text),
  );
  return clippedText.length > 0 ? truncateLinkText(clippedText) : undefined;
}

function truncateLinkText(text: string): string {
  const chars = Array.from(text);
  if (chars.length <= LINK_TEXT_MAX_CHARS) return text;
  return `${chars.slice(0, LINK_TEXT_MAX_CHARS - 3).join('')}...`;
}

function normalizeLinkText(parts: readonly string[]): string {
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function isLineCoveredByLink(line: LabelLine, link: BoxLike): boolean {
  const centerY = line.y + line.height / 2;
  return (
    line.x >= link.x - 2 &&
    line.x + line.width <= link.x + link.width + 2 &&
    centerY >= link.y - 2 &&
    centerY <= link.y + link.height + 2
  );
}

function clippedLineText(line: LabelLine, link: BoxLike): (LabelLine & { text: string }) | undefined {
  const text = line.text.trim();
  if (text.length === 0 || line.width <= 0 || line.height <= 0) return undefined;
  const verticalOverlap = intersectionHeight(line, link) / Math.max(0.001, Math.min(line.height, link.height));
  if (verticalOverlap < 0.45) return undefined;
  const horizontalOverlap = intersectionWidth(line, link) / Math.max(0.001, Math.min(line.width, link.width));
  if (horizontalOverlap < 0.45) return undefined;

  const clipped = clippedTextByHorizontalPosition(line.text, link, line);
  if (!clipped) return undefined;
  return { ...line, text: clipped };
}

function clippedTextByHorizontalPosition(text: string, link: BoxLike, line: BoxLike): string | undefined {
  const chars = Array.from(text);
  if (chars.length === 0) return undefined;

  const startRatio = clamp((link.x - line.x) / line.width, 0, 1);
  const endRatio = clamp((link.x + link.width - line.x) / line.width, 0, 1);
  let start = Math.min(chars.length - 1, Math.max(0, Math.floor(startRatio * chars.length)));
  let end = Math.min(chars.length, Math.max(start + 1, Math.ceil(endRatio * chars.length)));

  if (startsInsideWord(chars, start)) start = expandTokenStart(chars, start);
  if (endsInsideWord(chars, end)) end = expandTokenEnd(chars, end);

  let clipped = cleanClippedTextFragment(chars.slice(start, end).join(''));
  if (isUsefulClippedText(clipped, link, estimatedSliceWidth(chars, line, start, end))) return clipped;

  const center = Math.min(chars.length - 1, Math.max(0, Math.floor(((startRatio + endRatio) / 2) * chars.length)));
  start = startsInsideWord(chars, center) ? expandTokenStart(chars, center) : center;
  end = endsInsideWord(chars, center + 1) ? expandTokenEnd(chars, center + 1) : center + 1;
  clipped = cleanClippedTextFragment(chars.slice(start, end).join(''));
  return isUsefulClippedText(clipped, link, estimatedSliceWidth(chars, line, start, end)) ? clipped : undefined;
}

function expandTokenStart(chars: readonly string[], start: number): number {
  let out = start;
  while (out > 0 && out < chars.length && !isWhitespace(chars[out]) && !isWhitespace(chars[out - 1])) out--;
  return out;
}

function expandTokenEnd(chars: readonly string[], end: number): number {
  let out = end;
  while (out < chars.length && out > 0 && !isWhitespace(chars[out - 1]) && !isWhitespace(chars[out])) out++;
  return out;
}

function isWhitespace(value: string): boolean {
  return /\s/u.test(value);
}

function startsInsideWord(chars: readonly string[], start: number): boolean {
  return start > 0 && start < chars.length && isWordCharacter(chars[start - 1]) && isWordCharacter(chars[start]);
}

function endsInsideWord(chars: readonly string[], end: number): boolean {
  return end > 0 && end < chars.length && isWordCharacter(chars[end - 1]) && isWordCharacter(chars[end]);
}

function isWordCharacter(value: string): boolean {
  return /[\p{Letter}\p{Number}]/u.test(value);
}

function cleanClippedTextFragment(text: string): string {
  return text.replace(/^[\s,.;:)\]}]+/u, '').trim();
}

function isUsefulClippedText(text: string, link: BoxLike, estimatedWidth: number): boolean {
  if (
    estimatedWidth >
    Math.max(link.width * LINK_CLIPPED_TEXT_MAX_WIDTH_RATIO, link.width + LINK_CLIPPED_TEXT_MAX_EXTRA_WIDTH_PT)
  ) {
    return false;
  }
  const wordChars = Array.from(text).filter(isWordCharacter);
  if (wordChars.length >= 2) return true;
  if (/^\d+[.)]?$/u.test(text)) return true;
  return wordChars.length === 1 && link.width >= 10;
}

function estimatedSliceWidth(chars: readonly string[], line: BoxLike, start: number, end: number): number {
  return (line.width * Math.max(0, end - start)) / Math.max(1, chars.length);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function intersectionWidth(a: BoxLike, b: BoxLike): number {
  return Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
}

function intersectionHeight(a: BoxLike, b: BoxLike): number {
  return Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
}
