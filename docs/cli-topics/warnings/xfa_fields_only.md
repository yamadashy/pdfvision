---
code: xfa_fields_only
availability: always on; document level
summary: The PDF declares an XFA (LiveCycle) form whose static AcroForm field layer is real and was extracted, while the pages carrying it hold nothing of their own — the viewer placeholder, or nothing at all.
---

The fields are evidence; the page text is not. Both halves are true at once and neither can stand in for the other, which is why this is its own code rather than a severity of `xfa_form` — the action is neither "go to Acrobat" nor "read the pages". Attached to the first extracted page, true of the whole selection; JSON/TOON/library carry top-level `xfa: true`, XML `<document xfa="true">`. How it is told apart from the other XFA codes: `pdfvision docs warnings xfa_form`.

**Next step:** answer from `formFields` and from field-source search hits, which are real; do not quote the page text or read a miss over it as absence; and report that anything outside the fields lives in the XFA layer and needs Adobe Acrobat/Reader. `search_pdf` says the same in its response.
