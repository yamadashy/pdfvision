# Vertical 新旧対照条文 with side-lined amendments

- **Stresses:** vertical statute comparison on a /Rotate 90 sheet; upper half 改正後 over lower half 改正前, columns right to left; changed passages marked only by vector side lines; （略） provisions; an added article with a blank old half; hanging item numbers
- **Families:** vertical-rotated, tables, vector-meaning
- **Status:** ok

A portrait A4 page stored with `/Rotate 90`; a viewer shows an 842 × 595 pt landscape sheet
holding a vertical 新旧対照条文: the title **地域図書館の振興に関する法律施行規則の一部を改正する省令 新旧対照条文** in the rightmost column
and （傍線部分は改正部分） beside it. The table is split by a horizontal rule: the **upper half is 改正後, the
lower half 改正前**, each labelled in a narrow strip at the table's right edge. In each half the
text is vertical (glyph by glyph, the common DTP form, not an Identity-V font), columns run right
to left, and a provision's new and old text start in the same column position, so each pair sits
one above the other. 10 pt glyphs, 22 em boxes per column.

Changed passages are marked only by a vector side line (傍線) to the right of the glyphs — shown
below as <u>…</u>; the text carries no marker. Unchanged provisions are abbreviated to （略）. The
added article 第三条の二 is side-lined in full and the 改正前 half below it is empty.

| 改正後 | 改正前 |
| --- | --- |
| 第一条 （略） | 第一条 （略） |
| （定義）<br>第二条 この省令において、次の各号に掲げる用語の意義は、それぞれ当該各号に定めるところによる。<br>一 （略）<br>二 移動図書館 <u>自動車その他の移動手段</u>を用いて図書館資料の閲覧及び貸出しを行う事業をいう。<br>三 協議会 <u>法第八条第一項</u>に規定する図書館協議会をいう。 | （定義）<br>第二条 この省令において、次の各号に掲げる用語の意義は、それぞれ当該各号に定めるところによる。<br>一 （略）<br>二 移動図書館 <u>自動車</u>を用いて図書館資料の閲覧及び貸出しを行う事業をいう。<br>三 協議会 <u>法第八条</u>に規定する図書館協議会をいう。 |
| （計画の期間）<br>第三条 法第七条第一項の計画の期間は、<u>五年</u>とする。<br>２ （略） | （計画の期間）<br>第三条 法第七条第一項の計画の期間は、<u>三年</u>とする。<br>２ （略） |
| <u>（運営状況の評価の方法）</u><br><u>第三条の二 法第八条の二の評価は、利用者の満足度、図書館資料の貸出件数その他の地域図書館の運営の状況を示す指標を用いて行うものとする。</u> | _(blank)_ |
| 第四条及び第五条 （略） | 第四条及び第五条 （略） |

Page number `- 1 -` at the foot. A correct reading keeps 改正後 and 改正前 apart and each
provision whole, and an agent needs either the side lines or the pairing to tell what changed.
Full-width digits and brackets may come back NFKC-normalised (`２` → `2`, `（` → `(`).

## Questions an agent should be able to answer

1. 改正後の第三条で、計画の期間は何年か。改正前は何年だったか。 — 改正後は五年、改正前は三年
2. 第二条第二号「移動図書館」の定義はどう改められたか。 — 「自動車を用いて」が「自動車その他の移動手段を用いて」に改められた
3. この改正で新設される条は何か。その見出しは。 — 第三条の二（運営状況の評価の方法）
4. 第二条第三号「協議会」で引用する条文はどう変わったか。 — 「法第八条」から「法第八条第一項」へ
5. 第一条は改正されるか。 — 改正されない（両欄とも（略））

**Reads correctly (#261), side lines aside:** the rotated page is read exactly as the same drawing
stored landscape, as two tiers: the title and （傍線部分は改正部分）, then `改正後` and the whole upper half
column by column right to left, then `改正前` and the lower half, then `- 1 -`. Every provision
comes back whole and in order, with its label, caption and blank em boxes kept
(`第一条 (略)`, `(定義)`, `二 移動図書館 自動車その他の移動手段を用` / `いて図書館資料の…`,
`第三条の二 法第八条の二の評価は、…`). The side lines are not reported, so what changed is read by
comparing the two halves provision by provision, which the order now allows. No warning fires.
All five questions are answered from `read.md`.
