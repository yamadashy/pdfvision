// A project schedule printed from a spreadsheet Gantt tracker on Letter
// landscape: a task table (ID, task, owner, plan start, plan end) whose right
// side is a week-by-week timescale. Duration, current forecast, status
// colour, progress, milestones, the "today" line and dependency arrows exist
// only as vector shapes; the date columns hold the original plan, which the
// bars have since moved away from for one task. Organisation and people are
// fictional.

const SANS = 'Helvetica';
const BOLD = 'Helvetica-Bold';
const H = 612;

const PROJECT = {
  org: 'Cobalt Ridge Health',
  name: 'Patient Portal Relaunch — Project Schedule',
  manager: 'Project manager: Renata Solis',
  version: 'Schedule v7',
};
const FOOTER = 'Cobalt Ridge Health  |  PMO  |  Internal';

// Week 0 starts Monday 2026-09-07; the timescale shows 16 weeks.
const WEEK0 = Date.UTC(2026, 8, 7);
const WEEKS = 16;
// Wednesday of week 7 (2026-10-28), as a fraction of the week.
const TODAY = 7 + 2.5 / 7;

const STATUS = {
  done: { label: 'Done', fill: '#9aa3ae', dark: '#6b7480' },
  track: { label: 'On track', fill: '#5aa469', dark: '#2f7a3f' },
  risk: { label: 'At risk', fill: '#f0b429', dark: '#b7801a' },
  late: { label: 'Late', fill: '#d64545', dark: '#9b2525' },
};

// `plan` = [first week, last week] shown in the date columns; `bar` = the
// current forecast drawn on the timescale (defaults to plan). `progress` is
// the fraction of the bar drawn as a darker strip. `dates: false` leaves the
// date cells blank, as the tracker does for tasks not yet scheduled in detail.
// Milestones fall on the Friday of `week`.
const ROWS = [
  { kind: 'phase', id: '1', name: 'Discovery', bar: [0, 2] },
  { id: '1.1', name: 'Stakeholder interviews', owner: 'P. Nair', plan: [0, 1], status: 'done', progress: 1 },
  { id: '1.2', name: 'Current-state audit', owner: 'J. Brandt', plan: [1, 2], status: 'done', progress: 1 },
  { kind: 'milestone', id: '1.3', name: 'Requirements sign-off', owner: 'R. Solis', week: 2, status: 'done' },
  { kind: 'phase', id: '2', name: 'Design', bar: [2, 6] },
  { id: '2.1', name: 'UX wireframes', owner: 'M. Lindqvist', plan: [2, 4], status: 'done', progress: 1 },
  { id: '2.2', name: 'Visual design system', owner: 'A. Tanaka', plan: [3, 6], status: 'done', progress: 1 },
  { kind: 'milestone', id: '2.3', name: 'Design review', owner: 'R. Solis', week: 6, status: 'done' },
  { kind: 'phase', id: '3', name: 'Build', bar: [4, 11] },
  { id: '3.1', name: 'API integration', owner: 'D. Okafor', plan: [5, 10], status: 'track', progress: 0.5 },
  { id: '3.2', name: 'Data migration', owner: 'S. Kowalski', plan: [4, 7], bar: [4, 9], status: 'late', progress: 0.4 },
  { id: '3.3', name: 'Secure messaging module', owner: 'L. Haddad', plan: [6, 11], status: 'risk', progress: 0.15 },
  { id: '3.4', name: 'Appointment scheduling', owner: 'D. Okafor', plan: [7, 11], status: 'track', progress: 0.1 },
  { id: '3.5', name: 'Accessibility audit', owner: 'A. Tanaka', plan: [9, 10], status: 'track', progress: 0 },
  { kind: 'phase', id: '4', name: 'Test & launch', bar: [11, 15] },
  { id: '4.1', name: 'QA regression', owner: 'QA team', plan: [11, 12], status: 'track', progress: 0 },
  {
    id: '4.2',
    name: 'Penetration test',
    owner: 'Vendor (TBD)',
    plan: [12, 13],
    status: 'risk',
    progress: 0,
    dates: false,
  },
  { id: '4.3', name: 'User acceptance testing', owner: 'J. Brandt', plan: [13, 14], status: 'track', progress: 0 },
  { kind: 'milestone', id: '4.4', name: 'Go-live', owner: 'R. Solis', week: 14, status: 'track' },
  { id: '4.5', name: 'Hypercare', owner: 'Support', plan: [15, 15], status: 'track', progress: 0, dates: false },
];
// Finish-to-start links, drawn as elbow arrows from the end of one bar to the start of another.
const LINKS = [
  ['1.3', '2.1'],
  ['2.3', '3.4'],
  ['3.1', '4.1'],
  ['4.1', '4.3'],
  ['4.3', '4.4'],
];

