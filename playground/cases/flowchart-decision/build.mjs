// A process flowchart from a store's operations manual, as Visio or
// PowerPoint exports it: rounded terminators, process boxes and decision
// diamonds with real text, joined by vector connectors with arrowheads.
// Branches leave the diamonds sideways, one loops back up, and the Yes/No
// labels sit beside the connectors. Shapes and their text are written in
// shape order, the connectors and their labels afterwards, so the flow
// exists only in the drawing.

const W = 612;

const NODES = {
  start: { kind: 'terminal', x: 250, y: 104, text: ['Start'] },
  receive: { kind: 'box', x: 250, y: 160, text: ['Log the refund request'] },
  receipt: { kind: 'decision', x: 250, y: 238, text: ['Receipt', 'attached?'] },
  ask: { kind: 'box', x: 468, y: 238, text: ['Email the customer', 'for the receipt'] },
  days: { kind: 'decision', x: 250, y: 330, text: ['Bought within', '30 days?'] },
  credit: { kind: 'box', x: 468, y: 330, text: ['Offer store credit'] },
  unused: { kind: 'decision', x: 250, y: 422, text: ['Item unused?'] },
  inspect: { kind: 'box', x: 92, y: 422, text: ['Inspect the item'] },
  defect: { kind: 'decision', x: 92, y: 512, text: ['Fault from', 'manufacture?'] },
  repair: { kind: 'box', x: 92, y: 604, text: ['Offer a repair', 'at our cost'] },
  refund: { kind: 'box', x: 250, y: 604, text: ['Refund to the original', 'payment method'] },
  confirm: { kind: 'box', x: 250, y: 666, text: ['Send confirmation email'] },
  end: { kind: 'terminal', x: 250, y: 726, text: ['End'] },
};
const BOX_W = 128;
const BOX_H = 34;
const DIA_W = 120;
const DIA_H = 62;

// Connectors: polyline points and an optional label placed near `at`.
const EDGES = [
  {
    path: [
      [250, 117],
      [250, 143],
    ],
  },
  {
    path: [
      [250, 177],
      [250, 207],
    ],
  },
  {
    path: [
      [310, 238],
      [404, 238],
    ],
    label: 'No',
    at: [334, 226],
  },
  {
    path: [
      [468, 221],
      [468, 160],
      [314, 160],
    ],
  },
  {
    path: [
      [250, 269],
      [250, 299],
    ],
    label: 'Yes',
    at: [256, 280],
  },
  {
    path: [
      [310, 330],
      [404, 330],
    ],
    label: 'No',
    at: [334, 318],
  },
  {
    path: [
      [250, 361],
      [250, 391],
    ],
    label: 'Yes',
    at: [256, 372],
  },
  {
    path: [
      [190, 422],
      [156, 422],
    ],
    label: 'No',
    at: [164, 410],
  },
  {
    path: [
      [250, 453],
      [250, 587],
    ],
    label: 'Yes',
    at: [256, 520],
  },
  {
    path: [
      [92, 439],
      [92, 481],
    ],
  },
  {
    path: [
      [152, 512],
      [170, 512],
      [170, 604],
      [186, 604],
    ],
    label: 'Yes',
    at: [160, 500],
  },
  {
    path: [
      [92, 543],
      [92, 587],
    ],
    label: 'No',
    at: [98, 556],
  },
  {
    path: [
      [250, 621],
      [250, 649],
    ],
  },
  {
    path: [
      [250, 683],
      [250, 713],
    ],
  },
  {
    path: [
      [468, 347],
      [468, 726],
      [290, 726],
    ],
  },
  {
    path: [
      [92, 621],
      [92, 726],
      [210, 726],
    ],
  },
];

const CAPTION = 'Figure 2. Handling a refund request at the service desk';
const NOTE =
  'Store credit and repairs are recorded in the same log as refunds. A request that is waiting for a receipt is closed automatically after 14 days.';

export const meta = {
  title: 'Refund process flowchart with decision branches',
  stresses:
    'terminators, process boxes and decision diamonds with real text; vector connectors with arrowheads; Yes/No labels beside the connectors; a branch that loops back; two branches that merge into one box; shapes written before connectors',
  status: 'ok',
  showcase: true,
  hard: 'The flow exists only as strokes: connectors leave diamonds sideways, one loops back up as an elbow, two branches merge, and every Yes/No sits beside its connector, not in any box.',
  families: ['vector-meaning', 'reading-order'],
};

