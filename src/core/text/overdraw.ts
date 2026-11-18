import { codePointLength, isRawTextItem, type RawTextItem, uprightGeometry, withTextAndExtent } from './textItems.js';

/**
 * Collapse text that is drawn several times at almost the same position.
 *
 * Office-era producers fake bold by painting a run two to five times with
 * sub-point offsets. The page shows one bold run; pdf.js returns every copy,
 * and because it merges the last copy of one run with the first copy of the
 * next (they abut once the offsets are undone), the copies do not even come
 * back as identical items: `2`,`2`,`2`,`2`,`20`,`0`,`0`,`0`,`02`, … for
 * `2027`. Exact-position duplicates are already dropped by the page-text
 * dedupe key; this pass handles the offset copies.
 *
 * A copy is the same text, in the same font and size, on the same baseline,
 * starting (or ending) within a fraction of a glyph of a run already kept.
 * Two distinct runs of real text cannot sit that close: they would overprint
 * each other. When an item begins (or ends) with a copy of a kept run, the
 * copy is cut off and the rest is checked again, which is how a merged
 * `20` resolves to a duplicate `2` and a new `0`.
 */

// Offsets of fake-bold copies are a few hundredths of an em; a glyph-sized
// shift is a different glyph position. Both bounds apply.
const MAX_OFFSET_EM = 0.12;
const MAX_OFFSET_GLYPH_FRACTION = 0.35;
const MAX_BASELINE_SHIFT_EM = 0.12;
// Copies are painted back to back; looking further back than this only costs time.
const RECENT_RUNS_PER_FONT = 64;

interface KeptRun {
  text: string;
  /** Left edge of `text`; undefined when only the right edge is known. */
  left: number | undefined;
  /** Right edge of `text`; undefined when only the left edge is known. */
  right: number | undefined;
  baseline: number;
  fontSize: number;
  glyphWidth: number;
}

interface Piece {
  text: string;
  left: number;
  right: number;
}

export function collapseOverdrawnText(items: readonly unknown[]): unknown[] {
  const recent = new Map<string, KeptRun[]>();
  const out: unknown[] = [];
  let changed = false;
  let lastTextIndex = -1;

  for (const item of items) {
    const geometry = isRawTextItem(item) ? uprightGeometry(item) : undefined;
    if (!isRawTextItem(item) || !geometry || item.str.trim().length === 0) {
      out.push(item);
      if (isRawTextItem(item) && item.str.length > 0) lastTextIndex = out.length - 1;
      continue;
    }
    const key = `${String(item.fontName)}|${Math.round(geometry.fontSize * 100)}`;
    let runs = recent.get(key);
    if (!runs) {
      runs = [];
      recent.set(key, runs);
    }

    const pieces = uncoveredPieces(
      { text: item.str, left: geometry.left, right: geometry.right },
      geometry.baseline,
      geometry.fontSize,
      runs,
    );
    if (pieces.length === 1 && pieces[0].text === item.str) {
      out.push(item);
      lastTextIndex = out.length - 1;
      remember(runs, pieces[0], geometry.baseline, geometry.fontSize);
      continue;
    }

    changed = true;
    if (pieces.length === 0) {
      // A dropped copy that ended a line hands the line break to the run it copied.
      if (item.hasEOL && lastTextIndex >= 0)
        out[lastTextIndex] = { ...(out[lastTextIndex] as RawTextItem), hasEOL: true };
      continue;
    }
    for (const piece of pieces) {
      const isLast = piece === pieces[pieces.length - 1];
      out.push({ ...withTextAndExtent(item, piece.text, piece.left, piece.right), hasEOL: isLast && !!item.hasEOL });
      lastTextIndex = out.length - 1;
      remember(runs, piece, geometry.baseline, geometry.fontSize);
    }
  }
  return changed ? out : [...items];
}

/** The parts of `piece` that are not a copy of a recently kept run. */
function uncoveredPieces(piece: Piece, baseline: number, fontSize: number, runs: KeptRun[]): Piece[] {
  let current: Piece | undefined = piece;
  // Each step removes at least one character, so this terminates.
  for (let guard = 0; current && guard < 64; guard++) {
    const next = trimCopy(current, baseline, fontSize, runs);
    if (next === current) return [current];
    current = next;
  }
  return current ? [current] : [];
}

/**
 * Remove one leading or trailing copy of a kept run from `piece`. Returns
 * the same object when nothing was removed and undefined when the whole
 * piece was a copy.
 */
function trimCopy(piece: Piece, baseline: number, fontSize: number, runs: readonly KeptRun[]): Piece | undefined {
  const leadingSpace = piece.text.length - piece.text.trimStart().length;
  const trailingSpace = piece.text.length - piece.text.trimEnd().length;
  const core = piece.text.trim();
  if (core.length === 0) return undefined;
  const coreLeft = leadingSpace === 0 ? piece.left : undefined;
  const coreRight = trailingSpace === 0 ? piece.right : undefined;
  const glyphWidth = (piece.right - piece.left) / Math.max(codePointLength(piece.text), 1);

  for (let i = runs.length - 1; i >= 0; i--) {
    const run = runs[i];
    if (Math.abs(run.baseline - baseline) > MAX_BASELINE_SHIFT_EM * fontSize) continue;
    const tolerance = Math.min(
      MAX_OFFSET_EM * fontSize,
      MAX_OFFSET_GLYPH_FRACTION * Math.min(run.glyphWidth, glyphWidth),
    );
    const leftAligned = coreLeft !== undefined && run.left !== undefined && Math.abs(coreLeft - run.left) <= tolerance;
    const rightAligned =
      coreRight !== undefined && run.right !== undefined && Math.abs(coreRight - run.right) <= tolerance;
    if (!leftAligned && !rightAligned) continue;

    if (core === run.text || (leftAligned && run.text.startsWith(core)) || (rightAligned && run.text.endsWith(core))) {
      // Whole piece already drawn. Learn the edge the kept run was missing.
      if (run.left === undefined && coreLeft !== undefined && core === run.text) run.left = coreLeft;
      if (run.right === undefined && coreRight !== undefined && core === run.text) run.right = coreRight;
      return undefined;
    }
    const runWidth = run.left !== undefined && run.right !== undefined ? run.right - run.left : undefined;
    if (leftAligned && core.startsWith(run.text) && runWidth !== undefined && coreLeft !== undefined) {
      const rest = piece.text.slice(leadingSpace + run.text.length);
      return { text: rest, left: coreLeft + runWidth, right: piece.right };
    }
    if (rightAligned && core.endsWith(run.text) && runWidth !== undefined && coreRight !== undefined) {
      const rest = piece.text.slice(0, piece.text.length - trailingSpace - run.text.length);
      return { text: rest, left: piece.left, right: coreRight - runWidth };
    }
  }
  return piece;
}

function remember(runs: KeptRun[], piece: Piece, baseline: number, fontSize: number): void {
  const text = piece.text.trim();
  if (text.length === 0) return;
  const leading = piece.text.length - piece.text.trimStart().length;
  const trailing = piece.text.length - piece.text.trimEnd().length;
  runs.push({
    text,
    left: leading === 0 ? piece.left : undefined,
    right: trailing === 0 ? piece.right : undefined,
    baseline,
    fontSize,
    glyphWidth: (piece.right - piece.left) / Math.max(codePointLength(piece.text), 1),
  });
  if (runs.length > RECENT_RUNS_PER_FONT) runs.shift();
}
