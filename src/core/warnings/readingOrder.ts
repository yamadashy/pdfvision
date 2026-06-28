import type { LayoutBlock, PageResult, PageWarning } from '../../types/index.js';
import { horizontalOverlap } from '../warningTextOverlap/index.js';
import { detectColumnListReadingOrderDivergence } from './readingOrder/columnLists.js';
import { shortTextSample } from './textSamples.js';

export { detectFormLabelReadingOrderDivergence } from './readingOrder/formLabels.js';

/** Reading-order divergence thresholds. A heading the layout pass
 *  places in the first quarter of the page flow but whose text only
 *  shows up in the back half of the native content stream means the
 *  producer emitted columns/frames out of visual order (InDesign
 *  magazine layouts are the common case — PLoS Medicine emits the
 *  page title AFTER all three body columns). */
const READING_ORDER_LAYOUT_EARLY_RATIO = 0.25;
const READING_ORDER_LAYOUT_LATE_RATIO = 0.75;
const READING_ORDER_NATIVE_LATE_RATIO = 0.5;
const READING_ORDER_NATIVE_EARLY_RATIO = 0.1;
const READING_ORDER_BOTTOM_Y_RATIO = 0.85;
const READING_ORDER_SIDE_X_RATIO = 0.6;
const READING_ORDER_MIN_BLOCKS = 4;
const READING_ORDER_MIN_HEADING_CHARS = 10;
const READING_ORDER_PROBE_CHARS = 40;
const READING_ORDER_CONTEXT_PROBE_MIN_CHARS = 32;
const READING_ORDER_CONTEXT_MAX_Y_DELTA = 80;
const READING_ORDER_SEQUENTIAL_MIN_Y_GAP_PT = 6;
const READING_ORDER_SEQUENTIAL_NATIVE_DELTA_RATIO = 0.2;
const LINE_READING_ORDER_MIN_LINES = 3;
const LINE_READING_ORDER_MIN_PROBE_CHARS = 4;
const LINE_READING_ORDER_PROBE_CHARS = 60;
const LOCAL_READING_ORDER_MIN_COMPACT_CHARS = 4;
const LOCAL_READING_ORDER_MAX_COMPACT_CHARS = 40;
const LOCAL_READING_ORDER_PROBE_CHARS = 50;
const LOCAL_READING_ORDER_STRONG_MATH_SYMBOL = /[√∛∜∑∫∏∈∉∞≈≠≤≥±×÷=^]/u;
const LOCAL_READING_ORDER_WEAK_MATH_SYMBOL = /[+\-*/]/u;
const LOCAL_READING_ORDER_NUMBER = /\p{Number}/u;

/**
 * Flag pages whose native text stream order diverges from the visual
 * reading order the layout pass reconstructed. Detection is anchored
 * on headings: a heading that is *early* in layout order (top of the
 * visual flow) but *late* in `page.text` is unambiguous divergence,
 * whereas comparing whole-page block permutations would fire on benign
 * column-ordering nuances. A second narrow path catches short math
 * blocks whose superscripts or operators are emitted out of visual order
 * in the native text stream. Consumers should prefer `layout.blocks`
 * order when sequence matters; the Markdown formatter switches to the
 * layout-rebuilt body when this warning is present.
 */
export function detectReadingOrderDivergence(page: PageResult, blocks: LayoutBlock[], out: PageWarning[]): void {
  if (page.text.length === 0) return;
  if (blocks.length >= READING_ORDER_MIN_BLOCKS && detectHeadingReadingOrderDivergence(page, blocks, out)) return;
  if (blocks.length >= READING_ORDER_MIN_BLOCKS && detectLateBlockStartsNativeText(page, blocks, out)) return;
  if (blocks.length >= READING_ORDER_MIN_BLOCKS && detectSequentialBlockReadingOrderDivergence(page, blocks, out))
    return;
  if (detectColumnListReadingOrderDivergence(page, blocks, out)) return;
  if (detectLineReadingOrderDivergence(page, blocks, out)) return;
  detectLocalMathReadingOrderDivergence(page, blocks, out);
}

function detectHeadingReadingOrderDivergence(page: PageResult, blocks: LayoutBlock[], out: PageWarning[]): boolean {
  let layoutOffset = 0;
  const totalChars = blocks.reduce((sum, b) => sum + b.text.length, 0);
  if (totalChars === 0) return false;
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const layoutPos = layoutOffset / totalChars;
    layoutOffset += block.text.length;
    if (layoutPos > READING_ORDER_LAYOUT_EARLY_RATIO) return false;
    if (block.role !== 'heading' || block.repeated) continue;
    const probe = block.text.split('\n', 1)[0].trim().slice(0, READING_ORDER_PROBE_CHARS);
    if (probe.length < READING_ORDER_MIN_HEADING_CHARS) continue;
    const nativeIndex = page.text.indexOf(probe);
    if (nativeIndex < 0) continue;
    const nativePos = nativeIndex / page.text.length;
    if (nativePos < READING_ORDER_NATIVE_LATE_RATIO) continue;
    out.push({
      code: 'reading_order_divergence',
      severity: 'warning',
      message: `heading "${probe}" leads the visual reading order but only appears ${(nativePos * 100).toFixed(0)}% of the way through the native text stream — native text order diverges from what a human reads; prefer layout.blocks order when sequence matters`,
      blockIndex: i,
    });
    return true;
  }
  return false;
}

