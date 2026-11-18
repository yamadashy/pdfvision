// Two pages of software documentation printed to PDF from a docs site:
// breadcrumb header, headings, prose with inline code, a "Note" admonition
// box, syntax-coloured code blocks with a line-number gutter in which
// indentation carries meaning (YAML and Python), the Markdown source of a
// table followed by the same table rendered, and a shell session with
// prompts. As browsers' print engines and syntax highlighters emit them,
// each token is placed at its column's x position: leading indentation is
// geometry, not space characters.

const H = 'Helvetica';
const HB = 'Helvetica-Bold';
const M = 'Courier';
const MB = 'Courier-Bold';

const SITE = 'tidepool docs';
const CRUMBS = 'Guides › Pipelines › Configuring pipelines';
const VERSION = 'v2.4';
const URL = 'https://docs.tidepool.example/guides/pipelines/';

const YAML = [
  'pipeline:',
  '  name: nightly-export',
  '  schedule: "0 2 * * *"',
  '  stages:',
  '    - name: extract',
  '      image: tidepool/pg-dump:16',
  '      retries: 3',
  '    - name: transform',
  '      image: tidepool/dbt:1.8',
  '      env:',
  '        TARGET: warehouse',
  '        THREADS: "8"',
  '    - name: load',
  '      image: tidepool/s3-sync:2',
  '  notify:',
  '    on_failure: "#data-alerts"',
];
const PYTHON = [
  'from tidepool import Stage, register',
  '',
  '',
  '@register("dedupe")',
  'class Dedupe(Stage):',
  '    """Drop rows already seen in this run."""',
  '',
  '    def run(self, rows):',
  '        seen = set()',
  '        for row in rows:',
  '            key = (row["id"], row["ts"])',
  '            if key in seen:',
  '                continue',
  '            seen.add(key)',
  '            yield row',
  '        self.log.info("dedupe finished")',
];
const OPTIONS = [
  ['name', 'string', '—', 'Unique stage name; used in logs.'],
  ['image', 'string', '—', 'Container image to run.'],
  ['retries', 'integer', '0', 'Extra attempts after a failure.'],
  ['timeout', 'duration', '30m', 'Kill the stage after this long.'],
  ['env', 'map', '{}', 'Environment variables for the stage.'],
];
const OPTIONS_HEAD = ['Option', 'Type', 'Default', 'Description'];
const MARKDOWN_SOURCE = [
  `| ${OPTIONS_HEAD.join(' | ')} |`,
  '|---------|----------|:-------:|------------------------------|',
  ...OPTIONS.map((row) => `| ${row.map((cell, i) => (i === 0 ? `\`${cell}\`` : cell)).join(' | ')} |`),
];
const SHELL = [
  { prompt: '$ ', cmd: 'tidepool validate tidepool.yaml' },
  { out: 'OK  3 stages, schedule "0 2 * * *" (daily 02:00 UTC)' },
  { prompt: '$ ', cmd: 'tidepool run nightly-export --dry-run' },
  { out: '[extract]    would run tidepool/pg-dump:16 (retries=3)' },
  { out: '[transform]  would run tidepool/dbt:1.8 (TARGET=warehouse, THREADS=8)' },
  { out: '[load]       would run tidepool/s3-sync:2' },
  { prompt: '$ ', cmd: 'echo $?' },
  { out: '0' },
];

export const meta = {
  title: 'Software documentation with indented code blocks',
  stresses:
    'syntax-coloured code with a line-number gutter where indentation (placed as x offsets) carries meaning in YAML and Python; admonition box; inline code; Markdown table source next to the rendered table; shell session with prompts',
  families: ['structure', 'tables'],
  status: 'known-gap',
};

const fence = (lang, lines) => `\`\`\`${lang}\n${lines.join('\n')}\n\`\`\``;

