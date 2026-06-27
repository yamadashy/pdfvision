import type { PageLayout, VisualRegionAssociatedText } from '../../../types/index.js';
import { normalizeAssociatedText } from '../associatedText.js';
import { round2, unionBox } from '../geometry.js';
import type { BoxLike } from '../types.js';
import {
  captionContinuationLineLimit,
  captionKind,
  isCaptionContinuationText,
  isCaptionText,
  joinCaptionTextParts,
  trimGluedJapaneseTableHeaderFromCaption,
} from './text.js';

const CAPTION_CONTINUATION_TOTAL_MAX_CHARS = 600;
const LONG_CAPTION_BLOCK_TOTAL_MAX_CHARS = 1800;
const LONG_CAPTION_BLOCK_MAX_LINES = 24;

export function captionTextsFromBlock(
  block: NonNullable<PageLayout['blocks']>[number],
  blockIndex: number,
): VisualRegionAssociatedText[] {
  const lines = block.lines.map((line) => ({ line, text: normalizeAssociatedText(line.text) }));
  const longSingleCaptionBlock = captionTextFromLongSingleCaptionBlock(lines, blockIndex);
  if (longSingleCaptionBlock) return [longSingleCaptionBlock];

  const lineCaptions: VisualRegionAssociatedText[] = [];
  for (let i = 0; i < lines.length; i++) {
    const item = lines[i];
    if (!item || !isCaptionText(item.text)) continue;

    const textParts = [trimGluedJapaneseTableHeaderFromCaption(item.text, item.line, lines[i + 1]?.line)];
    let captionBox: BoxLike = item.line;
    const continuationLimit = captionContinuationLineLimit(item.text);
    for (let j = i + 1; continuationLimit > 0 && j < lines.length && j <= i + continuationLimit; j++) {
      const continuation = lines[j];
      if (!continuation) break;
      const captionText = joinCaptionTextParts(textParts);
      if (!isCaptionContinuationText(captionText, continuation.text)) break;
      const continuedCaption = joinCaptionTextParts([...textParts, continuation.text]);
      if (continuedCaption.length > CAPTION_CONTINUATION_TOTAL_MAX_CHARS) break;
      textParts.push(continuation.text);
      captionBox = unionBox(captionBox, continuation.line);
    }

    lineCaptions.push({
      text: joinCaptionTextParts(textParts),
      relation: 'caption' as const,
      x: round2(captionBox.x),
      y: round2(captionBox.y),
      width: round2(captionBox.width),
      height: round2(captionBox.height),
      blockIndex,
    });
  }
  if (lineCaptions.length > 0) return lineCaptions;

  const text = normalizeAssociatedText(block.text);
  if (!isCaptionText(text)) return [];
  return [
    {
      text,
      relation: 'caption' as const,
      x: block.x,
      y: block.y,
      width: block.width,
      height: block.height,
      blockIndex,
    },
  ];
}

function captionTextFromLongSingleCaptionBlock(
  lines: { line: BoxLike & { text: string }; text: string }[],
  blockIndex: number,
): VisualRegionAssociatedText | undefined {
  if (lines.length > LONG_CAPTION_BLOCK_MAX_LINES) return undefined;

  const first = lines[0];
  if (!first || !isCaptionText(first.text) || captionKind(first.text) !== 'figure') return undefined;
  if (lines.filter((line) => isCaptionText(line.text)).length !== 1) return undefined;

  const standardLineLimit = captionContinuationLineLimit(first.text);
  const textParts = [trimGluedJapaneseTableHeaderFromCaption(first.text, first.line, lines[1]?.line)];
  let captionBox: BoxLike = first.line;
  for (let i = 1; i < lines.length; i++) {
    const item = lines[i];
    if (!item) break;
    const captionText = joinCaptionTextParts(textParts);
    if (!isCaptionContinuationText(captionText, item.text)) break;
    const continuedCaption = joinCaptionTextParts([...textParts, item.text]);
    if (continuedCaption.length > LONG_CAPTION_BLOCK_TOTAL_MAX_CHARS) break;
    textParts.push(item.text);
    captionBox = unionBox(captionBox, item.line);
  }

  if (textParts.length <= standardLineLimit + 1) return undefined;
  return {
    text: joinCaptionTextParts(textParts),
    relation: 'caption',
    x: round2(captionBox.x),
    y: round2(captionBox.y),
    width: round2(captionBox.width),
    height: round2(captionBox.height),
    blockIndex,
  };
}
