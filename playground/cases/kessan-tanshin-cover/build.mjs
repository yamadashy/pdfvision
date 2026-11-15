// The first page of a Japanese interim earnings summary (決算短信) on A4, as
// older Word/Excel-to-PDF workflows produce it: the title made "bold" by
// drawing the same regular-weight text five times with sub-point offsets,
// the company key/value block in two columns of label/value pairs, bordered
// results tables with （％表示は対前年同四半期増減率）, △ for negatives and
// ― for empty dividend cells, and one line of the closing note justified by
// placing each character individually at a wider pitch.

const R = 'NotoSansJP';
const B = 'NotoSansJP-Bold';

const DATE = '2026年11月14日';
// The producer splits the title into runs and overdraws each run five times
// (x offsets in pt) before moving on to the next, so copies interleave run by run.
const TITLE_RUNS = [
  '2',
  '0',
  '2',
  '7',
  '年3月期',
  ' ',
  '第2四半期',
  '（',
  '中間期',
  '）',
  '決算短',
  '信',
  '〔',
  '日本基準',
  '〕',
  '（',
  '連結',
  '）',
];
const TITLE = TITLE_RUNS.join('');
const OVERDRAW = [0, 0.2, 0.4, 0.2, 0.4];
const COMPANY = {
  name: '株式会社ミナミ精機',
  exchange: '東',
  code: '6789',
  url: 'https://www.minami-seiki.example',
  rep: { title: '代表取締役社長', name: '山本 健一' },
  contact: { title: '取締役経理部長', name: '佐藤 由美', tel: '06-0000-1234' },
  reportDate: '2026年11月13日',
  dividendDate: '2026年12月5日',
  supplement: '有',
  briefing: '有（機関投資家・アナリスト向け）',
};
// Two columns of label/value pairs, as the cover lays them out.
const KV = [
  [
    ['上場会社名', COMPANY.name],
    ['上場取引所', COMPANY.exchange],
  ],
  [
    ['コード番号', COMPANY.code],
    ['URL', COMPANY.url],
  ],
  [['代表者', `（役職名）${COMPANY.rep.title}　（氏名）${COMPANY.rep.name}`]],
  [
    ['問合せ先責任者', `（役職名）${COMPANY.contact.title}　（氏名）${COMPANY.contact.name}`],
    ['TEL', COMPANY.contact.tel],
  ],
  [
    ['半期報告書提出予定日', COMPANY.reportDate],
    ['配当支払開始予定日', COMPANY.dividendDate],
  ],
  [['決算補足説明資料作成の有無', COMPANY.supplement]],
  [['決算説明会開催の有無', COMPANY.briefing]],
];

const PERIOD = '2027年3月期第2四半期（中間期）の連結業績（2026年4月1日～2026年9月30日）';
const RESULTS = {
  groups: ['売上高', '営業利益', '経常利益', '親会社株主に帰属する中間純利益'],
  rows: [
    { label: '2027年3月期中間期', values: ['48,215', '5.2', '3,104', '△12.4', '3,380', '△9.8', '2,215', '△15.1'] },
    { label: '2026年3月期中間期', values: ['45,832', '8.9', '3,543', '21.0', '3,748', '18.7', '2,609', '24.3'] },
  ],
};
const COMPREHENSIVE =
  '（注）包括利益　2027年3月期中間期　1,904百万円（△38.5％）　2026年3月期中間期　3,096百万円（30.2％）';
const PER_SHARE = {
  columns: ['1株当たり中間純利益', '潜在株式調整後1株当たり中間純利益'],
  rows: [
    { label: '2027年3月期中間期', values: ['85.42', '85.10'] },
    { label: '2026年3月期中間期', values: ['100.63', '100.21'] },
  ],
};
const POSITION = {
  columns: ['総資産', '純資産', '自己資本比率'],
  units: ['百万円', '百万円', '％'],
  rows: [
    { label: '2027年3月期中間期', values: ['98,450', '61,230', '61.8'] },
    { label: '2026年3月期', values: ['97,112', '60,104', '61.4'] },
  ],
};
const EQUITY_NOTE = '（参考）自己資本　2027年3月期中間期　60,842百万円　2026年3月期　59,620百万円';
const DIVIDENDS = {
  columns: ['第1四半期末', '第2四半期末', '第3四半期末', '期末', '合計'],
  rows: [
    { label: '2026年3月期', values: ['―', '30.00', '―', '35.00', '65.00'] },
    { label: '2027年3月期', values: ['―', '32.00', '', '', ''] },
    { label: '2027年3月期（予想）', values: ['', '', '―', '33.00', '65.00'] },
  ],
};
const DIVIDEND_NOTE = '（注）直近に公表されている配当予想からの修正の有無：無';
const CLOSING_HEADING = '※ 業績予想の適切な利用に関する説明、その他特記事項';
// Line 2 is the justified one: fewer characters than the measure, spread across it.
const CLOSING = [
  '本資料に記載されている業績見通し等の将来に関する記述は、当社が現在入手している情報及び合理的であ',
  'ると判断する一定の前提に基づいており、詳細は当社ウェブサイト',
  '（https://www.minami-seiki.example/ir/）に掲載の決算補足説明資料をご覧ください。実際の業績等',
  'は様々な要因により大きく異なる可能性があります。',
];
const JUSTIFIED_LINE = 1;

