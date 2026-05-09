import type { LayoutBlock, LayoutLine, PageLayout, PageResult, TextSpan } from '../types/index.js';

interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Round to 2dp — keeps coordinates compact in JSON. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Bounding box that encloses every item in `items`. Each item just needs
 * x / y / width / height — works for spans (line clustering) and lines
 * (block clustering) alike. Returns rounded coords ready for the public shape.
 */
function unionBox(items: readonly BBox[]): BBox {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const item of items) {
    if (item.x < minX) minX = item.x;
    if (item.y < minY) minY = item.y;
    if (item.x + item.width > maxX) maxX = item.x + item.width;
    if (item.y + item.height > maxY) maxY = item.y + item.height;
  }
  return {
    x: round2(minX),
    y: round2(minY),
    width: round2(maxX - minX),
    height: round2(maxY - minY),
  };
}

/** Most common value in `nums` — used for the dominant font size of a line. */
function mode(nums: number[]): number {
  const counts = new Map<number, number>();
  let best = nums[0];
  let bestCount = 0;
  for (const n of nums) {
    const c = (counts.get(n) ?? 0) + 1;
    counts.set(n, c);
    if (c > bestCount) {
      best = n;
      bestCount = c;
    }
  }
  return best;
}

/**
 * Median of `values`. Returns 0 for an empty array (caller should guard).
 */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Join the spans of a single layout line into a readable string. pdfjs
 * emits whitespace as separate items (already filtered upstream) but for
 * CJK it also splits adjacent characters into per-glyph spans. A naive
 * ' ' join produces `背景・ 目 的` for what is really `背景・目的`. Use
 * the visual gap between consecutive spans as a proxy: if it's at least
 * a quarter of the font size we treat them as different words and insert
 * a single space, otherwise we concatenate.
 */
function joinLineSpans(xSorted: TextSpan[]): string {
  if (xSorted.length === 0) return '';
  let out = xSorted[0].text;
  for (let i = 1; i < xSorted.length; i++) {
    const prev = xSorted[i - 1];
    const cur = xSorted[i];
    const gap = cur.x - (prev.x + prev.width);
    const threshold = cur.fontSize * 0.25;
    out += gap > threshold ? ` ${cur.text}` : cur.text;
  }
  return out;
}

/**
 * Classify each block as `heading` or `body` (default) based on its
 * dominant font size relative to the page's body fontSize.
 *
 * The page-body fontSize is the median of every line's fontSize, weighted
 * by the line's character count so a short 24pt heading doesn't drag the
 * median up against a 12pt body. A block becomes a heading when its first
 * line is at least 1.25× the body fontSize — large enough that real
 * heading hierarchies (H1/H2/H3 typically span 1.4×/1.25×/1.1×) are
 * caught while accidental size jitter (tab stops, sub/superscripts) is
 * not. The threshold is documented here rather than passed in because
 * tuning is a downstream concern — agents that want a different cutoff
 * can compute their own from `block.lines[0].fontSize`.
 */
function classifyHeadings(blocks: LayoutBlock[]): void {
  const charWeighted: number[] = [];
  for (const b of blocks) {
    for (const line of b.lines) {
      const weight = Math.max(line.text.length, 1);
      for (let i = 0; i < weight; i++) charWeighted.push(line.fontSize);
    }
  }
  if (charWeighted.length === 0) return;
  const bodyFontSize = median(charWeighted);
  if (bodyFontSize <= 0) return;
  for (const b of blocks) {
    const repFont = b.lines[0]?.fontSize ?? bodyFontSize;
    if (repFont >= bodyFontSize * 1.25) {
      b.role = 'heading';
    }
  }
}