function detectLateBlockStartsNativeText(page: PageResult, blocks: LayoutBlock[], out: PageWarning[]): boolean {
  let layoutOffset = 0;
  const totalChars = blocks.reduce((sum, block) => sum + block.text.length, 0);
  if (totalChars === 0 || page.width <= 0 || page.height <= 0) return false;
  const nativeText = collapseReadingOrderWhitespace(page.text);
  if (nativeText.length === 0) return false;

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    const layoutPos = layoutOffset / totalChars;
    layoutOffset += block.text.length;
    if (layoutPos < READING_ORDER_LAYOUT_LATE_RATIO) continue;
    if (block.repeated) continue;
    const isBottomBlock = block.y >= page.height * READING_ORDER_BOTTOM_Y_RATIO;
    const isSideBlock = block.x >= page.width * READING_ORDER_SIDE_X_RATIO;
    if (!isBottomBlock && !isSideBlock) continue;

    const probe = buildLateBlockNativeProbe(blocks, i);
    if (probe.length < READING_ORDER_MIN_HEADING_CHARS) continue;
    const nativeIndex = uniqueNativeTextIndex(nativeText, probe);
    if (nativeIndex === undefined) continue;
    const nativePos = nativeIndex / nativeText.length;
    if (nativePos > READING_ORDER_NATIVE_EARLY_RATIO) continue;
    const label = collapseReadingOrderWhitespace(block.text).slice(0, READING_ORDER_PROBE_CHARS);
    const regionLabel = isBottomBlock ? 'bottom block' : 'side block';
    out.push({
      code: 'reading_order_divergence',
      severity: 'warning',
      message: `${regionLabel} "${label}" appears at the start of the native text stream despite sitting late in the visual reading order — native text order diverges from what a human reads; prefer layout.blocks order when sequence matters`,
      blockIndex: i,
    });
    return true;
  }
  return false;
}

function detectSequentialBlockReadingOrderDivergence(
  page: PageResult,
  blocks: LayoutBlock[],
  out: PageWarning[],
): boolean {
  if (page.width <= 0 || page.height <= 0) return false;
  const nativeText = collapseReadingOrderWhitespace(page.text);
  if (nativeText.length === 0) return false;

  let previous:
    | {
        block: LayoutBlock;
        probe: string;
        nativeIndex: number;
      }
    | undefined;
  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
    const block = blocks[blockIndex];
    if (block.repeated) continue;
    const probe = collapseReadingOrderWhitespace(block.text).slice(0, READING_ORDER_PROBE_CHARS);
    if (probe.length < READING_ORDER_MIN_HEADING_CHARS) continue;
    const nativeIndex = uniqueNativeTextIndex(nativeText, probe);
    if (nativeIndex === undefined) continue;

    if (previous) {
      const currentNativePos = nativeIndex / nativeText.length;
      const previousNativePos = previous.nativeIndex / nativeText.length;
      const visualGap = block.y - (previous.block.y + previous.block.height);
      if (
        visualGap >= READING_ORDER_SEQUENTIAL_MIN_Y_GAP_PT &&
        currentNativePos <= READING_ORDER_NATIVE_EARLY_RATIO &&
        previousNativePos - currentNativePos >= READING_ORDER_SEQUENTIAL_NATIVE_DELTA_RATIO
      ) {
        out.push({
          code: 'reading_order_divergence',
          severity: 'warning',
          blockIndex,
          message: `layout block "${shortTextSample(probe)}" appears near the start of the native text stream despite following "${shortTextSample(previous.probe)}" visually — native block order diverges from what a human reads; prefer layout.blocks order when sequence matters`,
        });
        return true;
      }
    }

    previous = { block, probe, nativeIndex };
  }
  return false;
}

function buildLateBlockNativeProbe(blocks: LayoutBlock[], index: number): string {
  const block = blocks[index];
  const parts = [block.text];
  let probe = collapseReadingOrderWhitespace(parts.join(' '));
  if (probe.length < READING_ORDER_CONTEXT_PROBE_MIN_CHARS || block.role === 'heading') {
    for (let i = index + 1; i < blocks.length && probe.length < READING_ORDER_CONTEXT_PROBE_MIN_CHARS; i++) {
      const candidate = blocks[i];
      if (candidate.repeated) continue;
      if (candidate.y < block.y) continue;
      if (candidate.y - block.y > READING_ORDER_CONTEXT_MAX_Y_DELTA) break;
      if (!horizontalOverlap(block, candidate)) continue;
      parts.push(candidate.text);
      probe = collapseReadingOrderWhitespace(parts.join(' '));
    }
  }
  return probe.slice(0, READING_ORDER_PROBE_CHARS);
}

