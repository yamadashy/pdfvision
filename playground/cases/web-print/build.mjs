// A news-site article saved with a desktop browser's "Print → Save as PDF":
// the browser's own header and footer in the page margins (print time,
// page title, URL, page x/y), the site header with navigation, an image
// that had not loaded when the page was printed (a grey placeholder), the
// article flowing over two pages with inline links, a comment thread, a
// related-articles list — and the site's cookie banner, which is
// position: fixed and so is printed again at the bottom of every page.
// One inline link shows one domain and points at an ad-tracking redirect.

const SERIF = 'Times-Roman';
const SERIF_ITALIC = 'Times-Italic';
const SANS = 'Helvetica';
const BOLD = 'Helvetica-Bold';
const SERIF_BOLD = 'Times-Bold';
const INK = '#1b1f23';
const MUTED = '#6a737d';
const LINK = '#1a56db';
const BRAND = '#2f6b3b';

const W = 612;
const H = 792;
const LEFT = 72;
const RIGHT = W - 72;
const TOP = 40;
const BANNER_TOP = 682;
const IMAGE_H = 200;
// Where the browser broke the article; draw() checks it so the truth cannot drift.
const PAGE2_FIRST_LINE =
  'Staff who need colour proofs for a client meeting now book a slot on the large-format plotter beside the';

const SITE = 'https://journal.fernleaf.example';
const PRINTED_AT = '11/14/26, 9:42 AM';
const PAGE_TITLE = 'How a 40-person office cut its paper use by 60% in a year | Fernleaf Journal';
const PAGE_URL = `${SITE}/2026/11/office-paper-use-60-percent?utm_source=newsletter`;

const NAV = [
  ['Workplace', `${SITE}/workplace`],
  ['Sustainability', `${SITE}/sustainability`],
  ['Money', `${SITE}/money`],
  ['Podcasts', `${SITE}/podcasts`],
];
const SUBSCRIBE = ['Subscribe', `${SITE}/subscribe`];

const SHEETS_2024 = 312000;
const SHEETS_2025 = 124800;
const STAFF = 40;
const CUT = Math.round((1 - SHEETS_2025 / SHEETS_2024) * 100);
const COSTS = {
  oldLease: 11900,
  newLease: 4100,
  oldPaper: 9300,
  newPaper: 3500,
  software: 1300,
};
const SAVING = COSTS.oldLease + COSTS.oldPaper - (COSTS.newLease + COSTS.newPaper + COSTS.software);
const n = (value) => value.toLocaleString('en-US');

const ARTICLE = {
  section: 'Workplace  ›  Sustainability',
  title: ['How a 40-person office cut its', 'paper use by 60% in a year'],
  dek: 'Halvorsen & Weir stopped buying printers and started asking a simple question at the copier. Here is what worked, and what did not.',
  byline: 'By Mara Lindqvist  ·  November 12, 2026  ·  6 min read',
  caption:
    'The print room at the practice’s Leeds studio, now mostly used for storage. Photo: Tomas Brekke for Fernleaf Journal',
};

// The link whose text names one domain while the annotation goes elsewhere.
const TOOLKIT_TEXT = 'greenoffice.example.org/toolkit';
const TOOLKIT_TARGET = 'https://clk.adpartner-network.example/r?cid=55120&dest=greenoffice-toolkit';

const LINKS = {
  firm: 'https://halvorsenweir.example/',
  survey: 'https://officeresourcecouncil.example.org/reports/2025-print-survey',
  release: `${SITE}/2026/03/print-release-explained`,
  toolkit: TOOLKIT_TARGET,
};

