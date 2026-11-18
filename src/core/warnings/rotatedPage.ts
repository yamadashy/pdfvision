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
