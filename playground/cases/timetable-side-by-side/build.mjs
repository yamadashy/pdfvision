// A bus timetable sheet: two grids side by side for the same route
// (weekdays, weekends), stops as rows with dot leaders running from the stop
// name to the first time, one narrow column per trip with its trip number set
// rotated above it, bold for p.m. times, `—` where a trip skips a stop, blank
// cells where a trip starts part-way along the route, footnote symbols on
// times and stops, and the times written to the content stream column by
// column, as timetable software usually emits them.

const H = 'Helvetica';
const HB = 'Helvetica-Bold';
const SYM = 'NotoSansJP';

const ROUTE = '14';
const ROUTE_NAME = 'Harbour Station – Northgate Terminal';
const EFFECTIVE = 'Effective September 7, 2026';
const DIRECTION = 'NORTHBOUND';
// Minutes from the first stop; null = trip does not serve the stop (—).
const STOPS = [
  { name: 'Harbour Station', offset: 0 },
  { name: 'Customs House', offset: 3 },
  { name: 'Mill Street', offset: 7 },
  { name: 'Quarry Road', offset: 11, request: true },
  { name: 'St Brendan’s Hospital', offset: 15 },
  { name: 'Linden Park', offset: 19 },
  { name: 'Ferris Lane School', offset: 23 },
  { name: 'Ashgrove Shops', offset: 27 },
  { name: 'Northgate Library', offset: 33 },
  { name: 'Northgate Terminal', offset: 37 },
];
// A trip: departure (minutes after midnight) from `from` (stop index), optional
// skipped stops, optional footnote on its departure time.
const TABLES = [
  {
    title: 'MONDAY TO FRIDAY',
    trips: [
      { number: '1401', depart: 6 * 60 + 5 },
      { number: '1403', depart: 6 * 60 + 35 },
      { number: '1405', depart: 7 * 60 + 5, note: '§' },
      { number: '1407', depart: 7 * 60 + 20, skip: [3, 5], express: true },
      { number: '1409', depart: 7 * 60 + 42, from: 2 },
      { number: '1411', depart: 12 * 60 + 5 },
      { number: '1413', depart: 15 * 60 + 25, note: '§' },
      { number: '1415', depart: 17 * 60 + 35 },
    ],
  },
  {
    title: 'SATURDAY, SUNDAY & HOLIDAYS',
    trips: [
      { number: '1501', depart: 8 * 60 + 15 },
      { number: '1503', depart: 9 * 60 + 52, from: 2 },
      { number: '1505', depart: 10 * 60 + 15 },
      { number: '1507', depart: 12 * 60 + 15 },
      { number: '1509', depart: 14 * 60 + 15 },
      { number: '1511', depart: 16 * 60 + 15 },
      { number: '1513', depart: 18 * 60 + 15, to: 8 },
    ],
  },
];
const FOOTNOTES = [
  ['§', 'Runs on school days only; serves Ferris Lane School.'],
  ['‡', 'Request stop: signal the driver.'],
  ['—', 'Bus does not stop here.'],
  ['', 'Blank: trip begins or ends at another stop.'],
  ['', 'Times in bold are p.m.'],
];

/** Minutes after midnight → `h:mm`, 12-hour, as printed. */
const clock = (minutes) => {
  const h = Math.floor(minutes / 60) % 24;
  const m = String(minutes % 60).padStart(2, '0');
  return `${((h + 11) % 12) + 1}:${m}`;
};

/** The cell for a trip at a stop: { text, pm, note } or null (blank). */
function cell(trip, stopIndex) {
  const from = trip.from ?? 0;
  const to = trip.to ?? STOPS.length - 1;
  if (stopIndex < from || stopIndex > to) return null;
  if (trip.skip?.includes(stopIndex)) return { text: '—' };
  // Express trips run 4 minutes faster from the first skipped stop on.
  const saved = trip.express && stopIndex > trip.skip[0] ? 4 : 0;
  const minutes = trip.depart + STOPS[stopIndex].offset - STOPS[from].offset - saved;
  const note = stopIndex === from ? trip.note : undefined;
  return { text: clock(minutes), pm: minutes >= 12 * 60, note, minutes };
}