const DAY = 86400000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const weekStart = (week) => new Date(WEEK0 + week * 7 * DAY);
const weekFriday = (week) => new Date(WEEK0 + (week * 7 + 4) * DAY);
const shortDate = (d) => `${d.getUTCMonth() + 1}/${d.getUTCDate()}/${String(d.getUTCFullYear()).slice(2)}`;
const weekLabel = (week) => `${weekStart(week).getUTCMonth() + 1}/${weekStart(week).getUTCDate()}`;
const longDate = (d) => `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;

const tasks = ROWS.filter((row) => !row.kind);
const barOf = (row) => row.bar ?? row.plan;
const activeIn = (week) =>
  ROWS.filter((row) => {
    if (row.kind === 'phase') return false;
    if (row.kind === 'milestone') return row.week === week;
    const [a, b] = barOf(row);
    return a <= week && week <= b;
  });
const byId = (id) => ROWS.find((row) => row.id === id);
const OVERLAP_WEEK = 9;
const late = tasks.filter((t) => t.status === 'late');
const risky = tasks.filter((t) => t.status === 'risk');
const migration = byId('3.2');
const designReview = byId('2.3');
const goLive = byId('4.4');

export const meta = {
  title: 'Gantt project schedule with status-coloured bars and a today line',
  stresses:
    'task table whose right half is a week grid; durations, forecast slip, status, progress, milestones, today line and dependencies exist only as vector shapes',
  status: 'known-gap',
  families: ['vector-meaning', 'tables'],
  page: { size: 'LETTER', layout: 'landscape' },
};

const rowLine = (row) => {
  if (row.kind === 'phase')
    return `| **${row.id}** | **${row.name}** | | | | summary bar ${longDate(weekStart(row.bar[0]))}–${longDate(weekFriday(row.bar[1]))} |`;
  if (row.kind === 'milestone') {
    const d = shortDate(weekFriday(row.week));
    return `| ${row.id} | ${row.name} | ${row.owner} | ${d} | ${d} | ◆ milestone, ${STATUS[row.status].label} |`;
  }
  const [a, b] = row.plan;
  const dates = row.dates === false ? ['', ''] : [shortDate(weekStart(a)), shortDate(weekFriday(b))];
  const [ba, bb] = barOf(row);
  const bar = `${longDate(weekStart(ba))}–${longDate(weekFriday(bb))}, ${STATUS[row.status].label}, ${Math.round(row.progress * 100)}% done`;
  return `| ${row.id} | ${row.name} | ${row.owner} | ${dates[0]} | ${dates[1]} | ${bar} |`;
};

export const truth = `
One Letter landscape page: **${PROJECT.org} — ${PROJECT.name}**, ${PROJECT.manager}, ${PROJECT.version}.
Footer \`${FOOTER}\` and \`Page 1 of 1\`.

The left half is a table (ID, Task, Owner, Plan start, Plan end). The right half is a timescale of
${WEEKS} week columns headed by month (Sep–Dec 2026) and week-start date (${weekLabel(0)} … ${weekLabel(WEEKS - 1)}).
Everything in the last column below exists **only as shapes**: bar extent, colour, progress strip,
◆ milestones, a dashed red vertical **Today** line (no date printed on it), and dependency arrows.
The legend at the bottom explains the colours: ${Object.values(STATUS)
  .map((s) => s.label)
  .join(', ')}, plus Progress, Milestone, Today and Dependency.

| ID | Task | Owner | Plan start | Plan end | Bar (shapes only) |
| --- | --- | --- | --- | --- | --- |
${ROWS.map(rowLine).join('\n')}

Two tasks (${tasks
  .filter((t) => t.dates === false)
  .map((t) => t.name)
  .join(', ')}) have blank date cells; their schedule is the bar alone. **${migration.name}** is
planned to end ${shortDate(weekFriday(migration.plan[1]))} (text), but its red bar now runs to
${longDate(weekFriday(migration.bar[1]))} — the slip is visible only on the timescale.

The Today line falls on Wednesday ${longDate(new Date(WEEK0 + (7 * 7 + 2) * DAY))} (week of ${weekLabel(7)}), three working
days after the ${designReview.name} milestone (${longDate(weekFriday(designReview.week))}) and seven weeks before ${goLive.name}
(${longDate(weekFriday(goLive.week))}).

Dependency arrows (finish → start): ${LINKS.map(([a, b]) => `${byId(a).name} → ${byId(b).name}`).join('; ')}.

## Questions an agent should be able to answer

1. Which tasks are under way in the week of ${weekLabel(OVERLAP_WEEK)}? — ${activeIn(OVERLAP_WEEK)
  .map((t) => t.name)
  .join(', ')} (bars only; ${migration.name}'s plan dates say it ended earlier)
2. Which task is late, and which are at risk? — late: ${late.map((t) => t.name).join(', ')}; at risk: ${risky.map((t) => t.name).join(', ')} (colour only)
3. Where does the Today line fall relative to the ${designReview.name} milestone? — just after it: the milestone is on ${longDate(weekFriday(designReview.week))}, Today is in the following week (Wed ${longDate(new Date(WEEK0 + (7 * 7 + 2) * DAY))})
4. When is ${migration.name} now expected to finish? — ${longDate(weekFriday(migration.bar[1]))}, two weeks after its planned ${longDate(weekFriday(migration.plan[1]))} (bar only)
5. What has to finish before QA regression can start? — ${LINKS.filter(([, b]) => b === '4.1')
  .map(([a]) => byId(a).name)
  .join(', ')} (dependency arrow only)

**Known gap (no issue yet):** the page raises no warning (117 vector ops, no
\`dense_vector_graphics\`, nothing saying that colour or bar extent carries data), so an agent has
no reason to render it, and the text alone answers the bar-only questions wrongly or not at all:

- Question 1 is answered from the plan dates, which drop ${migration.name} (\`10/5/26 | 10/30/26\`)
  from the week of ${weekLabel(OVERLAP_WEEK)}; its forecast bar runs through it.
- Question 2: no status appears anywhere in the text; the legend (\`Done / On track / At risk / Late\`)
  is printed with nothing to attach it to.
- Question 4 is answered wrongly as the plan end \`10/30/26\`.
- Question 5: dependency arrows leave no trace; an agent can only guess from dates.
- Question 3 cannot be answered from the text: \`Today\` is printed with the legend after the task
  list, with nothing tying it to a date (it used to fall, by luck of the stream order, between the
  week headers \`10/26\` and \`11/2\`).

The layout table (\`Table 1 (21 rows × 5 columns)\`) now holds every phase and task row through
4.5, the tasks without dates included (\`4.2 | Penetration test | Vendor (TBD)\`), so the plan dates
can be read per task; fixed in #262, before which it stopped after row 3.5 with no note. Its header
row reads \`ID | Task | Owner | Plan start Plan end\`: the last two header labels are one line from
line building, so the end-date column is unnamed. The page body reads the task grid row by row (\`1.1\` / \`Stakeholder interviews\` / \`P. Nair\` /
\`9/7/26\` / \`9/18/26\`), the tasks without dates included (\`4.2\` / \`Penetration test\` / \`Vendor (TBD)\`),
so each task keeps its own dates there too; it used to give the Plan start / Plan end values as
two column lists that skipped the blank cells, so aligning them by position shifted the dates of
every task after ${byId('4.1').name}.
`;

