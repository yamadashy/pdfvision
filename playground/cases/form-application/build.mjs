// A fillable grant application as form-authoring tools produce it: printed
// labels and boxes on the page, AcroForm widgets on top carrying the values.
// Some fields are filled, some left empty; there is a multi-line address,
// a date split into three boxes, a radio group, checkboxes, a dropdown,
// and a signature line that is not a field.
//
// pdfkit 0.20 builds field dictionaries from a fixed set of named options,
// so button fields are assembled the way tests/core/processDocument.test.ts
// does it: raw keys patched onto the field ref, widget AP/AS passed inline.

const SANS = 'Helvetica';
const BOLD = 'Helvetica-Bold';

const ORG = 'Riverside Community Arts Fund';
const FORM_TITLE = 'Project Grant Application — 2027 Cycle';
const FORM_ID = 'Form RCAF-12 (rev. 03/2026)';
const INSTRUCTIONS =
  'Please type or print clearly. Fields marked * are required. Return the completed form to ' +
  'grants@riverside-arts.example no later than January 31, 2027. Incomplete applications will not be reviewed.';

// `label: 'left'` puts the label beside the box, `'above'` over it.
const APPLICANT = [
  { name: 'full_name', label: 'Full name *', at: 'left', value: 'Elena Marsh' },
  { name: 'organization', label: 'Organization', at: 'left', value: 'Tidewater Youth Theatre' },
  { name: 'email', label: 'Email *', at: 'left', value: 'elena.marsh@tidewater.example' },
  { name: 'phone', label: 'Phone', at: 'left', value: '' },
  {
    name: 'mailing_address',
    label: 'Mailing address *',
    at: 'above',
    value: '214 Harbor Street, Unit 3\nPort Avalon, CA 95012',
    multiline: true,
  },
];
const START_DATE = [
  { name: 'start_month', hint: 'MM', value: '03' },
  { name: 'start_day', hint: 'DD', value: '01' },
  { name: 'start_year', hint: 'YYYY', value: '2027' },
];
const CATEGORY = {
  name: 'program_category',
  label: 'Program category *',
  options: [
    { state: 'Visual', text: 'Visual arts' },
    { state: 'Performing', text: 'Performing arts' },
    { state: 'Literary', text: 'Literary arts' },
    { state: 'Media', text: 'Media arts' },
  ],
  selected: 'Performing',
};
const PROJECT_TITLE = {
  name: 'project_title',
  label: 'Project title *',
  value: 'Summer Stage: Shakespeare in the Park',
};
const AMOUNT = { name: 'requested_amount', label: 'Amount requested (USD) *', value: '12,500' };
const PARTICIPANTS = { name: 'participants', label: 'Expected participants', value: '' };
const COUNTY = {
  name: 'county',
  label: 'County served',
  options: ['Alder', 'Bayview', 'Coastline', 'Redwood'],
  value: 'Bayview',
};
const DECLARATIONS = [
  { name: 'confirm_accurate', text: 'I confirm that the information in this application is accurate.', checked: true },
  { name: 'is_nonprofit', text: 'The organization is a registered nonprofit.', checked: true },
  { name: 'prior_funding', text: 'We have received RCAF funding in the past three years.', checked: false },
  { name: 'newsletter', text: 'Send me the RCAF newsletter.', checked: false },
];

export const meta = {
  title: 'Fillable grant application (AcroForm)',
  stresses:
    'filled and empty text fields; labels left of and above boxes; multi-line field; split date boxes; radio group; checkboxes; dropdown; signature line that is not a field',
  status: 'ok',
};

const shown = (value) => (value ? `\`${value.replace('\n', ' / ')}\`` : '(empty)');
const selectedCategory = CATEGORY.options.find((o) => o.state === CATEGORY.selected).text;