export const meta = {
  title: 'Japanese interim earnings summary (決算短信) cover page',
  stresses:
    'A4; title faked bold by overdrawing the same text five times; two-column label/value block; bordered results tables with △ negatives, ％ rows and ― placeholders; one letter-spaced justified line in a paragraph',
  families: ['encoding', 'scripts', 'tables', 'structure'],
  status: 'known-gap',
  page: { size: 'A4' },
};

const kvLines = KV.map((pairs) => pairs.map(([label, value]) => `${label}　${value}`).join('　／　'));
const table = (head, rows) =>
  [`| | ${head.join(' | ')} |`, `| --- | ${head.map(() => '---:').join(' | ')} |`, ...rows].join('\n');

export const truth = `
Dated ${DATE}. Title (overdrawn five times to fake bold; a correct reading has it once):

**${TITLE}**

Company block (label → value):

${kvLines.map((line) => `- ${line}`).join('\n')}

（百万円未満切捨て）

**1. ${PERIOD}**

(1) 連結経営成績（累計）（％表示は対前年同四半期増減率）

${table(
  RESULTS.groups.flatMap((g) => [`${g} 百万円`, `${g} ％`]),
  RESULTS.rows.map((r) => `| ${r.label} | ${r.values.join(' | ')} |`),
)}

${COMPREHENSIVE}

${table(
  PER_SHARE.columns.map((c) => `${c} 円 銭`),
  PER_SHARE.rows.map((r) => `| ${r.label} | ${r.values.join(' | ')} |`),
)}

(2) 連結財政状態

${table(
  POSITION.columns.map((c, i) => `${c} ${POSITION.units[i]}`),
  POSITION.rows.map((r) => `| ${r.label} | ${r.values.join(' | ')} |`),
)}

${EQUITY_NOTE}

**2. 配当の状況** — 年間配当金（円 銭）

${table(
  DIVIDENDS.columns,
  DIVIDENDS.rows.map((r) => `| ${r.label} | ${r.values.join(' | ')} |`),
)}

${DIVIDEND_NOTE}

${CLOSING_HEADING}

${CLOSING.join('')}

(Line ${JUSTIFIED_LINE + 1} of that paragraph, \`${CLOSING[JUSTIFIED_LINE]}\`, is set with each character placed
individually across the full measure; it reads without spaces.) △ means a negative value.

## Questions an agent should be able to answer

1. Which company is this, and what is its securities code? — ${COMPANY.name}, ${COMPANY.code}
2. What was interim operating profit, and how did it change year on year? — ${RESULTS.rows[0].values[2]}百万円, ${RESULTS.rows[0].values[3]}％ (a 12.4% decrease)
3. When does the dividend payment start, and what is the full-year dividend forecast? — ${COMPANY.dividendDate}; ${DIVIDENDS.rows[2].values[4]}円 (中間 ${DIVIDENDS.rows[1].values[1]}円 + 期末予想 ${DIVIDENDS.rows[2].values[3]}円)
4. Who should be contacted about the report? — ${COMPANY.contact.title} ${COMPANY.contact.name}, TEL ${COMPANY.contact.tel}
5. Which fiscal period and accounting standard does the report cover? — 2027年3月期 第2四半期（中間期）, 日本基準, 連結

**Known gap (no issue yet):** the overdrawn title comes back with every run repeated and no
warning: \`2222000022227777年3月期年3月期年3月期年3月期 第2四半期第2四半期…決算短決算短決算短決算短信信信信〔〔〔〔日本基準日本基準…\`
— the survey's \`22222000002222255555年3月期…\` exactly. The year cannot be read back from it and a search
for 「決算短信」 misses the title (\`決算短\` and \`信\` are no longer adjacent). Question 5 survives only
through section 1's heading (\`2027年3月期第2四半期(中間期)の連結業績\`) and by guessing 日本基準 out of
the repeats. The justified line is emitted letter-spaced, also without a warning:
\`る と 判 断 す る 一 定 の 前 提 に 基 づ い て お り 、 詳 細 は 当 社 ウ ェ ブ サ イ ト\`, so a search for
「判断する」 or 「当社ウェブサイト」 fails.

The rest is usable. The page body separates the company labels from their values (labels first,
values after the results table header), but layout table 5 pairs them correctly
(\`| 問合せ先責任者 | (役職名)取締役経理部長 (氏名)佐藤 由美 | … | TEL | 06-0000-1234 |\`), so questions 1
and 4 are answered from it; it carries \`layout_table_uncertain\` because it runs on into the results
header. The results table keeps only the units row of its header (\`百万円 | % | …\`, #253) and loses
the item names, so its columns are \`C1…C9\` with no label above the amounts, and it merges one cell:
\`| 2027年3月期中間期 | 48,215 | 5.2 | 3,104 △12.4 |  | 3,380 |…\` — question 2 is still answerable, but the
operating-profit change sits in the amount column with the % column empty, and table 1 carries no
warning. The dividend table, with its \`―\` placeholders, is read correctly (question 3).
`;

