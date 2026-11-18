// A filled-in health questionnaire (問診票) as clinics receive it from a
// tablet app or a "print to PDF" of a completed web form: no form fields,
// the answers are only drawn. Yes/no items are pairs of □ boxes with a tick
// stroked over the chosen one, single-choice items are rows of ○ with the
// chosen one filled, and a five-point scale is a grid of circles with one
// filled per row. The free-text answers are ordinary text. Every option
// label is real text, so the text layer lists all options and none of the
// choices.

const W = 595;
const R = 'NotoSansJP';
const B = 'NotoSansJP-Bold';

const PATIENT = { name: '佐倉 みのり', birth: '1988年4月12日', date: '2026年11月18日' };
const YES_NO = [
  { q: '現在、治療中の病気がありますか', answer: 'はい', detail: '高血圧（内服中）' },
  { q: '薬や食べ物でアレルギーが出たことがありますか', answer: 'はい', detail: 'ペニシリン系の抗生物質' },
  { q: 'これまでに手術を受けたことがありますか', answer: 'いいえ' },
  { q: '妊娠中、または妊娠の可能性がありますか', answer: 'いいえ' },
  { q: '最近3か月で体重が3kg以上変わりましたか', answer: 'はい', detail: '約4kg減少' },
];
const CHOICES = [
  { q: '喫煙', options: ['吸わない', '以前吸っていた', '吸う（1日　本）'], answer: 1 },
  { q: '飲酒', options: ['飲まない', '週1〜2日', '週3〜5日', 'ほぼ毎日'], answer: 2 },
  { q: '運動習慣', options: ['ほとんどしない', '週1回程度', '週2回以上'], answer: 0 },
];
const SCALE = ['まったくない', 'あまりない', 'どちらとも', 'ときどき', 'よくある'];
const SCALE_ROWS = [
  { q: '夜、眠りにつきにくい', answer: 3 },
  { q: '日中に強い眠気がある', answer: 1 },
  { q: '食欲がない', answer: 0 },
  { q: '気分が落ち込む', answer: 2 },
];

export const meta = {
  title: 'Filled-in health questionnaire (問診票) whose answers are drawn marks',
  stresses:
    'no form fields; yes/no answers as ticks stroked over □ boxes; single choices as filled ○ among empty ones; a five-point scale grid with one filled circle per row; option labels all present as text; free-text answers as ordinary text',
  status: 'ok',
  showcase: true,
  hard: 'Every option label is text and the answers are only strokes — a tick over a □, a dot in a ○ — so the text alone reads as a blank form; a rating grid has no text beside its circles at all.',
  families: ['vector-meaning', 'interactive', 'scripts'],
  page: { size: 'A4' },
};

export const truth = `
One A4 page, a completed questionnaire. Patient: ${PATIENT.name}, born ${PATIENT.birth}, filled in ${PATIENT.date}.
All options are printed; the answers are only marks (a tick over a □, a filled ○). A correct reading
reports which option is marked:

**1. はい／いいえ**
${YES_NO.map((item, i) => `- (${i + 1}) ${item.q} — **${item.answer}**${item.detail ? `（${item.detail}）` : ''}`).join('\n')}

**2. 生活習慣** (one filled ○ per row)
${CHOICES.map((item) => `- ${item.q} — **${item.options[item.answer]}**`).join('\n')}

**3. この1か月の状態** (scale: ${SCALE.join(' / ')})
${SCALE_ROWS.map((row) => `- ${row.q} — **${SCALE[row.answer]}**`).join('\n')}

## Questions an agent should be able to answer

1. Does the patient have an allergy, and to what? — Yes, to penicillin-class antibiotics
2. Has the patient had surgery? — No
3. What is the patient's smoking status? — 以前吸っていた (former smoker)
4. How often does the patient drink? — 週3〜5日
5. How often does the patient have trouble falling asleep at night? — ときどき
6. Could the patient be pregnant? — No (いいえ)

Fixed in #303: the drawn answers are reported as content. \`### Choice marks\` gives one row per row
of boxes — the question at its left, the marked option, the options left empty — so every question
above is answered from it: \`(3) これまでに手術を受けたことがありますか | いいえ | はい\`,
\`喫煙 | 以前吸っていた | 吸わない / 吸う(1日 本)\`, and the rating grid by its column headings
(\`夜、眠りにつきにくい | ときどき | まったくない / あまりない / どちらとも / よくある\`). A tick is a stroked
open V with its longer arm rising right, a selected circle holds a filled dot; the boxes and circles carry
no text.

The body still reads section 1 column by column (the five questions, then \`はい\` ×5, \`いいえ\` ×5)
and splices section 2's options between them; the choice table does not depend on that order.
`;

