import type { LayoutBlock } from '../../types/index.js';

const DOTTED_TEXTURE_MIN_DOT_MARKS = 12;
const DOTTED_TEXTURE_MIN_DOT_RATIO = 0.65;
const DOTTED_TEXTURE_MAX_ALNUM_RATIO = 0.2;

export function isDottedTextureBlock(block: LayoutBlock): boolean {
  const text = block.lines.length > 0 ? block.lines.map((line) => line.text).join('\n') : block.text;
  const chars = Array.from(text).filter((char) => !/\s/u.test(char));
  if (chars.length === 0) return false;

  let dotMarks = 0;
  let alnum = 0;
  for (const char of chars) {
    if (isDotLikeMark(char)) dotMarks++;
    if (/[\p{L}\p{N}]/u.test(char)) alnum++;
  }

  if (dotMarks < DOTTED_TEXTURE_MIN_DOT_MARKS) return false;
  if (dotMarks / chars.length < DOTTED_TEXTURE_MIN_DOT_RATIO) return false;
  return alnum / chars.length <= DOTTED_TEXTURE_MAX_ALNUM_RATIO;
}

function isDotLikeMark(char: string): boolean {
  return (
    char === '.' ||
    char === '\u00b7' ||
    char === '\u2022' ||
    char === '\u2024' ||
    char === '\u2025' ||
    char === '\u2026'
  );
}
