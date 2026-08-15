import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import PDFDocument from 'pdfkit';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { clearRefs, lookupRef } from '../../src/mcp/refs.js';
import { renderPdf } from '../../src/mcp/tools/renderPdf.js';
import { searchPdf } from '../../src/mcp/tools/searchPdf.js';

/**
 * Lives in its own file because it mocks `node:fs/promises`, and a mock
 * that broad has no business sitting under the rest of the tool tests.
 * It is a pass-through until a test opts in, and even then only for the
 * rendered PNGs — extraction never reads those, so nothing else in the
 * pipeline can trip on it.
 */
const state = vi.hoisted(() => ({ failPngReads: false }));

vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {
    ...actual,
    readFile: (path: Parameters<typeof actual.readFile>[0], ...rest: unknown[]) =>
      state.failPngReads && String(path).endsWith('.png')
        ? Promise.reject(new Error('simulated PNG read failure'))
        : (actual.readFile as (...args: unknown[]) => Promise<unknown>)(path, ...rest),
  };
});

let workdir: string;
let figurePdf: string;

async function buildFigurePdf(): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  const doc = new PDFDocument({ size: [612, 792], margin: 0 });
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<void>((resolve) => doc.on('end', resolve));
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
    'base64',
  );
  doc.fontSize(12).text('The figure below shows the theory.', 72, 48);
  doc.image(png, 72, 120, { width: 240, height: 180 });
  doc.end();
  await done;
  return new Uint8Array(Buffer.concat(chunks));
}

beforeAll(async () => {
  workdir = mkdtempSync(join(tmpdir(), 'pdfvision-mcp-render-fail-'));
  figurePdf = join(workdir, 'figure.pdf');
  writeFileSync(figurePdf, await buildFigurePdf());
});

afterAll(() => {
  state.failPngReads = false;
  rmSync(workdir, { recursive: true, force: true });
  clearRefs();
});

describe('render_pdf ref set under failure', () => {
  it('leaves the previous refs resolvable when the render cannot be delivered', async () => {
    // Reading the PNGs is the last thing that can fail. A failure after
    // the set had been replaced would take the caller's live handles with
    // it and return nothing in their place, so the reads run first and the
    // replacement is a single step at the end.
    await searchPdf({ source: figurePdf, query: 'theory' });
    expect(lookupRef(figurePdf, 'p1m1')).toBeDefined();

    state.failPngReads = true;
    await expect(renderPdf({ source: figurePdf, pages: '1' })).rejects.toThrow(/simulated PNG read failure/);
    state.failPngReads = false;

    expect(lookupRef(figurePdf, 'p1m1')).toBeDefined();
    expect(lookupRef(figurePdf, 'p1r1')).toBeUndefined();
  });
});