export const meta = {
  title: 'Bus timetable, two grids side by side',
  stresses:
    'two independent grids sharing row baselines; dot leaders; rotated trip-number headers; times written column by column; blank and — cells; footnote symbols; bold for p.m.',
  status: 'known-gap',
  families: ['tables', 'vertical-rotated'],
  page: { size: 'LETTER', layout: 'landscape' },
};

const plainCell = (c) => {
  if (!c) return '';
  if (c.text === '—') return '—';
  return `${c.text}${c.pm ? ' pm' : ''}${c.note ?? ''}`;
};

export const truth = `
**Route ${ROUTE} — ${ROUTE_NAME}**, ${DIRECTION}. ${EFFECTIVE}.

Two separate grids for the same stops. A correct reading keeps each time under its own trip and
its own grid; the weekend grid's times must never be read as weekday trips. p.m. times are set in
bold on the page (written \`pm\` here); \`—\` means the trip skips the stop; an empty cell means the trip
does not run that far.

${TABLES.map(
  (table) => `_${table.title}_

| Stop | ${table.trips.map((t) => t.number).join(' | ')} |
| --- | ${table.trips.map(() => '---:').join(' | ')} |
${STOPS.map((stop, i) => `| ${stop.name}${stop.request ? ' ‡' : ''} | ${table.trips.map((t) => plainCell(cell(t, i))).join(' | ')} |`).join('\n')}`,
).join('\n\n')}

${FOOTNOTES.map(([mark, text]) => `${mark ? `${mark} ` : ''}${text}`).join(' ')}

## Questions an agent should be able to answer

1. On a weekday, when does the bus that leaves Harbour Station at 7:05 reach Northgate Terminal? — ${clock(TABLES[0].trips[2].depart + 37)}
2. What is the first bus from Mill Street on a Saturday? — ${cell(TABLES[1].trips[0], 2).text} (trip 1501)
3. Does weekday trip 1407 stop at Quarry Road? — No (— in that cell); it also skips Linden Park
4. Which weekday trips run on school days only? — ${TABLES[0].trips
  .filter((t) => t.note === '§')
  .map((t) => `${t.number} (${clock(t.depart)}${t.depart >= 720 ? ' pm' : ''})`)
  .join(' and ')}
5. When is the last weekend bus to Northgate Library, and does it continue to the terminal? — ${clock(TABLES[1].trips[6].depart + 33)} pm; no, trip 1513 ends at Northgate Library

Every question can be worked out from \`read.md\`, but only by counting positions in column lists
and with no warning that this is necessary; nothing marks the bold p.m. times.

**Known gap (no issue yet):** the page has no warnings at all.
- The single layout table (9 × 11) fuses the two grids into one, drops the \`Harbour Station\` row and
  the rotated trip-number header, and merges trip columns into one cell where a column starts with
  blanks or the grids' columns crowd: the weekday \`1409\` and \`1411\` times share one cell
  (\`7:42 12:12\`), and from \`St Brendan’s Hospital\` down the weekend trips 1501–1507 collapse into one
  cell (\`| 8:30 10:00 10:30 12:30 | |\`) while above it they are split differently
  (\`| 8:22 | 9:52 10:22 12:22 |\`). Reading that table by column gives wrong trip/time pairs.
- The body gives every trip number first (both grids' headers, interleaved with the agency name
  and phone line), then each grid stop by stop: the stop name with its first times, then the rest
  of that stop's row (\`Customs House … 6:08 6:38 7:08\` / \`7:23\` / \`12:08\` / \`3:28\` / \`5:38\`). A stop
  served by fewer trips has fewer times, and nothing says which trip a lone time belongs to; it used
  to give each trip as a column list headed by its trip number. Question 2 needs the weekend row
  of the stop, read left to right.
- Bold is lost, so the p.m. legend (\`Times in bold are p.m.\`) cannot be applied: \`5:35\` and \`6:15\`
  read the same as the a.m. times (question 5's “pm” comes only from the order of the trips).
`;

const PAGE_W = 792;
const GRID = [
  { x: 28, nameW: 120 },
  { x: 412, nameW: 120 },
];
const COL_W = 29;
const ROW_H = 17;
const TOP = 118;