// Article blocks: `p` is a list of segments, a string or `[text, href]`.
const BODY = [
  {
    p: [
      'When the Leeds architecture practice ',
      ['Halvorsen & Weir', LINKS.firm],
      ` counted its print jobs at the end of 2024, the total came to ${n(SHEETS_2024)} sheets — roughly ${n(SHEETS_2024 / STAFF)} per employee, nearly double the 4,000-sheet average for UK design firms reported in `,
      ['a 2025 survey by the Office Resource Council', LINKS.survey],
      '.',
    ],
  },
  {
    p: [
      `Office manager Priya Castellano set a target of cutting that by half. The firm finished 2025 at ${n(SHEETS_2025)} sheets, a ${CUT}% reduction, without banning printing outright.`,
    ],
  },
  { h2: 'Fewer printers, further away' },
  {
    p: [
      'The biggest change was physical. Nine desktop printers went back to the leasing company and three shared machines took their place, each fitted with ',
      ['print-release software', LINKS.release],
      ' that holds a job until its owner badges in at the device. Castellano estimates that a fifth of all jobs were never collected in the first month. Staff who need colour proofs for a client meeting now book a slot on the large-format plotter beside the model workshop, and the booking sheet doubles as a record of what gets printed and why.',
    ],
  },
  { h2: 'Templates that assume a screen' },
  {
    p: [
      'Drawing reviews moved to two large wall screens, and the practice rewrote its meeting templates so that agendas open in a shared document rather than a printout. For teams starting out, Castellano recommends the free checklists in the Paperless Office Toolkit at ',
      [TOOLKIT_TEXT, LINKS.toolkit],
      '.',
    ],
  },
  { h2: 'What it cost' },
  {
    p: [
      `The lease on the three shared printers runs to £${n(COSTS.newLease)} a year, against £${n(COSTS.oldLease)} for the old fleet; paper and toner spending fell from £${n(COSTS.oldPaper)} to £${n(COSTS.newPaper)}. Net of the software licence (£${n(COSTS.software)}), the firm saves about £${n(SAVING)} a year.`,
    ],
  },
  {
    p: [
      '“People still print contracts and planning submissions, and that is fine,” Castellano says. “What we stopped printing is everything nobody reads twice.”',
    ],
  },
];

const COMMENTS = [
  {
    name: 'Jonas Whitcombe',
    date: 'Nov 12, 2026',
    text: 'We tried badge release and people just reprinted when the queue timed out after an hour. Worth checking that setting first.',
    likes: 14,
  },
  {
    name: 'R. Okonkwo-Hale',
    date: 'Nov 13, 2026',
    text: `The £${n(SAVING)} saving leaves out the two wall screens. Ours cost more than a year of toner.`,
    likes: 9,
  },
  {
    name: 'Priya Castellano',
    date: 'Nov 13, 2026',
    text: 'Fair point. The screens were already budgeted for the studio refit, so we left them out. About £6,000 for the pair.',
    likes: 21,
    reply: true,
  },
];

const RELATED = [
  ['Hot-desking two years on: what the occupancy data says', `${SITE}/2026/09/hot-desking-occupancy-data`],
  ['The hidden energy bill of always-on office kit', `${SITE}/2026/06/standby-power-offices`],
  ['Is a paperless planning application finally possible?', `${SITE}/2026/10/paperless-planning`],
];

const COOKIE = {
  text: [
    'We use cookies to measure traffic and personalise ads. By continuing to browse you agree to our ',
    'Cookie Policy',
    '.',
  ],
  href: `${SITE}/cookies`,
  buttons: ['Manage settings', 'Accept all'],
};
const SITE_FOOTER = ['© 2026 Fernleaf Media Ltd.', 'About', 'Contact', 'Privacy'];

const plain = (block) => block.p.map((segment) => (typeof segment === 'string' ? segment : segment[0])).join('');

export const meta = {
  title: 'News article printed from a browser, cookie banner on every page',
  stresses:
    'browser print header/footer in the page margins; site navigation; fixed cookie banner repeated on both pages; unloaded image placeholder; article continued across a page break; inline link annotations, one whose text names a different domain than its target; comment thread; related links',
  families: ['interactive', 'structure', 'reading-order'],
  status: 'known-gap',
};

