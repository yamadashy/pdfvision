import type { PageResult, PageWarning } from '../../types/index.js';

interface RotatedPageWarningContext {
  readUnrotated?: { sidewaysTextShare: number };
}

// Below this share the text set the other way is a stray label, not content
// whose reading the message has to change.
const MIN_SIDEWAYS_SHARE = 0.05;

/**
 * Every page is read in its displayed (post-/Rotate) frame except one whose
 * text is upright only as stored. Say so, because that page's geometry and
 * render then follow the stored orientation rather than a viewer's. Text set
 * the other way on the same page is upright only as displayed, so it reads
 * sideways in that frame — the message says so instead of calling the page
 * clean.
 */
export function detectRotatedPageReadUnrotated(
  page: PageResult,
  context: RotatedPageWarningContext,
  out: PageWarning[],
): void {
  if (!context.readUnrotated || page.rotation === undefined) return;
  const sideways = context.readUnrotated.sidewaysTextShare;
  const mixed =
    sideways >= MIN_SIDEWAYS_SHARE
      ? `; ${Math.round(sideways * 100)}% of its characters are set the other way, upright only as displayed, so that text reads sideways here and its lines may come apart — render the page and read that text from the image`
      : '';
  out.push({
    code: 'rotated_page_read_unrotated',
    severity: 'warning',
    message: `page is stored with /Rotate ${page.rotation}, which shows its text ${page.rotation === 180 ? 'upside down' : 'sideways'} in a PDF viewer, so pdfvision reads and renders it in its stored orientation where ${mixed ? 'most of ' : ''}the text is upright — bboxes, width/height and --render-region use that unrotated page, and --render shows it unrotated${mixed}`,
  });
}

// Turned text holding at least this share of the page's characters makes the page itself a sideways sheet.
const MIN_TURNED_PAGE_SHARE = 0.5;

/**
 * Most of an upright page's text is drawn turned — a landscape sheet or a
 * `sidewaystable` set onto a portrait page without `/Rotate` — and was read
 * in its own upright frame. The reading is right, but every bbox stays in
 * the page frame and a render shows that text turned, which an agent about
 * to read a crop has to know. A smaller turned region carries `rotation` on
 * its blocks and tables, and a note in Markdown, without a page warning.
 */
export function detectTurnedTextReadUpright(page: PageResult, out: PageWarning[]): void {
  const blocks = page.layout?.blocks;
  if (!blocks || blocks.length === 0) return;
  const chars = (text: string) => text.replace(/\s+/g, '').length;
  const total = blocks.reduce((sum, block) => sum + chars(block.text), 0);
  if (total === 0) return;
  const byTurn = new Map<number, { chars: number; x1: number; y1: number; x2: number; y2: number }>();
  for (const block of blocks) {
    if (block.rotation === undefined) continue;
    const entry = byTurn.get(block.rotation) ?? {
      chars: 0,
      x1: Number.POSITIVE_INFINITY,
      y1: Number.POSITIVE_INFINITY,
      x2: Number.NEGATIVE_INFINITY,
      y2: Number.NEGATIVE_INFINITY,
    };
    entry.chars += chars(block.text);
    entry.x1 = Math.min(entry.x1, block.x);
    entry.y1 = Math.min(entry.y1, block.y);
    entry.x2 = Math.max(entry.x2, block.x + block.width);
    entry.y2 = Math.max(entry.y2, block.y + block.height);
    byTurn.set(block.rotation, entry);
  }
  for (const [rotation, entry] of byTurn) {
    if (entry.chars < total * MIN_TURNED_PAGE_SHARE) continue;
    const drawn = rotation === 180 ? 'upside down' : rotation === 90 ? 'running up the page' : 'running down the page';
    const box = [entry.x1, entry.y1, entry.x2 - entry.x1, entry.y2 - entry.y1].map((n) => Math.round(n * 100) / 100);
    out.push({
      code: 'rotated_text_read_upright',
      severity: 'warning',
      message: `${Math.round((entry.chars / total) * 100)}% of the page's text is drawn turned (${drawn}) with no /Rotate to match, so pdfvision read it in its own upright frame — its layout blocks and tables carry rotation: ${rotation} and keep page-frame bboxes (region ${box.join(',')}); --render and --render-region show that text turned, so turn the image ${rotation}° clockwise to read it`,
    });
  }
}
