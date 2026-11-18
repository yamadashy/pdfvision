import type { LayoutBlock, PageLayout } from '../../types/index.js';

/**
 * A block on a line-numbered page, each numbered line led by its margin
 * number (`16 PLEASE TAKE NOTICE …`) so a reading can be cited page:line.
 * Lines between two numbers are printed as they are.
 */
export function numberedBlockText(block: LayoutBlock): string {
  if (!block.lines.some((line) => line.lineNumber !== undefined)) return block.text;
  if (block.text !== block.lines.map((line) => line.text).join('\n')) return block.text;
  return block.lines
    .map((line) => (line.lineNumber !== undefined ? `${line.lineNumber} ${line.text}` : line.text))
    .join('\n');
}

/** The one line that says the numbers leading the body's lines are the page's margin line numbers. */
export function lineNumbersNote(layout: PageLayout | undefined): string | undefined {
  const numbers = layout?.lineNumbers;
  if (!numbers) return undefined;
  return `_Margin line numbers ${numbers.first}–${numbers.last}: each numbered line below starts with its number._`;
}
