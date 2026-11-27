import { createRequire } from 'node:module';
import PDFDocument from 'pdfkit';
import { describe, expect, it } from 'vitest';
import { processDocument } from '../../src/core/processor.js';

// End-to-end reads of the ways letter spacing is drawn (#268). Every case
// writes its own content stream, so the operators under test are exactly
// the ones named, and is read back through pdf.js and the text passes.

const NOTO_SANS_JP = createRequire(import.meta.url).resolve(
  '@expo-google-fonts/noto-sans-jp/400Regular/NotoSansJP_400Regular.ttf',
);
const PAGE_HEIGHT = 792;

interface Raw {
  /** Select a font and return its resource name. */
  font(name: string, size: number): string;
  /** Hex string drawing `text` in the current font. */
  hex(text: string): string;
  width(text: string): number;
  /** Content-stream lines in PDF coordinates (y up). */
  emit(...lines: string[]): void;
}

async function readPage(draw: (raw: Raw) => void): Promise<string> {
  const chunks: Buffer[] = [];
  const doc = new PDFDocument({ size: [612, PAGE_HEIGHT], margin: 0 });
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<void>((resolveDone) => doc.on('end', resolveDone));
  doc.registerFont('NotoSansJP', NOTO_SANS_JP);
  // pdfkit's font internals: the resource id and glyph encoder of the current font.
  const current = () => (doc as unknown as { _font: PdfkitFont; _fontSize: number; page: PdfkitPage })._font;
  const raw: Raw = {
    font(name, size) {
      doc.font(name).fontSize(size);
      const page = (doc as unknown as { page: PdfkitPage }).page;
      page.fonts[current().id] ??= current().ref();
      return current().id;
    },
    hex: (text) => `<${current().encode(text)[0].join('')}>`,
    width: (text) => doc.widthOfString(text),
    emit: (...lines) => {
      doc.addContent(`q 1 0 0 -1 0 ${PAGE_HEIGHT} cm`);
      for (const line of lines) doc.addContent(line);
      doc.addContent('Q');
    },
  };
  draw(raw);
  doc.end();
  await done;
  const result = await processDocument('memory://letter-spaced.pdf', {
    sourceData: new Uint8Array(Buffer.concat(chunks)),
    noCache: true,
  });
  return result.pages[0].text;
}

interface PdfkitFont {
  id: string;
  ref(): unknown;
  encode(text: string): [string[], unknown];
}

interface PdfkitPage {
  fonts: Record<string, unknown>;
}

const BODY = [
  'The committee met on three occasions during the year to review the',
  'progress of each workstream and to agree the priorities for next year.',
];

function body(raw: Raw, y: number): void {
  const id = raw.font('Helvetica', 11);
  raw.emit(...BODY.map((line, i) => `BT /${id} 11 Tf 72 ${y - i * 14} Td ${raw.hex(line)} Tj ET`));
}

/** One letter per Tj, each moved by Td: its own advance plus `gap`. */
function placeLetters(raw: Raw, id: string, text: string, x: number, y: number, gap: number): void {
  const ops = [`BT /${id} 14 Tf ${x} ${y} Td`];
  Array.from(text).forEach((char, i) => {
    if (i > 0 && char === ' ') return;
    const prev = text[i - 1];
    if (i > 0)
      ops.push(
        `${(prev === ' ' ? raw.width(text[i - 2]) + raw.width(' ') + 2 * gap : raw.width(prev) + gap).toFixed(3)} 0 Td`,
      );
    ops.push(`${raw.hex(char)} Tj`);
  });
  ops.push('ET');
  raw.emit(...ops);
}

