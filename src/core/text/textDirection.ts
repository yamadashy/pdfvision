interface PositionedText {
  text: string;
  x: number;
}

const RTL_SCRIPT_RE = /[\p{Script=Arabic}\p{Script=Hebrew}]/u;
const STRONG_LTR_SCRIPT_RE =
  /[\p{Script=Latin}\p{Script=Greek}\p{Script=Cyrillic}\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u;

export function isRtlDominantText(text: string): boolean {
  let rtl = 0;
  let ltr = 0;
  for (const char of text) {
    if (RTL_SCRIPT_RE.test(char)) rtl++;
    else if (STRONG_LTR_SCRIPT_RE.test(char)) ltr++;
  }
  return rtl > 0 && rtl >= ltr;
}

export function isRtlDominantPositionedText(items: readonly PositionedText[]): boolean {
  let rtl = 0;
  let ltr = 0;
  for (const item of items) {
    const text = item.text.trim();
    if (text.length === 0) continue;
    if (isRtlDominantText(text)) rtl++;
    else if (STRONG_LTR_SCRIPT_RE.test(text)) ltr++;
  }
  return rtl > 0 && rtl >= ltr;
}

export function textOrder<T extends PositionedText>(items: readonly T[]): T[] {
  if (!isRtlDominantPositionedText(items)) return [...items].sort((a, b) => a.x - b.x);
  return [...items].sort((a, b) => b.x - a.x);
}
