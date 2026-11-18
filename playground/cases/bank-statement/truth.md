# Two-page bank statement with a running balance

- **Stresses:** transaction table with no vertical rules and zebra-striped rows; every row leaves either Paid out or Paid in empty; running balance column; descriptions wrapping onto a reference line; table continued on page 2 with a repeated header and a balance-brought-forward row; summary box
- **Families:** tables, structure
- **Status:** known-gap (#308)

Two Letter pages. Account holder Ms R. Adeyemi, account 40-11-22 ••••4417, statement period 1–31 October
2026. Summary: opening balance £2,418.37, paid in £3,574.23, paid out £2,364.17,
closing balance £3,628.43.

Transactions (page 1 holds the first 12; page 2 starts with *Balance brought forward
£3,686.11*). Each amount belongs in exactly one of the two amount columns:

| Date | Description | Paid out | Paid in | Balance |
| --- | --- | ---: | ---: | ---: |
| Oct 01 | Rent — Linden Court Lettings (Standing order ref LCL-0412) | 1,150.00 |  | 1,268.37 |
| Oct 01 | Salary — Harrowgate Instruments Ltd |  | 3,285.40 | 4,553.77 |
| Oct 03 | Card purchase — Fenmore Grocers (Card ending 7731) | 86.12 |  | 4,467.65 |
| Oct 04 | Direct debit — Northwave Energy (Ref NWE 55190023) | 94.50 |  | 4,373.15 |
| Oct 07 | Transfer from J. Okonjo (Concert tickets) |  | 60.00 | 4,433.15 |
| Oct 08 | Card purchase — Pelham Rail | 42.80 |  | 4,390.35 |
| Oct 10 | ATM withdrawal — High St branch | 100.00 |  | 4,290.35 |
| Oct 12 | Direct debit — Cobalt Mobile (Ref CM-77810) | 18.00 |  | 4,272.35 |
| Oct 14 | Card refund — Pelham Rail (Delay repay) |  | 12.40 | 4,284.75 |
| Oct 15 | Card purchase — Fenmore Grocers (Card ending 7731) | 73.65 |  | 4,211.10 |
| Oct 17 | Transfer to Savings 40-11-22 88301245 | 500.00 |  | 3,711.10 |
| Oct 19 | Card purchase — Thistle & Page Books | 24.99 |  | 3,686.11 |
| Oct 21 | Direct debit — Brook Valley Water (Ref BVW 1100387) | 31.20 |  | 3,654.91 |
| Oct 22 | Interest paid |  | 1.83 | 3,656.74 |
| Oct 24 | Card purchase — Fenmore Grocers (Card ending 7731) | 91.07 |  | 3,565.67 |
| Oct 25 | Faster payment — Marsh Dental Practice (Inv 20931) | 65.00 |  | 3,500.67 |
| Oct 27 | Card purchase — Kestrel Fuel (Card ending 7731) | 58.34 |  | 3,442.33 |
| Oct 28 | Transfer from HMRC (Tax refund 2025-26) |  | 214.60 | 3,656.93 |
| Oct 30 | Card purchase — Lantern Cinema | 23.50 |  | 3,633.43 |
| Oct 31 | Monthly account fee | 5.00 |  | 3,628.43 |

## Questions an agent should be able to answer

1. How much was the Oct 14 Pelham Rail transaction, and was it money in or out? — £12.40 paid in (a refund)
2. What was the balance after the transfer to savings on Oct 17? — £3,711.10
3. What was the closing balance, and the balance brought forward to page 2? — £3,628.43; £3,686.11
4. How much was spent at Fenmore Grocers in October? — £250.84 (86.12 + 73.65 + 91.07)
5. What is the reference of the Northwave Energy direct debit? — NWE 55190023

Questions 2–5 are answerable from `read.md`, and page 2 is read well: its rows are a 15 × 5 layout
table with every amount in its own column (`| Oct 22 | Interest paid | | 1.83 | 3,656.74 |`), the
wrapped references on rows of their own, and a `layout_table_uncertain` warning that names the region.

**Known gap (#308):** page 1 — the same table, under the same header, with twelve rows — is not
detected as a table and nothing warns. Its body gives each row as date / description / one amount /
balance (`Oct 14` / `Card refund — Pelham Rail` / `Delay repay` / `12.40` / `4,284.75`), so whether
an amount was paid out or paid in is lost; it can only be worked out by differencing consecutive
balances. Question 1 (and any question about the money in or out on page 1, such as the Oct 07
transfer) needs that arithmetic; an agent that sums "the amounts" for spending counts the salary and
the refund too. Some wrapped references are also emitted after the amounts instead of under the
description (`94.50` / `4,373.15` / `Ref NWE 55190023`).