export const truth = `
One Letter page: a section heading, a flowchart and its caption, and a note. The flowchart, as steps:

1. **Start** → **Log the refund request** → decision **Receipt attached?**
2. Receipt attached? — **No** → **Email the customer for the receipt** → back to *Log the refund request*.
   **Yes** → decision **Bought within 30 days?**
3. Bought within 30 days? — **No** → **Offer store credit** → **End**. **Yes** → decision **Item unused?**
4. Item unused? — **Yes** → **Refund to the original payment method**. **No** → **Inspect the item** →
   decision **Fault from manufacture?**
5. Fault from manufacture? — **Yes** → **Refund to the original payment method**. **No** →
   **Offer a repair at our cost** → **End**.
6. Refund to the original payment method → **Send confirmation email** → **End**.

Note below the figure: ${NOTE}

## Questions an agent should be able to answer

1. A customer bought an item 45 days ago and has the receipt. What does the desk do? — Offer store credit
2. The item is within 30 days and has been used, and the inspection finds a manufacturing fault. What happens? — Refund to the original payment method, then a confirmation email
3. What happens when the request has no receipt? — The desk emails the customer for the receipt and the request goes back to being logged (closed automatically after 14 days if none arrives)
4. Which step comes right after a refund? — Send confirmation email
5. When is a repair offered instead of a refund? — When a used item, within 30 days, has a fault that is not from manufacture

Fixed in #265: \`### Connections\` lists all sixteen arrows as \`from → to (label)\`, each label the
\`Yes\`/\`No\` nearest its connector: \`Bought within 30 days? → Offer store credit (No)\`,
\`Email the customer for the receipt → Log the refund request\` (the loop back),
\`Fault from manufacture? → Refund to the original payment method (Yes)\` and
\`Offer a repair at our cost → End\` (the merges). Every question is answered from it.

The body still reads the labels as three loose groups (the left branch with \`Refund to the original
payment method\` after \`Offer a repair at our cost\`, the caption, the centre column, then the right
branch, \`No\` / \`No\` after \`End\`); the connections do not depend on that order.
`;

function shape(doc, node) {
  doc.lineWidth(1).strokeColor('#333');
  if (node.kind === 'terminal') {
    doc.roundedRect(node.x - 40, node.y - 13, 80, 26, 13).fillAndStroke('#e8eaf6', '#333');
  } else if (node.kind === 'box') {
    doc.rect(node.x - BOX_W / 2, node.y - BOX_H / 2, BOX_W, BOX_H).fillAndStroke('#ffffff', '#333');
  } else {
    doc
      .moveTo(node.x, node.y - DIA_H / 2)
      .lineTo(node.x + DIA_W / 2, node.y)
      .lineTo(node.x, node.y + DIA_H / 2)
      .lineTo(node.x - DIA_W / 2, node.y)
      .closePath()
      .fillAndStroke('#fff8e1', '#333');
  }
  doc.fillColor('black');
}

function label(h, node) {
  const size = 8.5;
  const top = node.y - (node.text.length * (size + 2)) / 2;
  node.text.forEach((line, i) => {
    h.text(line, node.x, top + i * (size + 2), { size, align: 'center' });
  });
}

function connector(doc, edge) {
  const pts = edge.path;
  doc.lineWidth(1).strokeColor('#333');
  doc.moveTo(...pts[0]);
  for (const p of pts.slice(1)) doc.lineTo(...p);
  doc.stroke();
  const [x1, y1] = pts[pts.length - 2];
  const [x2, y2] = pts[pts.length - 1];
  const a = Math.atan2(y2 - y1, x2 - x1);
  const head = (da) => [x2 - 7 * Math.cos(a + da), y2 - 7 * Math.sin(a + da)];
  doc
    .moveTo(x2, y2)
    .lineTo(...head(0.4))
    .lineTo(...head(-0.4))
    .closePath()
    .fill('#333');
  doc.fillColor('black');
}

export function draw(doc, h) {
  h.text('5.3  Refunds and returns', 54, 50, { font: 'Helvetica-Bold', size: 14 });
  for (const node of Object.values(NODES)) shape(doc, node);
  for (const node of Object.values(NODES)) label(h, node);
  for (const edge of EDGES) connector(doc, edge);
  for (const edge of EDGES)
    if (edge.label) h.text(edge.label, edge.at[0], edge.at[1], { font: 'Helvetica-Oblique', size: 8 });
  h.text(CAPTION, W / 2, 748, { font: 'Helvetica-Bold', size: 9, align: 'center' });
  h.paragraph(NOTE, 54, 764, W - 108, { font: 'Helvetica', size: 8.5 });
}
