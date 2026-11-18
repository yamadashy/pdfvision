// A two-page spread of a Japanese novel set vertically, as publishers and
// 青空文庫-derived PDFs put a spread on one landscape page: the right-hand
// page is read first, columns run right to left, a chapter opens with a
// larger heading, ruby (furigana) sits to the right of rare kanji, dialogue
// is in 「」, two-digit numbers are set 縦中横, and ―― / …… use their
// vertical forms. Running heads and kanji page numbers sit at the outer edges.

import { breakSegmentColumns, segmentText, verticalColumn } from '../../lib/visualC.mjs';

const W = 728;
const H = 516;
const PAGE = W / 2;
const SIZE = 9;
const PER_COLUMN = 38;
const PITCH = 16;
const COLUMNS_PER_PAGE = 15;
const TOP = 76;
const R = 'NotoSansJP';

const BOOK_TITLE = '汐見坂の灯';
const CHAPTER = '三　灯台守の手紙';
// Outer page first: the right-hand page of a right-bound book is the even one.
const PAGE_NUMBERS = [
  { label: '一二四', value: 124 },
  { label: '一二五', value: 125 },
];
const HEADING_SLOTS = 3;

// Markup: {base|reading} is ruby, [12] is 縦中横.
const PARAGRAPHS = [
  '　港の時計台が午後[11]時を打ったとき、{澪|みお}はまだ{埠頭|ふとう}の端に立っていた。風は昼間よりいくらか弱まり、沖のほうで{漁火|いさりび}がひとつ、またひとつと消えていくのが見えた。',
  '　父が灯台を降りてから、もう[12]年になる。それなのに澪は、夜になるとこの場所へ足を運ぶ癖をやめられずにいた。',
  '「こんな時間に、何をしているんだい」',
  '　振り返ると、外套の襟を立てた男が、古い街灯の下に立っていた。郵便局の{嘱託|しょくたく}をしている{真鍋|まなべ}という老人で、澪が子どものころから、この町の手紙はほとんど彼の手を通っていた。',
  '「灯りを見ていたんです。もう、ともらない灯りですけど」',
  '「そうか……」',
  '　真鍋はしばらく黙っていたが、やがて外套の内ポケットから、角の擦り切れた封筒を一通取り出した。',
  '「これをね、ずっと渡しそびれていた。宛名は君のお父さんだが――いや、読めばわかる」',
  '　封筒の消印は、父が灯台を去った年の冬のものだった。差出人の欄には、澪の知らない女の名前が、細い万年筆の字で書かれていた。',
  '「どうして、今になって」',
  '「今だから、さ。君ももう、あのころのお父さんと同じ年だろう」',
  '　澪は封筒を受け取った。紙は思っていたよりもずっと軽く、そのくせ、指先にいつまでも冷たさが残った。{潮騒|しおさい}が足もとで寄せては返し、そのたびに、遠い灯台の白い壁がかすかに浮かんで見えるような気がした。',
  '　家に戻ると、澪は台所の明かりだけをつけて、食卓の上で封を切った。便箋は二枚あった。一枚目には、こう書かれていた。',
  '　――あなたが灯りを守っているあいだ、わたしはずっと、その光を数えていました。',
  '　澪は二枚目をめくろうとして、手を止めた。窓の外で、ないはずの光が一度だけ、海の上を{掠|かす}めていった。',
];