export const truth = `
Two pages of the ${SITE} (${VERSION}), breadcrumb “${CRUMBS}”, footer \`${URL}\`.

**Page 1 — Configuring pipelines.** A pipeline is declared in \`tidepool.yaml\`; each entry under
\`stages\` runs one container image in order. A blue **Note** box: indentation is significant —
keys indented under a stage belong to that stage; keys at the level of \`stages\` belong to the
pipeline. The example (line numbers in a gutter):

${fence('yaml', YAML)}

A custom stage is a Python class registered with \`@register\`:

${fence('python', PYTHON)}

**Page 2 — Stage options.** The Markdown source of the options table, shown as a code block:

${fence('markdown', MARKDOWN_SOURCE)}

and the same table rendered:

| ${OPTIONS_HEAD.join(' | ')} |
| --- | --- | :---: | --- |
${OPTIONS.map((row) => `| ${row.join(' | ')} |`).join('\n')}

**Validating and dry-running** — a shell session (\`$\` is the prompt, not part of the command):

${fence(
  'console',
  SHELL.map((l) => (l.cmd ? `${l.prompt}${l.cmd}` : l.out)),
)}

A correct reading keeps each code line's indentation (or at least its nesting), keeps line
numbers apart from the code, and does not merge the Markdown source with the rendered table.

## Questions an agent should be able to answer

1. Which stage does \`retries: 3\` apply to? — \`extract\` (it is indented under \`- name: extract\`)
2. Is \`notify\` a setting of the \`load\` stage or of the whole pipeline? — the whole pipeline: it is indented two spaces, a sibling of \`stages\`
3. In \`Dedupe.run\`, is \`self.log.info("dedupe finished")\` called once per row or once per run? — once per run: it is at the method body's level, after the \`for\` loop
4. What is the default for \`retries\`, and what does \`timeout\` default to? — \`0\`; \`30m\`
5. Which command checks the configuration without running anything, and which previews the run? — \`tidepool validate tidepool.yaml\`; \`tidepool run nightly-export --dry-run\`

**Known gap (no issue yet):** no warning on either page, and both code blocks lose what makes
them code: every line comes out flush left. The YAML block, drawn on a tinted panel, is read
line by line with each line number before its line (\`1 pipeline:\` / \`2\` / \`name: nightly-export\`
/ … / \`11\` / \`TARGET: warehouse\`), so its order is right (it used to move lines 11–12 after
line 16), but with the indentation gone question 2 still rests on line order alone (\`notify\`
follows the \`load\` stage's \`image\`, and nothing says it is a pipeline-level key). In the Python
block the gutter is read as a column of its own (\`1 from tidepool …\` then bare \`2\` … \`16\`, then
the code); question 3 cannot be answered — \`self.log.info("dedupe finished")\` follows
\`yield row\` at the same (zero) indentation, so nothing distinguishes once-per-run from
once-per-row.

The rest holds up. The Markdown source comes back intact and separate from the rendered table,
so question 4 is answered from the source; the rendered table itself is flattened column by
column (\`name\` / \`image\` / … then \`string\` / \`string\` / …) with no layout table. The shell
session keeps its prompts and order (question 5), though \`[extract]\` and \`[load]\` are split from
their \`would run …\` text (each is still followed by its own). The breadcrumb and URL lines are
dropped as repeated chrome and named once in the header (issue #259).
`;

const LEFT = 72;
const RIGHT = 540;
const CODE_SIZE = 8.6;
const CHAR_W = CODE_SIZE * 0.6;
const CODE_LEAD = 11.6;

const COLORS = {
  key: '#0b5cad',
  str: '#1a7f37',
  num: '#b35900',
  kw: '#8250df',
  com: '#6e7781',
  fn: '#953800',
  text: '#1f2328',
};