/**
 * Detect a multi-column layout and reorder blocks into reading order.
 *
 * A naive top-down sort interleaves columns: line 1 of the left column,
 * then line 1 of the right column, then line 2 of the left, etc. — which
 * is unreadable for any agent that doesn't already know the page is
 * multi-column. Re-ordering by (column, y) preserves the intended flow.
 *
 * Detection is intentionally conservative — false-positive columns are
 * worse than missing them, since they scramble single-column documents:
 *
 *   1. Treat blocks wider than 60% of the page as `spanning` (likely
 *      page-spanning headings, footers). They keep their position in the
 *      y-ordered output and act as group separators.
 *   2. Cluster the remaining `narrow` blocks (including headings) by
 *      their left-edge x. Two blocks share a column when their x's are
 *      within 5% of the page width of each other.
 *   3. Promote standalone headings (a heading block with no parallel
 *      block in another column at a similar y) to spanning separators.
 *      This catches both shapes that would otherwise misorder a real
 *      page: a left-aligned section heading that joined the left
 *      column, and a centered heading that opened its own one-block
 *      cluster between the two real columns. Parallel-heading layouts
 *      (one heading per column at the same y) keep their column
 *      membership so the body underneath each heading reads with that
 *      column, not as a single "all headings then all bodies" flush.
 *   4. Reject if (after pruning promoted headings) there's only one
 *      surviving column, or any surviving column has < 2 blocks — a
 *      lone block sitting at a different x is just an indent, not a
 *      column.
 *   5. Walk the y-ordered blocks; whenever a run of narrow column
 *      blocks sits between two spanning blocks (or the page edge),
 *      reorder that run by (column index, y).
 */
function reorderForColumns(blocks: LayoutBlock[], pageWidth: number): LayoutBlock[] {
  if (blocks.length < 4 || pageWidth <= 0) return blocks;

  const spanThreshold = pageWidth * 0.6;
  const xEpsilon = pageWidth * 0.05;

  const narrow = blocks.filter((b) => b.width < spanThreshold);
  if (narrow.length < 4) return blocks;

  // Cluster narrow blocks by left edge x. Sorted ascending so each new
  // block joins the most recent column whose representative x is within
  // xEpsilon, otherwise opens a new column.
  const sortedByX = [...narrow].sort((a, b) => a.x - b.x);
  const initialColumns: LayoutBlock[][] = [[sortedByX[0]]];
  for (let i = 1; i < sortedByX.length; i++) {
    const last = initialColumns[initialColumns.length - 1];
    const colX = last[0].x;
    if (sortedByX[i].x - colX <= xEpsilon) {
      last.push(sortedByX[i]);
    } else {
      initialColumns.push([sortedByX[i]]);
    }
  }

  // Initial column-of-block map used by the standalone-heading test
  // below — even a singleton-x heading cluster gets a column index here,
  // so the parallelism check can compare its y against blocks in *other*
  // columns regardless of where the heading sat in x.
  const initialColumnOf = new Map<LayoutBlock, number>();
  for (let ci = 0; ci < initialColumns.length; ci++) {
    for (const b of initialColumns[ci]) initialColumnOf.set(b, ci);
  }

  // Promote standalone headings (heading blocks with no parallel block
  // in another column at a similar y) to separators *before* validating
  // column counts. Otherwise a centered standalone heading at a unique
  // x would form its own one-block cluster and trip the < 2 guard,
  // disabling reorder for the whole page.
  const hasParallelInOtherColumn = (heading: LayoutBlock): boolean => {
    const ownCol = initialColumnOf.get(heading);
    if (ownCol === undefined) return false;
    const yTop = heading.y;
    const yBot = heading.y + heading.height;
    for (const b of narrow) {
      if (b === heading) continue;
      const otherCol = initialColumnOf.get(b);
      if (otherCol === undefined || otherCol === ownCol) continue;
      const bTop = b.y;
      const bBot = b.y + b.height;
      if (bBot >= yTop && bTop <= yBot) return true;
    }
    return false;
  };
  const promoted = new Set<LayoutBlock>();
  for (const b of narrow) {
    if (b.role === 'heading' && !hasParallelInOtherColumn(b)) {
      promoted.add(b);
    }
  }

  // Surviving columns are the initial clusters minus promoted blocks.
  // Each surviving column needs ≥ 2 members and we need ≥ 2 surviving
  // columns; otherwise this isn't a real multi-column layout.
  const survivingColumns = initialColumns.map((c) => c.filter((b) => !promoted.has(b))).filter((c) => c.length >= 2);
  if (survivingColumns.length < 2) return blocks;

  const columnOf = new Map<LayoutBlock, number>();
  for (let ci = 0; ci < survivingColumns.length; ci++) {
    for (const b of survivingColumns[ci]) columnOf.set(b, ci);
  }

  // Walk in current (y-ordered) order. Buffer column-member blocks;
  // flush sorted by (column, y) whenever we hit a clearly-spanning
  // block or a promoted standalone heading.
  const out: LayoutBlock[] = [];
  let pending: LayoutBlock[] = [];
  const flush = () => {
    if (pending.length === 0) return;
    pending.sort((a, b) => {
      const ca = columnOf.get(a) ?? 0;
      const cb = columnOf.get(b) ?? 0;
      return ca - cb || a.y - b.y;
    });
    out.push(...pending);
    pending = [];
  };
  for (const b of blocks) {
    const isSeparator = !columnOf.has(b) || promoted.has(b);
    if (isSeparator) {
      flush();
      out.push(b);
    } else {
      pending.push(b);
    }
  }
  flush();
  return out;
}

