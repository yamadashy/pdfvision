import type { LayoutBlock } from '../../types/index.js';
import { horizontalOverlap, verticalIntersectionDepth } from './geometry.js';

const TEXT_OVERLAP_MIN_DEPTH_RATIO = 0.5;
const DISPLAY_NUMBER_MIN_HEIGHT_PT = 24;
const DISPLAY_NUMBER_LABEL_MAX_HEIGHT_PT = 18;
const DISPLAY_NUMBER_LABEL_MAX_CHARS = 40;
const DISPLAY_NUMBER_LABEL_ZONE_RATIO = 0.35;
const DISPLAY_NUMBER_TEXT = /^[\d０-９\s,，.．:：%％+\-−–—/／()（）※年月日現末在]+$/u;
const DISPLAY_NUMBER_MIN_DIGITS = 2;
const ICON_MARKER_MAX_CHARS = 3;
const ICON_MARKER_MAX_SIZE_PT = 36;

export function isDisplayNumberLabelPair(a: LayoutBlock, b: LayoutBlock): boolean {
  return isLabelNearDisplayNumber(a, b) || isLabelNearDisplayNumber(b, a);
}

export function isIconMarkerPair(a: LayoutBlock, b: LayoutBlock): boolean {
  return isIconMarkerNearText(a, b) || isIconMarkerNearText(b, a);
}

function isIconMarkerNearText(marker: LayoutBlock, text: LayoutBlock): boolean {
  const compact = marker.text.replace(/\s+/g, '');
  if (compact.length === 0 || compact.length > ICON_MARKER_MAX_CHARS) return false;
  if (/[\p{L}\p{N}]/u.test(compact)) return false;
  if (marker.lines.length !== 1 || text.lines.length === 0) return false;
  if (marker.width > ICON_MARKER_MAX_SIZE_PT || marker.height > ICON_MARKER_MAX_SIZE_PT) return false;
  if (text.width < marker.width * 4) return false;

  const line = text.lines[0];
  const verticalDepth = verticalIntersectionDepth(marker.lines[0] ?? marker, line);
  const minHeight = Math.max(Math.min(marker.height, line.height), 0.001);
  if (verticalDepth / minHeight < TEXT_OVERLAP_MIN_DEPTH_RATIO) return false;

  const leadingGap = line.x - (marker.x + marker.width);
  return Math.abs(leadingGap) <= marker.width * 0.75;
}

function isLabelNearDisplayNumber(label: LayoutBlock, value: LayoutBlock): boolean {
  if (!isCompactInfographicLabel(label)) return false;
  if (!isDisplayNumberBlock(value)) return false;
  if (!horizontalOverlap(label, value)) return false;
  const labelCenterY = label.y + label.height / 2;
  const numberLine = value.lines[0];
  if (!numberLine) return false;
  const topZone = Math.max(value.height * DISPLAY_NUMBER_LABEL_ZONE_RATIO, numberLine.fontSize * 0.8);
  return labelCenterY >= value.y - 2 && labelCenterY <= value.y + topZone;
}

function isCompactInfographicLabel(block: LayoutBlock): boolean {
  const text = block.text.replace(/\s+/g, '');
  return (
    text.length > 0 &&
    text.length <= DISPLAY_NUMBER_LABEL_MAX_CHARS &&
    block.lines.length === 1 &&
    block.height <= DISPLAY_NUMBER_LABEL_MAX_HEIGHT_PT
  );
}

function isDisplayNumberBlock(block: LayoutBlock): boolean {
  const text = block.text.trim();
  const digitCount = text.match(/[\d０-９]/gu)?.length ?? 0;
  return (
    block.lines.length === 1 &&
    block.height >= DISPLAY_NUMBER_MIN_HEIGHT_PT &&
    digitCount >= DISPLAY_NUMBER_MIN_DIGITS &&
    DISPLAY_NUMBER_TEXT.test(text)
  );
}