/** Tokenise one code line into [column, text, colour] runs (whitespace dropped). */
function tokens(lang, line) {
  const out = [];
  const rules = {
    yaml: [
      [
        /^(\s*- )?([\w_]+)(:)/u,
        (m) => [
          [m[1] ? m[1].trimEnd() : null, 'text'],
          [m[2], 'key'],
          [m[3], 'text'],
        ],
      ],
      [/"[^"]*"/u, 'str'],
      [/\b\d+(\.\d+)?\b/u, 'num'],
    ],
    python: [
      [/"""[^"]*"""|"[^"]*"/u, 'str'],
      [/\b(from|import|class|def|for|in|if|continue|yield)\b/u, 'kw'],
      [/@\w+/u, 'fn'],
    ],
  }[lang];
  let col = 0;
  let rest = line;
  while (rest.length > 0) {
    const ws = /^\s+/u.exec(rest);
    if (ws) {
      col += ws[0].length;
      rest = rest.slice(ws[0].length);
      continue;
    }
    let best = null;
    for (const [re, kind] of rules ?? []) {
      const m = re.exec(rest);
      if (m && (best === null || m.index < best.m.index)) best = { m, kind };
    }
    if (best && best.m.index === 0) {
      const parts = typeof best.kind === 'function' ? best.kind(best.m) : [[best.m[0], best.kind]];
      for (const [text, kind] of parts) {
        if (!text) continue;
        const lead = rest.indexOf(text);
        col += lead;
        out.push([col, text, kind]);
        col += text.length;
        rest = rest.slice(lead + text.length);
      }
      continue;
    }
    // Plain text up to the next token or whitespace run.
    const stop = Math.min(
      ...[best?.m.index ?? rest.length, rest.search(/\s/u) === -1 ? rest.length : rest.search(/\s/u)].filter(
        (n) => n > 0,
      ),
      rest.length,
    );
    out.push([col, rest.slice(0, stop), 'text']);
    col += stop;
    rest = rest.slice(stop);
  }
  return out;
}

/** A code block with a line-number gutter; returns the y below it. */
function codeBlock(doc, h, lang, lines, y, { gutter = true } = {}) {
  const pad = 7;
  const height = lines.length * CODE_LEAD + pad * 2 - 2;
  doc.roundedRect(LEFT, y, RIGHT - LEFT, height, 3).fillAndStroke('#f6f8fa', '#d0d7de');
  const gutterW = gutter ? 26 : 0;
  if (gutter)
    doc
      .moveTo(LEFT + gutterW, y)
      .lineTo(LEFT + gutterW, y + height)
      .lineWidth(0.5)
      .stroke('#d0d7de');
  lines.forEach((line, i) => {
    const ly = y + pad + i * CODE_LEAD;
    if (gutter) {
      doc.fillColor('#8c959f');
      h.text(String(i + 1), LEFT + gutterW - 6, ly, { font: M, size: CODE_SIZE, align: 'right' });
    }
    for (const [col, text, kind] of tokens(lang, line)) {
      doc.fillColor(COLORS[kind]);
      h.text(text, LEFT + gutterW + 8 + col * CHAR_W, ly, { font: kind === 'kw' ? MB : M, size: CODE_SIZE });
    }
  });
  doc.fillColor('black').strokeColor('black');
  return y + height + 12;
}

/** Prose where `backticked` spans are set as inline code on a grey chip. */
function prose(doc, h, text, y) {
  const size = 10;
  const words = text.split(/(`[^`]+`)/u).flatMap((part) =>
    part.startsWith('`')
      ? [{ code: part.slice(1, -1) }]
      : part
          .split(/(?<= )/u)
          .filter(Boolean)
          .map((w) => ({ w })),
  );
  let x = LEFT;
  const width = (piece) =>
    piece.code
      ? doc.font(M).fontSize(9.2).widthOfString(piece.code) + 4
      : doc.font(H).fontSize(size).widthOfString(piece.w);
  for (const piece of words) {
    const w = width(piece);
    if (x + w > RIGHT && x > LEFT) {
      x = LEFT;
      y += 15;
    }
    if (piece.code) {
      doc.roundedRect(x, y - 1.5, w, 12.5, 2).fill('#eff1f3');
      doc.fillColor('#1f2328');
      h.text(piece.code, x + 2, y + 0.5, { font: M, size: 9.2 });
      x += w + 1;
    } else {
      doc.fillColor('#1f2328');
      h.text(piece.w, x, y, { font: H, size });
      x += w;
    }
  }
  doc.fillColor('black');
  return y + 22;
}

function chrome(h, page) {
  h.text(`${SITE}  ·  ${CRUMBS}`, LEFT, 36, { font: H, size: 8 });
  h.text(VERSION, RIGHT, 36, { font: H, size: 8, align: 'right' });
  h.text(URL, LEFT, 752, { font: H, size: 7.5 });
  h.text(`${page}/2`, RIGHT, 752, { font: H, size: 7.5, align: 'right' });
}

function heading(h, text, y, size) {
  h.text(text, LEFT, y, { font: HB, size });
  return y + size + 12;
}

