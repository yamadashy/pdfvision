# Segment information, two ruled tables

- **Stresses:** header cell wrapped onto a second line between the header row and the rows; a label-only group row; a ruled grid whose first band holds three rows; △ negatives; two tables of one shape on a page
- **Families:** tables, scripts
- **Status:** ok

株式会社ミナミ精機 — (2)セグメント情報等の注記, 2 報告セグメントの収益および業績. Two tables of the same shape, one per period, (単位:百万円).
The header is `精密機器 | 金融 | その他 | 消去又は全社 | 連結`; `消去又は全社` is set on two lines (`消去又は` / `全社`).

**前中間連結会計期間(2025年9月30日に終了した6ヶ月間)**

| | 精密機器 | 金融 | その他 | 消去又は全社 | 連結 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 営業収益 |  |  |  |  |  |
| 外部顧客への営業収益 | 812,450 | 64,120 | 18,230 | - | 894,800 |
| セグメント間の営業収益 | 2,310 | 1,840 | 26,750 | △30,900 | - |
| 計 | 814,760 | 65,960 | 44,980 | △30,900 | 894,800 |
| 営業費用 | 725,136 | 55,406 | 40,482 | △30,490 | 790,534 |
| 営業利益 | 89,624 | 10,554 | 4,498 | △410 | 104,266 |

**当中間連結会計期間(2026年9月30日に終了した6ヶ月間)**

| | 精密機器 | 金融 | その他 | 消去又は全社 | 連結 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 営業収益 |  |  |  |  |  |
| 外部顧客への営業収益 | 868,910 | 71,480 | 19,870 | - | 960,260 |
| セグメント間の営業収益 | 2,950 | 1,620 | 28,440 | △33,010 | - |
| 計 | 871,860 | 73,100 | 48,310 | △33,010 | 960,260 |
| 営業費用 | 775,955 | 61,404 | 43,479 | △32,600 | 848,238 |
| 営業利益 | 95,905 | 11,696 | 4,831 | △410 | 112,022 |

## Questions an agent should be able to answer

1. What was the 精密機器 segment's operating profit in the current interim period? — 95,905 百万円
2. How much inter-segment revenue was eliminated in the prior interim period? — △30,900 百万円 (消去又は全社)
3. What were consolidated operating expenses in the current interim period? — 848,238 百万円
4. What is the 金融 segment's total revenue (計) in each period? — 65,960 and 73,100 百万円

Both layout tables open on the header row with the wrapped cell joined (`| 精密機器 | 金融 | その他 | 消去又は 全社 | 連結 |`,
#294), then the `営業収益` group row, then the five value rows, each value under its segment, so every
question is answered from them. The header used to be lost: its second line `全社` sat between the
header row and the rows as a row of its own, which ended the header search, and the column header
of every value (`消去又は全社` vs `連結` for question 2) had to be guessed from the page body.