function box(doc, x, y) {
  doc.lineWidth(0.8).rect(x, y, 9, 9).stroke();
}
function tick(doc, x, y) {
  doc.save().lineWidth(1.6).strokeColor('#1a237e');
  doc
    .moveTo(x - 1, y + 4)
    .lineTo(x + 3.5, y + 9.5)
    .lineTo(x + 12, y - 3)
    .stroke();
  doc.restore();
}
function radio(doc, cx, cy, filled) {
  doc.lineWidth(0.8).circle(cx, cy, 4.2).stroke();
  if (filled) doc.circle(cx, cy, 2.8).fill('#1a237e');
  doc.fillColor('black');
}

export function draw(doc, h) {
  h.text('問　診　票', W / 2, 46, { font: B, size: 17, align: 'center' });
  h.text('ご記入日', 360, 88, { font: R, size: 9 });
  h.text(PATIENT.date, 412, 88, { font: R, size: 10 });
  doc.lineWidth(0.6).rect(50, 108, 495, 26).stroke();
  doc.moveTo(250, 108).lineTo(250, 134).stroke();
  h.text('氏名', 58, 114, { font: R, size: 9 });
  h.text(PATIENT.name, 100, 113, { font: R, size: 11 });
  h.text('生年月日', 258, 114, { font: R, size: 9 });
  h.text(PATIENT.birth, 318, 113, { font: R, size: 11 });

  // 1. yes/no grid: question text, then the boxes; the ticks come after all of it.
  let y = 156;
  h.text('1. 次の質問にお答えください。「はい」の場合は内容もご記入ください。', 50, y, { font: B, size: 10 });
  y += 24;
  const rows = [];
  for (const [i, item] of YES_NO.entries()) {
    h.text(`(${i + 1}) ${item.q}`, 58, y, { font: R, size: 9.5 });
    box(doc, 330, y + 1);
    h.text('はい', 343, y, { font: R, size: 9.5 });
    box(doc, 378, y + 1);
    h.text('いいえ', 391, y, { font: R, size: 9.5 });
    h.text('内容：', 430, y, { font: R, size: 8.5 });
    doc
      .lineWidth(0.4)
      .moveTo(455, y + 12)
      .lineTo(545, y + 12)
      .stroke();
    rows.push(y);
    y += 26;
  }
  for (const [i, item] of YES_NO.entries()) {
    tick(doc, item.answer === 'はい' ? 330 : 378, rows[i] + 1);
    if (item.detail) h.text(item.detail, 457, rows[i] + 1, { font: R, size: 8.5 });
  }

  // 2. single choice rows.
  y += 12;
  h.text('2. 生活習慣について、あてはまるものを一つ選んでください。', 50, y, { font: B, size: 10 });
  y += 24;
  for (const item of CHOICES) {
    h.text(item.q, 58, y, { font: R, size: 9.5 });
    let x = 130;
    item.options.forEach((option, i) => {
      radio(doc, x + 4, y + 7, i === item.answer);
      const label = h.text(option, x + 12, y, { font: R, size: 9.5 });
      x = label.right + 22;
    });
    y += 26;
  }

  // 3. scale grid.
  y += 12;
  h.text('3. この1か月の状態について、最も近いものを選んでください。', 50, y, { font: B, size: 10 });
  y += 22;
  const colX = (i) => 270 + i * 58;
  doc
    .lineWidth(0.5)
    .rect(50, y, 495, 24 + SCALE_ROWS.length * 24)
    .stroke();
  SCALE.forEach((label, i) => {
    h.text(label, colX(i), y + 7, { font: R, size: 8, align: 'center' });
  });
  doc
    .moveTo(50, y + 24)
    .lineTo(545, y + 24)
    .stroke();
  SCALE_ROWS.forEach((row, r) => {
    const top = y + 24 + r * 24;
    h.text(row.q, 58, top + 7, { font: R, size: 9.5 });
    SCALE.forEach((_, i) => {
      radio(doc, colX(i), top + 12, i === row.answer);
    });
    if (r > 0) doc.lineWidth(0.3).moveTo(50, top).lineTo(545, top).stroke();
  });

  h.text('ご協力ありがとうございました。診察の順番が来ましたらお呼びします。', W / 2, 790, {
    font: R,
    size: 8.5,
    align: 'center',
  });
}