// ---------------------------------------------------------------------------
// Drawing

const COLS = [
  { key: 'id', label: 'ID', x: 24, w: 24 },
  { key: 'name', label: 'Task', x: 48, w: 132 },
  { key: 'owner', label: 'Owner', x: 180, w: 66 },
  { key: 'start', label: 'Plan start', x: 246, w: 46 },
  { key: 'end', label: 'Plan end', x: 292, w: 46 },
];
const GRID_LEFT = 338;
const GRID_RIGHT = 768;
const WEEK_W = (GRID_RIGHT - GRID_LEFT) / WEEKS;
const HEAD_TOP = 78;
const HEAD_H = 13;
const ROW_TOP = HEAD_TOP + 2 * HEAD_H;
const ROW_H = 18;
const ROWS_BOTTOM = ROW_TOP + ROWS.length * ROW_H;
const wx = (week) => GRID_LEFT + week * WEEK_W;
const rowY = (i) => ROW_TOP + i * ROW_H;

function heading(doc, h) {
  doc.fillColor('#1d3557');
  h.text(PROJECT.org, 24, 24, { font: BOLD, size: 10 });
  doc.fillColor('#111');
  h.text(PROJECT.name, 24, 38, { font: BOLD, size: 16 });
  doc.fillColor('#555');
  h.text(PROJECT.manager, GRID_RIGHT, 28, { font: SANS, size: 8.5, align: 'right' });
  h.text(PROJECT.version, GRID_RIGHT, 40, { font: SANS, size: 8.5, align: 'right' });
  doc.rect(24, 62, GRID_RIGHT - 24, 2).fill('#1d3557');
  doc.fillColor('black');
}