export const truth = `
Two US Letter pages printed from a browser. The browser adds, in the page margins, \`${PRINTED_AT}\`
(top left) and the page title \`${PAGE_TITLE}\` (top centre), and \`${PAGE_URL}\` (bottom left)
with \`1/2\`, \`2/2\` (bottom right). Everything else is the web page.

**Page 1.** Site header: the **fernleaf journal** wordmark, navigation links
${NAV.map(([label]) => label).join(', ')} and a ${SUBSCRIBE[0]} button. Then \`${ARTICLE.section}\`, the headline
**${ARTICLE.title.join(' ')}**, the dek “${ARTICLE.dek}”, the byline \`${ARTICLE.byline}\`, a grey
image placeholder (the photo had not loaded; no image object, no text inside) and its caption
“${ARTICLE.caption}”. The article starts below; the browser breaks the
fourth paragraph across the pages, so page 2 opens mid-paragraph with \`${PAGE2_FIRST_LINE} …\`.

**Article text** (in order; headings in bold):

${BODY.map((block) => (block.h2 ? `**${block.h2}**` : plain(block))).join('\n\n')}

**Page 2** continues the article, then **Comments (${COMMENTS.length})**:

${COMMENTS.map((c) => `- ${c.name} (${c.date}${c.reply ? ', reply' : ''}): ${c.text} — ${c.likes} likes`).join('\n')}

**Related articles:** ${RELATED.map(([label]) => label).join('; ')}. Site footer: ${SITE_FOOTER.join(' · ')}.

**Cookie banner.** A dark bar at the bottom of *both* pages: “${COOKIE.text.join('')}” with buttons
${COOKIE.buttons.map((b) => `\`${b}\``).join(' and ')}. It is the site's fixed-position consent overlay, printed once per page;
it is not part of the article.

**Link annotations** (target as the annotation stores it):

| Page | Visible text | Target |
| --- | --- | --- |
${NAV.map(([label, href]) => `| 1 | ${label} | ${href} |`).join('\n')}
| 1 | ${SUBSCRIBE[0]} | ${SUBSCRIBE[1]} |
| 1 | Halvorsen & Weir | ${LINKS.firm} |
| 1 | a 2025 survey by the Office Resource Council | ${LINKS.survey} |
| 1, 2 | Cookie Policy | ${COOKIE.href} |
| 1 | print-release software | ${LINKS.release} |
| 2 | **${TOOLKIT_TEXT}** | **${TOOLKIT_TARGET}** |
${RELATED.map(([label, href]) => `| 2 | ${label} | ${href} |`).join('\n')}

The toolkit link's visible text is a bare domain, \`${TOOLKIT_TEXT}\`, but the annotation sends the
reader to an ad-network click redirect on a different domain.

## Questions an agent should be able to answer

1. The article recommends a toolkit at ${TOOLKIT_TEXT}. Where does that link actually go? — ${TOOLKIT_TARGET} (an ad-network redirect, not greenoffice.example.org)
2. Is the sentence “${COOKIE.text.join('')}” part of the article? — No: it is the site's cookie banner, printed at the bottom of both pages because it is fixed-position
3. How much paper did the firm use in 2025, and by how much did that fall? — ${n(SHEETS_2025)} sheets, down ${CUT}% from ${n(SHEETS_2024)}
4. Which commenter says the savings figure is incomplete, and what does the firm say the missing item cost? — ${COMMENTS[1].name} (the wall screens); ${COMMENTS[2].name} replies about £6,000 for the pair
5. When was this copy printed, and from which address? — ${PRINTED_AT}, ${PAGE_URL}

**Known gap (no issue yet):** \`read_pdf\` drops repeated page chrome, and here that removes
the browser's header and footer lines — \`${PRINTED_AT}\`, the page title and \`${PAGE_URL}\` — from
both pages; only \`1/2\` / \`2/2\` survive. Nothing in the response says text was dropped, so
question 5 gets no answer (the print time and source URL are not in \`read.md\` at all; the CLI's
JSON \`text\` and a \`search_pdf\` for \`9:42\` still find them). The cookie sentence is dropped the same
way, which happens to be the right call for the article — an agent will not mistake it for article
text — but it leaves question 2 answerable only as “that sentence is not in the document”, and the
banner's \`Manage settings\` / \`Accept all\` buttons remain as two orphan lines after the article
text on each page.

The link table also misassigns visible text to annotations. In the site navigation the
${NAV[2][0]} link (\`${NAV[2][1]}\`) gets an empty Text cell and the ${NAV[3][0]} link (\`${NAV[3][1]}\`) gets
\`Money Podcasts\`,
so an agent asked where the Money link goes is pointed at the Podcasts URL. Article links pick up
neighbouring words: \`Halvorsen & Weir counted\`, \`print-release software that\`,
\`at ${TOOLKIT_TEXT}.\`. The targets themselves are right, so question 1 is answered correctly:
the page-2 row \`at ${TOOLKIT_TEXT}.\` → \`${TOOLKIT_TARGET}\` shows the mismatch. Questions 3 and 4
are answered from \`read.md\`; the comment thread keeps names, dates and text together (the avatar
initials \`JW\` / \`RO\` / \`PC\` print as a line under each name), and the article text runs on
correctly from \`…first month.\` on page 1 to \`Staff who need colour proofs …\` on page 2.
`;

