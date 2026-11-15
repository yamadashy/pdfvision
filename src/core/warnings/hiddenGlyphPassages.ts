import type { TextGlyphEvidence } from '../graphics/opaqueFillText.js';
import type { PageBox } from '../graphics/textGlyphs.js';
import { round2 } from '../processor/textUtils.js';

/** A contiguous stretch of hidden glyphs on one line, in paint order. */
export interface HiddenPassage {
  text: string;
  box: PageBox;
}

export interface GlyphRef {
  glyph: TextGlyphEvidence;
  run: number;
}

/** Shared budget for glyph-against-glyph and glyph-against-box comparisons on one page. */
export interface ComparisonBudget {
  remaining: number;
  exhausted: boolean;
}

export const MIN_PASSAGE_CHARACTERS = 3;
const MAX_LISTED_PASSAGES = 3;
const MAX_PASSAGE_SAMPLE = 60;
/** Core boxes further apart than this many ems belong to different words-in-sequence or lines. */
const MAX_CONTINUATION_GAP_EM = 0.6;
const WORD_GAP_EM = 0.3;
const MIN_REPAINT_OVERLAP = 0.5;

export function createComparisonBudget(limit: number): ComparisonBudget {
  return { remaining: limit, exhausted: false };
}

export function spend(budget: ComparisonBudget, amount = 1): boolean {
  if (budget.exhausted) return false;
  budget.remaining -= amount;
  if (budget.remaining < 0) budget.exhausted = true;
  return !budget.exhausted;
}

export function flattenGlyphs(glyphRuns: ReadonlyArray<readonly TextGlyphEvidence[] | undefined>): GlyphRef[] {
  const out: GlyphRef[] = [];
  glyphRuns.forEach((run, index) => {
    for (const glyph of run ?? []) out.push({ glyph, run: index });
  });
  return out;
}

/**
 * Group hidden glyphs into passages. Whitespace never breaks a passage;
 * a visible glyph, a line change, or a gap wider than a word space does.
 * Passages with fewer than three non-whitespace characters are dropped as
 * too small to be a redaction rather than a stray mark.
 */
export function hiddenPassages(glyphs: readonly GlyphRef[], isHidden: (ref: GlyphRef) => boolean): HiddenPassage[] {
  const passages: HiddenPassage[] = [];
  let current: { parts: string[]; box: PageBox; last: TextGlyphEvidence; count: number } | undefined;
  let pendingSpace = false;
  const close = (): void => {
    if (current && current.count >= MIN_PASSAGE_CHARACTERS) {
      passages.push({ text: current.parts.join('').trim(), box: current.box });
    }
    current = undefined;
    pendingSpace = false;
  };

  for (const ref of glyphs) {
    const { glyph } = ref;
    if (glyph.whitespace) {
      if (current) pendingSpace = true;
      continue;
    }
    if (!isHidden(ref)) {
      close();
      continue;
    }
    const em = Math.max(glyph.em, current?.last.em ?? 0, 0.01);
    const gap = current ? boxGap(current.last.core, glyph.core) : 0;
    if (current && gap > MAX_CONTINUATION_GAP_EM * em) close();
    if (!current) {
      current = { parts: [], box: { ...glyph.box }, last: glyph, count: 0 };
    } else {
      if (pendingSpace || gap > WORD_GAP_EM * em) current.parts.push(' ');
      current.box = union(current.box, glyph.box);
    }
    current.parts.push(glyph.text);
    current.count += [...glyph.text].length;
    current.last = glyph;
    pendingSpace = false;
  }
  close();
  return passages;
}

/**
 * True when a glyph from `laterGlyphs` sits on top of `glyph` — text
 * repainted over a box or over its own background copy is what a reader
 * sees, so the glyph underneath is not hidden content.
 */
export function isRepaintedOver(
  glyph: TextGlyphEvidence,
  glyphs: readonly GlyphRef[],
  laterStart: number,
  budget: ComparisonBudget,
  ignore?: (ref: GlyphRef) => boolean,
): boolean {
  const area = glyph.core.width * glyph.core.height;
  if (!(area > 0)) return false;
  for (let i = laterStart; i < glyphs.length; i++) {
    const ref = glyphs[i];
    if (!spend(budget)) return false;
    if (ref.glyph.whitespace || ignore?.(ref)) continue;
    if (overlapArea(glyph.core, ref.glyph.core) / area >= MIN_REPAINT_OVERLAP) return true;
  }
  return false;
}

/** Index of the first glyph painted in a run at or after `run`, or `glyphs.length`. */
export function firstGlyphAtOrAfterRun(glyphs: readonly GlyphRef[], run: number): number {
  let low = 0;
  let high = glyphs.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (glyphs[middle].run < run) low = middle + 1;
    else high = middle;
  }
  return low;
}

export function isOnPage(box: PageBox, pageWidth: number, pageHeight: number): boolean {
  return box.x < pageWidth && box.x + box.width > 0 && box.y < pageHeight && box.y + box.height > 0;
}

export function coverage(target: PageBox, cover: PageBox): number {
  const area = target.width * target.height;
  return area > 0 ? overlapArea(target, cover) / area : 0;
}

export function overlapArea(a: PageBox, b: PageBox): number {
  const width = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const height = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return width > 0 && height > 0 ? width * height : 0;
}

/** `"text" (bbox x,y,w,h)` for up to three passages, in raw page units for --render-region. */
export function describePassages(passages: readonly HiddenPassage[], userUnit: number | undefined): string {
  const toRaw = 1 / (userUnit ?? 1);
  const region = (box: PageBox): string =>
    [box.x, box.y, box.width, box.height].map((n) => round2(n * toRaw)).join(',');
  const listed = passages
    .slice(0, MAX_LISTED_PASSAGES)
    .map((passage) => `${JSON.stringify(sample(passage.text))} (bbox ${region(passage.box)})`);
  const more = passages.length - listed.length;
  if (more <= 0) return listed.join('; ');
  const all = passages.slice(1).reduce((box, passage) => union(box, passage.box), passages[0].box);
  return `${listed.join('; ')}; and ${more} more (all ${passages.length} within bbox ${region(all)})`;
}

function sample(text: string): string {
  const normalized = text.replace(/\s+/gu, ' ').trim();
  return normalized.length > MAX_PASSAGE_SAMPLE
    ? `${normalized.slice(0, MAX_PASSAGE_SAMPLE - 3).replace(/[\uD800-\uDBFF]$/u, '')}...`
    : normalized;
}

function boxGap(a: PageBox, b: PageBox): number {
  const dx = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.width, b.x + b.width));
  const dy = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.height, b.y + b.height));
  return Math.hypot(dx, dy);
}

function union(a: PageBox, b: PageBox): PageBox {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width: Math.max(a.x + a.width, b.x + b.width) - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}
