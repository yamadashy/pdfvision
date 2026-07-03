import type { PageLayout, VisualRegionAssociatedText } from '../../../types/index.js';
import { normalizeAssociatedText } from '../associatedText.js';
import { horizontalOverlapRatio, round2, unionBox } from '../geometry.js';
import { isUsefulVisualLabelText } from '../labels/text.js';
import type { BoxLike } from '../types.js';
import { captionTextsFromBlock } from './extraction.js';
import { captionKind } from './text.js';

const NUMBERED_CHART_TITLE_PATTERN = /^\s*\p{N}{1,3}\s+[\p{L}]/u;
const NUMBERED_CHART_TITLE_CONTINUATION_MAX_GAP_PT = 8;
const NUMBERED_CHART_TITLE_CONTINUATION_MIN_OVERLAP_RATIO = 0.45;
const NUMBERED_CHART_TITLE_CONTINUATION_CENTER_TOLERANCE_PT = 36;
const NUMBERED_CHART_TITLE_CONTINUATION_SCAN_LIMIT = 6;

type CaptionAnchor = VisualRegionAssociatedText;
type LayoutBlock = NonNullable<PageLayout['blocks']>[number];

export function captionGridAnchors(layout: PageLayout): CaptionAnchor[] {
  return [...figureCaptionAnchors(layout), ...numberedChartTitleAnchors(layout)];
}

function figureCaptionAnchors(layout: PageLayout): CaptionAnchor[] {
  return layout.blocks.flatMap((block, index) =>
    block.repeated
      ? []
      : captionTextsFromBlock(block, index).filter((caption) => captionKind(caption.text) === 'figure'),
  );
}

function numberedChartTitleAnchors(layout: PageLayout): CaptionAnchor[] {
  const anchors: CaptionAnchor[] = [];
  const consumed = new Set<number>();
  const blocks = layout.blocks;
  for (const [index, block] of blocks.entries()) {
    if (consumed.has(index) || block.repeated || block.role !== 'heading') continue;
    const title = normalizeAssociatedText(block.text);
    if (!isNumberedChartTitleText(title)) continue;
    let text = title;
    let box: BoxLike = block;
    for (
      let nextIndex = index + 1;
      nextIndex < blocks.length && nextIndex <= index + NUMBERED_CHART_TITLE_CONTINUATION_SCAN_LIMIT;
      nextIndex++
    ) {
      const next = blocks[nextIndex];
      const gapFromTitle = next.y - (block.y + block.height);
      if (gapFromTitle < -2) continue;
      if (gapFromTitle > NUMBERED_CHART_TITLE_CONTINUATION_MAX_GAP_PT) break;
      if (!isNumberedChartTitleContinuation(block, next)) continue;
      text = `${text} ${normalizeAssociatedText(next.text)}`;
      box = unionBox(box, next);
      consumed.add(nextIndex);
      break;
    }
    anchors.push({
      text,
      relation: 'label',
      x: round2(box.x),
      y: round2(box.y),
      width: round2(box.width),
      height: round2(box.height),
      blockIndex: index,
    });
  }
  return anchors;
}

function isNumberedChartTitleText(text: string): boolean {
  return NUMBERED_CHART_TITLE_PATTERN.test(text) && isUsefulVisualLabelText(text);
}

function isNumberedChartTitleContinuation(title: LayoutBlock, next: LayoutBlock): boolean {
  if (next.repeated || next.role !== 'heading') return false;
  const text = normalizeAssociatedText(next.text);
  if (!isUsefulVisualLabelText(text) || isNumberedChartTitleText(text)) return false;
  const gap = next.y - (title.y + title.height);
  if (gap < -2 || gap > NUMBERED_CHART_TITLE_CONTINUATION_MAX_GAP_PT) return false;
  if (horizontalOverlapRatio(title, next) >= NUMBERED_CHART_TITLE_CONTINUATION_MIN_OVERLAP_RATIO) return true;
  return Math.abs(centerX(title) - centerX(next)) <= NUMBERED_CHART_TITLE_CONTINUATION_CENTER_TOLERANCE_PT;
}

function centerX(box: BoxLike): number {
  return box.x + box.width / 2;
}
