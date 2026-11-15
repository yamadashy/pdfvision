# Playground

Synthetic PDFs whose correct reading is known, each stored next to what pdfvision actually returns for it. Unit tests check what someone thought to assert; comparing a page against its extraction catches the rest — values shifted into the wrong column, a row that silently vanished, `10^19` read as `1019`, prose reported as a table.

Contributor tooling only: nothing here ships in the npm package or runs under Vitest.

## Commands

```sh
node --run playground                  # every case, then index.html
node --run playground -- <case-name>   # one case (the gallery still lists all)
node --run playground -- --check       # re-read committed PDFs; exit 1 if any read.md differs (CI)
```

Every command rebuilds `dist/` first (`node --run build`, under a second), so a snapshot never comes from a stale bundle. `--check` does not rebuild PDFs.

## A case

```
cases/<case-name>/
  build.mjs    # exports meta, truth, draw(doc, helpers) — the single source of truth
  data.mjs     # optional: constants shared by build.mjs and assets.mjs
  assets.mjs   # optional: draws the raster images the case embeds
  assets/      # optional: those images, committed
  case.pdf     # generated, committed
  truth.md     # generated from meta + truth, committed
  read.md      # what read_pdf returns, committed
  page-N.png   # pdfvision's own render, one per page, gitignored
```

- `meta = { title, stresses, status: 'ok' | 'known-gap', issue?, page? }`. `known-gap` means pdfvision currently reads the case wrong; `issue` links the GitHub issue when there is one. `page` is the first page's pdfkit `size` / `layout` (default US Letter portrait), e.g. `{ size: 'A4' }`, `{ size: [960, 540] }`, `{ size: 'LETTER', layout: 'landscape' }`.
- `truth` is Markdown built from the same constants `draw` uses, so it cannot drift from the PDF. It states what a correct reading contains and ends with `## Questions an agent should be able to answer`: three to five questions someone would actually ask of such a document, with their answers taken from those constants. Below the questions it records how the current `read.md` does on them — for a `known-gap` case, precisely what pdfvision gets wrong and which questions that breaks.
- `draw` gets a pdfkit document (no margins, the first page already added) and the helpers in `lib/pdf.mjs`:
  - `text` (left/right/centre-anchored), `run` (one baseline with `{ sup }`/`{ sub }` segments), `paragraph`, `rule`;
  - `newPage(options?)` for multi-page cases (same size as the first page unless `options` says otherwise);
  - `rotateClockwise()` stores the current page with `/Rotate 90` and switches to the coordinates a reader sees, for landscape pages inside a portrait document;
  - `invisible(fn)` draws `fn`'s text in render mode 3, as OCR text layers are drawn;
  - `asset(name)` returns the bytes of `assets/<name>`.

  Use the standard fonts; `'NotoSansJP'` and `'NotoSansJP-Bold'` are registered for CJK or for symbols outside WinAnsi such as `∇`. Everything else pdfkit offers works directly on `doc`: AcroForm fields (`initForm`, `formText`, …; see `cases/form-application` for button fields with appearance states), annotations (`note`, `link`, `annotate`), `doc.outline`, `doc.file` attachments (pass `FIXED_DATE` from `lib/pdf.mjs` as their dates).

To add a case, create `cases/<name>/build.mjs`, run `node --run playground -- <name>`, review it as below, set `meta.status` from what you saw, and commit `build.mjs`, `case.pdf`, `truth.md` and `read.md` (plus `data.mjs`, `assets.mjs` and `assets/` if the case has them).

### Raster assets

A case that needs a raster image — a scanned page, a pasted screenshot — draws it in its own `assets.mjs` with `@napi-rs/canvas`, through `lib/assets.mjs`, which registers the Noto Sans JP TTFs explicitly (so the image never depends on system fonts) and provides a seeded PRNG for noise. Run it by hand (`node playground/cases/<name>/assets.mjs`) when the image should change, and commit what it writes under `assets/`; `node --run playground` never regenerates assets, it only embeds the committed files, so canvas version changes cannot churn the PDFs. Keep images small (JPEG for scans, PNG for flat screenshots; about 100 dpi is plenty) so each `case.pdf` stays well under 150 KB.

### Judging a case

Set `meta.status` by harm, against the questions:

- `ok` — every question is answerable from `read.md`, or the part that is not is flagged by a pdfvision warning that names a workable next step (render the page or region, run OCR). That is the product working as designed; say which warning carried it.
- `known-gap` — a value is wrong or missing, or a reading is misleading, and nothing in the response tells the agent to look again. Use `issue` 241 for flattened superscripts/subscripts and 242 for prose reported as a layout table; otherwise leave it unset until an issue exists.

Never change pdfvision to make a case pass, and never bend a realistic layout until it does; equally, do not contrive geometry just to break it.

PDFs are byte-identical across runs (pinned dates and trailer `/ID`), so regenerating an unchanged case leaves the tree clean.

## How `read.md` is produced

`run.mjs` spawns `node dist/bin/pdfvision.mjs mcp` from the repo root and calls `read_pdf` with the repo-relative path of `case.pdf`, through a minimal JSON-RPC client in `lib/mcpClient.mjs`. That is one unscoped call per case: every case is kept small enough (at most a few pages, well under the response's 30,000-character body budget and 20-page full-read limit) that the response carries every page body rather than a truncated body or a document map. Keep new cases that way; `run.mjs` does not page through a document. The text blocks of the response are saved as-is except for two normalisations: the absolute repo root the server resolves the path to is stripped back to the repo-relative path, and any mention of the cache root becomes `<cache>`. The server runs with `PDFVISION_CACHE_DIR` pointed at a fresh temp directory that is deleted afterwards, so a stale cache entry can never be snapshotted and your own cache is untouched.

## Reviewing a case

For an agent:

1. Read `truth.md`.
2. Look at the pages: `page-N.png`, or `render_pdf` through the `pdfvision-dev` MCP server from `.mcp.json`.
3. Read the PDF with `read_pdf` (or read `read.md`, which is the same response).
4. Answer the truth's questions from `read.md` alone, and report every place the reading disagrees with the page or with the truth.

For a human: skim `index.html` (open it from disk) for what only a person notices — whether a warning helps or is noise, whether the output is pleasant to read.

When `--check` fails in a PR, the diff is a behaviour change. Review it this way before regenerating, and update `meta.status` (and the known-gap line in `truth`) if a gap closed or a new one opened.
