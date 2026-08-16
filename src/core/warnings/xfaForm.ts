import type { PageResult, PageWarning } from '../../types/index.js';

/**
 * Which XFA shape a document is, as far as the extraction can prove.
 *
 * `IsXFAPresent` alone says nothing about whether extraction worked, and
 * the two documents it covers ask for opposite behaviour:
 *
 * - **`viewer_placeholder`** — dynamic XFA (LiveCycle). The real content
 *   lives in an XFA XML stream; the standard page tree holds a generated
 *   "Please wait... upgrade Adobe Reader" page and nothing else.
 *   Everything pdfvision extracts is boilerplate, so a summary built from
 *   it is wrong and a search over it can neither hit nor miss anything
 *   meaningful. Rendering does not help — the render is the placeholder.
 * - **`static_content`** — the static layer is the document's own
 *   content: a hybrid AcroForm+XFA form (IRS f1040, W-9, most government
 *   forms built with LiveCycle/Designer), or any XFA-declaring file whose
 *   pages carry text, images, or vector drawing of their own. What each
 *   page is worth is then the ordinary per-page question the other
 *   warnings and `quality` answer; the only XFA-specific loss is data
 *   held solely in the XFA layer.
 * - **`unconfirmed`** — XFA is declared and nothing extracted looks like
 *   content, but nothing confirms the placeholder either: no marker
 *   matched (LiveCycle localizes that page, and other producers write
 *   their own), and the document does carry a static field layer or the
 *   selection was too narrow to tell. Saying "placeholder" here would
 *   send the caller to Acrobat for a page a render could have answered,
 *   and saying "real content" would vouch for text nothing checked. The
 *   honest output is the hedge, and the check is cheap: render or OCR.
 */
export type XfaStaticLayerShape = 'viewer_placeholder' | 'unconfirmed' | 'static_content';

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

type XfaPage = Pick<PageResult, 'text' | 'charCount' | 'imageCount' | 'vectorCount'> &
  Partial<Pick<PageResult, 'ocr' | 'quality'>>;

function looksLikePlaceholderText(text: string | undefined): boolean {
  if (!text) return false;
  const flat = text.replace(/\s+/g, ' ').trim().toLowerCase();
  if (flat.length === 0 || flat.length > PLACEHOLDER_MAX_CHARS) return false;
  return PLACEHOLDER_MARKERS.some((marker) => marker.test(flat));
}

/** Native text or, when OCR ran, the OCR of the same page — either can be the boilerplate. */
function isViewerPlaceholderPage(page: XfaPage): boolean {
  return looksLikePlaceholderText(page.text) || looksLikePlaceholderText(page.ocr?.text);
}

/**
 * "Real content" is not "extractable text". A scanned page inside an
 * XFA-declaring file has a page number for native text and everything else
 * in pixels — calling that a placeholder would tell the caller that
 * rendering is pointless and only Acrobat can help, when a render or OCR
 * is exactly what reads it. So images, vector drawing, and recovered OCR
 * text all count, and the page-level warnings say what each is worth.
 *
 * A page that matched the placeholder markers is excluded first: the
 * generated page can carry a rule or a logo, and that must not promote it
 * to content.
 */
function carriesRealContent(page: XfaPage): boolean {
  if (isViewerPlaceholderPage(page)) return false;
  if (page.charCount > TRACE_TEXT_CHARS) return true;
  if ((page.ocr?.text?.trim().length ?? 0) > TRACE_TEXT_CHARS) return true;
  if (page.imageCount > 0 || page.vectorCount > 0) return true;
  const visualStatus = page.quality?.visualStatus;
  return visualStatus === 'ok' || visualStatus === 'sparse';
}

export interface ClassifyXfaStaticLayerInput {
  /**
   * pdf.js `info.IsAcroFormPresent` — true when the AcroForm dictionary
   * carries a non-empty `/Fields` array that is not signatures-only.
   * A form that keeps its fields there can be read and filled without an
   * XFA-aware viewer, which is the definition of a usable static
   * document, so it is never reported as a placeholder (measured: `false`
   * on `xfa_filled_imm1344e.pdf`, `true` on IRS f1040 and W-9).
   */
  isAcroFormPresent: boolean;
  /** The pages that were actually extracted, not the whole document. */
  pages: readonly XfaPage[];
}

/**
 * Classify from the pages in hand plus one document-level structural fact.
 *
 * Two facts can end the question on their own, and both are document-level
 * so a narrow `pages` selection cannot flip them: a static field layer
 * means the static document is usable, and any extracted page carrying
 * content of its own means the static layer is not a placeholder. Only
 * when neither holds does the placeholder verdict get considered, and it
 * still needs a marker to confirm it — everything else stays
 * `unconfirmed`, which is a cheap render away from being settled.
 */
export function classifyXfaStaticLayer({ isAcroFormPresent, pages }: ClassifyXfaStaticLayerInput): XfaStaticLayerShape {
  if (pages.length === 0) return 'unconfirmed';
  if (pages.some(carriesRealContent)) return 'static_content';
  if (isAcroFormPresent) return 'static_content';
  return pages.some(isViewerPlaceholderPage) ? 'viewer_placeholder' : 'unconfirmed';
}

/**
 * Document-driven warning: the PDF declares an XFA (LiveCycle) form.
 * Unlike the per-page detectors this fires from document metadata plus the
 * shape classification above, so the processor attaches it to the first
 * extracted page where agents already look for warnings — and because it
 * describes the document rather than that page, consumers treat it as
 * covering the whole selection.
 *
 * `xfa_form` keeps its name for both shapes that cast doubt on the text,
 * and separates them by severity: `error` when the placeholder is
 * confirmed and nothing here is data about the file, `warning` when it is
 * merely unconfirmed and one render settles it. `xfa_static_content`
 * exists so the common case can be told the truth without borrowing that
 * alarm — it claims only what was actually established: these pages are
 * the document's own, not a viewer placeholder.
 */
export function buildXfaFormWarning(shape: XfaStaticLayerShape = 'viewer_placeholder'): PageWarning {
  if (shape === 'static_content') {
    return {
      code: 'xfa_static_content',
      severity: 'warning',
      message:
        "document also carries an XFA (LiveCycle) layer that standard extraction never sees; the pages extracted here are the document's own content rather than a viewer placeholder, so read them as usual — only values held solely in the XFA layer are missing",
    };
  }
  if (shape === 'unconfirmed') {
    return {
      code: 'xfa_form',
      severity: 'warning',
      message:
        'document declares an XFA (LiveCycle) form and the extracted pages carry too little to confirm they are the document rather than a viewer placeholder — render or OCR them to check; if they show only a "Please wait..." notice, the real content is XFA-only and needs Adobe Acrobat/Reader',
    };
  }
  return {
    code: 'xfa_form',
    severity: 'error',
    message:
      'the extracted pages are only the XFA (LiveCycle) viewer placeholder ("Please wait..."), not the document; the real form content lives in an XFA data stream that standard extraction never sees, so nothing here — and no search over it — is evidence about the form; open the file in Adobe Acrobat/Reader',
  };
}
