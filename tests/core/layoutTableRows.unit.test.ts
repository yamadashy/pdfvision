import { describe, expect, it } from 'vitest';
import { buildLayout } from '../../src/core/layout/index.js';
import type { LayoutTable, TextSpan } from '../../src/types/index.js';

function span(text: string, x: number, y: number, width: number, fontSize = 9): TextSpan {
  return { text, x, y, width, height: fontSize, fontSize };
}

function texts(table: LayoutTable | undefined): string[][] | undefined {
  return table?.rows.map((row) => row.cells.map((cell) => cell.text));
}

function findTable(tables: LayoutTable[] | undefined, text: string): LayoutTable | undefined {
  return tables?.find((table) => table.rows.some((row) => row.cells.some((cell) => cell.text === text)));
}

// Cash-flow-statement shape: a label column and two right-aligned year
// columns, section labels without values, `—` for zero.
function statement(rows: [string, string?, string?][]): TextSpan[] {
  const spans: TextSpan[] = [span('2024', 448, 100, 22), span('2023', 518, 100, 22)];
  rows.forEach(([label, current, prior], index) => {
    const y = 120 + index * 16.6;
    spans.push(span(label, 84, y, label.length * 4.4));
    if (current)
      spans.push(
        span(
          current,
          current === '—' ? 460 : 470 - current.length * 4.6,
          y,
          current === '—' ? 10 : current.length * 4.6,
        ),
      );
    if (prior)
      spans.push(
        span(prior, prior === '—' ? 530 : 540 - prior.length * 4.6, y, prior === '—' ? 10 : prior.length * 4.6),
      );
  });
  return spans;
}

describe('layout table rows — dash placeholders (#250)', () => {
  const rows: [string, string?, string?][] = [
    ['Operating activities:'],
    ['Net income', '93,736', '96,995'],
    ['Adjustments to reconcile net income:'],
    ['Depreciation and amortization', '11,445', '11,519'],
    ['Share-based compensation expense', '11,688', '10,833'],
    ['Deferred income tax benefit', '(4,738)', '—'],
    ['Restructuring charges', '—', '—'],
    ['Other', '(2,266)', '(2,227)'],
    ['Changes in operating assets:'],
    ['Accounts receivable, net', '(3,788)', '(1,688)'],
    ['Vendor non-trade receivables', '—', '1,271'],
    ['Inventories', '(1,046)', '(1,618)'],
  ];

  it('keeps a row of nothing but placeholders inside the table it sits in', () => {
    const table = findTable(buildLayout(statement(rows), 612, 792).tables, '93,736');

    expect(texts(table)).toContainEqual(['Restructuring charges', '—', '—']);
    expect(texts(table)).toContainEqual(['Inventories', '(1,046)', '(1,618)']);
    const restructuring = table?.rows.find((row) => row.cells[0]?.text === 'Restructuring charges');
    expect(restructuring?.cells.map((cell) => cell.column)).toEqual([0, 1, 2]);
  });

  it('keeps placeholder rows that open a table above its first numbered row', () => {
    const spans = statement([
      ['Bonds', '—', '—'],
      ['Municipal', '—', '—'],
      ['Corporate', '24,539', '23,373'],
      ['Other', '50,590', '48,571'],
      ['Subtotal', '75,129', '71,944'],
      ['Total', '75,129', '71,944'],
    ]);
    const table = findTable(buildLayout(spans, 612, 792).tables, '24,539');

    expect(texts(table)?.slice(1, 3)).toEqual([
      ['Bonds', '—', '—'],
      ['Municipal', '—', '—'],
    ]);
  });

  it('does not admit a placeholder row whose dashes sit outside the value columns', () => {
    const restructuringY = 120 + 6 * 16.6;
    const misaligned = statement(rows).map((item) =>
      item.y === restructuringY && item.text === '—' ? { ...item, x: item.x - 160 } : item,
    );
    const tables = buildLayout(misaligned, 612, 792).tables ?? [];

    expect(tables.flatMap((table) => texts(table)?.flat() ?? [])).not.toContain('Restructuring charges');
  });
});
