import type { PageResult, PageWarning } from '../../types/index.js';

/**
 * Which of the two XFA shapes a document is.
 *
 * `IsXFAPresent` alone says nothing about whether extraction worked. Two
 * very different documents declare XFA:
 *
 * - **`viewer_placeholder`** — dynamic XFA (LiveCycle). The real content
 *   lives in an XFA XML stream; the standard page tree holds one
 *   generated "Please wait... upgrade Adobe Reader" page and nothing
 *   else. Everything pdfvision extracts is boilerplate, so a summary
 *   built from it is wrong and a search over it cannot miss or hit
 *   anything meaningful.
 * - **`static_content`** — a hybrid AcroForm+XFA document (IRS f1040,
 *   W-9, most government forms built with LiveCycle/Designer). The
 *   static layer is the whole form: thousands of real characters,
 *   labelled widget fields, tables. Extraction is exactly as good as on
 *   any other PDF; only data held solely in the XFA layer is unseen.
 */
export type XfaStaticLayerShape = 'viewer_placeholder' | 'static_content';

/**
 * Adobe's generated placeholder page, matched against whitespace-collapsed
 * lowercase text. The two `adobe.com/go/…` links are the load-bearing
 * markers: LiveCycle localizes the prose (the same page ships in French,
 * German, Spanish …) but not the URLs, so they survive a translation that
 * would defeat an English sentence match.
 */
const PLACEHOLDER_MARKERS: readonly RegExp[] = [
  /adobe\.com\/go\/reader_download/,
  /adobe\.com\/go\/acrreader/,
  /if this message is not eventually replaced/,
  /please wait[\s\S]{0,400}?adobe reader/,
];

/**
 * The generated page is ~700 characters of boilerplate plus trademark
 * notices. A page carrying real content well past that is not the
 * placeholder even if it happens to name an Adobe URL — a manual telling
 * the reader to upgrade Adobe Reader is a normal thing for a document to
 * say.
 */
const PLACEHOLDER_MAX_CHARS = 2000;

/** Below this a page has no text worth calling content (a stray mark, a page number). */
const TRACE_TEXT_CHARS = 32;

type XfaPage = Pick<PageResult, 'text' | 'charCount'>;

function isViewerPlaceholderPage(page: XfaPage): boolean {
  const flat = page.text.replace(/\s+/g, ' ').trim().toLowerCase();
  if (flat.length === 0 || flat.length > PLACEHOLDER_MAX_CHARS) return false;
  return PLACEHOLDER_MARKERS.some((marker) => marker.test(flat));
}

export interface ClassifyXfaStaticLayerInput {
  /**
   * pdf.js `info.IsAcroFormPresent` — true when the AcroForm dictionary
   * carries a non-empty `/Fields` array that is not signatures-only. It is
   * the cheap structural half of the classification: a hybrid form keeps
   * its fields in that array so non-XFA viewers can fill it, while a
   * dynamic XFA form has nowhere to put them but the XFA stream
   * (measured: `false` on `xfa_filled_imm1344e.pdf`, `true` on IRS f1040
   * and W-9).
   */
  isAcroFormPresent: boolean;
  /** The pages that were actually extracted, not the whole document. */
  pages: readonly XfaPage[];
}

/**
 * Classify from the pages in hand plus one document-level structural fact.
 *
 * A document counts as `viewer_placeholder` only when nothing extracted
 * carries real content *and* that is corroborated — either by the
 * placeholder markers themselves, or by the absence of an AcroForm field
 * layer, which means whatever the form holds is reachable only through
 * XFA. Requiring both a content and a structural signal keeps a blank
 * page inside an ordinary hybrid form (f1040's page 2 tail, a separator
 * sheet) from being reported as an unreadable document, and keeps a
 * localized placeholder the marker list has never seen from being
 * reported as real content.
 */
export function classifyXfaStaticLayer({ isAcroFormPresent, pages }: ClassifyXfaStaticLayerInput): XfaStaticLayerShape {
  if (pages.length === 0) return 'static_content';
  const markedAsPlaceholder = pages.some(isViewerPlaceholderPage);
  const noRealContent = pages.every((page) => isViewerPlaceholderPage(page) || page.charCount <= TRACE_TEXT_CHARS);
  if (noRealContent && (markedAsPlaceholder || !isAcroFormPresent)) return 'viewer_placeholder';
  return 'static_content';
}

/**
 * Document-driven warning: the PDF declares an XFA (LiveCycle) form.
 * Unlike the per-page detectors this fires from document metadata plus the
 * shape classification above, so the processor attaches it to the first
 * extracted page where agents already look for warnings.
 *
 * The two shapes get two codes because they ask for opposite behaviour.
 * `xfa_form` keeps its name and says the extracted text is not the
 * document — an error, since what came back is not data about this file.
 * `xfa_static_content` exists so the common case can be told the truth
 * without borrowing that alarm: it names the unread XFA layer and says the
 * page content is real.
 */
export function buildXfaFormWarning(shape: XfaStaticLayerShape = 'viewer_placeholder'): PageWarning {
  if (shape === 'static_content') {
    return {
      code: 'xfa_static_content',
      severity: 'warning',
      message:
        'document also carries an XFA (LiveCycle) layer that standard extraction never sees; the static page content extracted here is the real form and can be read as-is — only values held solely in the XFA layer are missing',
    };
  }
  return {
    code: 'xfa_form',
    severity: 'error',
    message:
      'the extracted pages are only the XFA (LiveCycle) viewer placeholder ("Please wait..."), not the document; the real form content lives in an XFA data stream that standard extraction never sees, so nothing here — and no search over it — is evidence about the form; open the file in Adobe Acrobat/Reader',
  };
}