function parse(markup) {
  const segments = [];
  const pattern = /\{([^|}]+)\|([^}]+)\}|\[(\d+)\]|([^{[]+)/gu;
  for (const match of markup.matchAll(pattern)) {
    if (match[1]) segments.push({ ruby: [match[1], match[2]] });
    else if (match[3]) segments.push({ tcy: match[3] });
    else segments.push(match[4]);
  }
  return segments;
}

const PARSED = PARAGRAPHS.map(parse);
const COLUMNS = PARSED.flatMap((segments) => breakSegmentColumns(segments, PER_COLUMN));
const RUBY = PARSED.flat().filter((segment) => segment.ruby !== undefined);
const plain = (segments) => segmentText(segments).replace(/^　/u, '');

export const meta = {
  title: 'Vertical novel spread (縦組み見開き) with ruby',
  stresses:
    'two vertical pages on one landscape sheet read right page first; columns right to left; ruby beside base kanji; 縦中横 numbers; vertical ―― and ……; chapter heading; running heads and kanji page numbers at the outer edges',
  status: 'ok',
  issue: 261,
  showcase: true,
  hard: 'each glyph is a separate text object placed down its column, so 縦中横 digits, vertical dashes and blank em boxes look like breaks, and a two-page spread has to be read right page first',
  page: { size: [W, H] },
  families: ['vertical-rotated', 'reading-order', 'structure'],
};

export const truth = `
One ${W} × ${H} pt landscape page holding a two-page spread of a vertically set novel (縦組み).
Every glyph is its own horizontal-mode text object placed down the column (the common DTP form,
not an Identity-V vertical font); 、。「」ー…― use the font's vertical variants and the content
stream emits the text in reading order. The **right-hand page is read first** (p. ${PAGE_NUMBERS[0].value}),
then the left (p. ${PAGE_NUMBERS[1].value}); on each page the columns run right to left,
${PER_COLUMN} em boxes of ${SIZE} pt per column.

Page furniture: running head \`${BOOK_TITLE}\` (vertical, top of the right page's outer edge) and
\`${CHAPTER.replace('　', ' ')}\` (top of the left page's outer edge); page numbers \`${PAGE_NUMBERS[0].label}\`
(bottom right) and \`${PAGE_NUMBERS[1].label}\` (bottom left), in kanji. A reading may drop them as
page chrome.

The right page opens chapter **${CHAPTER.replace('　', ' ')}** with a larger vertical heading in
the first ${HEADING_SLOTS} column slots, then the text. In reading order, one paragraph per line:

${PARSED.map((segments) => `> ${plain(segments)}`).join('\n>\n')}

Ruby (small kana to the right of the base, not part of the running text):
${RUBY.map((segment) => `${segment.ruby[0]}（${segment.ruby[1]}）`).join('、')}. A good reading
keeps the base text intact and either drops the ruby or attaches it to its base — it must not
splice the kana into the sentence. \`11\` and \`12\` are 縦中横 (two digits set side by side inside
one em box) and read as one number each.

## Questions an agent should be able to answer

1. 澪に封筒を渡したのは誰で、どんな仕事をしている人か。 — 真鍋という老人で、郵便局の嘱託をしている
2. 父が灯台を降りてから何年になるか。 — 12年
3. 港の時計台が何時を打ったとき、澪は埠頭にいたか。 — 午後11時
4. 便箋の一枚目には何と書かれていたか。 — 「あなたが灯りを守っているあいだ、わたしはずっと、その光を数えていました。」
5. 「漁火」の読みは何か。 — いさりび

**Reads correctly (#261):** the page is read the way it is set — the right page's running head,
the chapter heading \`三 灯台守の手紙\` (its blank em box kept as a space), the right page's columns
right to left, then the left page's, the left running head, and the page numbers \`一二四\`, \`一二五\`
last. Each column is one line, and the 縦中横 numbers and the vertical dashes stay in their
columns: \`港の時計台が午後11時を打ったとき、…\`, \`父が灯台を降りてから、もう12年になる。…\`,
\`宛名は君のお父さんだが――いや、読めばわ\` / \`かる」\`, and the letter opens with \`――あなたが…\`.
Ruby is attached to its base (\`澪《みお》\`, \`漁火《いさりび》\`). All five questions are answered
from \`read.md\`. \`……\` comes back NFKC-normalised as \`......\`; that is intended.
`;

function column(doc, segments, cx) {
  verticalColumn(doc, segments, cx, TOP, { size: SIZE });
}

export function draw(doc, h) {
  // Faint gutter shadow, as a scanned-in-InDesign spread shows the fold.
  doc.rect(PAGE - 0.25, 0, 0.5, H).fill('#d8d8d8');
  doc.fillColor('black');

  // Running heads (outer edges) come first in the stream, as page masters do.
  doc.fillColor('#444');
  verticalColumn(doc, BOOK_TITLE, W - 34, TOP, { size: 7.5 });
  verticalColumn(doc, CHAPTER, 34, TOP, { size: 7.5 });
  doc.fillColor('black');

  const firstRight = W - 62;
  const firstLeft = PAGE - 62;
  // Right page: chapter heading in the first slots, then text.
  verticalColumn(doc, CHAPTER, firstRight - PITCH, TOP + SIZE * 4, { size: 14 });
  let slot = HEADING_SLOTS;
  let index = 0;
  while (index < COLUMNS.length && slot < COLUMNS_PER_PAGE) {
    column(doc, COLUMNS[index++], firstRight - slot * PITCH);
    slot++;
  }
  slot = 0;
  while (index < COLUMNS.length && slot < COLUMNS_PER_PAGE) {
    column(doc, COLUMNS[index++], firstLeft - slot * PITCH);
    slot++;
  }
  if (index < COLUMNS.length) throw new Error(`tategaki-book-spread: ${COLUMNS.length - index} columns do not fit`);

  doc.fillColor('#444');
  h.text(PAGE_NUMBERS[0].label, W - 40, H - 46, { font: R, size: 7.5, align: 'right' });
  h.text(PAGE_NUMBERS[1].label, 40, H - 46, { font: R, size: 7.5 });
  doc.fillColor('black');
}