// --- drawing ---------------------------------------------------------------

function browserChrome(doc, h, page, pages) {
  doc.fillColor('#000000');
  h.text(PRINTED_AT, 28, 14, { font: SANS, size: 7.5 });
  h.text(PAGE_TITLE, W / 2 + 30, 14, { font: SANS, size: 7.5, align: 'center' });
  h.text(PAGE_URL, 28, H - 22, { font: SANS, size: 7.5 });
  h.text(`${page}/${pages}`, W - 28, H - 22, { font: SANS, size: 7.5, align: 'right' });
}

function linkText(doc, h, label, x, y, href, { font = SANS, size = 10, color = LINK, underline = true } = {}) {
  doc.fillColor(color);
  const box = h.text(label, x, y, { font, size });
  if (underline) {
    doc
      .moveTo(box.left, y + size * 0.98)
      .lineTo(box.right, y + size * 0.98)
      .lineWidth(0.5)
      .stroke(color);
  }
  doc.link(box.left, y - 1, box.width, size + 3, href);
  return box;
}

function cookieBanner(doc, h) {
  const top = BANNER_TOP;
  doc.rect(0, top, W, 58).fill('#22272e');
  doc.fillColor('#e6edf3');
  const [before, label, after] = COOKIE.text;
  const size = 8.5;
  // The sentence wraps once, inside the banner, before the link.
  const breakAt = before.indexOf('By continuing');
  h.text(before.slice(0, breakAt).trim(), LEFT, top + 14, { font: SANS, size });
  const second = h.text(before.slice(breakAt), LEFT, top + 27, { font: SANS, size });
  const link = linkText(doc, h, label, second.right, top + 27, COOKIE.href, { size, color: '#8ab4f8' });
  doc.fillColor('#e6edf3');
  h.text(after, link.right, top + 27, { font: SANS, size });

  let x = RIGHT;
  for (const [i, label] of [...COOKIE.buttons].reverse().entries()) {
    doc.font(BOLD).fontSize(8.5);
    const width = doc.widthOfString(label) + 20;
    x -= width;
    const primary = i === 0;
    doc.roundedRect(x, top + 16, width, 24, 4);
    if (primary) doc.fill('#3fb950');
    else doc.lineWidth(0.8).stroke('#e6edf3');
    doc.fillColor(primary ? '#0d1117' : '#e6edf3');
    h.text(label, x + width / 2, top + 24, { font: BOLD, size: 8.5, align: 'center' });
    x -= 8;
  }
  doc.fillColor(INK);
}

function siteHeader(doc, h) {
  doc.fillColor(BRAND);
  const word = h.text('fernleaf', LEFT, 40, { font: BOLD, size: 20 });
  doc.fillColor(INK);
  h.text('journal', word.right + 3, 40, { font: SANS, size: 20 });
  let x = 252;
  for (const [label, href] of NAV) {
    const box = linkText(doc, h, label, x, 47, href, { size: 9.5, color: INK, underline: false });
    x = box.right + 14;
  }
  doc.font(BOLD).fontSize(9);
  const width = doc.widthOfString(SUBSCRIBE[0]) + 16;
  doc.roundedRect(RIGHT - width, 42, width, 20, 3).fill(BRAND);
  doc.fillColor('white');
  h.text(SUBSCRIBE[0], RIGHT - width / 2, 48, { font: BOLD, size: 9, align: 'center' });
  doc.link(RIGHT - width, 42, width, 20, SUBSCRIBE[1]);
  doc.fillColor(INK);
  doc.rect(LEFT, 72, RIGHT - LEFT, 0.8).fill('#d0d7de');
  doc.fillColor(INK);
}

function imagePlaceholder(doc, x, y, width, height) {
  doc.rect(x, y, width, height).fill('#e5e7eb');
  const cx = x + width / 2;
  const cy = y + height / 2;
  doc.save();
  doc.lineWidth(1.6).strokeColor('#9ca3af').lineJoin('round');
  doc.roundedRect(cx - 22, cy - 17, 44, 34, 4).stroke();
  doc
    .moveTo(cx - 18, cy + 12)
    .lineTo(cx - 6, cy - 2)
    .lineTo(cx + 2, cy + 6)
    .lineTo(cx + 8, cy)
    .lineTo(cx + 18, cy + 12)
    .stroke();
  doc.circle(cx + 9, cy - 8, 3.5).stroke();
  doc.restore();
}

