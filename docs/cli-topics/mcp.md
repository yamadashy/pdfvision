---
name: mcp
description: Configuring and calling the MCP server: the three tools, response budgets, refs, and how it differs from the CLI. Only needed for shell-less hosts.
---

# MCP server reference

`pdfvision mcp` serves the same extraction over the Model Context Protocol on stdio. Read this only when you are asked to **set pdfvision up for another host**, or when you are yourself operating through the MCP tools rather than a shell.

**If you have a shell, use the CLI.** Everything below is a narrower surface over the same `core/` code, and MCP tool schemas sit in the host's context for the whole session — the CLI plus this skill costs nothing until it is used. This file exists because "install pdfvision into Claude Desktop / Cursor / Cline / Zed / n8n" is a task you may be handed, not because MCP is the better path for you.

## Setup

The server is a subcommand of the main binary, not a separate package:

```json
{ "mcpServers": { "pdfvision": { "command": "npx", "args": ["-y", "pdfvision", "mcp"] } } }
```

`pdfvision mcp` takes no arguments. It speaks JSON-RPC on stdout, so anything the process would otherwise log is redirected to stderr.

## The three tools

| Tool | Returns |
|---|---|
| `read_pdf` | Text as Markdown. Parameters: `source`, `pages`, `ocr`, `attachment`, `password`. |
| `search_pdf` | One row per distinct place — page, origin, matched string(s), optional context, region, and a short `ref`. Occurrences sharing a place collapse into one row marked `×N`, while the headline count keeps reporting occurrences. Parameters: `source`, `query`, `pages`, `regex`, `password`. |
| `render_pdf` | Page or region PNGs as image blocks, each preceded by a `Page N:` label. Parameters: `source`, `pages`, `ref`, `region`, `password`. |

`source` takes a local path **or** an `http(s)` URL — there is no separate remote parameter. `ocr` is a Tesseract language string with the primary language first (`"eng"`, `"jpn+eng"`), not a boolean; omit it to use the PDF's own text layer, and reach for it on the pages the document map or a quality report calls empty or garbled — `read_pdf(pages: "31", ocr: "jpn+eng")`.

## Differences from the CLI that will surprise you

- **No format, include, scale, or cache parameter.** Anything pdfvision can decide from the document, the server decides. `read_pdf` always runs layout, form fields, links, and annotations, and simply omits the sections that found nothing. On a blank form the field table collapses to a count and a type breakdown (`_23 fillable fields on this page, none filled (15 text, 8 checkbox)._`) — filled values, checked boxes, scripted widgets, and hidden/locked ones still get a row each. Do not look for a flag equivalent; there is not one.
- **`read_pdf` without `pages` on a document over 20 pages returns a document map, not the body** — page count, outline, per-page native-text quality and warning codes collapsed into page ranges, plus the specific calls to make next. This is the normal first call on an unknown document.
- **Responses are budgeted** (30,000 chars per body, 12,000 per page, 100 match places, 4 rendered pages, 5 OCR pages, 6 MB of images). Every truncation names what to do next — a page call narrower than the one that produced it, or `search_pdf` guidance when a single page cannot fit whole and no narrower page call exists — so a clipped result is recoverable, never silently complete. A document under the 20-page limit is read whole and then truncated like any other if it exceeds the character budget — "under the page limit" is not a promise that the body fits. The count in `N page bodies omitted` is about bodies: the per-page Overview rows for those pages are still in the response — unless the same notice also says `Overview clipped after page N`, or `Overview clipped before any page row` when no complete Overview row survived at all, which is where that guarantee stops. When the selected range is so wide that its Overview table alone fills the budget, no page body fits and the table itself is cut too, always on a row boundary: `after page N` names the last page whose row is complete and nothing below it survived, while `before any page row` means the response carries no per-page detail whatever. Per-page detail is then what the notice says survived, not the whole selection. There too the notice names a single page to start from rather than the range that just failed.
- **Refs replace coordinates.** `search_pdf` and a full-page `render_pdf` hand back short handles (`p47m1`, `p5r2`). Pass one straight back as `render_pdf(ref: "p47m1")` instead of transcribing a bbox. A source's refs are the ones its last `search_pdf`, or its last full-page `render_pdf` that listed visual regions, filed; either of those replaces the whole previous set, renumbered from `p1m1` — a search that found nothing replaces it with an empty set. A `render_pdf` that mints no refs leaves the set intact: a region render, including every `ref: "…"` call since a ref carries its own region, or a full page whose response lists no visual regions. So the hits of one search stay renderable one after another, and a ref held over from an *earlier* search points at the newer result instead: `render_pdf` echoes what it resolved to (`Ref p1m1 → search hit for …`) so that is visible. When in doubt, re-run the search. `ref` cannot be combined with `pages` or `region` — the ref already names both, and the call is rejected rather than silently answering for the ref's page. A match ref crops to the table row the hit sits in, or to its visual line when the page has no detected table, so a row's values are inside the image rather than just its label. Occurrences from the same text source whose crops resolve to the same region therefore share a single ref — the row's `×N` and its list of matched strings say how many and which they were, and the cap counts places, not occurrences. Where the page's layout does not cover the hit — an OCR-sourced match, a scanned page with no reconstructed lines — the crop falls back to a fixed pad around the glyph box, which on a wide row can still be too narrow to read; pass an explicit `region` there.
- **No scale knob.** Renders are fitted to 1568 px on the longest edge, past which vision models downsample anyway. If a render is too small to read, the fix is a smaller `region`, not a bigger raster.
- **Every successful result leads with an untrusted-data banner.** The server cannot assume its host carries equivalent standing instructions, so the trust boundary travels with the payload. Error results do not carry it and can still quote the document — see `pdfvision docs security`.

