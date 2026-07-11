import type { PageResult, PageWarning } from '../../types/index.js';

const LETTER = /\p{Letter}/u;
const MINIMUM_LETTERS = 50;
const RTL_LETTER_RATIO_THRESHOLD = 0.25;

function isStrongRtlCodePoint(codePoint: number): boolean {
  // U+0590–08FF is the contiguous run of RTL script blocks: Hebrew,
  // Arabic, Syriac, Arabic Supplement, Thaana, NKo, Samaritan, Mandaic,
  // Syriac Supplement, Arabic Extended-B/A. The presentation-forms
  // blocks and Adlam sit apart.
  return (
    (codePoint >= 0x0590 && codePoint <= 0x08ff) ||
    (codePoint >= 0xfb1d && codePoint <= 0xfdff) ||
    (codePoint >= 0xfe70 && codePoint <= 0xfeff) ||
    (codePoint >= 0x1e900 && codePoint <= 0x1e95f)
  );
}

export function detectRtlScriptText(page: PageResult, out: PageWarning[]): void {
  let letters = 0;
  let rtl = 0;

  // Count RTL only among Letter code points so the reported "% of
  // letters" stays truthful for heavily vocalized Arabic, where
  // combining diacritics live in the RTL ranges but are not letters.
  for (const character of page.text) {
    if (!LETTER.test(character)) continue;
    letters += 1;
    if (isStrongRtlCodePoint(character.codePointAt(0) as number)) rtl += 1;
  }

  if (letters < MINIMUM_LETTERS) return;
  const ratio = rtl / letters;
  if (ratio <= RTL_LETTER_RATIO_THRESHOLD) return;

  out.push({
    code: 'rtl_script_text',
    severity: 'warning',
    message: `${Math.round(ratio * 100)}% of letters are right-to-left script; extraction preserves logical order but may drop inter-word spaces or mirror paired brackets — verify against a render when exact wording matters`,
  });
}
