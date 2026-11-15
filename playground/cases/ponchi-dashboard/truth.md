# Japanese ministry briefing slide (ポンチ絵) with flow boxes and four charts

- **Stresses:** A4 landscape CJK slide; about twenty rounded boxes joined by arrows; four vector charts whose values are free data labels; 100% stacked bar and donut labels with no series link; rotated label on a vertical band
- **Families:** vector-meaning, reading-order, vertical-rotated, scripts
- **Status:** known-gap

One A4 landscape slide from a fictional ministry (国土産業振興省 地域政策局), labelled `資料２`,
dated 令和8年11月, page number `2` at the bottom right.

**Title bar:** 地域デジタル人材育成プログラム（仮称）の概要. Lead sentence: 地方のデジタル人材不足を解消するため、研修・伴走支援・講師育成を一体的に実施する。
Callout at the top right: 令和9年度要求額 **42.5億円**（新規）.

**Left band:** a pale vertical band down the left edge carries `令和9年度 概算要求 重点施策` as real text rotated
90° counter-clockwise (reads bottom to top). It is a label for the whole slide, not part of the flow.

**Flow (three columns, left to right, joined by arrows):** each 課題 box has an arrow to the 施策
box on the same row; a large block arrow leads from the 施策 column to the 効果 column.

| 現状・課題 | → | 対応（施策） |
| --- | --- | --- |
| 地方ではデジタル人材が慢性的に不足（2026年には14.6万人が不足する見込み） | → | ① オンライン研修プラットフォームの整備：動画教材・演習環境を無償で提供 |
| 研修機会が都市部に集中し、地方部の受講者数は都市部の3分の1以下 | → | ② 地域の大学・高専と連携した実践講座：週末・夜間の通学型講座を全国50か所で開講 |
| 中小企業の約半数がDXに未着手（相談できる専門家が身近にいない） | → | ③ 中小企業への専門家派遣（伴走支援）：1社あたり最大6か月、課題の特定から実装まで |
| 地域で指導者・講師を確保できない（講師の約7割が首都圏在住） | → | ④ 講師育成・認定制度の創設：地域在住の実務家を講師として認定・登録 |

効果（目標）: 2030年度までに支援対象者3万人を育成 / 地方部の研修受講者数を5年間で2倍に / 中小企業のDX取組率を60%に引き上げ.

**Charts (bottom row, four panels, left to right).** Every value is a text data label placed next
to its bar, point or segment; nothing in the text says which label belongs to which series.

1. デジタル人材の不足数（推計） （万人） — bar chart: 2022 8.2, 2023 9.5, 2024 11.3, 2025 12.8, 2026 14.6.
2. 研修受講者数の推移 （千人） — line chart, two series (legend at the top; 地方部 dashed):
   - 都市部: 2021 3.1, 2022 3.8, 2023 4.6, 2024 5.2, 2025 6.0
   - 地方部: 2021 0.9, 2022 1.1, 2023 1.4, 2024 1.6, 2025 1.9
3. 企業規模別のDX取組状況 — 100% stacked horizontal bars, white percent labels inside the segments,
   legend below (取組済 / 検討中 / 未着手):
   - 大企業: 取組済 62% / 検討中 28% / 未着手 10%
   - 中堅企業: 取組済 41% / 検討中 33% / 未着手 26%
   - 中小企業: 取組済 22% / 検討中 30% / 未着手 48%
   - 小規模事業者: 取組済 9% / 検討中 21% / 未着手 70%
4. 支援対象者の内訳（目標） — donut, centre text `3万人 目標`, percent labels on the ring,
   names in a legend to the right: 在職者 45%, 離職者・求職者 25%, 学生 20%, その他 10%.

**Source note:** 出典：国土産業振興省「地域デジタル人材実態調査（2026年）」、同「研修事業実績報告（2021〜2025年度）」を基に作成。2026年の不足数と目標値は事務局による試算。

## Questions an agent should be able to answer

1. デジタル人材の不足数が12.8万人と推計されているのは何年か？ — 2025年
2. 2025年の地方部の研修受講者数は？ — 1.9千人（都市部は6.0千人）
3. 中小企業のうち、DXに「未着手」の割合は？ — 48%
4. 「地域で指導者・講師を確保できない」という課題に対応する施策は？ — ④ 講師育成・認定制度の創設
5. 支援対象者の内訳で最も割合が大きいのは何で、何%か？ — 在職者、45%

**Known gap (no issue yet):** the page raises no warning at all (100 vector ops, no
`dense_vector_graphics`, no layout-table caveat), yet the chart values come back as a stream
with no series or category link, partly out of order, plus one bogus layout table:

- Bar chart: `8.2 / 2022 / 11.3 / 9.5 / 2023 / 2024 / 14.6 / 12.8 / 2025 / 2026`. Pairing labels
  in stream order gives 11.3 → 2023 and 12.8 → 2026, so question 1 is answered wrongly (2026)
  unless the agent assumes the bars rise monotonically.
- Line chart: `3.1 / 0.9 / 2021 / 2022 / … / 4.6 / 3.8 / 1.4 / 1.1 / 2023 / 都市部 / 5.2 / 1.6 / 2024 /
  地方部 / 6.0 / 1.9 / 2025`. Which value belongs to 地方部 is never stated; question 2 needs the
  guess that the smaller series is 地方部 (the 課題 text happens to support it).
- Stacked bars: `中小企業 22%` keeps only its first segment; the other segments come back
  column-wise (`取組済 / 62% / 41% / 30% / 検討中 / 28% 10% / 33% / 26% / 48% / 70% / 未着手`), so
  question 3 (48%) cannot be read off. The layout table (`Table 1 (6 rows × 5 columns)`) spans the
  bar, line and stacked charts, cuts off before the 中小企業 row, and mixes `12.8 | 中堅企業 | 41% | 33% | 26%`
  into one row.
- Donut: `10% / 20% / 3万人 / 目標 / 25% / 45% / 在職者 / 離職者・求職者 / 学生 / その他` — the
  percentages are never tied to the legend names, so question 5 is a guess.
- Flow: question 4 is answerable — 課題 1–3 and 施策 1–3 come back in order, and 課題 4
  (`地域で指導者・講師を確保できない`) and 施策 `4 講師育成・認定制度の創設` match by number and
  content — but the arrows themselves leave no trace, and 施策 4 is printed among the line-chart
  labels. The third 効果 box is split: `中小企業のDX取組率を` stays in the flow while
  `60%に引き上げ` lands after the stacked-bar labels, where it reads like a chart value.
- `①〜④` come back NFKC-normalised as `1〜4` (intended). The rotated band label
  `令和9年度 概算要求 重点施策` reads correctly.

Only the title, lead, flow text (questions about issues and measures) and the source note are
reliable from `read.md`; questions 1, 3 and 5 need the render.