## Embedded files

`read_pdf(attachment: "invoice.xml")` — or a 1-based index — returns the embedded file instead of the pages. It matters because in e-invoices and regulatory filings (Factur-X, ZUGFeRD, XBRL) **the attachment is the authoritative data and the pages are only its rendering**; answering from the pages there is answering from a picture of the truth. Any response that reports attachments names this call.

Text attachments come back inline, images as image blocks. Anything else — spreadsheets, archives — is refused with a pointer to `--attachments --attachment-output <dir>`, because delivering those bytes into a context window accomplishes nothing. That is the one place the MCP surface genuinely needs the CLI.

## Remote input is guarded

Unlike the CLI's `--remote`, the MCP server refuses URLs that resolve to private, loopback, link-local, CGNAT, NAT64, or IPv4-mapped/-compatible addresses, and re-validates every redirect hop. The reason is that the *model* chooses the URL here, which would otherwise make the server an SSRF pivot into whatever network it runs on.

For an intranet document store, set `PDFVISION_MCP_ALLOW_PRIVATE_NETWORK=1`. Known limitation, documented at the call site: the address validated is not pinned for the fetch, so a DNS answer that changes between validation and connection is not covered.

## Errors

Tool failures come back as in-band error results with a recovery instruction, not as protocol errors — an out-of-range page selector, an OCR request over the 5-page budget, an unknown ref, a malformed `region`, or an encrypted PDF all tell the caller what to do instead. Read the message; it names the next call. Encryption is reported as two distinct failures because the recovery differs: no password given (retry with `password`) versus a wrong one (retry with a different value).

`search_pdf` also relays core search warnings in the response body: a regex that exceeds the ~1s per-page time budget drops that page's results and says so, which is what keeps its "0 matches" from reading as evidence of absence. The same applies when a regex exhausts the ~12s budget on regex time per request — the search stops early, keeps the matches it already has, and the warning names how many pages were searched and which pages to re-run, so a pathological pattern adds at most ~13s on top of the document's own processing time instead of minutes. That summary is guaranteed a slot in the response even when per-page timeout warnings already filled the relay cap. The same response names searched pages classified as having no usable native text — the classification the document map uses to suggest OCR — since a miss there is not evidence of absence either; the note points at `read_pdf` with `ocr` or `render_pdf` for those pages. A separate note covers the pages whose extracted text may not be the page's content at all (today: `xfa_form` and `xfa_fields_only`, an XFA form whose static layer is, or may be, only the "Please wait..." viewer placeholder). That one rides every response, hits or not, because the zero-hit response is where it is most likely to be read as absence. Because those codes describe the document rather than the page they are attached to, the note names the pages *selected* for the search rather than claiming each was searched — under a regex budget exhaustion some of them were not — and it covers all of them, not just the first. It names the recovery that fits the evidence: a confirmed placeholder (`xfa_form`, severity `error`) points at Adobe Acrobat/Reader rather than a render, since the render shows the placeholder too; an unconfirmed one (severity `warning`) points at exactly that render or an OCR pass, which is what would settle it; and `xfa_fields_only` says that the form-field hits in the same response are real while the page text is not. Pages the note speaks for are left out of both the per-hit warning list and the no-usable-native-text note below, so the response never hands back two recoveries that contradict each other.