// Symbols outside WinAnsi come from the CJK font, set on the Helvetica baseline.
const sym = (h, text, x, y) => h.run([{ text, font: SYM }], x, y, { font: H, size: 8 });
const symWidth = (doc, text) => doc.font(SYM).fontSize(8).widthOfString(text);

function drawGrid(doc, h, table, grid) {
  const timesX = grid.x + grid.nameW + 10;
  const width = timesX - grid.x + table.trips.length * COL_W;
  // Banner.
  doc.rect(grid.x, TOP, width, 18).fill('#111');
  doc.fillColor('white');
  h.text(table.title, grid.x + 6, TOP + 5, { font: HB, size: 8.5 });
  doc.fillColor('black');
  // Rotated trip numbers, reading bottom to top.
  const headTop = TOP + 22;
  const headBottom = headTop + 36;
  h.text('Trip', grid.x + 4, headBottom - 11, { font: HB, size: 7 });
  table.trips.forEach((trip, i) => {
    const cx = timesX + i * COL_W + COL_W / 2;
    doc.save();
    doc.rotate(-90, { origin: [cx, headBottom - 3] });
    h.text(trip.number, cx, headBottom - 3 - 3.5, { font: HB, size: 7.5 });
    doc.restore();
  });
  h.rule(grid.x, headBottom + 2, grid.x + width, { width: 1 });
  // Shaded alternate rows.
  STOPS.forEach((_, r) => {
    if (r % 2 === 1) doc.rect(grid.x, headBottom + 4 + r * ROW_H, width, ROW_H).fill('#eef1f4');
  });
  doc.fillColor('black');
  // Stop names with dot leaders to the first time column.
  STOPS.forEach((stop, r) => {
    const y = headBottom + 8 + r * ROW_H;
    const name = stop.request ? `${stop.name} ` : stop.name;
    const { right } = h.text(name, grid.x + 4, y, { font: H, size: 8 });
    let end = right;
    if (stop.request) end = sym(h, '‡', right, y);
    doc.font(H).fontSize(8);
    const dot = doc.widthOfString('.');
    const count = Math.max(0, Math.floor((timesX - 4 - end - 3) / dot));
    h.text('.'.repeat(count), timesX - 4, y, { font: H, size: 8, align: 'right' });
  });
  // Times, column by column.
  table.trips.forEach((trip, i) => {
    const right = timesX + (i + 1) * COL_W - 5;
    STOPS.forEach((_, r) => {
      const c = cell(trip, r);
      if (!c) return;
      const y = headBottom + 8 + r * ROW_H;
      if (c.text === '—') {
        sym(h, '—', right - symWidth(doc, '—'), y);
        return;
      }
      h.text(c.text, right, y, { font: c.pm ? HB : H, size: 8, align: 'right' });
      if (c.note) h.run([{ sup: c.note, font: SYM }], right + 0.5, y, { font: H, size: 8 });
    });
  });
  const bottom = headBottom + 4 + STOPS.length * ROW_H;
  h.rule(grid.x, bottom, grid.x + width, { width: 1 });
  return bottom;
}

export function draw(doc, h) {
  // Route header.
  doc.rect(28, 30, 60, 52).fill('#0a6b3d');
  doc.fillColor('white');
  h.text(ROUTE, 58, 38, { font: HB, size: 34, align: 'center' });
  doc.fillColor('black');
  h.text(ROUTE_NAME, 100, 36, { font: HB, size: 20 });
  h.text(`${DIRECTION}  ·  ${EFFECTIVE}`.replace('·', '-'), 100, 64, { font: H, size: 9.5 });
  h.text('Riverside Transit Authority', PAGE_W - 28, 40, { font: HB, size: 10, align: 'right' });
  h.text('Customer service 555-0190', PAGE_W - 28, 56, { font: H, size: 8.5, align: 'right' });
  h.rule(28, 96, PAGE_W - 28, { width: 2 });

  let bottom = 0;
  TABLES.forEach((table, i) => {
    bottom = Math.max(bottom, drawGrid(doc, h, table, GRID[i]));
  });

  let y = bottom + 16;
  for (const [mark, text] of FOOTNOTES) {
    if (mark) sym(h, mark, 32, y);
    h.text(text, 46, y, { font: mark ? H : HB, size: 8 });
    y += 12;
  }
}
