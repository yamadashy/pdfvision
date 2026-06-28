import { describe, expect, it } from 'vitest';
import { captionTextsFromBlock } from '../../src/core/visualRegions/captions/extraction.js';
import type { LayoutBlock, LayoutLine } from '../../src/types/index.js';

function line(text: string, y: number): LayoutLine {
  return {
    text,
    x: 300,
    y,
    width: 230,
    height: 10,
    fontSize: 10,
  };
}

function block(lines: LayoutLine[]): LayoutBlock {
  return {
    text: lines.map((item) => item.text).join('\n'),
    x: Math.min(...lines.map((item) => item.x)),
    y: Math.min(...lines.map((item) => item.y)),
    width: Math.max(...lines.map((item) => item.x + item.width)) - Math.min(...lines.map((item) => item.x)),
    height: Math.max(...lines.map((item) => item.y + item.height)) - Math.min(...lines.map((item) => item.y)),
    lines,
  };
}

describe('captionTextsFromBlock', () => {
  it('does not treat mid-block figure references in body prose as captions', () => {
    const captions = captionTextsFromBlock(
      block([
        line('While we have focused on studying task-learning capabilities,', 90),
        line('the representation protocol is described in detail.', 102),
        line('Figure 6 summarizes our findings. To minimize selection effects,', 120),
        line('we first study performance on the evaluation suite.', 132),
      ]),
      0,
    );

    expect(captions).toEqual([]);
  });

  it('keeps standalone figure captions at the start of a block', () => {
    const captions = captionTextsFromBlock(
      block([
        line('Figure 5. Zero-shot CLIP outperforms few-shot linear probes.', 236),
        line('Zero-shot CLIP matches the average performance of a 4-shot classifier.', 247),
      ]),
      7,
    );

    expect(captions).toEqual([
      {
        text: 'Figure 5. Zero-shot CLIP outperforms few-shot linear probes. Zero-shot CLIP matches the average performance of a 4-shot classifier.',
        relation: 'caption',
        x: 300,
        y: 236,
        width: 230,
        height: 21,
        blockIndex: 7,
      },
    ]);
  });
});
