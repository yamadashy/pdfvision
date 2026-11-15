# Landscape GAAP to non-GAAP reconciliation

- **Stresses:** Letter landscape; three-level centred header over two column groups; `$` as its own glyph; parenthesised negatives; `—` placeholders; footnote markers on values; per-share decimals; wrapped footnotes
- **Families:** tables, page-geometry
- **Status:** ok
- **Showcase:** A three-level centred header spans two column groups on a landscape page, with `$`, parenthesised negatives, `—` placeholders and footnote markers each set as separate glyphs that must be reattached to the right value.

NORTHBRIDGE SYSTEMS, INC. — RECONCILIATION OF GAAP TO NON-GAAP FINANCIAL MEASURES (Unaudited; in thousands, except per-share amounts).

Header: `Three Months Ended` spans the first three value columns and `Nine Months Ended` the last three; each
group has the date line `September 30, 2026` under it, then the column names `As Reported`, `Adjustments`, `As Adjusted`.
A correct reading attributes every value to period **and** column (qualified names below).
`(…)` is negative; `—` means zero/not applicable; `(a)`–`(c)` are footnote markers on the value
to their left, not values.

| Line item | Three Months Ended September 30, 2026 — As Reported | Three Months Ended September 30, 2026 — Adjustments | Three Months Ended September 30, 2026 — As Adjusted | Nine Months Ended September 30, 2026 — As Reported | Nine Months Ended September 30, 2026 — Adjustments | Nine Months Ended September 30, 2026 — As Adjusted |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Revenue | $ 412,580 | — | $ 412,580 | $ 1,186,240 | — | $ 1,186,240 |
| Cost of revenue | 158,920 | (6,410) (a) | 152,510 | 461,330 | (18,870) (a) | 442,460 |
| Gross profit | 253,660 | 6,410 | 260,070 | 724,910 | 18,870 | 743,780 |
| Research and development | 88,140 | (14,220) (a) | 73,920 | 259,600 | (41,050) (a) | 218,550 |
| Sales and marketing | 97,310 | (11,860) (a) | 85,450 | 284,170 | (33,940) (a) | 250,230 |
| General and administrative | 41,780 | (9,350) (a)(b) | 32,430 | 125,410 | (27,600) (a)(b) | 97,810 |
| Restructuring charges | 27,240 | (27,240) (b) | — | 38,620 | (38,620) (b) | — |
| Total operating expenses | 254,470 | (62,670) | 191,800 | 707,800 | (141,210) | 566,590 |
| Operating income (loss) | (810) | 69,080 | 68,270 | 17,110 | 160,080 | 177,190 |
| Other income, net | 3,120 | — | 3,120 | 8,940 | — | 8,940 |
| Provision for income taxes | 1,450 | 9,870 (c) | 11,320 | 6,210 | 31,420 (c) | 37,630 |
| Net income (loss) | $ 860 | 59,210 | $ 60,070 | $ 19,840 | 128,660 | $ 148,500 |
| Net income (loss) per share — diluted | $ 0.01 | 0.40 | $ 0.41 | $ 0.13 | 0.87 | $ 1.01 |
| Weighted-average shares — diluted | 148,200 | — | 148,200 | 147,650 | — | 147,650 |

Footnotes:

- (a) Stock-based compensation expense, which is excluded because it is a non-cash expense that varies with the price of our common stock and the timing of grants.
- (b) Restructuring charges consist of severance and facility exit costs under the plan announced in May 2026; general and administrative adjustments also include acquisition-related legal and advisory fees.
- (c) Income tax effect of the non-GAAP adjustments, calculated using a long-term projected non-GAAP tax rate of 16%.

## Questions an agent should be able to answer

1. What was non-GAAP (As Adjusted) operating income for the three months ended September 30, 2026? — $68,270 thousand
2. What was GAAP diluted net income (loss) per share for the nine months? — $0.13
3. How much stock-based compensation was excluded from research and development in the nine months? — 41,050 thousand (shown as (41,050) (a))
4. Which footnotes apply to the general and administrative adjustment, and what do they cover? — (a) stock-based compensation and (b) restructuring / acquisition-related costs
5. Was the quarter's GAAP operating result a profit or a loss? — a loss of 810 thousand, shown as (810)

**Current reading (ok — covered by warnings):** the layout table gets the three-level header right
(group, date, column names over the right columns), keeps `$` with its value, keeps `(…)` and
`—`, and attaches `(a)`/`(b)`/`(c)` to the value they follow. Questions 1, 2, 3 and 5 are answered
from it. Two rows lose their label and their first value: `|  |  | (9,350) (a)(b) | 32,430 | …` is
General and administrative without `41,780`, and `|  |  | (27,240) (b) | — | …` is
Restructuring charges without `27,240` — the two rows whose adjustment carries a
`(b)` marker. Question 4 is answerable only by row order. The table carries
`layout_table_uncertain` (“2 lines with numbers inside the table belong to no row … render that
region before trusting the table”), and the column-by-column page body carries
`tabular_numeric_layout`; in that body the `—` placeholders of the Adjustments columns are
pulled out of row order.
