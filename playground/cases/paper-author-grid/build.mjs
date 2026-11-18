// The first page of a machine-learning conference paper, as arXiv serves it:
// a centred title over an author grid where every author is a three-line
// block (name with footnote marks, affiliation, email) set at its own x, four
// blocks in the first row and three in the second, and the arXiv identifier
// stamped sideways in the left margin. The abstract and the first paragraph
// of the introduction follow in one narrow column; the footnotes explain the
// author marks.

const W = 612;
const AUTHORS = [
  { name: 'Mireille Ostrander', marks: '*', affiliation: 'Halcyon Labs', email: 'mostrander@halcyon.ai' },
  { name: 'Tobiah Kwan', marks: '*', affiliation: 'Halcyon Labs', email: 'tkwan@halcyon.ai' },
  { name: 'Ines Valcárcel', marks: '*', affiliation: 'Halcyon Research', email: 'ivalcarcel@halcyon.ai' },
  { name: 'Dmitri Halvorsen', marks: '*', affiliation: 'Halcyon Research', email: 'dhalvorsen@halcyon.ai' },
  { name: 'Priya Ramaswamy', marks: '*', affiliation: 'Halcyon Research', email: 'pramaswamy@halcyon.ai' },
  { name: 'Oskar Lindqvist', marks: '*†', affiliation: 'University of Tarrow', email: 'oskar@cs.tarrow.edu' },
  { name: 'Yusra Haddad', marks: '*‡', affiliation: '', email: 'yusra.haddad@fastmail.org' },
];
const ROW_SPLIT = 4;
const ARXIV = 'arXiv:2611.04172v2  [cs.LG]  9 Nov 2026';
const TITLE = 'Sparse Routing Is All You Need for Long Context';
const ABSTRACT =
  'Long-context language models spend most of their compute attending to tokens that do not matter for the next prediction. We introduce the Sparse Router, a learned gate that sends each query to at most 64 key blocks chosen from the whole context, and train it jointly with the model. On a 128k-token retrieval benchmark the Sparse Router matches dense attention at 31.4 exact match while using 6.2 times fewer attention FLOPs, and on long-document summarisation it improves ROUGE-L from 24.9 to 26.3. Training a 1.3B-parameter model with routing takes 4.5 days on 16 accelerators, about a third of the dense baseline.';
const INTRO =
  'Attention cost grows with the square of the context length, so most long-context systems truncate, chunk or compress their inputs before the model sees them. Each of these choices discards information that a later query might need. A learned router keeps the whole context available and decides per query which parts of it to read.';
const FOOTNOTES = [
  { mark: '*', text: 'Equal contribution. Listing order is random.' },
  { mark: '†', text: 'Work performed while at Halcyon Research.' },
  { mark: '‡', text: 'Work performed while visiting Halcyon Labs as an independent researcher.' },
];
const VENUE = '40th Conference on Neural Information Processing (NIP 2026), Lisbon, Portugal.';

export const meta = {
  title: 'Paper first page with an author grid and a sideways arXiv stamp',
  stresses:
    'title over a grid of three-line author blocks (name, affiliation, email) in two rows of unequal length; one block with no affiliation; footnote marks after names; arXiv identifier rotated 90° in the left margin; narrow single-column abstract',
  status: 'known-gap',
  issue: 300,
  families: ['reading-order', 'structure', 'vertical-rotated'],
};

const authorLine = (a) => `- ${a.name}${a.marks} — ${a.affiliation || '(no affiliation line)'} — ${a.email}`;

