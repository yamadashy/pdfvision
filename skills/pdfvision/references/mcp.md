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
| `search_pdf` | Flat hit list — page, origin, context, region, and a short `ref` per match. Parameters: `source`, `query`, `pages`, `regex`, `password`. |
| `render_pdf` | Page or region PNGs as image blocks, each preceded by a `Page N:` label. Parameters: `source`, `pages`, `ref`, `region`, `password`. |

`source` takes a local path **or** an `http(s)` URL — there is no separate remote parameter.

## Differences from the CLI that will surprise you

- **No format, include, scale, or cache parameter.** Anything pdfvision can decide from the document, the server decides. `read_pdf` always runs layout, form fields, links, and annotations, and simply omits the sections that found nothing. Do not look for a flag equivalent; there is not one.
- **`read_pdf` without `pages` on a document over 20 pages returns a document map, not the body** — page count, outline, per-page native-text quality and warning codes collapsed into page ranges, plus the specific calls to make next. This is the normal first call on an unknown document.
- **Responses are budgeted** (30,000 chars per body, 12,000 per page, 100 matches, 4 rendered pages, 5 OCR pages, 6 MB of images). Every truncation names the exact follow-up call, so a clipped result is recoverable, never silently complete.
- **Refs replace coordinates.** `search_pdf` and a full-page `render_pdf` hand back short handles (`p47m1`, `p5r2`). Pass one straight back as `render_pdf(ref: "p47m1")` instead of transcribing a bbox. Refs are renumbered from `p1m1` by *every* call, so one held over from an earlier search now points at the newer result — `render_pdf` echoes what the ref resolved to (`Ref \`p1m1\` → search hit for …`) so a stale one is visible. When in doubt, re-run the search.
- **No scale knob.** Renders are fitted to 1568 px on the longest edge, past which vision models downsample anyway. If a render is too small to read, the fix is a smaller `region`, not a bigger raster.
- **Every result carries an untrusted-data banner.** MCP hosts have no equivalent of this skill, so the trust boundary travels with the payload.

## Embedded files

`read_pdf(attachment: "invoice.xml")` — or a 1-based index — returns the embedded file instead of the pages. It matters because in e-invoices and regulatory filings (Factur-X, ZUGFeRD, XBRL) **the attachment is the authoritative data and the pages are only its rendering**; answering from the pages there is answering from a picture of the truth. Any response that reports attachments names this call.

Text attachments come back inline, images as image blocks. Anything else — spreadsheets, archives — is refused with a pointer to `--attachments --attachment-output <dir>`, because delivering those bytes into a context window accomplishes nothing. That is the one place the MCP surface genuinely needs the CLI.

## Remote input is guarded

Unlike the CLI's `--remote`, the MCP server refuses URLs that resolve to private, loopback, link-local, CGNAT, NAT64, or IPv4-mapped/-compatible addresses, and re-validates every redirect hop. The reason is that the *model* chooses the URL here, which would otherwise make the server an SSRF pivot into whatever network it runs on.

For an intranet document store, set `PDFVISION_MCP_ALLOW_PRIVATE_NETWORK=1`. Known limitation, documented at the call site: the address validated is not pinned for the fetch, so a DNS answer that changes between validation and connection is not covered.

## Errors

Tool failures come back as in-band error results with a recovery instruction, not as protocol errors — an out-of-range page selector, an OCR request over the 5-page budget, an unknown ref, or a malformed `region` all tell the caller what to do instead. Read the message; it names the next call.
