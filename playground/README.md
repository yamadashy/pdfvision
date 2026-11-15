# Playground

Small synthetic PDFs whose correct reading is known, each stored next to what pdfvision actually returns for it. Unit tests check what someone thought to assert; comparing a page against its extraction catches the rest — values shifted into the wrong column, a row that silently vanished, `10^19` read as `1019`, prose reported as a table.

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
  case.pdf     # generated, committed
  truth.md     # generated from meta + truth, committed
  read.md      # what read_pdf returns, committed
  page-N.png   # pdfvision's own render, gitignored
```

- `meta = { title, stresses, status: 'ok' | 'known-gap', issue? }`. `known-gap` means pdfvision currently reads the page wrong; `issue` links the GitHub issue when there is one.
- `truth` is Markdown built from the same constants `draw` uses, so it cannot drift from the PDF. For a `known-gap` case it also says what pdfvision currently gets wrong.
- `draw` gets a pdfkit document (US Letter, no margins, one page) and helpers in `lib/pdf.mjs`: `text` (left/right/centre-anchored), `run` (one baseline with `{ sup }`/`{ sub }` segments), `paragraph`, `rule`. Use the standard fonts; `'NotoSansJP'` is registered for CJK or for symbols outside WinAnsi such as `∇`.

To add a case, create `cases/<name>/build.mjs`, run `node --run playground -- <name>`, review it as below, set `meta.status` from what you saw, and commit `build.mjs`, `case.pdf`, `truth.md` and `read.md`.

PDFs are byte-identical across runs (pinned dates and trailer `/ID`), so regenerating an unchanged case leaves the tree clean.

## How `read.md` is produced

`run.mjs` spawns `node dist/bin/pdfvision.mjs mcp` from the repo root and calls `read_pdf` with the repo-relative path of `case.pdf`, through a minimal JSON-RPC client in `lib/mcpClient.mjs`. The text blocks of the response are saved as-is except for two normalisations: the absolute repo root the server resolves the path to is stripped back to the repo-relative path, and any mention of the cache root becomes `<cache>`. The server runs with `PDFVISION_CACHE_DIR` pointed at a fresh temp directory that is deleted afterwards, so a stale cache entry can never be snapshotted and your own cache is untouched.

## Reviewing a case

For an agent:

1. Read `truth.md`.
2. Look at the page: `page-N.png`, or `render_pdf` through the `pdfvision-dev` MCP server from `.mcp.json`.
3. Read the PDF with `read_pdf` (or read `read.md`, which is the same response).
4. Report every place the reading disagrees with the page or with the truth.

For a human: skim `index.html` (open it from disk) for what only a person notices — whether a warning helps or is noise, whether the output is pleasant to read.

When `--check` fails in a PR, the diff is a behaviour change. Review it this way before regenerating, and update `meta.status` (and the known-gap line in `truth`) if a gap closed or a new one opened.
