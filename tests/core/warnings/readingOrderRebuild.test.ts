import { describe, expect, it } from 'vitest';
import { detectPageWarnings } from '../../../src/core/warnings/index.js';
import { describeInconsistentLayoutOrder } from '../../../src/core/warnings/readingOrder/rebuildConsistency.js';
import {
  READING_ORDER_REMEDY,
  READING_ORDER_UNRESOLVED_REMEDY,
} from '../../../src/core/warnings/readingOrder/remedy.js';
import type { LayoutBlock, PageResult } from '../../../src/types/index.js';
import { block, line } from './helpers.js';

const TITLE = 'Night-shift work and gut microbial diversity';

function oneLineBlock(text: string, x: number, y: number, width: number, height: number): LayoutBlock {
  return block(x, y, width, height, { text, lines: [line(text, x, y, width, height)] });
}

/** A sidebar (x 36) and an abstract (x 176) that share baselines, read
 *  one line from each in turn — the shape of `paper-floats-out-of-order`. */
function wovenBlocks(pairs = 4): LayoutBlock[] {
  const blocks: LayoutBlock[] = [];
  for (let k = 0; k < pairs; k++) {
    const y = 200 + k * 11.6;
    blocks.push(oneLineBlock(`abstract line ${k} continues the sentence`, 176, y, 400, 9.5));
    blocks.push(oneLineBlock(`sidebar line ${k} of the citation`, 36, y + 5, 110, 7));
  }
  return blocks;
}

/** A heading-led page whose title the producer drew last, so the heading
 *  detector fires; `middle` sits between the title and the body. */
function divergentPage(middle: LayoutBlock[]): PageResult {
  const body = 'Published research findings are sometimes refuted by subsequent evidence. '.repeat(20);
  const blocks = [
    block(176, 61, 347, 35, { text: TITLE, role: 'heading' }),
    ...middle,
    block(176, 450, 192, 300, { text: body.slice(0, 700) }),
    block(384, 450, 192, 300, { text: body.slice(700) }),
  ];
  const middleText = middle.map((b) => b.text).join('\n');
  const text = `${body}\n${middleText}\n${TITLE}`;
  return {
    page: 1,
    text,
    charCount: text.length,
    imageCount: 0,
    vectorCount: 0,
    textCoverage: 0,
    nonPrintableRatio: 0,
    nonPrintableCount: 0,
    width: 612,
    height: 792,
    layout: { blocks },
    quality: { nativeTextStatus: 'ok' },
  };
}

function divergence(p: PageResult) {
  return detectPageWarnings(p).find((w) => w.code === 'reading_order_divergence');
}

describe('reading_order_divergence remedy when the layout order is broken too', () => {
  it('stops recommending the layout order when side-by-side blocks are read line by line', () => {
    const warning = divergence(divergentPage(wovenBlocks()));
    expect(warning).toBeDefined();
    expect(warning?.message).toContain('heading "Night-shift work and gut microbial diver"');
    expect(warning?.message).toContain('the layout-rebuilt order is unreliable here too');
    expect(warning?.message).toContain(
      'side-by-side blocks "abstract line 0 continues the sentence" and "sidebar line 0 of the citation" are interleaved line by line',
    );
    expect(warning?.message.endsWith(`; ${READING_ORDER_UNRESOLVED_REMEDY}`)).toBe(true);
    expect(warning?.message).not.toContain(READING_ORDER_REMEDY);
  });

  it('stops recommending the layout order when one block runs on into the column beside it', () => {
    const lines = [
      line('16S rRNA gene was sequenced on a paired-end', 384, 580, 192, 9.5),
      line('years, and fewer still have adjusted for diet, which platform.', 176, 592, 243, 9.5),
      line('differs systematically between shift patterns.', 176, 604, 169, 9.5),
    ];
    const fused = block(176, 580, 400, 33.5, { text: lines.map((l) => l.text).join('\n'), lines });
    const warning = divergence(divergentPage([fused]));
    expect(warning?.message).toContain(
      'one block runs from "16S rRNA gene was sequenced on a pair..." into "differs systematically between shift ..." in a side-by-side column',
    );
    expect(warning?.message.endsWith(READING_ORDER_UNRESOLVED_REMEDY)).toBe(true);
  });

  it('keeps the layout-order remedy when the layout order shows no such defect', () => {
    const paragraph = [
      oneLineBlock('Abstract text that runs across the main area', 176, 200, 400, 9.5),
      oneLineBlock('and a second paragraph further down the page', 176, 230, 400, 9.5),
    ];
    const warning = divergence(divergentPage(paragraph));
    expect(warning?.message.endsWith(READING_ORDER_REMEDY)).toBe(true);
  });

  it('accepts a margin note or two beside a paragraph', () => {
    // P Q P: a note read between two paragraphs is a plausible reading order.
    expect(describeInconsistentLayoutOrder(wovenBlocks(2).slice(0, 3))).toBeUndefined();
    expect(describeInconsistentLayoutOrder(wovenBlocks(3).slice(0, 4))).toBeUndefined();
    expect(describeInconsistentLayoutOrder(wovenBlocks(3).slice(0, 5))).toBeDefined();
  });

  it('does not read a label/value table row by row as interleaved prose', () => {
    const rows: LayoutBlock[] = [];
    for (let k = 0; k < 6; k++) {
      rows.push(oneLineBlock(`${k + 1}`, 36, 200 + k * 12, 6, 8));
      rows.push(oneLineBlock(`Task name number ${k}`, 60, 200 + k * 12, 120, 8));
    }
    expect(describeInconsistentLayoutOrder(rows)).toBeUndefined();
  });

  it('does not treat side-by-side entries spaced apart as one woven paragraph', () => {
    // Term / definition rows: each side resumes well below its previous
    // block, so the blocks were never one paragraph split by the other side.
    const rows: LayoutBlock[] = [];
    for (let k = 0; k < 4; k++) {
      rows.push(oneLineBlock(`Defined term number ${k}`, 36, 200 + k * 30, 110, 9));
      rows.push(oneLineBlock(`what the defined term ${k} means here`, 176, 200 + k * 30, 300, 9));
    }
    expect(describeInconsistentLayoutOrder(rows)).toBeUndefined();
  });

  it('ignores vertical-writing blocks, whose lines are side by side by design', () => {
    const lines = [line('縦書きの一行目です', 300, 100, 12, 200), line('縦書きの二行目です', 280, 100, 12, 200)];
    const vertical = block(280, 100, 32, 200, { text: '縦書き', lines, writingMode: 'vertical' });
    expect(describeInconsistentLayoutOrder([vertical])).toBeUndefined();
  });

  it('leaves the in-block character-reorder variant alone', () => {
    // Its subject is one block's characters, which the layout has right
    // whatever happens elsewhere on the page.
    const blocks = [...wovenBlocks(), oneLineBlock('x = a + b^2', 176, 400, 60, 9.5)];
    const p = divergentPage([]);
    p.layout = { blocks };
    p.text = `${blocks
      .slice(0, -1)
      .map((b) => b.text)
      .join('\n')}\nx = a + 2^b`;
    const warning = divergence(p);
    expect(warning?.message.endsWith('prefer layout.blocks order when exact sequence matters')).toBe(true);
  });
});