export const truth = `
${ORG} — ${FORM_TITLE} (${FORM_ID}). Instructions: “${INSTRUCTIONS}”

A correct reading pairs every field with its printed label and value, and distinguishes an
empty field from a missing one.

**1. Applicant information**

${APPLICANT.map((f) => `- ${f.label}: ${shown(f.value)}`).join('\n')}

**2. Project details**

- ${PROJECT_TITLE.label}: ${shown(PROJECT_TITLE.value)}
- Project start date (three boxes ${START_DATE.map((d) => d.hint).join(' / ')}): ${START_DATE.map((d) => d.value).join('/')}
- ${CATEGORY.label} (radio): **${selectedCategory}** selected; ${CATEGORY.options
  .filter((o) => o.state !== CATEGORY.selected)
  .map((o) => o.text)
  .join(', ')} not selected
- ${AMOUNT.label}: ${shown(AMOUNT.value)}
- ${PARTICIPANTS.label}: ${shown(PARTICIPANTS.value)}
- ${COUNTY.label} (dropdown of ${COUNTY.options.join(', ')}): **${COUNTY.value}**

**3. Declarations** (checkboxes)

${DECLARATIONS.map((d) => `- [${d.checked ? 'x' : ' '}] ${d.text}`).join('\n')}

Signature of applicant and Date: printed lines, not fields, left blank.

## Questions an agent should be able to answer

1. How much funding is requested? — $${AMOUNT.value}
2. Which program category did the applicant choose? — ${selectedCategory}
3. When does the project start? — ${START_DATE.map((d) => d.value).join('/')} (March 1, 2027)
4. Has the organization received RCAF funding in the past three years? — No (box unchecked)
5. Which required fields, if any, are still empty? — none; the empty fields (Phone, Expected participants) are optional

**Current reading (ok):** all five questions are answerable from \`read.md\`, with some deduction.
Values live only in the form-field table (the body is the printed labels), which is the design.
Unchecked boxes and empty text fields are collapsed into “_4 further fields, none filled
(2 checkbox, 2 text)_” — question 4 follows from the two checked declarations being listed by
label, question 5 from every \`*\` label having a filled field.

Defect without a warning: the label column is empty for left-labelled fields whose printed
label ends far from the box (\`full_name\`, \`organization\`, \`email\`, \`project_title\`,
\`county\`, and \`start_day\`/\`start_year\`), while \`requested_amount\` (longer label, smaller
gap) gets \`Amount requested (USD) * (left)\`. Here the field names carry the meaning; on a form
with generic names (\`Text1\`, \`Text2\`) the values could not be attributed. The radio labels'
body order diverges (\`Media arts\` after \`Signature of applicant\`) and is covered by a
\`reading_order_divergence\` warning that says to render.
`;

const LEFT = 54;
const RIGHT = 558;
const FIELD_LEFT = 200;
const BORDER = '#7d8794';

function box(doc, x, y, w, h) {
  doc.rect(x, y, w, h).lineWidth(0.6).stroke(BORDER);
  doc.strokeColor('black');
}

function appearance(doc, w, h, content) {
  const stream = doc.ref({ Type: 'XObject', Subtype: 'Form', BBox: [0, 0, w, h], Resources: {} });
  stream.end(content);
  return stream;
}

function buttonField(doc, name, entries) {
  const field = doc.formField(name, {});
  Object.assign(field.data, { FT: 'Btn', ...entries });
  field.data.Kids = [];
  return field;
}

function buttonWidget(doc, parent, x, y, size, onState, isOn, radio) {
  const k = 0.5523 * (size / 2 - 3);
  const c = size / 2;
  const r = size / 2 - 3;
  const mark = radio
    ? `0 g ${c + r} ${c} m ${c + r} ${c + k} ${c + k} ${c + r} ${c} ${c + r} c ${c - k} ${c + r} ${c - r} ${c + k} ${c - r} ${c} c ${c - r} ${c - k} ${c - k} ${c - r} ${c} ${c - r} c ${c + k} ${c - r} ${c + r} ${c - k} ${c + r} ${c} c f`
    : `0 g 1.4 w 2.5 ${size / 2} m ${size * 0.42} 2.5 l ${size - 2} ${size - 2.5} l S`;
  const AP = { N: { Off: appearance(doc, size, size, ''), [onState]: appearance(doc, size, size, mark) } };
  doc.annotate(x, y, size, size, { Subtype: 'Widget', F: 4, Parent: parent, AP, AS: isOn ? onState : 'Off' });
  parent.data.Kids.push(doc.page.annotations[doc.page.annotations.length - 1]);
}

function sectionHeading(doc, h, text, y) {
  doc.rect(LEFT, y, RIGHT - LEFT, 18).fill('#e4e9f0');
  doc.fillColor('#1d2b3a');
  h.text(text, LEFT + 6, y + 4, { font: BOLD, size: 10.5 });
  doc.fillColor('black');
  return y + 28;
}

