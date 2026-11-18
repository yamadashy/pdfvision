---
code: xfa_form
availability: always on; document level
summary: The PDF declares an XFA (LiveCycle) form and nothing extracted is the document's own content; severity `error` means the viewer placeholder is confirmed, `warning` that it is not.
---

Document-level: attached to the first extracted page and true of the whole selection, not of that page. Exactly one of `xfa_form`, `xfa_fields_only`, and `xfa_static_content` fires on a document that declares XFA, decided from what the extracted pages actually contain (see "How the three XFA codes are told apart" below). JSON/TOON/library use top-level `xfa: true`; XML uses `<document xfa="true">`.

## Severity `error`: placeholder confirmed

The extracted pages are confirmed to be only the dynamic-XFA viewer placeholder ("Please wait..."), nothing else. The real form content lives in an XML stream that standard extraction never sees; the page tree holds one generated "Please wait... upgrade Adobe Reader" page, which is why the reported page count can collapse to one. Severity is `error` because what came back is not data about this file: nothing here is evidence about the form.

**Next step:** never answer from that text, and do not read a search miss over it as absence — a hit and a miss are equally uninformative. Rendering does not help here: the render is the placeholder. Report that the document is an XFA form whose content pdfvision does not extract, and suggest opening it in Adobe Acrobat/Reader. `search_pdf` says the same thing in its response, on zero hits as well as hits, and for every page in the selection.

## Severity `warning`: unconfirmed

XFA is declared and nothing extracted looks like content, yet nothing establishes the placeholder either: no marker matched, and the document has no static field layer to vouch for it. This is deliberately not a verdict.

**Next step:** render or OCR the pages to settle it — if they show only a "Please wait" notice, treat the document as the `error` case above; if they show the form, the pages are real and the missing text is an ordinary extraction problem (see `raster_image_no_native_text`, `glyph_garbage_text`). A search miss here is not evidence of absence either.

## How the three XFA codes are told apart

In order. The inputs are `IsXFAPresent` and `IsAcroFormPresent` from pdf.js plus what the extracted pages hold.

1. **Any extracted page carries content of its own → `xfa_static_content`.** Content means more than a trace of native text, or images, or vector drawing, or recovered OCR text — a scanned page counts, because a render or OCR reads it and sending the caller to Acrobat would be wrong. Pages matching the placeholder markers are excluded from this test first, so a rule or logo on the generated page cannot promote it. This is the only branch that vouches for the page text, and it runs first for that reason.
2. **`IsAcroFormPresent` is true → `xfa_fields_only`.** A non-empty, non-signature `/Fields` array means the form can be read and filled without an XFA-aware viewer, so the Acrobat-only verdict is ruled out — but it says nothing about pages that produced nothing, so the code claims the field layer and not the text. This is a document-level fact, so a narrow `pages` selection cannot flip it.
3. **A placeholder marker matched → `xfa_form` (`error`).** The markers are the locale-independent `adobe.com/go/reader_download` and `adobe.com/go/acrreader` links and the English boilerplate sentences, on a page under 2,000 characters.
4. **Otherwise → `xfa_form` (`warning`).** Nothing was extracted and nothing confirms why.