function tableHead(doc, h) {
  doc.rect(24, HEAD_TOP, GRID_LEFT - 24, 2 * HEAD_H).fill('#1d3557');
  doc.fillColor('white');
  for (const col of COLS) h.text(col.label, col.x + 3, HEAD_TOP + 9, { font: BOLD, size: 7.5 });
  // Month row, then week-start row.
  doc.rect(GRID_LEFT, HEAD_TOP, GRID_RIGHT - GRID_LEFT, 2 * HEAD_H).fill('#2c4a73');
  let monthStart = 0;
  for (let week = 0; week <= WEEKS; week++) {
    const month = week < WEEKS ? weekStart(week).getUTCMonth() : -1;
    if (week === WEEKS || (week > 0 && month !== weekStart(week - 1).getUTCMonth())) {
      const label = `${MONTHS[weekStart(monthStart).getUTCMonth()]} 2026`;
      doc.fillColor('white');
      h.text(label, (wx(monthStart) + wx(week)) / 2, HEAD_TOP + 3, { font: BOLD, size: 7, align: 'center' });
      if (week < WEEKS) {
        doc
          .moveTo(wx(week), HEAD_TOP)
          .lineTo(wx(week), HEAD_TOP + HEAD_H)
          .lineWidth(0.5)
          .stroke('#8fa6c4');
      }
      monthStart = week;
    }
  }
  for (let week = 0; week < WEEKS; week++) {
    doc.fillColor('#dfe7f2');
    h.text(weekLabel(week), wx(week) + WEEK_W / 2, HEAD_TOP + HEAD_H + 3, { font: SANS, size: 6.5, align: 'center' });
  }
  doc.fillColor('black');
}