function textField(doc, h, field, y) {
  const height = field.multiline ? 34 : 18;
  let fieldY = y;
  if (field.at === 'above') {
    h.text(field.label, LEFT, y, { font: SANS, size: 9 });
    fieldY = y + 13;
  } else {
    h.text(field.label, LEFT, y + 5, { font: SANS, size: 9 });
  }
  const x = field.at === 'above' ? LEFT : FIELD_LEFT;
  box(doc, x, fieldY, RIGHT - x, height);
  doc.font(SANS);
  doc.formText(field.name, x, fieldY, RIGHT - x, height, {
    value: field.value,
    multiline: field.multiline,
    fontSize: 10,
  });
  return fieldY + height + 9;
}

export function draw(doc, h) {
  doc.font(SANS);
  doc.initForm();

  h.text(ORG, LEFT, 48, { font: BOLD, size: 15 });
  h.text(FORM_TITLE, LEFT, 68, { font: SANS, size: 12 });
  h.text(FORM_ID, RIGHT, 52, { font: SANS, size: 8, align: 'right' });
  doc.fillColor('#4b5563');
  let y = h.paragraph(INSTRUCTIONS, LEFT, 90, RIGHT - LEFT, { font: SANS, size: 8, lineGap: 1 }) + 10;
  doc.fillColor('black');

  y = sectionHeading(doc, h, '1. Applicant information', y);
  for (const field of APPLICANT) y = textField(doc, h, field, y);

  y = sectionHeading(doc, h, '2. Project details', y + 4);
  y = textField(doc, h, { ...PROJECT_TITLE, at: 'left' }, y);

  h.text('Project start date *', LEFT, y + 5, { font: SANS, size: 9 });
  let x = FIELD_LEFT;
  START_DATE.forEach((part, i) => {
    const w = part.hint === 'YYYY' ? 46 : 28;
    box(doc, x, y, w, 18);
    doc.formText(part.name, x, y, w, 18, { value: part.value, align: 'center', fontSize: 10 });
    doc.fillColor('#6b7280');
    h.text(part.hint, x + w / 2, y + 21, { font: SANS, size: 6.5, align: 'center' });
    doc.fillColor('black');
    if (i < START_DATE.length - 1) h.text('/', x + w + 5, y + 4, { font: SANS, size: 11, align: 'center' });
    x += w + 10;
  });
  y += 38;

  h.text(CATEGORY.label, LEFT, y + 2, { font: SANS, size: 9 });
  const group = buttonField(doc, CATEGORY.name, { Ff: 49152, V: CATEGORY.selected });
  x = FIELD_LEFT;
  for (const option of CATEGORY.options) {
    doc
      .circle(x + 5.5, y + 5.5, 5.5)
      .lineWidth(0.6)
      .stroke(BORDER);
    doc.strokeColor('black');
    buttonWidget(doc, group, x, y, 11, option.state, option.state === CATEGORY.selected, true);
    const { right } = h.text(option.text, x + 15, y + 1.5, { font: SANS, size: 9 });
    x = right + 18;
  }
  y += 24;

  y = textField(doc, h, { ...AMOUNT, at: 'left' }, y);
  y = textField(doc, h, { ...PARTICIPANTS, at: 'left' }, y);

  h.text(COUNTY.label, LEFT, y + 5, { font: SANS, size: 9 });
  box(doc, FIELD_LEFT, y, 150, 18);
  doc.formCombo(COUNTY.name, FIELD_LEFT, y, 150, 18, { select: COUNTY.options, value: COUNTY.value, fontSize: 10 });
  y += 30;

  y = sectionHeading(doc, h, '3. Declarations', y + 4);
  for (const item of DECLARATIONS) {
    box(doc, LEFT, y, 11, 11);
    const field = buttonField(doc, item.name, item.checked ? { V: 'Yes' } : {});
    buttonWidget(doc, field, LEFT, y, 11, 'Yes', item.checked, false);
    h.text(item.text, LEFT + 18, y + 1.5, { font: SANS, size: 9 });
    y += 18;
  }

  y += 26;
  h.rule(LEFT, y, LEFT + 260, { width: 0.6 });
  h.rule(LEFT + 300, y, RIGHT, { width: 0.6 });
  h.text('Signature of applicant', LEFT, y + 4, { font: SANS, size: 8 });
  h.text('Date', LEFT + 300, y + 4, { font: SANS, size: 8 });

  doc.fillColor('#6b7280');
  h.paragraph(
    'By signing, you authorize RCAF to verify the information provided. Personal information is used only to ' +
      'administer this grant program. For office use only — Application ID: ________  Reviewed by: ________',
    LEFT,
    736,
    RIGHT - LEFT,
    { font: SANS, size: 7, lineGap: 1 },
  );
  doc.fillColor('black');
}
