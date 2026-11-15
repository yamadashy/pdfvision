import type { PageResult, PageWarning } from '../../types/index.js';

interface RotatedPageWarningContext {
  readUnrotated?: boolean;
}

/**
 * Every page is read in its displayed (post-/Rotate) frame except one whose
 * text is upright only as stored. Say so, because that page's geometry and
 * render then follow the stored orientation rather than a viewer's.
 */
export function detectRotatedPageReadUnrotated(
  page: PageResult,
  context: RotatedPageWarningContext,
  out: PageWarning[],
): void {
  if (!context.readUnrotated || page.rotation === undefined) return;
  out.push({
    code: 'rotated_page_read_unrotated',
    severity: 'warning',
    message: `page is stored with /Rotate ${page.rotation}, which shows its text ${page.rotation === 180 ? 'upside down' : 'sideways'} in a PDF viewer, so pdfvision reads and renders it in its stored orientation where the text is upright — bboxes, width/height and --render-region use that unrotated page, and --render shows it unrotated`,
  });
}
