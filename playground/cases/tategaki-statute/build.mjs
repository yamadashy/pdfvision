// The first page of an amending bill (法律案) as the Diet and ministries
// publish it: a landscape sheet of vertical text stored as a portrait page
// with /Rotate 90. Columns run right to left; article numbers (第八条),
// paragraph numbers (２) and item numbers (一) stand at the head of their
// column with the continuation indented one em further (hanging
// indentation), article captions sit in parentheses one em down, and the
// page number is a kanji numeral at the foot.

import { breakColumns, verticalColumn } from '../../lib/visualC.mjs';

const SIZE = 12;
const PER_COLUMN = 36;
const PITCH = 21;

const LAW = '地域図書館の振興に関する法律';
const BILL_TITLE = `${LAW}の一部を改正する法律案`;
const PAGE_NUMBER = '一';
// `first` / `rest`: em boxes of indentation for the first and later columns.
const PARAGRAPHS = [
  { text: `${LAW}（令和四年法律第五十七号）の一部を次のように改正する。`, first: 1, rest: 0 },
  { text: '第七条第二項中「三年」を「五年」に改め、同条に次の一項を加える。', first: 1, rest: 0 },
  {
    text: '３　市町村の教育委員会は、前項の計画を変更したときは、遅滞なく、これを公表しなければならない。',
    first: 0,
    rest: 1,
  },
  { text: '第八条を次のように改める。', first: 1, rest: 0 },
  { text: '（図書館協議会）', first: 1, rest: 1 },
  {
    text: '第八条　市町村の教育委員会は、その設置する地域図書館の運営に関し、館長の諮問に応じるとともに、館長に対して意見を述べる機関として、図書館協議会（以下「協議会」という。）を置くことができる。',
    first: 0,
    rest: 1,
  },
  {
    text: '２　協議会の委員は、次に掲げる者のうちから、市町村の教育委員会が任命する。',
    first: 0,
    rest: 1,
  },
  { text: '一　学校教育及び社会教育の関係者', first: 1, rest: 2 },
  { text: '二　家庭教育の向上に資する活動を行う者', first: 1, rest: 2 },
  { text: '三　学識経験のある者', first: 1, rest: 2 },
  {
    text: '３　前二項に定めるもののほか、協議会の組織及び運営に関し必要な事項は、当該市町村の条例で定める。',
    first: 0,
    rest: 1,
  },
  { text: '第八条の次に次の一条を加える。', first: 1, rest: 0 },
  { text: '（運営状況の評価等）', first: 1, rest: 1 },
  {
    text: '第八条の二　地域図書館の館長は、毎年度、当該図書館の運営の状況について評価を行い、その結果を協議会に報告するとともに、インターネットの利用その他の適切な方法により公表するよう努めなければならない。',
    first: 0,
    rest: 1,
  },
  { text: '附　則', first: 3, rest: 3 },
  { text: 'この法律は、令和九年四月一日から施行する。', first: 1, rest: 0 },
];

const plain = (text) => text.replaceAll('　', ' ');

export const meta = {
  title: 'Vertical amending bill (法律案) on a rotated page',
  stresses:
    'vertical Japanese set glyph by glyph; /Rotate 90 landscape sheet; columns right to left; hanging article, paragraph and item numbers at column heads; parenthesised captions; kanji page number',
  status: 'ok',
  issue: 261,
  page: { size: 'A4' },
  families: ['vertical-rotated', 'reading-order', 'structure'],
};

export const truth = `
A portrait A4 page stored with \`/Rotate 90\`, so a viewer shows an 842 × 595 pt landscape sheet.
The text is vertical (縦書き): columns run top to bottom and follow one another right to left.
Every glyph is its own horizontal-mode text object placed down the column (the common DTP
form, not an Identity-V vertical font); 、。「」（） use the font's vertical variants, and the
content stream emits the glyphs in reading order. ${SIZE} pt glyphs, ${PER_COLUMN} em boxes per column.

The bill title stands alone in the first (rightmost) column, indented four em boxes:
**${BILL_TITLE}**. Then, column by column (a paragraph that wraps continues in the next column):

${PARAGRAPHS.map((p) => `- ${plain(p.text)}`).join('\n')}

Article numbers (\`第八条\`, \`第八条の二\`), paragraph numbers (\`２\`, \`３\`) and item numbers
(\`一\`–\`三\`) stand at the very head of their own column; the wrapped continuation of an
article or paragraph starts one em lower, an item's continuation two. A correct reading starts
each of them on a new line and never glues a number to the end of the previous column — the
previous column often fills to its last em box. Captions \`（図書館協議会）\` and
\`（運営状況の評価等）\` head the article that follows them. The page number \`${PAGE_NUMBER}\`
is centred at the foot of the sheet. Full-width digits and brackets may come back
NFKC-normalised (\`３\` → \`3\`, \`（\` → \`(\`).

## Questions an agent should be able to answer

1. 改正後の第八条の見出しは何か。 — 図書館協議会
2. 第七条第二項はどのように改正されるか。 — 「三年」を「五年」に改め、同条に第三項（計画を変更したときは遅滞なく公表）を加える
3. 協議会の委員はどのような者のうちから任命されるか。 — 学校教育及び社会教育の関係者、家庭教育の向上に資する活動を行う者、学識経験のある者（いずれも市町村の教育委員会が任命）
4. 新設される第八条の二で、館長は評価の結果をどうするよう努めなければならないか。 — 協議会に報告するとともに、インターネットの利用その他の適切な方法により公表する
5. この法律はいつから施行されるか。 — 令和九年四月一日

**Reads correctly (#261):** the rotated page is read exactly as the same drawing stored landscape,
and in the order it is set: the title column first, then every column right to left, one line
per column. Each column-head number starts its own line and stays with its text, its blank em box
read as a space (\`3 市町村の教育委員会は、…\`, \`第八条 市町村の…\`, \`2 協議会の委員は、…\`,
\`一 学校教育及び社会教育の関係者\`), \`附 則\` is one line, and the page number \`一\` comes last.
No warning fires. All five questions are answered from \`read.md\`.
`;

export function draw(doc, h) {
  const { width, height } = h.rotateClockwise();
  const top = (height - SIZE * PER_COLUMN) / 2;
  let cx = width - 70;
  const column = (text) => {
    verticalColumn(doc, text, cx, top, { size: SIZE });
    cx -= PITCH;
  };

  column(`　　　　${BILL_TITLE}`);
  cx -= PITCH;
  for (const paragraph of PARAGRAPHS) {
    if (paragraph.text === '附　則') cx -= PITCH / 2;
    for (const text of breakColumns(paragraph.text, PER_COLUMN, {
      firstIndent: paragraph.first,
      restIndent: paragraph.rest,
    })) {
      column(text);
    }
  }

  h.text(PAGE_NUMBER, width / 2, height - 34, { font: 'NotoSansJP', size: 10, align: 'center' });
}
