import { describe, expect, it } from 'vitest';
import { markRepeatedBlocks } from '../../src/core/layout/index.js';
import { overlayUnits } from '../../src/core/layout/repeatedChrome.js';
import type { LayoutBlock, PageResult } from '../../src/types/index.js';

function block(text: string, y: number): LayoutBlock {
  return { text, x: 30, y, width: 200, height: 10, lines: [{ text, x: 30, y, width: 200, height: 10, fontSize: 9 }] };
}

function page(pageNum: number, texts: readonly [string, number][], width = 362.83): PageResult {
  return {
    page: pageNum,
    text: texts.map(([text]) => text).join('\n'),
    charCount: 100,
    imageCount: 0,
    vectorCount: 0,
    textCoverage: 0.1,
    nonPrintableRatio: 0,
    nonPrintableCount: 0,
    width,
    height: 272.13,
    quality: { nativeTextStatus: 'ok' },
    layout: { blocks: texts.map(([text, y]) => block(text, y)) },
  };
}

const NAV: [string, number] = ['Introduction Explicit methods Implicit methods Summary', 4];
const FOOTER: [string, number] = ['Ana Ferreira', 262];
const FRAME: [string, number][] = [
  ['Explicit Euler for the heat equation', 30],
  ['Forward difference in time, central difference in space', 60],
  ['Each step costs O(N) — no linear system to solve', 80],
  ['Error is O(Δt + Δx^2) while the scheme is stable', 100],
];

function deck(): PageResult[] {
  return [
    page(1, [NAV, ['Numerical Methods for PDEs', 80], ['Lecture 5', 110], FOOTER]),
    page(2, [NAV, ['Outline', 30], ['1 Model problem: the heat equation', 80], FOOTER]),
    page(3, [NAV, ...FRAME, ['u_j^{n+1} = u_j^n + λ', 140], FOOTER]),
    page(4, [NAV, ...FRAME, ['u_j^{n+1} = u_j^n + λ', 140], FOOTER]),
    page(5, [NAV, ...FRAME, ['Δt ≤ Δx^2 / 2', 140], FOOTER]),
  ];
}

describe('overlay steps and repeated chrome (#270)', () => {
  it('groups consecutive pages that repeat one slide step by step', () => {
    expect(overlayUnits(deck())).toEqual([0, 1, 2, 2, 2]);
  });

  it('keeps a frame body shared by its overlay steps, and still strips real chrome', () => {
    const pages = deck();
    markRepeatedBlocks(pages);
    const repeated = (p: PageResult, text: string) => p.layout?.blocks.find((b) => b.text === text)?.repeated;
    for (const p of pages) {
      expect(repeated(p, NAV[0])).toBe(true);
      expect(repeated(p, FOOTER[0])).toBe(true);
    }
    for (const p of pages.slice(2)) {
      expect(repeated(p, 'Explicit Euler for the heat equation')).toBeUndefined();
      expect(repeated(p, 'Forward difference in time, central difference in space')).toBeUndefined();
    }
  });

  it('does not group pages that only share their chrome, or pages of another size', () => {
    const pages = [
      page(1, [NAV, ['Body one', 80], ['More one', 100], FOOTER]),
      page(2, [NAV, ['Body two', 80], ['More two', 100], FOOTER]),
      page(3, [NAV, ['Body two', 80], ['More two', 100], FOOTER], 612),
    ];
    expect(overlayUnits(pages)).toEqual([0, 1, 2]);
  });

  it('does not group pages that are not consecutive', () => {
    const [a, , c] = deck().slice(2);
    expect(overlayUnits([a, { ...c, page: 9 }])).toEqual([0, 1]);
  });
});
