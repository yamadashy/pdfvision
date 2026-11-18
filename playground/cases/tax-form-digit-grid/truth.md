# Tax-return form (確定申告書) with digit grids

- **Stresses:** one digit per ruled box; coloured section bands with labels stacked one character per line; circled line numbers; レ ticks in checkboxes; furigana above the name; template drawn first, values overlaid after; fine print
- **Families:** tables, vertical-rotated, structure
- **Status:** ok
- **Showcase:** Every amount is a row of single digits in ruled boxes, overlaid after the template, so nothing but geometry ties a number to its label or its stacked section band.

An A4 page laid out like the first sheet of a Japanese income-tax return, printed filled in by
tax software: the template (ruled boxes, labels, bands) is drawn first and the taxpayer's values
are overlaid afterwards, each digit centred in its own box. Not an AcroForm. Fictional data.

**令和８年分の所得税及び復興特別所得税の確定申告書** — 提出先 緑ヶ丘税務署長, 提出日 令和９年３月１０日.

- 住所: 東京都緑ヶ丘市青葉台二丁目１４番３号
- フリガナ: アオキ ミサキ (small, above the name) / 氏名: 青木 美咲
- 個人番号: `417203985610` — twelve boxes, one digit each
- 職業: 会社員; 生年月日: 昭和６３年７月２２日; 電話番号: ０４２－５５５－０１８７; 性別: 女 (レ in the 女 box)
- 申告の種類 checkboxes (青色 / 分離 / 損失 / 修正): none ticked

Section bands on the left of each block carry labels stacked one character per line
(収入金額等、所得金額等、所得から差し引かれる金額、税金の計算; the third is two stacked columns read
right to left). Amounts sit right-aligned in 9-box digit grids with a heavier rule every three
boxes from the right; ⑯ is left empty.

| 区分 | 項目 | 番号 | 金額 |
| --- | --- | --- | ---: |
| 収入金額等 | 給与 | ア | 6,240,000 |
| 収入金額等 | 配当 | イ | 48,000 |
| 収入金額等 | 雑（その他） | ウ | 135,000 |
| 所得金額等 | 給与 | ① | 4,552,000 |
| 所得金額等 | 配当 | ② | 48,000 |
| 所得金額等 | 雑 | ③ | 95,000 |
| 所得金額等 | 合計（①から③まで） | ④ | 4,695,000 |
| 所得から差し引かれる金額 | 社会保険料控除 | ⑤ | 912,000 |
| 所得から差し引かれる金額 | 生命保険料控除 | ⑥ | 40,000 |
| 所得から差し引かれる金額 | 基礎控除 | ⑦ | 480,000 |
| 所得から差し引かれる金額 | 合計（⑤から⑦まで） | ⑧ | 1,432,000 |
| 税金の計算 | 課税される所得金額（④－⑧） | ⑨ | 3,263,000 |
| 税金の計算 | 上の⑨に対する税額 | ⑩ | 228,800 |
| 税金の計算 | 配当控除 | ⑪ | 4,800 |
| 税金の計算 | 差引所得税額（⑩－⑪） | ⑫ | 224,000 |
| 税金の計算 | 復興特別所得税額（⑫×2.1%） | ⑬ | 4,704 |
| 税金の計算 | 所得税及び復興特別所得税の額 | ⑭ | 228,704 |
| 税金の計算 | 源泉徴収税額 | ⑮ | 251,300 |
| 税金の計算 | 申告納税額（⑭－⑮） | ⑯ |  |
| 税金の計算 | 還付される税金 | ⑰ | 22,596 |

還付される税金の受取場所: みどり信用金庫 青葉台支店; 預金の種類 普通 / 当座 / 納税準備 / 貯蓄 with レ in
**普通**; 口座番号 `0381624`.

Fine print at the foot: ※ 金額の頭には「￥」を付けないでください。 ○ 源泉徴収票など、申告書に添付する書類は、提出又は提示してください。 ○ 還付される税金の受取場所は、申告者本人名義の口座に限ります。

A correct reading keeps every amount whole and on its own row label (`給与 ① 4,552,000` or the
digits without separators), and never runs the stacked band characters into the row labels.
Circled numbers may come back NFKC-normalised (`①` → `1`).

## Questions an agent should be able to answer

1. 還付される税金はいくらか。 — 22,596円
2. 所得金額等の合計（④）はいくらか。 — 4,695,000円
3. 源泉徴収税額はいくらか。 — 251,300円
4. 還付金はどの口座に振り込まれるか。 — みどり信用金庫 青葉台支店、普通預金、口座番号 0381624
5. 申告者の氏名の読みは何か。 — アオキ ミサキ

**Current reading (ok, via warnings):** the page body reads the header fields label by label
(`氏 名` / `青木 美咲`) and the income and deduction rows row by row (`合計(1から3まで)` / `4` /
`4 6 9 5 0 0 0`), each amount right after its label and line number (`給与` / `ア` /
`6 2 4 0 0 0 0` first); it used to follow the drawing order of template and overlay, with every amount far from its label. The layout table pairs most of them correctly — `| 給与 | ア | 6 2 4 0 0 0 0 | 課税される所得金額(4-8) 9 | | 3 2 6 3 0 0 0 |`,
`| 源泉徴収税額 | 15 | 2 5 1 3 0 0 |`, `| 還付される税金 | 17 | 2 2 5 9 6 |` — and the stacked band
labels are rebuilt as words (`収入金額等`, `所得から差し` / `引かれる金額`), never spliced into the
rows. But the 所得金額等 rows ① to ④ lose their labels and line numbers in the table
(`| | | 4 6 9 5 0 0 0 | …`), and 申告納税額 ⑯ is missing from it. `layout_table_uncertain` says
exactly that (“8 lines with numbers inside the table belong to no row … render that region
(--render-region …) before trusting the table”) and `dense_vector_graphics` says to inspect the
render. All five questions are answered from `read.md` (`預金の種類 レ普通`, `アオキ ミサキ`, and
question 2 from the body row `合計(1から3まで)` / `4` / `4 6 9 5 0 0 0`, which the table lacks). Circled numbers come back NFKC-normalised
(`④` → `4`).
