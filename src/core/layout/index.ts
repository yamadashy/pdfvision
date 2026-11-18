import type { LayoutBlock, LayoutLine, PageLayout, TextSpan } from '../../types/index.js';
import { extractCodeBlocks } from './codeBlocks.js';
import { isProseColumnTable } from './columnGutters.js';
import { isStandaloneNumericLineAfterProse } from './columns.js';
import { unionBox } from './geometry.js';
import { classifyHeadings } from './headings.js';
import { buildLayoutLinesWithGutters } from './lines.js';
import { assembleDisplayMath } from './math/index.js';
import { orderLayoutBlocks } from './regionOrder.js';
import { detectLayoutRegions, type LayoutGraphics } from './regions.js';
import { alignedRowRegions, readAlignedRows } from './rows/index.js';
import { sideLineMarks } from './sideLines.js';
import { tableRules } from './tableRules.js';
import { detectLayoutTables } from './tables.js';
import { isVerticalPage, orderVerticalPage } from './vertical/pageOrder.js';
import { compareLayoutBlocks, extractVerticalCjkBlocks } from './verticalText.js';
import { findWovenContinuation } from './wovenLines.js';

export { markPageEdgeChromeBlocks } from './pageEdgeChrome.js';
export type { LayoutGraphics } from './regions.js';
export { markRepeatedBlocks } from './repeatedChrome.js';

const SHORT_LARGER_LINE_MAX_CHARS = 100;

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
 * column or when blocks come from a non-page source). `pageHeight`
 * enables bottom-note detection inside column runs; 0 keeps the legacy
 * column sort for synthetic callers that do not know page bounds.
 * `graphics` (the page's vector and image boxes) lets frames, rule bands
 * and figures keep their text together in the reading order.
 */
export function buildLayout(
  spans: TextSpan[],
  pageWidth = 0,
  pageHeight = 0,
  graphics?: LayoutGraphics,
  monospaceFonts?: ReadonlySet<string>,
): PageLayout {
  if (spans.length === 0) return { blocks: [] };

  const mathBoxes =
    graphics?.maskRules && graphics.maskRules.length > 0
      ? [...(graphics.vectorBoxes ?? []), ...graphics.maskRules]
      : graphics?.vectorBoxes;
  const math = assembleDisplayMath(spans, mathBoxes, pageWidth);
  const vertical = extractVerticalCjkBlocks(math.spans);
  const code = extractCodeBlocks(vertical.remainingSpans, monospaceFonts);

  const rules = tableRules(graphics?.vectorBoxes);
  const { lines, columnGutters } = buildLayoutLinesWithGutters(code.remainingSpans, pageWidth, rules.vertical);
  // A "table" whose every column boundary is a detected prose gutter is the
  // page's text columns read across (#242), not a table.
  const detectedTables = detectLayoutTables(lines, rules, graphics?.vectorBoxes)?.filter(
    (table) => !isProseColumnTable(table, columnGutters),
  );
  const tables = detectedTables && detectedTables.length > 0 ? detectedTables : undefined;

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
      // Multi-column pages often emit the right-column line for row N,
      // then the left-column line for row N+1. They do not vertically
      // overlap, so `sideBySide` misses them and the old clustering glued
      // different columns into one block. If two close lines have no
      // horizontal overlap at all, keep them as separate visual blocks.
      const closeButDifferentColumn = xDisjoint && Math.abs(gap) <= prev.height * 1.5;
      // Narrow heading-glue split: when the previous line is short and
      // at a noticeably larger fontSize than the incoming line, treat
      // the run that ends at `prev` as a (sub)heading that mustn't merge
      // with the body below. The general 1.3× ratio rule above would miss
      // arxiv subsections (10.96 over 9.96 ≈ 1.10×); this rule fires only
      // at 1.05× and only with the heading-shaped guards, so it doesn't
      // over-split emphasis runs inside paragraphs. We deliberately do
      // not gate on `last.length === 1` — level 2 structural headings can
      // legitimately span two lines (see the LEVEL_2_MAX_LINES path), so
      // a 2-line heading whose second line is short + larger than the
      // body still needs to break here.
      const prevWasShortLarger =
        prev.fontSize > line.fontSize * 1.05 && prev.text.replace(/\s/g, '').length <= SHORT_LARGER_LINE_MAX_CHARS;
      const standaloneNumericAfterProse = isStandaloneNumericLineAfterProse(prev, line, pageWidth);
      if (
        gap > prev.height * 1.0 ||
        sizeRatio > 1.3 ||
        sideBySide ||
        closeButDifferentColumn ||
        prevWasShortLarger ||
        standaloneNumericAfterProse
      ) {
        const woven = findWovenContinuation(blockGroups, line);
        if (woven) woven.push(line);
        else blockGroups.push([line]);
      } else {
        last.push(line);
      }
    } else {
      blockGroups.push([line]);
    }
  }

  const rows = readAlignedRows(
    [
      ...blockGroups.map((group) => ({
        text: group.map((l) => l.text).join('\n'),
        ...unionBox(group),
        lines: group,
      })),
      ...vertical.blocks,
      ...code.blocks,
    ],
    {
      gutters: columnGutters,
      verticalRules: rules.vertical,
      regions: (pending) => detectLayoutRegions(pending, graphics, pageWidth, pageHeight, { bars: false }),
    },
  );
  const blocks: LayoutBlock[] = rows.blocks.sort(compareLayoutBlocks);

  if (isVerticalPage(blocks)) {
    const ordered = orderVerticalPage(blocks);
    classifyHeadings(ordered, pageWidth, pageHeight);
    return withMarks({ blocks: ordered, ...(tables !== undefined && { tables }) }, math.spans, graphics);
  }

  classifyHeadings(blocks, pageWidth, pageHeight);
  const ordered =
    pageWidth > 0
      ? orderLayoutBlocks(
          blocks,
          [
            ...(rows.regions ?? detectLayoutRegions(blocks, graphics, pageWidth, pageHeight)),
            ...alignedRowRegions(rows.runs),
          ],
          pageWidth,
          pageHeight,
        )
      : blocks;
  return withMarks({ blocks: ordered, ...(tables !== undefined && { tables }) }, math.spans, graphics);
}

function withMarks(layout: PageLayout, spans: readonly TextSpan[], graphics: LayoutGraphics | undefined): PageLayout {
  if (!layout.blocks.some((block) => block.writingMode === 'vertical')) return layout;
  const markedText = sideLineMarks(layout.blocks, spans, graphics?.vectorBoxes);
  return markedText.length > 0 ? { ...layout, markedText } : layout;
}