/**
 * Group `spans` into lines (by y proximity) and lines into blocks (by
 * vertical-gap and font-size similarity), then classify headings and
 * reorder for multi-column layouts. Pure function — no side effects
 * beyond the returned structure.
 *
 * Heuristics, tuned against the colopl / golf / repomix-OSS fixtures:
 *
 *   - Same line: |y_a - y_b| < 0.5 × span height
 *   - New block: gap > 1.0 × prev line height OR fontSize ratio > 1.3
 *
 * `pageWidth` is needed for column detection; pass 0 to skip the multi-
 * column pass (e.g. when the caller already knows the page is single-
 * column or when blocks come from a non-page source).
 */
export function buildLayout(spans: TextSpan[], pageWidth = 0): PageLayout {
  if (spans.length === 0) return { blocks: [] };

  // Stable sort: primarily by y (top to bottom), then by x within a row.
  const sorted = [...spans].sort((a, b) => a.y - b.y || a.x - b.x);

  // Cluster spans into lines. The y comparison anchors on the first span
  // of the current group rather than the most recent one — chaining off
  // the latest span lets a slow vertical drift accumulate and merge spans
  // whose y is significantly above the line's actual baseline.
  const lineGroups: TextSpan[][] = [];
  for (const s of sorted) {
    const last = lineGroups[lineGroups.length - 1];
    const tolerance = Math.max(s.height, 1) * 0.5;
    if (last && Math.abs(s.y - last[0].y) < tolerance) {
      last.push(s);
    } else {
      lineGroups.push([s]);
    }
  }

  // Split each y-row into runs of contiguous spans. An x-gap of ≥ 5× the
  // preceding span's fontSize is a strong column-gutter signal — ordinary
  // inter-word gaps are well under 1× fontSize, so this threshold leaves
  // body text untouched while preventing left and right column spans at
  // the same y from collapsing into one mega-line that crosses the page.
  const lines: LayoutLine[] = lineGroups.flatMap((group) => {
    const xSorted = [...group].sort((a, b) => a.x - b.x);
    const subLines: TextSpan[][] = [[xSorted[0]]];
    for (let i = 1; i < xSorted.length; i++) {
      const prev = xSorted[i - 1];
      const cur = xSorted[i];
      const gap = cur.x - (prev.x + prev.width);
      if (gap > prev.fontSize * 5) {
        subLines.push([cur]);
      } else {
        subLines[subLines.length - 1].push(cur);
      }
    }
    return subLines.map((sub) => ({
      text: joinLineSpans(sub),
      ...unionBox(sub),
      fontSize: round2(mode(sub.map((s) => s.fontSize))),
    }));
  });

  // Cluster lines into blocks. Splits when:
  //   - vertical gap > 1× prev line height (paragraph break / section break)
  //   - fontSize ratio > 1.3 (heading vs body)
  //   - lines are side-by-side rather than stacked (x-disjoint and y-
  //     overlapping). Two column lines at the same y get y-clustered into
  //     adjacent layout lines but must not share a block, otherwise the
  //     left and right columns merge into one nonsense block.
  const blockGroups: LayoutLine[][] = [];
  for (const line of lines) {
    const last = blockGroups[blockGroups.length - 1];
    if (last) {
      const prev = last[last.length - 1];
      const gap = line.y - (prev.y + prev.height);
      const sizeRatio =
        Math.max(line.fontSize, prev.fontSize) / Math.max(Math.min(line.fontSize, prev.fontSize), 0.001);
      const xDisjoint = line.x + line.width <= prev.x || prev.x + prev.width <= line.x;
      const sideBySide = gap < 0 && xDisjoint;
      if (gap > prev.height * 1.0 || sizeRatio > 1.3 || sideBySide) {
        blockGroups.push([line]);
      } else {
        last.push(line);
      }
    } else {
      blockGroups.push([line]);
    }
  }

  const blocks: LayoutBlock[] = blockGroups.map((group) => ({
    text: group.map((l) => l.text).join('\n'),
    ...unionBox(group),
    lines: group,
  }));

  classifyHeadings(blocks);
  const ordered = pageWidth > 0 ? reorderForColumns(blocks, pageWidth) : blocks;

  return { blocks: ordered };
}

