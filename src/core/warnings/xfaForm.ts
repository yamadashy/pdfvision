import type { PageWarning } from '../../types/index.js';

/**
 * Document-driven warning: the PDF declares an XFA (LiveCycle) form.
 * Dynamic XFA documents carry their real content in an XML stream that
 * standard text extraction never sees — the visible text layer is often
 * just the "Please wait... upgrade Adobe Reader" viewer placeholder, and
 * the reported page count can collapse to a single placeholder page.
 * Unlike the per-page detectors this fires from document metadata, so the
 * processor attaches it to the first extracted page where agents already
 * look for warnings.
 */
export function buildXfaFormWarning(): PageWarning {
  return {
    code: 'xfa_form',
    severity: 'warning',
    message:
      'document declares an XFA (LiveCycle) form; the standard text layer may be only a viewer placeholder ("Please wait...") and the real form content is not extracted — treat placeholder text as unread content, not as the document',
  };
}
