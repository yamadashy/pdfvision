---
code: xfa_static_content
availability: always on; document level
summary: The PDF declares an XFA (LiveCycle) form and the extracted pages are the document's own content rather than a viewer placeholder; read them as usual.
---

This is the hybrid AcroForm+XFA shape used by IRS forms and most fillable government PDFs, where the page tree carries the full text and the widget fields and the XFA layer duplicates them — or any XFA file whose pages carry text, images, or vector drawing of their own. Extraction here is as good as on any other PDF, so read the text, fields, and search hits normally, with the other page warnings saying what each is worth. It also covers the XFA-declaring file whose pages are a scan or a drawing rather than a form: what it asserts is only that the pages are the document's own, not that their text extracted well — the per-page warnings and `quality` answer that as usual. Attached to the first extracted page, and carries the same top-level `xfa: true` / `<document xfa="true">`. How it is told apart from the other XFA codes: `pdfvision docs warnings xfa_form`.

**Next step:** the one thing this code marks is the residue: only values held solely in the XFA layer — some dynamically added rows or subforms — are missing, so treat a *specific expected field* that is genuinely missing as possibly XFA-only rather than as evidence the form is blank. Do not escalate to Acrobat on this code alone.
