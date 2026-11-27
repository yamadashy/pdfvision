// The business-overview page of a Japanese annual earnings summary (決算短信)
// on A4, as some Word-to-PDF workflows write it: every glyph of the body is
// placed on its own (one `Tm` + `Tj` per glyph), no space glyph is ever
// drawn, and a justified line is spread across the measure only by moving
// each glyph a little further than its advance. Lines that end early (a
// number or a Latin name that does not fit is carried to the next line)
// are spread wider, and a real word space inside such a line is just a
// wider move.

const R = 'NotoSansJP';
const B = 'NotoSansJP-Bold';

const SIZE = 9;
const LEADING = 15;
const LEFT = 62;
/** 50 full-width glyphs. */
const MEASURE = 50 * SIZE;

const HEADING = '１．経営成績等の概況';
const SUBHEADING = '（１）当期の経営成績の概況';
const PARAGRAPHS = [
  '当連結会計年度におけるわが国経済は、雇用・所得環境の改善や各種政策の効果により、緩やかな回復基調で推移いたしました。一方で、原材料価格の高止まりや為替相場の変動など、先行きは依然として不透明な状況が続いております。',
  'このような環境のもと、当社グループの当連結会計年度の売上高は1,284億3千万円（前年同期比8.6％増）、営業利益は142億7百万円（同12.1％増）、経常利益は151億2千万円（同11.8％増）、親会社株主に帰属する当期純利益は98億5千万円（同10.4％増）となりました。なお、セグメント別の詳細は当社ウェブサイト（https://www.minami-seiki.example/ir/library/）に掲載の決算説明資料をご覧ください。',
  'エンターテインメント事業では、当社が本年10月に発売した『ハルカの冒険 ソラ ノ カケラ』（HRK-2026-SG01）が国内外で好調に推移し、累計販売本数は320万本となりました。',
  '海外事業では、欧州における販売体制の強化を目的として、連結子会社であるMinami Precision Europe GmbHを通じてドイツ国内に新たな物流拠点を開設いたしました。',
];
const SECOND_HEADING = '（２）今後の見通し';
const OUTLOOK = [
  '次期の連結業績につきましては、売上高1,350億円、営業利益150億円、経常利益158億円、親会社株主に帰属する当期純利益103億円を見込んでおります。',
];

export const meta = {
  title: 'Japanese earnings summary body set one glyph at a time (決算短信 経営成績の概況)',
  stresses:
    'A4; every body glyph placed on its own with no space glyphs; justified lines spread by moving glyphs apart, several lines ending early and spread wide; a word space inside a spread line (a game title) and a Latin company name in one',
  families: ['encoding', 'scripts'],
  status: 'ok',
  showcase: true,
  hard: 'Every glyph is placed on its own, so a justified line is only glyphs moved apart: pdf.js reads each move as a space between every character, and a real word space in that line is just a wider move.',
  issue: 268,
  page: { size: 'A4' },
};

export const truth = `
**${HEADING}**

**${SUBHEADING}**

${PARAGRAPHS.join('\n\n')}

**${SECOND_HEADING}**

${OUTLOOK.join('\n\n')}

(Every line but the last of a paragraph is justified: its glyphs are moved apart until it spans the
measure. A number, a product code or a Latin name is never broken, so a line that cannot take the next
one ends early and is spread wider. The spaces inside 『ハルカの冒険 ソラ ノ カケラ』 and
\`Minami Precision Europe GmbH\` are real: wider moves, with no space glyph drawn.)

## Questions an agent should be able to answer

1. What were consolidated net sales for the year, and how did they change? — 1,284億3千万円, 前年同期比8.6％増
2. Which title drove the entertainment business, and how many copies has it sold? — 『ハルカの冒険 ソラ ノ カケラ』, 320万本
3. Through which subsidiary did the company open its new logistics base in Germany? — Minami Precision Europe GmbH
4. What net sales and operating profit does the company forecast for next year? — 売上高1,350億円, 営業利益150億円

Each justified line reads as set, with no space between its characters (#268): on a page where every
glyph is placed on its own, the drawn positions show the spread line at one pitch and the lines around it
set tightly to the same measure, so 「エンターテインメント事業」 and 「欧州における販売体制」 can be searched. The
title keeps its word spaces (\`『ハルカの冒険 ソラ ノ カケラ』\`): those moves are wider than the line's pitch.
Every question is answered from the body.
`;

// Runs the producer never breaks (a number, a code, a URL, a Latin name), an
// opening bracket kept with what follows it, and line starts it avoids (kinsoku).
const UNBREAKABLE = /[（『「]?(?:[0-9A-Za-z,.%:/_-]+(?: (?=[A-Z])[0-9A-Za-z,.%:/_-]+)*|.)/gsu;
const NO_LINE_START = /^[、。，．）」』％・ー]/u;

/** Break a paragraph into lines that fit the measure, the first indented by a full-width space. */
function breakLines(paragraph, width) {
  const pieces = `　${paragraph}`.match(UNBREAKABLE);
  const lines = [];
  let current = '';
  for (const piece of pieces) {
    const fits = lineWidth(current + piece, width) <= MEASURE;
    if (fits || current === '' || NO_LINE_START.test(piece)) current += piece;
    else {
      lines.push(current);
      current = piece;
    }
  }
  lines.push(current);
  return lines;
}

const move = (char) => (char === ' ' ? SIZE * 0.224 : char === '　' ? SIZE : 0);
const lineWidth = (text, width) => Array.from(text).reduce((sum, char) => sum + (move(char) || width(char)), 0);

/** One line, every glyph on its own `Tm`; justified lines spread to the measure. Spaces are moves only. */
function line(h, text, y, justify) {
  h.textOperators(R, SIZE, ({ id, hex, width }) => {
    const chars = Array.from(text);
    const glyphs = chars.filter((char) => !move(char));
    const gap = justify ? (MEASURE - lineWidth(text, width)) / (glyphs.length - 1) : 0;
    const ops = [`BT /${id} ${SIZE} Tf`];
    let x = LEFT;
    let prevWasGlyph = false;
    for (const char of chars) {
      if (move(char)) {
        x += move(char);
        continue;
      }
      if (prevWasGlyph) x += gap;
      ops.push(`1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm ${hex(char)} Tj`);
      x += width(char);
      prevWasGlyph = true;
    }
    ops.push('ET');
    return ops;
  });
}

export function draw(doc, h) {
  const H = doc.page.height;
  const width = (char) => doc.font(R).fontSize(SIZE).widthOfString(char);
  h.text('ミナミ精機株式会社（6789）　2027年3月期 決算短信', 595.28 - LEFT, 40, { font: R, size: 7.5, align: 'right' });
  h.text(HEADING, LEFT, 70, { font: B, size: 10.5 });
  h.text(SUBHEADING, LEFT, 92, { font: B, size: 9.5 });
  let baseline = H - 128;
  const paragraph = (text) => {
    const lines = breakLines(text, width);
    lines.forEach((content, i) => {
      line(h, content, baseline, i < lines.length - 1);
      baseline -= LEADING;
    });
    baseline -= 4;
  };
  PARAGRAPHS.forEach(paragraph);
  h.text(SECOND_HEADING, LEFT, H - baseline - 2, { font: B, size: 9.5 });
  baseline -= 26;
  OUTLOOK.forEach(paragraph);
}
