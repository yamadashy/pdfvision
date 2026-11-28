# Japanese earnings summary body set one glyph at a time (決算短信 経営成績の概況)

- **Stresses:** A4; every body glyph placed on its own with no space glyphs; justified lines spread by moving glyphs apart, several lines ending early and spread wide; a word space inside a spread line (a game title) and a Latin company name in one
- **Families:** encoding, scripts
- **Status:** ok
- **Showcase:** Every glyph is placed on its own, so a justified line is only glyphs moved apart: pdf.js reads each move as a space between every character, and a real word space in that line is just a wider move.

**１．経営成績等の概況**

**（１）当期の経営成績の概況**

当連結会計年度におけるわが国経済は、雇用・所得環境の改善や各種政策の効果により、緩やかな回復基調で推移いたしました。一方で、原材料価格の高止まりや為替相場の変動など、先行きは依然として不透明な状況が続いております。

このような環境のもと、当社グループの当連結会計年度の売上高は1,284億3千万円（前年同期比8.6％増）、営業利益は142億7百万円（同12.1％増）、経常利益は151億2千万円（同11.8％増）、親会社株主に帰属する当期純利益は98億5千万円（同10.4％増）となりました。なお、セグメント別の詳細は当社ウェブサイト（https://www.minami-seiki.example/ir/library/）に掲載の決算説明資料をご覧ください。

エンターテインメント事業では、当社が本年10月に発売した『ハルカの冒険 ソラ ノ カケラ』（HRK-2026-SG01）が国内外で好調に推移し、累計販売本数は320万本となりました。

海外事業では、欧州における販売体制の強化を目的として、連結子会社であるMinami Precision Europe GmbHを通じてドイツ国内に新たな物流拠点を開設いたしました。

**（２）今後の見通し**

次期の連結業績につきましては、売上高1,350億円、営業利益150億円、経常利益158億円、親会社株主に帰属する当期純利益103億円を見込んでおります。

(Every line but the last of a paragraph is justified: its glyphs are moved apart until it spans the
measure. A number, a product code or a Latin name is never broken, so a line that cannot take the next
one ends early and is spread wider. The spaces inside 『ハルカの冒険 ソラ ノ カケラ』 and
`Minami Precision Europe GmbH` are real: wider moves, with no space glyph drawn.)

## Questions an agent should be able to answer

1. What were consolidated net sales for the year, and how did they change? — 1,284億3千万円, 前年同期比8.6％増
2. Which title drove the entertainment business, and how many copies has it sold? — 『ハルカの冒険 ソラ ノ カケラ』, 320万本
3. Through which subsidiary did the company open its new logistics base in Germany? — Minami Precision Europe GmbH
4. What net sales and operating profit does the company forecast for next year? — 売上高1,350億円, 営業利益150億円

Each justified line reads as set, with no space between its characters (#268): on a page where every
glyph is placed on its own, the drawn positions show the spread line at one pitch and the lines around it
set tightly to the same measure, so 「エンターテインメント事業」 and 「欧州における販売体制」 can be searched. The
title keeps its word spaces (`『ハルカの冒険 ソラ ノ カケラ』`): those moves are wider than the line's pitch.
Every question is answered from the body.
