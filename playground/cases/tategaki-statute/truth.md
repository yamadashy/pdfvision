# Vertical amending bill (法律案) on a rotated page

- **Stresses:** vertical Japanese set glyph by glyph; /Rotate 90 landscape sheet; columns right to left; hanging article, paragraph and item numbers at column heads; parenthesised captions; kanji page number
- **Families:** vertical-rotated, reading-order, structure
- **Status:** known-gap

A portrait A4 page stored with `/Rotate 90`, so a viewer shows an 842 × 595 pt landscape sheet.
The text is vertical (縦書き): columns run top to bottom and follow one another right to left.
Every glyph is its own horizontal-mode text object placed down the column (the common DTP
form, not an Identity-V vertical font); 、。「」（） use the font's vertical variants, and the
content stream emits the glyphs in reading order. 12 pt glyphs, 36 em boxes per column.

The bill title stands alone in the first (rightmost) column, indented four em boxes:
**地域図書館の振興に関する法律の一部を改正する法律案**. Then, column by column (a paragraph that wraps continues in the next column):

- 地域図書館の振興に関する法律（令和四年法律第五十七号）の一部を次のように改正する。
- 第七条第二項中「三年」を「五年」に改め、同条に次の一項を加える。
- ３ 市町村の教育委員会は、前項の計画を変更したときは、遅滞なく、これを公表しなければならない。
- 第八条を次のように改める。
- （図書館協議会）
- 第八条 市町村の教育委員会は、その設置する地域図書館の運営に関し、館長の諮問に応じるとともに、館長に対して意見を述べる機関として、図書館協議会（以下「協議会」という。）を置くことができる。
- ２ 協議会の委員は、次に掲げる者のうちから、市町村の教育委員会が任命する。
- 一 学校教育及び社会教育の関係者
- 二 家庭教育の向上に資する活動を行う者
- 三 学識経験のある者
- ３ 前二項に定めるもののほか、協議会の組織及び運営に関し必要な事項は、当該市町村の条例で定める。
- 第八条の次に次の一条を加える。
- （運営状況の評価等）
- 第八条の二 地域図書館の館長は、毎年度、当該図書館の運営の状況について評価を行い、その結果を協議会に報告するとともに、インターネットの利用その他の適切な方法により公表するよう努めなければならない。
- 附 則
- この法律は、令和九年四月一日から施行する。

Article numbers (`第八条`, `第八条の二`), paragraph numbers (`２`, `３`) and item numbers
(`一`–`三`) stand at the very head of their own column; the wrapped continuation of an
article or paragraph starts one em lower, an item's continuation two. A correct reading starts
each of them on a new line and never glues a number to the end of the previous column — the
previous column often fills to its last em box. Captions `（図書館協議会）` and
`（運営状況の評価等）` head the article that follows them. The page number `一`
is centred at the foot of the sheet. Full-width digits and brackets may come back
NFKC-normalised (`３` → `3`, `（` → `(`).

## Questions an agent should be able to answer

1. 改正後の第八条の見出しは何か。 — 図書館協議会
2. 第七条第二項はどのように改正されるか。 — 「三年」を「五年」に改め、同条に第三項（計画を変更したときは遅滞なく公表）を加える
3. 協議会の委員はどのような者のうちから任命されるか。 — 学校教育及び社会教育の関係者、家庭教育の向上に資する活動を行う者、学識経験のある者（いずれも市町村の教育委員会が任命）
4. 新設される第八条の二で、館長は評価の結果をどうするよう努めなければならないか。 — 協議会に報告するとともに、インターネットの利用その他の適切な方法により公表する
5. この法律はいつから施行されるか。 — 令和九年四月一日

**Known gap (no issue yet):** on the rotated page the vertical columns are not reassembled. Only
the title column and the 附則 sentence come back whole; between them `read.md` is a stack of
one- to eight-character fragments in which glyphs of neighbouring columns that share a height
are joined sideways (`を「五年」`, `。こ`, `る、`, `えく` … `委にい次会に者のめ条)館をり`),
column heads such as `第`, `3`, `2` and `一二三` stand alone, and no caption, article number or
item survives in context. The page reports `rotation: 90°` but raises **no warning**, so nothing
tells the agent to render. Only question 5 is answerable from `read.md`; questions 1–4 are not
(`図書館協議会` and `第八条の二` never appear as text). The same drawing on an unrotated
landscape page (not part of this case) comes back as whole columns — with its own faults: the
２/３ and 一–三 column heads detached from their text, and the title and the 第八条の二 body moved
to the end — so the rotation is what turns it into fragments.
