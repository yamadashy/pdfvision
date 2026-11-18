# Municipal newsletter page mixing vertical and horizontal Japanese

- **Stresses:** horizontal masthead; vertical feature article in the upper half with a two-column vertical headline and body columns right to left; horizontal event box with a ruled schedule table and a note in the lower half; horizontal photo caption beside a photo placeholder
- **Families:** vertical-rotated, scripts, reading-order
- **Status:** ok

One A4 page. Reading order: the masthead (広報みなと 2026年12月号 No.418), the vertical
article, then the horizontal event box. The photo caption belongs to the photo placeholder beside
the box.

The article, set vertically: headline **海辺の図書館、冬も開いています**, then the body (columns right to left):

> 旧漁協の倉庫を改装した「みなと海辺図書館」が、開館から一年を迎えました。窓いっぱいに海が見える閲覧席は、平日でも昼過ぎには満席になる人気ぶりです。
>
> これまで冬の間は休館していましたが、今年度から暖房設備を整え、十二月から三月までも開館することになりました。開館時間は午前十時から午後五時まで、毎週火曜日は休館日です。
>
> 館長の浜野さんは「波の音を聞きながら本を読む時間を、冬にも楽しんでほしい」と話しています。
>
> 館内では、地元の漁師さんから聞き取った「浜のことば」をまとめた小冊子を無料で配っています。数に限りがありますので、お早めにどうぞ。

The event box, set horizontally: **冬のおはなし会**

| 日にち | 時間 | 内容 | 対象 |
| --- | --- | --- | --- |
| 12月14日（日） | 14:00〜14:40 | 海の生きもの絵本 | 幼児〜小学2年生 |
| 1月11日（日） | 14:00〜14:40 | 冬の星と昔話 | 小学生 |
| 2月8日（日） | 10:30〜11:30 | 大人のための朗読会 | 中学生以上 |

申込不要・参加無料。定員は各回20人（先着順）です。

Caption: 写真：海に面した閲覧席（11月撮影）

## Questions an agent should be able to answer

1. 図書館は冬の間、何時から何時まで開いているか。休館日は。 — 午前10時から午後5時まで。毎週火曜日が休館日
2. 図書館の建物はもともと何だったか。 — 旧漁協の倉庫
3. 小学生向けのおはなし会はいつ、何をするか。 — 1月11日（日）14:00〜14:40、「冬の星と昔話」
4. おはなし会の定員と申込方法は。 — 各回20人（先着順）、申込不要・参加無料
5. 館長は誰で、何と話しているか。 — 浜野さん。「波の音を聞きながら本を読む時間を、冬にも楽しんでほしい」

**Reads correctly:** the vertical article is read column by column, right to left, after the masthead,
and the horizontal box after it, so all five questions are answered from `read.md`. The headline picks
up spaces between glyph groups (`海辺 の図書館、` / `冬も開いて います`). The schedule table is not
reported as a layout table, but its rows read left to right, one line each, header first
(`日にち 時間 内容 対象` / `2月8日(日) 10:30〜11:30 大人のための朗読会 中学生以上`), and the photo
placeholder's `(写真)` after them (#309). The masthead still reads its right-hand date before the
title on its left.