const PAGE_W = 595.28;
const LEFT = 45;
const RIGHT = PAGE_W - 45;
const LABEL_W = 105;

function grid(doc, x, y, widths, heights) {
  doc.lineWidth(0.5);
  const total = widths.reduce((a, b) => a + b, 0);
  const tall = heights.reduce((a, b) => a + b, 0);
  doc.rect(x, y, total, tall).stroke();
  let cy = y;
  for (const hgt of heights.slice(0, -1)) {
    cy += hgt;
    doc
      .moveTo(x, cy)
      .lineTo(x + total, cy)
      .stroke();
  }
}

function vline(doc, x, y1, y2) {
  doc.moveTo(x, y1).lineTo(x, y2).lineWidth(0.5).stroke();
}

/** A bordered table: header lines per column (centred), optional units row, right-aligned values. */
function borderedTable(doc, h, y, { columns, widths, units, rows, headerHeight = 16 }) {
  const heights = [headerHeight, ...(units ? [12] : []), ...rows.map(() => 15)];
  const total = widths.reduce((a, b) => a + b, LABEL_W);
  grid(doc, LEFT, y, [LABEL_W, ...widths], heights);
  const tableBottom = y + heights.reduce((a, b) => a + b, 0);
  let x = LEFT + LABEL_W;
  vline(doc, x, y, tableBottom);
  columns.forEach((col, i) => {
    const lines = Array.isArray(col) ? col : [col];
    const span = col.span ?? 1;
    const w = widths.slice(i, i + span).reduce((a, b) => a + b, 0);
    lines.forEach((line, j) => {
      h.text(line, x + w / 2, y + (headerHeight - lines.length * 10) / 2 + j * 10, {
        font: R,
        size: 7.5,
        align: 'center',
      });
    });
    x += widths[i];
    if (x < LEFT + total - 0.1) vline(doc, x, units ? y + headerHeight : y, tableBottom);
  });
  let ry = y + headerHeight;
  if (units) {
    let ux = LEFT + LABEL_W;
    units.forEach((unit, i) => {
      if (unit) h.text(unit, ux + widths[i] - 3, ry + 2, { font: R, size: 6.5, align: 'right' });
      ux += widths[i];
    });
    ry += 12;
  }
  for (const row of rows) {
    h.text(row.label, LEFT + 3, ry + 3, { font: R, size: 7.5 });
    let vx = LEFT + LABEL_W;
    row.values.forEach((value, i) => {
      if (value) {
        const align = value === '―' ? 'center' : 'right';
        h.text(value, align === 'center' ? vx + widths[i] / 2 : vx + widths[i] - 3, ry + 3, {
          font: R,
          size: 8,
          align,
        });
      }
      vx += widths[i];
    });
    ry += 15;
  }
  return tableBottom;
}

function header(doc, h) {
  h.text(DATE, RIGHT, 40, { font: R, size: 9, align: 'right' });
  doc.font(R).fontSize(13);
  const titleW = doc.widthOfString(TITLE);
  const titleX = (PAGE_W - titleW) / 2;
  let runX = titleX;
  for (const run of TITLE_RUNS) {
    for (const dx of OVERDRAW) h.text(run, runX + dx, 60, { font: R, size: 13 });
    runX += doc.font(R).fontSize(13).widthOfString(run);
  }

  let y = 92;
  for (const pairs of KV) {
    pairs.forEach(([label, value], i) => {
      // Left pairs share a value column; a right pair's value follows its label.
      const end = h.text(label, i === 0 ? LEFT : 370, y, { font: R, size: 8.5 }).right;
      h.text(value, i === 0 ? LEFT + 118 : end + 10, y, { font: R, size: 8.5 });
    });
    y += 14;
  }
  h.text('（百万円未満切捨て）', RIGHT, y + 2, { font: R, size: 7.5, align: 'right' });
  doc
    .moveTo(LEFT, y + 14)
    .lineTo(RIGHT, y + 14)
    .lineWidth(0.8)
    .stroke();
  return y + 22;
}

