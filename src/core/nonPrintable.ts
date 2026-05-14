/**
 * Detect text that looks like raw glyph indices rather than real characters.
 *
 * pdf.js falls back to emitting raw font glyph indices (often starting at
 * U+0000, U+0001, ...) when a PDF's font has no ToUnicode CMap and no
 * recognisable encoding — common with Hebrew / older CJK PDFs, scientific
 * PDFs with custom symbol fonts, and PDFs that omit font embedding. The
 * resulting `text` reads as 100%-coverage from the density heuristic
 * (because the glyph positions are all there) but every code point is a
 * NUL / control byte.
 *
 * `nonPrintableRatio` exposes this directly: ratio of non-printable code
 * points to total code points in the page text. Empty strings produce 0.
 * `>= 0.05` is a strong signal that the extracted text is unusable as
 * native text; agents should fall back to `--render` or `--ocr`.
 *
 * What counts as non-printable (deliberately narrow — we want a clean
 * "raw bytes" signal, not a "weird text" signal):
 *   - C0 controls (U+0000..U+001F) except TAB / LF / CR
 *   - DEL (U+007F)
 *   - C1 controls (U+0080..U+009F)
 *   - Unpaired surrogate code points (U+D800..U+DFFF observed standalone)
 *   - Unicode noncharacters (U+FDD0..U+FDEF and any U+xxFFFE / U+xxFFFF)
 *
 * What does NOT count, even though some are "weird":
 *   - Private Use Area (U+E000..U+F8FF and the two PUA supplementary planes).
 *     Math / dingbats / icon fonts legitimately use PUA for printable glyphs.
 *   - Format controls Cf (ZWJ, ZWNJ, variation selectors, bidi marks).
 *   - Combining marks (Mn, Mc, Me).
 *   - Replacement character U+FFFD. A separate signal could measure this if
 *     we want, but mixing it in here would dilute the "raw bytes" signal.
 */

function isNonPrintableCodePoint(cp: number): boolean {
  // C0 controls except TAB / LF / CR — those three are legitimately used
  // by pdf.js for line / paragraph breaks and have to stay printable.
  if (cp < 0x20) return cp !== 0x09 && cp !== 0x0a && cp !== 0x0d;
  if (cp === 0x7f) return true;
  if (cp >= 0x80 && cp <= 0x9f) return true;
  // Unpaired surrogates: `for..of` over a JS string emits these as standalone
  // code points when no high/low partner is present. Well-formed UTF-16 with
  // matched pairs never reaches this branch (the pair is yielded as a single
  // supplementary-plane code point instead).
  if (cp >= 0xd800 && cp <= 0xdfff) return true;
  // Arabic-block noncharacters carved out by the Unicode standard.
  if (cp >= 0xfdd0 && cp <= 0xfdef) return true;
  // The last two code points of every plane (U+FFFE, U+FFFF, U+1FFFE, ...).
  if ((cp & 0xfffe) === 0xfffe) return true;
  return false;
}

/**
 * Compute the non-printable ratio for a string, iterating by Unicode code
 * point (not UTF-16 code unit). Returns a value in [0, 1] rounded to 3dp,
 * matching `textCoverage`'s rounding so the two signals compare like-for-like.
 */
export function nonPrintableRatio(text: string): number {
  if (text.length === 0) return 0;
  let total = 0;
  let bad = 0;
  for (const ch of text) {
    total++;
    if (isNonPrintableCodePoint(ch.codePointAt(0) as number)) bad++;
  }
  if (total === 0) return 0;
  return Math.round((bad / total) * 1000) / 1000;
}