function collapseReadingOrderWhitespace(text: string): string {
  return text.replace(/\s+/gu, ' ').trim();
}

function detectLineReadingOrderDivergence(page: PageResult, blocks: LayoutBlock[], out: PageWarning[]): boolean {
  const nativeText = collapseReadingOrderWhitespace(page.text.normalize('NFKC'));
  if (nativeText.length === 0) return false;
  for (let blockIndex = 0; blockIndex < blocks.length; blockIndex++) {
    const block = blocks[blockIndex];
    if (block.repeated || block.lines.length < LINE_READING_ORDER_MIN_LINES) continue;
    const probes = block.lines
      .map((line) =>
        collapseReadingOrderWhitespace(line.text.normalize('NFKC')).slice(0, LINE_READING_ORDER_PROBE_CHARS),
      )
      .filter((probe) => probe.length >= LINE_READING_ORDER_MIN_PROBE_CHARS);
    if (probes.length < LINE_READING_ORDER_MIN_LINES || new Set(probes).size !== probes.length) continue;
    const indexed: { probe: string; nativeIndex: number }[] = [];
    for (const probe of probes) {
      const nativeIndex = uniqueNativeTextIndex(nativeText, probe);
      if (nativeIndex === undefined) {
        indexed.length = 0;
        break;
      }
      indexed.push({ probe, nativeIndex });
    }
    if (indexed.length === 0) continue;
    let previous = indexed[0];
    for (const item of indexed.slice(1)) {
      if (item.nativeIndex + 2 >= previous.nativeIndex) {
        previous = item;
        continue;
      }
      out.push({
        code: 'reading_order_divergence',
        severity: 'warning',
        blockIndex,
        message: `layout line "${shortTextSample(item.probe)}" appears after "${shortTextSample(previous.probe)}" visually but earlier in the native text stream — native line order diverges from what a human reads; prefer layout.blocks order when sequence matters`,
      });
      return true;
    }
  }
  return false;
}

function uniqueNativeTextIndex(text: string, probe: string): number | undefined {
  const first = text.indexOf(probe);
  if (first < 0) return undefined;
  const second = text.indexOf(probe, first + Math.max(1, probe.length));
  return second < 0 ? first : undefined;
}

function detectLocalMathReadingOrderDivergence(page: PageResult, blocks: LayoutBlock[], out: PageWarning[]): void {
  const nativeChars = compactReadingOrderChars(page.text);
  if (nativeChars.length === 0) return;
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.repeated) continue;
    if (!hasLocalReadingOrderMathSignal(block.text)) continue;
    const blockChars = compactReadingOrderChars(block.text);
    if (
      blockChars.length < LOCAL_READING_ORDER_MIN_COMPACT_CHARS ||
      blockChars.length > LOCAL_READING_ORDER_MAX_COMPACT_CHARS
    ) {
      continue;
    }
    const compactBlock = blockChars.join('');
    if (nativeChars.join('').includes(compactBlock)) continue;
    if (!containsReorderedCharacterWindow(nativeChars, blockChars)) continue;
    const probe = block.text.replace(/\s+/gu, ' ').trim().slice(0, LOCAL_READING_ORDER_PROBE_CHARS);
    out.push({
      code: 'reading_order_divergence',
      severity: 'warning',
      message: `layout block "${probe}" appears with reordered characters in the native text stream — superscripts, radicals, or inline math may read differently in pages[].text; prefer layout.blocks order when exact sequence matters`,
      blockIndex: i,
    });
    return;
  }
}

function hasLocalReadingOrderMathSignal(text: string): boolean {
  if (LOCAL_READING_ORDER_STRONG_MATH_SYMBOL.test(text)) return true;
  return LOCAL_READING_ORDER_WEAK_MATH_SYMBOL.test(text) && LOCAL_READING_ORDER_NUMBER.test(text);
}

function compactReadingOrderChars(text: string): string[] {
  return Array.from(text.normalize('NFKC')).filter((char) => !/\s/u.test(char));
}

function containsReorderedCharacterWindow(nativeChars: readonly string[], blockChars: readonly string[]): boolean {
  if (blockChars.length > nativeChars.length) return false;
  const target = characterMultisetKey(blockChars);
  const blockText = blockChars.join('');
  for (let i = 0; i <= nativeChars.length - blockChars.length; i++) {
    const window = nativeChars.slice(i, i + blockChars.length);
    if (window.join('') === blockText) continue;
    if (characterMultisetKey(window) === target) return true;
  }
  return false;
}

function characterMultisetKey(chars: readonly string[]): string {
  return [...chars].sort().join('');
}