export function draw(doc, h) {
  let y = header(doc, h);
  h.text(`1. ${PERIOD}`, LEFT, y, { font: B, size: 9 });
  y += 16;
  h.text('(1) 連結経営成績（累計）', LEFT, y, { font: R, size: 8.5 });
  h.text('（％表示は対前年同四半期増減率）', RIGHT, y, { font: R, size: 7.5, align: 'right' });
  y += 13;

  // Results: four groups of (amount, %) with the group name spanning both.
  const groupW = (RIGHT - LEFT - LABEL_W) / 4;
  const widths = RESULTS.groups.flatMap(() => [groupW * 0.62, groupW * 0.38]);
  const headerTop = y;
  const columns = RESULTS.groups.flatMap((g) => {
    const lines = g.length > 8 ? [g.slice(0, 8), g.slice(8)] : [g];
    return [Object.assign(lines, { span: 2 }), []];
  });
  y = borderedTable(doc, h, y, {
    columns,
    widths,
    units: RESULTS.groups.flatMap(() => ['百万円', '％']),
    rows: RESULTS.rows,
    headerHeight: 24,
  });
  // The amount/% split runs only below the group header.
  widths.forEach((_, i) => {
    if (i % 2 === 0) vline(doc, LEFT + LABEL_W + groupW * (i / 2) + widths[i], headerTop + 24, y);
  });
  h.text(COMPREHENSIVE, LEFT, y + 4, { font: R, size: 7.5 });
  y += 20;

  y = borderedTable(doc, h, y, {
    columns: PER_SHARE.columns,
    widths: [200, 200],
    units: ['円 銭', '円 銭'],
    rows: PER_SHARE.rows,
  });
  y += 12;

  h.text('(2) 連結財政状態', LEFT, y, { font: R, size: 8.5 });
  y += 13;
  y = borderedTable(doc, h, y, {
    columns: POSITION.columns,
    widths: [133, 133, 134],
    units: POSITION.units,
    rows: POSITION.rows,
  });
  h.text(EQUITY_NOTE, LEFT, y + 4, { font: R, size: 7.5 });
  y += 26;

  h.text('2. 配当の状況', LEFT, y, { font: B, size: 9 });
  y += 15;
  const divTop = y;
  const divW = (RIGHT - LEFT - LABEL_W) / 5;
  // A spanning 年間配当金 band above the five period columns.
  doc
    .rect(LEFT + LABEL_W, divTop, divW * 5, 14)
    .lineWidth(0.5)
    .stroke();
  h.text('年間配当金', LEFT + LABEL_W + (divW * 5) / 2, divTop + 3, { font: R, size: 7.5, align: 'center' });
  doc.rect(LEFT, divTop, LABEL_W, 14).stroke();
  y = borderedTable(doc, h, divTop + 14, {
    columns: DIVIDENDS.columns,
    widths: DIVIDENDS.columns.map(() => divW),
    units: DIVIDENDS.columns.map(() => '円 銭'),
    rows: DIVIDENDS.rows,
  });
  h.text(DIVIDEND_NOTE, LEFT, y + 4, { font: R, size: 7.5 });
  y += 28;

  doc
    .moveTo(LEFT, y - 6)
    .lineTo(RIGHT, y - 6)
    .lineWidth(0.8)
    .stroke();
  h.text(CLOSING_HEADING, LEFT, y, { font: R, size: 8.5 });
  y += 15;
  // The measure is the first line's width; line 2 is spread across it.
  const measure = doc.font(R).fontSize(8).widthOfString(CLOSING[0]);
  CLOSING.forEach((line, i) => {
    if (i === JUSTIFIED_LINE) {
      const chars = [...line];
      doc.font(R).fontSize(8);
      const widthsOf = chars.map((ch) => doc.widthOfString(ch));
      const gap = (measure - widthsOf.reduce((a, b) => a + b, 0)) / (chars.length - 1);
      let x = LEFT + 10;
      chars.forEach((ch, k) => {
        h.text(ch, x, y, { font: R, size: 8 });
        x += widthsOf[k] + gap;
      });
    } else h.text(line, LEFT + 10, y, { font: R, size: 8 });
    y += 12;
  });
}