/** Split segments into words that remember their link, for greedy wrapping. */
function words(segments) {
  const out = [];
  for (const segment of segments) {
    const [text, href] = typeof segment === 'string' ? [segment, undefined] : segment;
    const parts = text.split(/( +)/u).filter((part) => part.length > 0);
    for (const part of parts) {
      if (/^ +$/u.test(part)) out.push({ space: true });
      else {
        const last = out.at(-1);
        // Punctuation glued to a link (`link.`) stays on the link's line.
        if (last && !last.space) last.parts.push({ text: part, href });
        else out.push({ parts: [{ text: part, href }] });
      }
    }
  }
  return out.filter((word) => !word.space);
}

function wrap(doc, segments, width, font, size) {
  doc.font(font).fontSize(size);
  const space = doc.widthOfString(' ');
  const lines = [];
  let line = [];
  let lineWidth = 0;
  for (const word of words(segments)) {
    const w = word.parts.reduce((sum, part) => sum + doc.widthOfString(part.text), 0);
    const next = line.length === 0 ? w : lineWidth + space + w;
    if (next > width && line.length > 0) {
      lines.push(line);
      line = [word];
      lineWidth = w;
    } else {
      line.push(word);
      lineWidth = next;
    }
  }
  if (line.length > 0) lines.push(line);
  return lines;
}

/** Draw one wrapped line as runs of same-link text; links get colour, underline and an annotation. */
function drawLine(doc, h, line, x, y, font, size) {
  const runs = [];
  line.forEach((word, i) => {
    word.parts.forEach((part, j) => {
      const text = `${i > 0 && j === 0 ? ' ' : ''}${part.text}`;
      const last = runs.at(-1);
      if (last && last.href === part.href) last.text += text;
      else runs.push({ text, href: part.href });
    });
  });
  let cursor = x;
  for (const run of runs) {
    if (run.href) {
      const lead = run.text.startsWith(' ') ? ' ' : '';
      if (lead) cursor = h.text(lead, cursor, y, { font, size }).right;
      cursor = linkText(doc, h, run.text.trimStart(), cursor, y, run.href, { font, size }).right;
      doc.fillColor(INK);
    } else {
      cursor = h.text(run.text, cursor, y, { font, size }).right;
    }
  }
}

/**
 * Flow the article from `y` on page 1 to the banner, continuing on page 2
 * the way a browser paginates: a heading stays with the two lines after it,
 * and a paragraph may break across pages with at least two lines on each
 * side (CSS orphans/widows default to 2). Returns the y below the article
 * and the first line printed on page 2.
 */
function flowArticle(doc, h, y) {
  const size = 11;
  const lead = 15.5;
  const limit = BANNER_TOP - 14;
  let cursor = y;
  let firstOnPage2;
  let fresh = false;
  const nextPage = () => {
    cookieBanner(doc, h);
    browserChrome(doc, h, 1, 2);
    h.newPage();
    cursor = TOP + 4;
    fresh = true;
  };
  const record = (text) => {
    if (fresh && firstOnPage2 === undefined) firstOnPage2 = text;
    fresh = false;
  };
  const fits = () => Math.floor((limit - cursor) / lead);
  BODY.forEach((block, index) => {
    if (block.h2) {
      const following = wrap(doc, BODY[index + 1].p, RIGHT - LEFT, SERIF, size).length;
      // A paragraph shorter than four lines cannot split two-and-two, so it all has to fit.
      if (cursor + 30 + (following < 4 ? following : 2) * lead > limit) nextPage();
      cursor += 6;
      record(block.h2);
      doc.fillColor(INK);
      h.text(block.h2, LEFT, cursor, { font: SERIF_BOLD, size: 14 });
      cursor += 24;
      return;
    }
    const lines = wrap(doc, block.p, RIGHT - LEFT, SERIF, size);
    let breakAfter = lines.length;
    if (fits() < lines.length) {
      const take = Math.min(fits(), lines.length - 2);
      if (take < 2) nextPage();
      else breakAfter = take;
    }
    lines.forEach((line, i) => {
      if (i === breakAfter) nextPage();
      record(line.map((word) => word.parts.map((part) => part.text).join('')).join(' '));
      doc.fillColor(INK);
      drawLine(doc, h, line, LEFT, cursor, SERIF, size);
      cursor += lead;
    });
    cursor += 8;
  });
  return { bottom: cursor, firstOnPage2 };
}

