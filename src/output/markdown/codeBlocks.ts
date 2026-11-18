import type { LayoutBlock } from '../../types/index.js';

/**
 * A `role: 'code'` block as a fenced code block. The fence is longer than
 * any backtick run in the code, so PDF text can never close it early. A
 * line-number gutter left out of the code is named on the line above.
 */
export function fencedCode(block: LayoutBlock): string {
  const longestRun = Math.max(0, ...(block.text.match(/`+/gu) ?? []).map((run) => run.length));
  const fence = '`'.repeat(Math.max(3, longestRun + 1));
  const numbers = block.codeLineNumbers;
  const note = numbers ? `_Lines ${numbers.first}–${numbers.last} (line numbers left out of the code):_\n` : '';
  return `${note}${fence}\n${block.text}\n${fence}`;
}
