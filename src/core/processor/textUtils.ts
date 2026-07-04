interface LineSegment {
  content: string;
  ending: string;
}

/**
 * Apply Unicode NFKC normalization and remove non-visible C0 control
 * characters from the LLM-facing text. PDFs commonly embed compatibility
 * codepoints (e.g. CJK Compatibility Forms `⽬` U+2F6C, halfwidth/fullwidth
 * variants, ligatures `ﬁ`) that break grep / diff / structured extraction
 * for downstream agents. NFKC folds them to the canonical form.
 *
 * TAB, LF, and CR are preserved because pdf.js uses them as visible text
 * separators. Other C0 controls are stripped, and control-only lines are
 * removed so they do not become stray blank lines.
 */
export function normalizeText(s: string): string {
  return stripC0ControlsAndCollapseEmptyLines(normalizeTextForNonPrintableStats(s));
}

export function normalizeTextForNonPrintableStats(s: string): string {
  return s.normalize('NFKC');
}

function stripC0ControlsAndCollapseEmptyLines(text: string): string {
  if (!hasStrippableC0Control(text)) return text;

  const output: LineSegment[] = [];
  let removedControlOnlyLine = false;

  for (const line of splitLines(text)) {
    const strippedContent = stripStrippableC0Controls(line.content);
    const lineBecameEmpty = strippedContent.length === 0 && strippedContent.length !== line.content.length;
    if (lineBecameEmpty) {
      removedControlOnlyLine = true;
      continue;
    }
    if (removedControlOnlyLine && strippedContent.length === 0) continue;

    output.push({ content: strippedContent, ending: line.ending });
    removedControlOnlyLine = false;
  }

  if (removedControlOnlyLine && output.length > 0) {
    output[output.length - 1].ending = '';
  }

  return output.map((line) => `${line.content}${line.ending}`).join('');
}

function hasStrippableC0Control(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    if (isStrippableC0Control(text.charCodeAt(i))) return true;
  }
  return false;
}

function stripStrippableC0Controls(text: string): string {
  let output = '';
  let chunkStart = 0;

  for (let i = 0; i < text.length; i++) {
    if (!isStrippableC0Control(text.charCodeAt(i))) continue;
    output += text.slice(chunkStart, i);
    chunkStart = i + 1;
  }

  return chunkStart === 0 ? text : output + text.slice(chunkStart);
}

function isStrippableC0Control(codeUnit: number): boolean {
  return codeUnit < 0x20 && codeUnit !== 0x09 && codeUnit !== 0x0a && codeUnit !== 0x0d;
}

function splitLines(text: string): LineSegment[] {
  const lines: LineSegment[] = [];
  let lineStart = 0;

  for (let i = 0; i < text.length; ) {
    const cp = text.charCodeAt(i);
    if (cp !== 0x0a && cp !== 0x0d) {
      i++;
      continue;
    }

    const content = text.slice(lineStart, i);
    if (cp === 0x0d && text.charCodeAt(i + 1) === 0x0a) {
      lines.push({ content, ending: '\r\n' });
      i += 2;
    } else {
      lines.push({ content, ending: text[i] });
      i++;
    }
    lineStart = i;
  }

  if (lineStart < text.length) {
    lines.push({ content: text.slice(lineStart), ending: '' });
  }

  return lines;
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