function body(doc, h) {
  ROWS.forEach((row, i) => {
    const y = rowY(i);
    if (row.kind === 'phase') doc.rect(24, y, GRID_RIGHT - 24, ROW_H).fill('#e6ebf2');
    else if (i % 2 === 0) doc.rect(24, y, GRID_RIGHT - 24, ROW_H).fill('#f7f8fa');
  });
  // Week grid lines, then row rules.
  for (let week = 0; week <= WEEKS; week++) {
    doc.moveTo(wx(week), ROW_TOP).lineTo(wx(week), ROWS_BOTTOM).lineWidth(0.3).stroke('#c9d0d9');
  }
  for (let i = 0; i <= ROWS.length; i++) {
    doc.moveTo(24, rowY(i)).lineTo(GRID_RIGHT, rowY(i)).lineWidth(0.3).stroke('#c9d0d9');
  }
  for (const col of COLS.slice(1)) {
    doc.moveTo(col.x, ROW_TOP).lineTo(col.x, ROWS_BOTTOM).lineWidth(0.3).stroke('#c9d0d9');
  }
  doc.moveTo(GRID_LEFT, HEAD_TOP).lineTo(GRID_LEFT, ROWS_BOTTOM).lineWidth(0.8).stroke('#1d3557');

  ROWS.forEach((row, i) => {
    const ty = rowY(i) + 5.5;
    const phase = row.kind === 'phase';
    const font = phase ? BOLD : SANS;
    doc.fillColor('#222');
    h.text(row.id, COLS[0].x + 3, ty, { font, size: 7.5 });
    h.text(row.name, COLS[1].x + (phase ? 3 : 11), ty, { font, size: 7.5 });
    if (phase) return;
    h.text(row.owner, COLS[2].x + 3, ty, { font: SANS, size: 7.5 });
    let start = '';
    let end = '';
    if (row.kind === 'milestone') {
      start = shortDate(weekFriday(row.week));
      end = start;
    } else if (row.dates !== false) {
      start = shortDate(weekStart(row.plan[0]));
      end = shortDate(weekFriday(row.plan[1]));
    }
    h.text(start, COLS[3].x + COLS[3].w - 4, ty, { font: SANS, size: 7.5, align: 'right' });
    h.text(end, COLS[4].x + COLS[4].w - 4, ty, { font: SANS, size: 7.5, align: 'right' });
  });
  doc.fillColor('black');
}

// Bars cover Monday to Friday: 5/7 of the last week column.
const barLeft = (week) => wx(week) + 1;
const barRight = (week) => wx(week) + (WEEK_W * 5) / 7;

function bars(doc) {
  ROWS.forEach((row, i) => {
    const y = rowY(i);
    if (row.kind === 'phase') {
      const [a, b] = row.bar;
      const x1 = barLeft(a);
      const x2 = barRight(b);
      doc.rect(x1, y + 6, x2 - x1, 4).fill('#1f2933');
      doc.polygon([x1, y + 10], [x1 + 5, y + 10], [x1, y + 14]).fill('#1f2933');
      doc.polygon([x2, y + 10], [x2 - 5, y + 10], [x2, y + 14]).fill('#1f2933');
      return;
    }
    if (row.kind === 'milestone') {
      const cx = barRight(row.week);
      const cy = y + ROW_H / 2;
      doc.polygon([cx, cy - 5.5], [cx + 5.5, cy], [cx, cy + 5.5], [cx - 5.5, cy]).fill(STATUS[row.status].dark);
      return;
    }
    const [a, b] = barOf(row);
    const x1 = barLeft(a);
    const x2 = barRight(b);
    const status = STATUS[row.status];
    doc.rect(x1, y + 4, x2 - x1, ROW_H - 8).fill(status.fill);
    if (row.progress > 0) doc.rect(x1, y + 7.5, (x2 - x1) * row.progress, 3).fill(status.dark);
  });
}

function anchor(id, end) {
  const i = ROWS.findIndex((row) => row.id === id);
  const row = ROWS[i];
  const cy = rowY(i) + ROW_H / 2;
  if (row.kind === 'milestone') return { x: barRight(row.week) + (end ? 5.5 : -5.5), y: cy };
  const [a, b] = barOf(row);
  return { x: end ? barRight(b) : barLeft(a), y: cy };
}

