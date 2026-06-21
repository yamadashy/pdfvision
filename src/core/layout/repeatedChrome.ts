import type { LayoutBlock, LayoutLine, PageResult } from '../../types/index.js';
import { type BBox, unionBox } from './geometry.js';

const REPEATED_CHROME_EDGE_RATIO = 0.1;
const REPEATED_CHROME_MIN_EDGE_PT = 60;
const REPEATED_CHROME_LINE_EDGE_RATIO = 0.04;
const REPEATED_CHROME_LINE_MIN_EDGE_PT = 24;
const REPEATED_CHROME_LINE_MIN_TEXT_LENGTH = 20;
const REPEATED_CHROME_LINE_MIN_WIDTH_RATIO = 0.2;

/**
 * Cross-page pass: flag blocks that look like running headers / footers /
 * page numbers / watermarks. Two blocks across different pages are
 * considered the "same" when their normalized text matches and their top y
 * sits in the same 5-pt bin (page chrome rarely shifts more than that
 * between pages, while body text reflows). Edge-band blocks also contribute
 * long line-level keys so a stable footer line still marks its parent block
 * as repeated when an adjacent page-number line changes on every page.
 * Numeric variants like "Lecture 5 - 18" also contribute a digit-normalized
 * key, but only inside the page edge band.
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

  type ChromeRef = { pageIndex: number; blockIndex: number; lineIndex?: number };
  const groups = new Map<string, ChromeRef[]>();
  for (let pi = 0; pi < pagesWithLayout.length; pi++) {
    const page = pagesWithLayout[pi];
    const blocks = page.layout?.blocks ?? [];
    for (let bi = 0; bi < blocks.length; bi++) {
      const block = blocks[bi];
      if (!isRepeatedChromeCandidate(page, block)) continue;
      const text = block.text.replace(/\s+/g, ' ').trim();
      for (const keyText of repeatedChromeTextKeys(text, isDigitVariableChromeCandidate(page, block, text))) {
        addRepeatedChromeGroup(groups, `block\t${Math.round(block.y / 5) * 5}\t${keyText}`, {
          pageIndex: pi,
          blockIndex: bi,
        });
      }
      for (let li = 0; li < block.lines.length; li++) {
        const line = block.lines[li];
        if (!isRepeatedChromeLineCandidate(page, line)) continue;
        const lineText = line.text.replace(/\s+/g, ' ').trim();
        for (const keyText of repeatedChromeTextKeys(lineText, isDigitVariableChromeCandidate(page, line, lineText))) {
          addRepeatedChromeGroup(groups, `line\t${Math.round(line.y / 5) * 5}\t${keyText}`, {
            pageIndex: pi,
            blockIndex: bi,
            lineIndex: li,
          });
        }
      }
    }
  }

  const minOccurrences = Math.max(2, Math.ceil(pagesWithLayout.length / 2));
  const repeatedBlocks = new Map<number, Set<number>>();
  const repeatedLines = new Map<number, Map<number, Set<number>>>();
  for (const refs of groups.values()) {
    if (refs.length < minOccurrences) continue;
    const seenPages = new Set(refs.map((r) => r.pageIndex));
    if (seenPages.size < minOccurrences) continue;
    for (const ref of refs) {
      if (ref.lineIndex === undefined) {
        addIndexSetValue(repeatedBlocks, ref.pageIndex, ref.blockIndex);
      } else {
        addNestedIndexSetValue(repeatedLines, ref.pageIndex, ref.blockIndex, ref.lineIndex);
      }
    }
  }

  for (const [pageIndex, blockIndexes] of repeatedBlocks) {
    const blocks = pagesWithLayout[pageIndex].layout?.blocks ?? [];
    for (const blockIndex of blockIndexes) {
      const block = blocks[blockIndex];
      if (!block) continue;
      markBlockAsRepeatedChrome(block);
    }
  }

  for (const [pageIndex, blockLines] of repeatedLines) {
    const page = pagesWithLayout[pageIndex];
    const wholeBlocks = repeatedBlocks.get(pageIndex) ?? new Set<number>();
    for (const blockIndex of [...blockLines.keys()].sort((a, b) => b - a)) {
      if (wholeBlocks.has(blockIndex)) continue;
      splitRepeatedChromeLines(page, blockIndex, blockLines.get(blockIndex) ?? new Set<number>());
    }
  }
}

function addRepeatedChromeGroup(
  groups: Map<string, { pageIndex: number; blockIndex: number; lineIndex?: number }[]>,
  key: string,
  ref: { pageIndex: number; blockIndex: number; lineIndex?: number },
): void {
  const list = groups.get(key);
  if (list) list.push(ref);
  else groups.set(key, [ref]);
}

function addIndexSetValue(map: Map<number, Set<number>>, key: number, value: number): void {
  const set = map.get(key);
  if (set) set.add(value);
  else map.set(key, new Set([value]));
}

function addNestedIndexSetValue(
  map: Map<number, Map<number, Set<number>>>,
  outerKey: number,
  innerKey: number,
  value: number,
): void {
  let inner = map.get(outerKey);
  if (!inner) {
    inner = new Map<number, Set<number>>();
    map.set(outerKey, inner);
  }
  addIndexSetValue(inner, innerKey, value);
}

function markBlockAsRepeatedChrome(block: LayoutBlock): void {
  block.repeated = true;
  // Demote chrome from heading. A running header / page-number /
  // language-marker line that happens to be short and slightly
  // larger than the body fontSize sails through the heading
  // classifier (eu-ai-act surfaces "EN" as a level-1 heading on
  // every page). Once we know the block is repeated chrome, the
  // heading role is almost always wrong — and agents iterating
  // `headings` then see "EN" once per page. Drop the role here.
  // Consumers that genuinely want repeated headings (a doc title
  // that only appears in the running header) can still recover it
  // from `text` + `repeated: true` + size; the common case wins.
  if (block.role === 'heading') {
    block.role = undefined;
    block.level = undefined;
    block.roleConfidence = undefined;
  }
}

function splitRepeatedChromeLines(page: PageResult, blockIndex: number, lineIndexes: Set<number>): void {
  const blocks = page.layout?.blocks;
  const block = blocks?.[blockIndex];
  if (!blocks || !block || lineIndexes.size === 0 || block.lines.length === 0) return;

  if (lineIndexes.size >= block.lines.length) {
    markBlockAsRepeatedChrome(block);
    return;
  }

  const replacement: LayoutBlock[] = [];
  let run: LayoutLine[] = [];
  let runRepeated = false;
  const flush = () => {
    if (run.length === 0) return;
    const next = blockFromLineRun(block, run, runRepeated);
    if (runRepeated) markBlockAsRepeatedChrome(next);
    replacement.push(next);
    run = [];
  };

  for (let i = 0; i < block.lines.length; i++) {
    const repeated = lineIndexes.has(i);
    if (run.length > 0 && repeated !== runRepeated) flush();
    runRepeated = repeated;
    run.push(block.lines[i]);
  }
  flush();

  if (replacement.length > 1) {
    blocks.splice(blockIndex, 1, ...replacement);
  }
}

function blockFromLineRun(source: LayoutBlock, lines: LayoutLine[], repeated: boolean): LayoutBlock {
  const box = unionBox(lines);
  const block: LayoutBlock = {
    text: lines.map((line) => line.text).join('\n'),
    ...box,
    lines,
  };
  if (!repeated) {
    block.role = source.role;
    block.level = source.level;
    block.roleConfidence = source.roleConfidence;
    block.writingMode = source.writingMode;
  }
  return block;
}

function repeatedChromeTextKeys(text: string, includeDigitNormalized: boolean): string[] {
  if (text.length === 0) return [];
  const keys = [text];
  const variable = includeDigitNormalized ? digitNormalizedChromeText(text) : undefined;
  if (variable && variable !== text) keys.push(variable);
  return keys;
}

function isDigitVariableChromeCandidate(page: PageResult, box: BBox, text: string): boolean {
  if (text.length > 80) return false;
  if (/^[\p{N}\s.-]{1,12}$/u.test(text) && box.width <= page.width * 0.12) return true;
  if (/^(?:page|p\.|slide|lecture)\b/iu.test(text)) return true;
  return box.width <= page.width * 0.25 && /\b(?:page|p\.|slide|lecture)\b/iu.test(text);
}

function digitNormalizedChromeText(text: string): string | undefined {
  if (!/\p{N}/u.test(text)) return undefined;
  const compactDigitLabel = text.replace(/\s+/g, '');
  if (/\s/u.test(text) && /^\p{N}{2,4}$/u.test(compactDigitLabel)) return '#page-number';
  if (!/\p{L}/u.test(text)) return undefined;
  const letterCount = [...text.matchAll(/\p{L}/gu)].length;
  if (letterCount < 4) return undefined;
  return text.replace(/\p{N}+/gu, '#');
}

function isRepeatedChromeCandidate(page: PageResult, block: LayoutBlock): boolean {
  const text = block.text.replace(/\s+/g, ' ').trim();
  if (isShortFormControlLabel(text)) return false;
  const edgeBand = Math.max(REPEATED_CHROME_MIN_EDGE_PT, page.height * REPEATED_CHROME_EDGE_RATIO);
  return block.y <= edgeBand || block.y + block.height >= page.height - edgeBand;
}

function isShortFormControlLabel(text: string): boolean {
  return /^(?:yes|no|stop)\.?$/iu.test(text);
}

function isRepeatedChromeLineCandidate(page: PageResult, line: LayoutBlock['lines'][number]): boolean {
  const text = line.text.replace(/\s+/g, ' ').trim();
  if (!isRepeatedChromeLineEdgeCandidate(page, line)) return false;
  return (
    text.length >= REPEATED_CHROME_LINE_MIN_TEXT_LENGTH ||
    line.width >= page.width * REPEATED_CHROME_LINE_MIN_WIDTH_RATIO ||
    isDigitVariableChromeCandidate(page, line, text)
  );
}

function isRepeatedChromeLineEdgeCandidate(page: PageResult, line: LayoutBlock['lines'][number]): boolean {
  const edgeBand = Math.max(REPEATED_CHROME_LINE_MIN_EDGE_PT, page.height * REPEATED_CHROME_LINE_EDGE_RATIO);
  return line.y <= edgeBand || line.y + line.height >= page.height - edgeBand;
}