export const truth = `
Letter page. Reading order: the title **${TITLE}**, the author grid, the abstract, the introduction,
then the footnotes and the venue line. The sideways margin stamp \`${ARXIV.replace(/\s+/gu, ' ')}\`
is page furniture; it may come anywhere but must not split a block.

The authors sit in a grid of three-line blocks, ${ROW_SPLIT} in the first row and ${AUTHORS.length - ROW_SPLIT}
in the second. Each block reads name, affiliation, email; a reading must keep each affiliation and
email with its own name:

${AUTHORS.map(authorLine).join('\n')}

Footnotes: ${FOOTNOTES.map((f) => `${f.mark} ${f.text}`).join(' ')}

Abstract: ${ABSTRACT}

## Questions an agent should be able to answer

1. What is Ines Valcárcel's email address and affiliation? — ${AUTHORS[2].email}, ${AUTHORS[2].affiliation}
2. Which authors are at Halcyon Labs (not Halcyon Research)? — ${AUTHORS.filter((a) => a.affiliation === 'Halcyon Labs')
  .map((a) => a.name)
  .join(' and ')}
3. Which author worked on the paper while at Halcyon Research but lists another affiliation? — ${AUTHORS[5].name} (${AUTHORS[5].affiliation}; footnote †)
4. What is the paper's arXiv identifier and version date? — arXiv:2611.04172v2, 9 Nov 2026
5. How many fewer attention FLOPs does the Sparse Router use at matched exact match? — 6.2 times fewer (31.4 exact match)
6. What is Priya Ramaswamy's affiliation? — ${AUTHORS[4].affiliation}

Questions 2, 3, 4 and 5 are answerable from \`read.md\`; the footnotes, the abstract and the margin
stamp read cleanly (the stamp last, whole).

**Known gap (#300):** the author grid is read as loose fragments in a mixed order, and
nothing warns about it (the only warning is a \`reading_order_divergence\` about \`1 Introduction\`).
\`Priya Ramaswamy\` (second row) follows \`Mireille Ostrander\`'s block directly with her email but
without her affiliation; her \`Halcyon Research\` line is left orphaned between two \`*\` marks, so
question 6 has no answer. \`Dmitri Halvorsen\`'s email is glued onto Ines Valcárcel's line
(\`ivalcarcel@halcyon.ai dhalvorsen@halcyon.ai\`) and his name comes after Yusra Haddad's block,
so question 1 needs a guess between two addresses. Every footnote mark (\`*\`, \`*†\`, \`*‡\`) is cut
from its name and emitted as a line of its own, so which author is † or ‡ is lost from the grid
(question 3 is still answerable from the footnote text plus the affiliation). The \`Abstract\` and
\`1 Introduction\` headings are emitted together before the abstract text.
`;

const LEFT = 108;
const RIGHT = 504;

export function draw(doc, h) {
  // The arXiv stamp: grey, sideways, reading bottom to top, in the left margin.
  doc.save();
  doc.fillColor('#888');
  doc.rotate(-90, { origin: [36, 560] });
  h.text(ARXIV, 36, 560 - 14, { font: 'Times-Roman', size: 20 });
  doc.restore();
  doc.fillColor('black');

  h.rule(LEFT, 78, RIGHT, { width: 3 });
  h.text(TITLE, W / 2, 92, { font: 'Times-Bold', size: 17, align: 'center' });
  h.rule(LEFT, 122, RIGHT, { width: 1 });

  const rows = [AUTHORS.slice(0, ROW_SPLIT), AUTHORS.slice(ROW_SPLIT)];
  let y = 146;
  for (const row of rows) {
    const span = (RIGHT + 20 - (LEFT - 20)) / row.length;
    row.forEach((author, i) => {
      const cx = LEFT - 20 + span * (i + 0.5);
      doc.font('Times-Bold').fontSize(10);
      const nameWidth = doc.widthOfString(author.name);
      doc.font('NotoSansJP').fontSize(6.5);
      const markWidth = doc.widthOfString(author.marks);
      h.run([author.name, { sup: author.marks, font: 'NotoSansJP' }], cx - (nameWidth + markWidth) / 2, y, {
        font: 'Times-Bold',
        size: 10,
      });
      let line = y + 12;
      if (author.affiliation) {
        h.text(author.affiliation, cx, line, { font: 'Times-Roman', size: 9.5, align: 'center' });
        line += 11;
      }
      h.text(author.email, cx, line, { font: 'Courier', size: 8, align: 'center' });
    });
    y += 46;
  }

  y += 10;
  h.text('Abstract', W / 2, y, { font: 'Times-Bold', size: 12, align: 'center' });
  y = h.paragraph(ABSTRACT, LEFT + 36, y + 20, RIGHT - LEFT - 72, { size: 10, align: 'justify' }) + 18;

  h.text('1    Introduction', LEFT, y, { font: 'Times-Bold', size: 12 });
  h.paragraph(INTRO, LEFT, y + 20, RIGHT - LEFT, { size: 10, align: 'justify' });

  // Footnotes above the venue line.
  let fy = 668;
  h.rule(LEFT, fy, LEFT + 120, { width: 0.4 });
  fy += 6;
  for (const note of FOOTNOTES) {
    h.run([{ sup: note.mark, font: 'NotoSansJP' }, note.text], LEFT + 10, fy, { font: 'Times-Roman', size: 8.5 });
    fy += 11;
  }
  h.text(VENUE, LEFT, fy + 12, { font: 'Times-Roman', size: 8.5 });
}