/**
 * Cross-page pass: flag blocks that look like running headers / footers /
 * page numbers / watermarks. Two blocks across different pages are
 * considered the "same" when their normalized text matches and their top y
 * sits in the same 5-pt bin (page chrome rarely shifts more than that
 * between pages, while body text reflows).
 *
 * A block is marked `repeated: true` when it occurs on at least 2 pages
 * AND on at least half of the pages that have a layout. With the default
 * threshold a 3-page run with the same footer marks all three; a one-off
 * line that happens to coincide with one other page does not.
 *
 * Mutates the layout in place.
 */
export function markRepeatedBlocks(pages: PageResult[]): void {
  const pagesWithLayout = pages.filter((p) => p.layout && p.layout.blocks.length > 0);
  if (pagesWithLayout.length < 2) return;

  type BlockRef = { pageIndex: number; blockIndex: number };
  const groups = new Map<string, BlockRef[]>();
  for (let pi = 0; pi < pagesWithLayout.length; pi++) {
    const page = pagesWithLayout[pi];
    const blocks = page.layout?.blocks ?? [];
    for (let bi = 0; bi < blocks.length; bi++) {
      const b = blocks[bi];
      const text = b.text.replace(/\s+/g, ' ').trim();
      if (text.length === 0) continue;
      const key = `${Math.round(b.y / 5) * 5}\t${text}`;
      const list = groups.get(key);
      if (list) list.push({ pageIndex: pi, blockIndex: bi });
      else groups.set(key, [{ pageIndex: pi, blockIndex: bi }]);
    }
  }

  const minOccurrences = Math.max(2, Math.ceil(pagesWithLayout.length / 2));
  for (const refs of groups.values()) {
    if (refs.length < minOccurrences) continue;
    const seenPages = new Set(refs.map((r) => r.pageIndex));
    if (seenPages.size < minOccurrences) continue;
    for (const ref of refs) {
      const block = pagesWithLayout[ref.pageIndex].layout?.blocks[ref.blockIndex];
      if (block) block.repeated = true;
    }
  }
}
