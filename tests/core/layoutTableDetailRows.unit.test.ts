import { describe, expect, it } from 'vitest';
import { buildLayout } from '../../src/core/layout/index.js';
import type { TextSpan } from '../../src/types/index.js';

function span(text: string, x: number, y: number, fontSize = 10, width = [...text].length * fontSize * 0.5): TextSpan {
  return { text, x, y, width, height: fontSize, fontSize };
}

describe('layout tables — rows that carry a detail line (#308)', () => {
  // A bank statement: some transactions carry a small, indented detail line
  // under their description, so the row pitch alternates between one and
  // two lines while the space between rows stays the same.
  const entries: [string, string, string, string, string | undefined][] = [
    ['Oct 01', 'Rent — Linden Court Lettings', '1,150.00', '', 'Standing order ref LCL-0412'],
    ['Oct 01', 'Salary — Harrowgate Instruments Ltd', '', '3,285.40', undefined],
    ['Oct 03', 'Card purchase — Fenmore Grocers', '86.12', '', 'Card ending 7731'],
    ['Oct 04', 'Direct debit — Northwave Energy', '94.50', '', 'Ref NWE 55190023'],
    ['Oct 07', 'Transfer from J. Okonjo', '', '60.00', 'Concert tickets'],
    ['Oct 08', 'Card purchase — Pelham Rail', '42.80', '', undefined],
    ['Oct 10', 'ATM withdrawal — High St branch', '100.00', '', undefined],
    ['Oct 12', 'Direct debit — Cobalt Mobile', '18.00', '', 'Ref CM-77810'],
    ['Oct 14', 'Card refund — Pelham Rail', '', '12.40', 'Delay repay'],
    ['Oct 15', 'Card purchase — Fenmore Grocers', '73.65', '', 'Card ending 7731'],
    ['Oct 17', 'Transfer to Savings', '500.00', '', undefined],
    ['Oct 19', 'Card purchase — Thistle & Page Books', '24.99', '', undefined],
  ];
  function statement(details: boolean): TextSpan[] {
    const spans = [
      span('Date', 54, 224.6, 8.5),
      span('Description', 104, 224.6, 8.5),
      span('Paid out', 376.7, 224.6, 8.5, 33.3),
      span('Paid in', 448.4, 224.6, 8.5, 27.6),
      span('Balance', 523.4, 224.6, 8.5, 32.6),
    ];
    let y = 241.6;
    let balance = 2418.37;
    for (const [date, description, out, paidIn, detail] of entries) {
      balance += (paidIn ? Number(paidIn.replace(',', '')) : 0) - (out ? Number(out.replace(',', '')) : 0);
      const amount = balance.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      spans.push(span(date, 54, y, 8.5, 25), span(description, 104, y, 8.5));
      if (out) spans.push(span(out, 410 - out.length * 4.25, y, 8.5, out.length * 4.25));
      if (paidIn) spans.push(span(paidIn, 476 - paidIn.length * 4.25, y, 8.5, paidIn.length * 4.25));
      spans.push(span(amount, 556 - amount.length * 4.25, y, 8.5, amount.length * 4.25));
      if (details && detail) spans.push(span(detail, 112, y + 10.3, 7.5));
      y += detail ? 26 : 16;
    }
    return spans;
  }

  it('detects the table and its header when some rows carry a detail line', () => {
    const [table] = buildLayout(statement(true), 612, 792).tables ?? [];
    expect(table?.rows[0]?.cells.map((cell) => cell.text)).toEqual([
      'Date',
      'Description',
      'Paid out',
      'Paid in',
      'Balance',
    ]);
    const refund = table?.rows.find((row) => row.cells.some((cell) => cell.text === 'Card refund — Pelham Rail'));
    expect(refund?.cells.find((cell) => cell.text === '12.40')?.column).toBe(3);
  });

  it('does not excuse an uneven pitch that no detail line explains', () => {
    // The same rows at the same uneven pitch, with the detail lines missing.
    expect(buildLayout(statement(false), 612, 792).tables ?? []).toHaveLength(0);
  });
});