describe('letter-spaced Latin headings', () => {
  it('reads words tracked wider than pdf.js keeps in one item, keeping the word space', async () => {
    const text = await readPage((raw) => {
      const id = raw.font('Helvetica-Bold', 14);
      raw.emit(`BT /${id} 14 Tf 12 Tc 72 700 Td ${raw.hex('MEETING NOTES')} Tj ET`);
      body(raw, 680);
    });
    expect(text.split('\n')[0]).toBe('MEETING NOTES');
  });

  it('reads tracking written into TJ adjustments together with pair kerning', async () => {
    const text = await readPage((raw) => {
      const id = raw.font('Helvetica-Bold', 14);
      const pushes = [-150, -180, -130, -150, -150, -190, -120, -150];
      const glyphs = Array.from('CLASSROOM').map((char, i) => (i > 0 ? `${pushes[i - 1]} ` : '') + raw.hex(char));
      raw.emit(`BT /${id} 14 Tf 72 700 Td [${glyphs.join(' ')}] TJ ET`);
      body(raw, 680);
    });
    expect(text.split('\n')[0]).toBe('CLASSROOM');
  });

  it('reads letters each placed on their own at equal gaps', async () => {
    const text = await readPage((raw) => {
      const id = raw.font('Helvetica-Bold', 14);
      placeLetters(raw, id, 'BACKGROUND', 72, 700, 4);
      placeLetters(raw, id, 'BOARD MINUTES', 72, 600, 10);
      body(raw, 680);
    });
    const lines = text.split('\n');
    expect(lines).toContain('BACKGROUND');
    expect(lines).toContain('BOARD MINUTES');
  });

  it('keeps typed spaces, initials and letters set at one pitch apart', async () => {
    const text = await readPage((raw) => {
      const id = raw.font('Helvetica', 11);
      raw.emit(
        `BT /${id} 11 Tf 72 700 Td ${raw.hex('A G E N D A')} Tj ET`,
        `BT /${id} 11 Tf 72 680 Td ${raw.hex('Foreword by J. R. R. Tolkien')} Tj ET`,
      );
      // A weekday header: each letter centred in a 14pt cell.
      Array.from('SMTWTFS').forEach((char, i) => {
        const x = 72 + i * 14 + (14 - raw.width(char)) / 2;
        raw.emit(`BT /${id} 11 Tf 1 0 0 1 ${x.toFixed(3)} 660 Tm ${raw.hex(char)} Tj ET`);
      });
      body(raw, 620);
    });
    const lines = text.split('\n');
    expect(lines).toContain('A G E N D A');
    expect(lines).toContain('Foreword by J. R. R. Tolkien');
    expect(lines).toContain('S M T W T F S');
  });
});

describe('justified Japanese lines set glyph by glyph', () => {
  const ABOVE = '本資料に記載されている業績見通し等の将来に関する記述は、当社が現在入手している情報及';
  const BELOW = '（https://www.example.co.jp/ir/）に掲載の決算補足説明資料をご覧ください。';

  /** `line` spread over the measure of ABOVE, one Tm per glyph; spaces in `line` add `space` em. */
  async function readJustified(line: string, options: { space?: number; compressPunctuation?: boolean } = {}) {
    return readPage((raw) => {
      const id = raw.font('NotoSansJP', 9);
      const measure = raw.width(ABOVE);
      raw.emit(`BT /${id} 9 Tf 72 700 Td ${raw.hex(ABOVE)} Tj ET`, `BT /${id} 9 Tf 72 673 Td ${raw.hex(BELOW)} Tj ET`);
      const chars = Array.from(line);
      const glyphs = chars.filter((char) => char !== ' ');
      const share = (i: number) => (options.compressPunctuation && /[、。]/u.test(glyphs[i] + glyphs[i + 1]) ? 0.5 : 1);
      const spaces = (chars.length - glyphs.length) * (options.space ?? 0) * 9;
      const shares = glyphs.slice(1).reduce((sum, _, i) => sum + share(i), 0);
      const unit = (measure - glyphs.reduce((sum, char) => sum + raw.width(char), 0) - spaces) / shares;
      let x = 72;
      let k = 0;
      for (const char of chars) {
        if (char === ' ') {
          x += (options.space ?? 0) * 9;
          continue;
        }
        raw.emit(`BT /${id} 9 Tf 1 0 0 1 ${x.toFixed(3)} 686.5 Tm ${raw.hex(char)} Tj ET`);
        x += raw.width(char) + share(k) * unit;
        k++;
      }
    });
  }

  it('reads a line whose gaps pdf.js turned into spaces inside one item', async () => {
    const line = 'び合理的であると判断する一定の前提に基づいており、実際の業績等は様々';
    expect((await readJustified(line)).split('\n')).toContain(line);
  });

  it('keeps a real word space that is wider than the justification', async () => {
    const line = 'したタイトルに新たな要素が追加された『ゼルダの伝説 ブレス オブ ザ ワイルド』';
    expect((await readJustified(line, { space: 0.3 })).split('\n')).toContain(line);
  });

  it('reads a widely spread line whose punctuation sits closer', async () => {
    const line = 'く異なる可能性があります。詳細は当社ウェブサイト';
    expect((await readJustified(line, { compressPunctuation: true })).split('\n')).toContain(line);
  });
});