function comments(doc, h, y) {
  doc.rect(LEFT, y, RIGHT - LEFT, 0.8).fill('#d0d7de');
  doc.fillColor(INK);
  h.text(`Comments (${COMMENTS.length})`, LEFT, y + 14, { font: BOLD, size: 13 });
  let cursor = y + 40;
  for (const comment of COMMENTS) {
    const x = comment.reply ? LEFT + 36 : LEFT;
    doc.circle(x + 11, cursor + 11, 11).fill(comment.reply ? BRAND : '#c9d1d9');
    doc.fillColor('white');
    const initials = comment.name
      .split(/[ .-]+/u)
      .filter(Boolean)
      .map((part) => part[0])
      .slice(0, 2)
      .join('');
    h.text(initials, x + 11, cursor + 7, { font: BOLD, size: 8, align: 'center' });
    doc.fillColor(INK);
    const name = h.text(comment.name, x + 30, cursor, { font: BOLD, size: 9.5 });
    doc.fillColor(MUTED);
    h.text(comment.date, name.right + 8, cursor + 0.5, { font: SANS, size: 8.5 });
    doc.fillColor(INK);
    const bottom = h.paragraph(comment.text, x + 30, cursor + 14, RIGHT - x - 30, {
      font: SANS,
      size: 9.5,
      lineGap: 2,
    });
    doc.fillColor(MUTED);
    h.text(`Reply   ·   ${comment.likes} likes`, x + 30, bottom + 3, { font: SANS, size: 8 });
    doc.fillColor(INK);
    cursor = bottom + 24;
  }
  return cursor;
}

function related(doc, h, y) {
  doc.rect(LEFT, y, RIGHT - LEFT, 0.8).fill('#d0d7de');
  doc.fillColor(INK);
  h.text('Related articles', LEFT, y + 14, { font: BOLD, size: 13 });
  let cursor = y + 38;
  for (const [label, href] of RELATED) {
    doc.rect(LEFT, cursor + 3, 4, 4).fill(BRAND);
    linkText(doc, h, label, LEFT + 14, cursor, href, { font: SERIF, size: 11, color: LINK, underline: false });
    cursor += 20;
  }
  return cursor;
}

export function draw(doc, h) {
  siteHeader(doc, h);
  doc.fillColor(BRAND);
  h.text(ARTICLE.section.toUpperCase(), LEFT, 90, { font: BOLD, size: 8 });
  doc.fillColor(INK);
  ARTICLE.title.forEach((line, i) => {
    h.text(line, LEFT, 106 + i * 30, { font: SERIF_BOLD, size: 26 });
  });
  doc.fillColor('#444d56');
  const dekBottom = h.paragraph(ARTICLE.dek, LEFT, 174, RIGHT - LEFT, { font: SERIF_ITALIC, size: 12.5, lineGap: 2 });
  doc.fillColor(MUTED);
  h.text(ARTICLE.byline, LEFT, dekBottom + 10, { font: SANS, size: 8.5 });

  const imageTop = dekBottom + 32;
  imagePlaceholder(doc, LEFT, imageTop, RIGHT - LEFT, IMAGE_H);
  doc.fillColor(MUTED);
  const captionBottom = h.paragraph(ARTICLE.caption, LEFT, imageTop + IMAGE_H + 6, RIGHT - LEFT, {
    font: SANS,
    size: 8,
    lineGap: 1,
  });

  const article = flowArticle(doc, h, captionBottom + 18);
  if (article.firstOnPage2 !== PAGE2_FIRST_LINE) {
    throw new Error(
      `web-print: page 2 now starts with "${article.firstOnPage2}"; update PAGE2_FIRST_LINE and the truth`,
    );
  }
  let y = comments(doc, h, article.bottom + 12);
  y = related(doc, h, y + 4);
  doc.fillColor(MUTED);
  h.text(SITE_FOOTER.join('     '), LEFT, y + 14, { font: SANS, size: 8 });
  cookieBanner(doc, h);
  browserChrome(doc, h, 2, 2);
  doc.fillColor('black');
}