export function draw(doc, h) {
  chrome(h, 1);
  let y = heading(h, 'Configuring pipelines', 66, 20);
  y = prose(
    doc,
    h,
    'A pipeline is declared in `tidepool.yaml` at the root of your project. Each entry under `stages` runs one container image, in order; a stage starts only after the previous one succeeds.',
    y,
  );

  // Admonition: tinted box with a coloured left bar and a title.
  const boxH = 46;
  doc.rect(LEFT, y, RIGHT - LEFT, boxH).fill('#ddf4ff');
  doc.rect(LEFT, y, 3, boxH).fill('#0969da');
  doc.fillColor('#0969da');
  h.text('Note', LEFT + 12, y + 7, { font: HB, size: 9.5 });
  doc.fillColor('#1f2328');
  h.paragraph(
    'Indentation is significant. Keys indented under a stage belong to that stage; keys at the level of stages belong to the pipeline. Use two spaces per level, never tabs.',
    LEFT + 12,
    y + 20,
    RIGHT - LEFT - 24,
    { font: H, size: 9, lineGap: 1.5 },
  );
  doc.fillColor('black');
  y += boxH + 14;

  y = heading(h, 'Example', y, 13);
  y = codeBlock(doc, h, 'yaml', YAML, y);
  y = heading(h, 'Custom stages', y + 4, 13);
  y = prose(doc, h, 'A custom stage is a subclass of `Stage` registered under a name with `@register`:', y);
  codeBlock(doc, h, 'python', PYTHON, y);

  h.newPage();
  chrome(h, 2);
  y = heading(h, 'Stage options', 66, 16);
  y = prose(doc, h, 'Every stage accepts the options below. In the source of this page the table is written as:', y);
  y = codeBlock(doc, h, 'markdown', MARKDOWN_SOURCE, y, { gutter: false });
  y = prose(doc, h, 'which renders as:', y);

  const cols = [LEFT, LEFT + 70, LEFT + 140, LEFT + 205];
  const rowH = 18;
  doc.rect(LEFT, y, RIGHT - LEFT, rowH).fill('#f6f8fa');
  doc.fillColor('#1f2328');
  OPTIONS_HEAD.forEach((label, i) => {
    h.text(label, cols[i] + 6, y + 5, { font: HB, size: 9 });
  });
  OPTIONS.forEach((row, r) => {
    const ry = y + rowH * (r + 1);
    row.forEach((cell, i) => {
      const font = i === 0 ? M : H;
      if (i === 2) h.text(cell, cols[2] + 32, ry + 5, { font: M, size: 9, align: 'center' });
      else h.text(cell, cols[i] + 6, ry + 5, { font, size: 9 });
    });
  });
  doc.lineWidth(0.5).strokeColor('#d0d7de');
  for (let r = 0; r <= OPTIONS.length + 1; r += 1)
    doc
      .moveTo(LEFT, y + rowH * r)
      .lineTo(RIGHT, y + rowH * r)
      .stroke();
  for (const x of [...cols, RIGHT])
    doc
      .moveTo(x, y)
      .lineTo(x, y + rowH * (OPTIONS.length + 1))
      .stroke();
  doc.strokeColor('black').fillColor('black');
  y += rowH * (OPTIONS.length + 1) + 22;

  y = heading(h, 'Validating and dry-running', y, 13);
  y = prose(
    doc,
    h,
    'Check a configuration with `tidepool validate`, then preview a run with `--dry-run`, which prints what each stage would execute without starting any container:',
    y,
  );
  // Shell session: dark panel, prompt in grey, command in white, output dimmer.
  const pad = 8;
  const height = SHELL.length * CODE_LEAD + pad * 2 - 2;
  doc.roundedRect(LEFT, y, RIGHT - LEFT, height, 3).fill('#24292f');
  SHELL.forEach((line, i) => {
    const ly = y + pad + i * CODE_LEAD;
    if (line.cmd) {
      doc.fillColor('#8c959f');
      h.text(line.prompt.trim(), LEFT + 10, ly, { font: M, size: CODE_SIZE });
      doc.fillColor('#ffffff');
      h.text(line.cmd, LEFT + 10 + 2 * CHAR_W, ly, { font: MB, size: CODE_SIZE });
    } else {
      doc.fillColor('#d0d7de');
      h.text(line.out, LEFT + 10, ly, { font: M, size: CODE_SIZE });
    }
  });
  doc.fillColor('black');
}