function links(doc) {
  for (const [from, to] of LINKS) {
    const s = anchor(from, true);
    const t = anchor(to, false);
    const elbow = Math.max(s.x + 5, t.x - 5);
    const turnY = t.y - 7;
    doc.moveTo(s.x, s.y).lineTo(s.x + 4, s.y);
    if (elbow > s.x + 4) {
      // Target starts later: run right, then drop onto the target bar's start.
      doc.lineTo(t.x + 3, s.y).lineTo(t.x + 3, turnY);
    } else {
      doc
        .lineTo(s.x + 4, s.y + 9)
        .lineTo(t.x - 5, s.y + 9)
        .lineTo(t.x - 5, t.y)
        .lineTo(t.x - 3, t.y);
    }
    doc.lineWidth(0.7).stroke('#33415c');
    if (elbow > s.x + 4)
      doc.polygon([t.x + 3, turnY + 3], [t.x + 0.8, turnY - 1], [t.x + 5.2, turnY - 1]).fill('#33415c');
    else doc.polygon([t.x, t.y], [t.x - 3.5, t.y - 2.2], [t.x - 3.5, t.y + 2.2]).fill('#33415c');
  }
}

function todayLine(doc, h) {
  const x = wx(TODAY);
  doc.moveTo(x, HEAD_TOP + 2 * HEAD_H - 2).lineTo(x, ROWS_BOTTOM + 4);
  doc.dash(3, { space: 2 }).lineWidth(1).stroke('#d62828');
  doc.undash();
  doc.roundedRect(x - 13, ROWS_BOTTOM + 4, 26, 11, 2).fill('#d62828');
  doc.fillColor('white');
  h.text('Today', x, ROWS_BOTTOM + 6, { font: BOLD, size: 6.5, align: 'center' });
  doc.fillColor('black');
}

function legend(doc, h) {
  const y = ROWS_BOTTOM + 32;
  doc.fillColor('#222');
  h.text('Legend', 24, y, { font: BOLD, size: 8 });
  let x = 70;
  for (const status of Object.values(STATUS)) {
    doc.rect(x, y, 22, 8).fill(status.fill);
    doc.fillColor('#222');
    h.text(status.label, x + 26, y, { font: SANS, size: 7.5 });
    x += 78;
  }
  doc.rect(x, y, 22, 8).fill('#c9d0d9');
  doc.rect(x, y + 2.5, 12, 3).fill('#4a5462');
  doc.fillColor('#222');
  h.text('Progress (% complete)', x + 26, y, { font: SANS, size: 7.5 });
  x += 112;
  doc.polygon([x + 11, y - 1], [x + 16, y + 4], [x + 11, y + 9], [x + 6, y + 4]).fill('#33415c');
  doc.fillColor('#222');
  h.text('Milestone', x + 22, y, { font: SANS, size: 7.5 });
  x += 66;
  doc
    .moveTo(x + 11, y - 2)
    .lineTo(x + 11, y + 10)
    .dash(3, { space: 2 })
    .lineWidth(1)
    .stroke('#d62828');
  doc.undash();
  doc.fillColor('#222');
  h.text('Today', x + 18, y, { font: SANS, size: 7.5 });
  x += 48;
  doc
    .moveTo(x, y + 4)
    .lineTo(x + 16, y + 4)
    .lineWidth(0.7)
    .stroke('#33415c');
  doc.polygon([x + 20, y + 4], [x + 16, y + 1.8], [x + 16, y + 6.2]).fill('#33415c');
  doc.fillColor('#222');
  h.text('Dependency', x + 24, y, { font: SANS, size: 7.5 });
  doc.fillColor('black');
}

export function draw(doc, h) {
  heading(doc, h);
  tableHead(doc, h);
  body(doc, h);
  bars(doc);
  links(doc);
  todayLine(doc, h);
  legend(doc, h);
  doc.fillColor('#777');
  h.text(FOOTER, 24, H - 30, { font: SANS, size: 7 });
  h.text('Page 1 of 1', GRID_RIGHT, H - 30, { font: SANS, size: 7, align: 'right' });
  doc.fillColor('black');
}
