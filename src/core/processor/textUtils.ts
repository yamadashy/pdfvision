/**
 * Apply Unicode NFKC normalization. PDFs commonly embed compatibility
 * codepoints (e.g. CJK Compatibility Forms `⽬` U+2F6C, halfwidth/fullwidth
 * variants, ligatures `ﬁ`) that break grep / diff / structured extraction
 * for downstream agents. NFKC folds them to the canonical form.
 */
export function normalizeText(s: string): string {
  return s.normalize('NFKC');
}

/** Round to 2 decimal places — keeps span coordinates compact in JSON. */
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function textItemDedupeKey(
  text: string,
  width: number,
  height: number,
  transform: readonly number[] | undefined,
  fontName: unknown,
): string {
  const geometry = transform ? transform.map((value) => Math.round(value * 1000) / 1000).join(',') : 'no-transform';
  const font = typeof fontName === 'string' ? fontName : '';
  return JSON.stringify([text, round3(width), round3(height), geometry, font]);
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
