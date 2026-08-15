---
name: options
description: Every CLI option with its interactions and caveats, the order arguments are resolved in, output formats, and exit codes. Use when picking or combining flags, or when explaining an exit code.
---

# Options

The short `pdfvision --help` lists the flags reached for most often. This topic is the complete set, in the same layout, plus the rules that decide what happens when they are combined.

```text
  -p, --pages <range>     Pages to extract: "1", "1-5", "1,3,5", "2-4,7". Default: all pages.
  -f, --format <type>     Output format: markdown (default), json, xml, toon.
      --markdown          Shortcut for --format markdown.
      --json              Shortcut for --format json.
      --xml               Shortcut for --format xml.
      --toon              Shortcut for --format toon.
                          (Specifying more than one format, or mixing a shortcut with a different
                          --format, is an error — pdfvision does not last-wins-resolve them.)
                          JSON-style field paths below are exact for JSON/TOON and processDocument();
                          XML maps them to tags/attributes (for example page→no, pageLabel→label).
  -r, --render            Render each selected page to a PNG and include the path on every page result.
      --render-output <dir>
                          Directory to write rendered page PNGs or visual-region PNGs into, created
                          if missing. Requires --render or --render-visual-regions.
                          PNGs land flat as `<dir>/page-N.png` (`--render-region` keeps its
                          coordinate-suffixed name); a filename already taken by another PDF in the
                          same dir is written with a `-2` suffix and a note on stderr.
                          Without this, PNGs land under the cache (or OS tmp with --no-cache).
      --render-scale <n>  Rasterisation multiplier for --render / --render-visual-regions / --ocr.
                          Default 2 (≈144 DPI). Smaller values shrink the PNG
                          (and vision-model payload); OCR keeps at least scale 2 for recognition
                          quality; larger values capture more detail.
                          Accepts decimals; bounds (0, 4].
                          Errors when none of the three flags is present, rather than
                          silently doing nothing — same contract as --render-output.
      --render-region <x,y,width,height>
                          Render a sub-rectangle in raw unrotated page-view units (top-left origin,
                          y grows downward). Physical points = raw value × pages[].userUnit (or 1
                          when omitted); pixels = raw region × UserUnit × render scale. Requires
                          --render or --ocr — there is nothing to crop otherwise. Single-page
                          only: --pages must resolve to exactly one
                          page (errors otherwise). Region must fit within the page bounds.
                          Typical use: --search "term" --matches-only reports each match's
                          region; re-run with that region here to zoom in (--layout for a
                          block-level bbox when there is no term to search).
      --no-normalize      Disable Unicode NFKC normalization and C0-control cleanup. Default ON;
                          pre-normalization text is `pages[].rawText` in JSON/TOON and a sibling
                          `<rawText>` element in XML when normalization changed the string.
                          Markdown output shows only the
                          normalized form — pass --no-normalize if original codepoint fidelity
                          (e.g. fullwidth punctuation `（`, ligatures `ﬁ`, control bytes)
                          matters for downstream diff / forensics.
      --password <value>  Password for encrypted PDFs. The password is used only for pdf.js
                          decryption and is never emitted in output.
      --password-stdin    Read the encrypted PDF password from piped stdin, stripping one
                          trailing newline. If stdin is empty, --password is used as fallback.
      --geometry          Emit per-text-item bbox + font size in `pages[].spans`.
                          Only takes effect with -f json / -f xml / -f toon.
      --layout            Reconstruct `pages[].layout` (lines, blocks, vertical CJK stacks,
                          and numeric-table hints in approximate reading order) from the
                          same span data, and add the structured layout fields to
                          -f json / -f xml / -f toon. In Markdown it also adds the per-page
                          `Layout tables` sections and the Overview `Blocks` / `Tables` columns.
                          Markdown does NOT need this flag for the reading-order body or the
                          layout warnings — those are on by default (see below).
      --image-boxes       Emit `pages[].imageBoxes` — bounding box of every raster image
                          draw on the page. Enables large-raster warnings with --layout or
                          --geometry. Only -f json / -f xml / -f toon.
                          Full-page scan/OCR-layer and dense-vector warnings can appear
                          even without this flag.
      --vector-boxes      Emit `pages[].vectorBoxes` — bounding boxes of vector drawings
                          such as map symbols, chart paths, clipped shading fills, table
                          rules, form boxes, and slide shapes. Only -f json / -f xml / -f toon.
      --visual-regions    Emit `pages[].visualRegions` — padded, crop-ready bboxes
                          for important figures, charts, diagrams, tables, forms,
                          visible annotation markup, and raster/vector clusters.
                          Feed x,y,width,height directly into
                          --render-region for a visual zoom.
      --render-visual-regions
                          Render each visual region crop to PNG and attach
                          `visualRegions[].image`, `renderContentRatio`,
                          and `renderedContentBox` when visible pixels are tighter.
                          Implies --visual-regions and does not require --render.
      --form-fields       Emit `pages[].formFields` — interactive PDF widget fields
                          such as text boxes, checkboxes, radio buttons, choices,
                          buttons, and signatures with values, export values,
                          flags, actions, choice options, bboxes, and nearby visible labels.
                          Useful for government forms.
                          Markdown also renders a form-field table.
      --links             Emit `pages[].links` — clickable PDF link annotations such as
                          external URLs, citation jumps, and table-of-contents destinations
                          with bboxes and resolved destination pages when available.
                          Markdown also renders a links table.
      --annotations       Emit `pages[].annotations` — non-link PDF annotations such as
                          comments, sticky notes, highlights, underlines, strikeouts, stamps,
                          file-attachment icons, shape markup, and ink with bboxes, comment
                          text, icon names, PDF flags such as hidden/print, attachment
                          metadata, and shape geometry when available.
      --structure         Emit tagged-PDF structure trees in `pages[].structure`,
                          including role hierarchy, figure alt text, language hints,
                          bboxes, and marked-content ids when the PDF provides them.
      --page-labels       Emit viewer page labels in `pageLabels` and `pages[].pageLabel`;
                          useful when front matter uses roman numerals or page numbering
                          restarts apart from the physical page number.
      --attachments       Emit document-level embedded file attachment metadata in
                          `attachments` without embedding attachment bytes in output.
      --attachment-output <dir>
                          Directory to write embedded attachment files into. Requires
                          --attachments; files land under a per-PDF fingerprint subdir.
      --outline           Emit top-level `outline` document bookmarks, preserving hierarchy,
                          URLs, named actions, and resolved destination pages when possible.
                          Markdown also renders an outline section.
      --viewer            Emit top-level `viewer` settings: initial page mode/layout,
                          viewer preferences, open action, document/page JavaScript
                          actions, permissions, and MarkInfo.
      --layers            Emit top-level `layers` from PDF optional content groups:
                          layer names, visibility, usage states, radio groups, and
                          viewer panel order for maps, CAD/design PDFs, and variants.
      --strip-repeated    Drop running headers / footers / page numbers (blocks the layout
                          pass tagged as `repeated`) from the rendered Markdown body so
                          LLM readers don't have to wade through the same footer N times.
                          Markdown only; JSON/TOON preserve block `repeated: true`, while XML
                          uses `<block repeated="true">`. Requires --layout.
      --map               Emit a map of the document instead of its contents: page count,
                          metadata, outline, and per-page native-text quality plus warning
                          codes folded into page ranges. No page bodies. The cheap first
                          move on a long PDF — a 120-page report maps in ~300 bytes where
                          the full body is ~290 KB. Markdown only.
      --ocr               Run OCR on each selected page and attach `pages[].ocr`
                          (text + confidence + lang). Slow; opt-in. Requires the
                          optional `tesseract.js` dependency. `pages[].text` is
                          preserved alongside so callers can compare native vs OCR.
      --ocr-lang <lang>   Tesseract language code(s), plus-separated for multi-lang
                          (e.g. `eng+jpn`). Default: eng. Only used with --ocr.
      --search <query>    Find occurrences of <query> on each page and emit
                          `pages[].matches[]` with the bbox of each hit. Pipe a
                          match's bbox into a follow-up --render-region for visual
                          zoom. Repeatable: `--search A --search B` searches both
                          (each match carries the source query). Literal substring
                          by default; case-insensitive; NFKC-aware (matches
                          compatibility codepoints like `ﬁ` (U+FB01 ligature) for
                          `fi`). Also searches text/choice form field values
                          (marked source:'formField'), clickable link targets
                          (source:'link'), visible FreeText annotations
                          (source:'annotation'), and OCR text when --ocr is on
                          (source:'ocr'); duplicate OCR hits already covered by
                          non-OCR matches are suppressed. At most 10,000 matches are
                          emitted per page, query, and source. The first additional valid
                          match warns on stderr; it and later matches for that combination
                          are dropped.
      --search-regex      Treat each --search query as a JavaScript regular expression
                          (default: literal substring). Each page's regex search is
                          bounded at 1s; a pattern that exceeds it drops that page's
                          results and warns on stderr (usually catastrophic backtracking).
                          The whole regex request is bounded at 12s: past that, matches
                          found so far are kept, the remaining pages go unsearched, and a
                          warning names the pages searched and where to resume.
      --search-case-sensitive
                          Match case exactly (default: insensitive).
      --matches-only      Emit a focused search report: the file, total page/match counts, and
                          a flat list of emitted matches with page, query reference, source,
                          text, optional context, bbox, and region. Pass `region` to
                          --render-region: it is the crop-ready box, grown from the match to
                          the table row or visual line containing it. Passing `bbox` instead
                          crops to the matched glyphs alone, which on a financial table renders
                          the row label and none of its values.
                          Non-default page UserUnits are retained
                          in compact pageUserUnits metadata. Requires --search. The full pages/body
                          payload is omitted; zero matches still exits 0 with a zero-match report.
                          Works in every format. Size grows with emitted matches and context.
      --remote <url>      Download an http(s) PDF, validate the PDF header, and run extraction
                          on it. Same URL → same cache slot unless --no-cache streams the
                          bytes directly without writing the remote-PDF cache. Surrounding
                          whitespace is trimmed; a blank value does not count as an input source.
      --no-cache          Skip extraction and remote-PDF caches (re-download / re-extract).
                          OCR support files still use the validated on-disk cache root.
      --clear-cache       Deprecated alias for the `clear-cache` subcommand; still works, still
                          warns, removed in v1.0.
  -v, --version           Show version
  -h, --help              Show this help

```

## Subcommands

```text
  docs [topic]            Print the documentation for the installed version. Bare `docs` lists
                          the topics with a line each on when to read them; one positional
                          argument prints that topic. An unknown topic exits 1 with the closest
                          match rather than falling back to the index.
  clear-cache             Remove cached extractions, rendered PNGs, remote PDFs, and OCR
                          support data, then exit. No file argument required. PDFVISION_CACHE_DIR,
                          when set, must be a nonblank absolute path to a dedicated directory.
                          An ownership marker authorizes recursive clearing; broad, unmarked custom,
                          or otherwise unverified roots are refused. POSIX ownership and no-follow
                          checks are stronger; Windows replacement resistance is best effort.
                          Because clearing is destructive, an entry named `clear-cache` in the
                          working directory is refused rather than guessed at — including a
                          symlink whose target is missing, and an entry that cannot be read.
  mcp                     Serve pdfvision over the Model Context Protocol on stdio, for hosts
                          that cannot run a shell (Claude Desktop, Cursor, Cline, Zed, n8n).
                          Exposes three tools — read_pdf, search_pdf, render_pdf — rather than
                          the flags above; see "pdfvision mcp --help". Prefer the CLI plus the
                          bundled agent skill in shell-capable agents: MCP tool schemas stay in the
                          host's context for the whole session, a skill loads on demand.
```

A subcommand is recognized only as the first argument and takes no options of its own; `--help`
and `--version` are the usual exceptions and work after one. A file actually named `docs`, `mcp`,
or `clear-cache` must be passed as `./docs`, `./mcp`, or `./clear-cache`.

## Argument handling

```text
  A subcommand is recognized only as the first argument, before any option parsing, and
  takes no options of its own beyond --help / --version. A file actually named `docs`,
  `mcp`, or `clear-cache` must therefore be passed as `./docs`, `./mcp`, or
  `./clear-cache`; because clearing is destructive, `clear-cache` refuses instead of
  guessing when anything of that name exists in the directory.
  Option syntax is parsed next; an unknown option or missing option value exits 1 even
  when --help is present. After successful parsing, terminal precedence is --version,
  then --help, then --clear-cache; these skip input and extraction-option semantic checks.
  Otherwise, multiple positional arguments exit 1 before source presence is checked.
  With at most one positional argument, the absence of both a non-empty positional input
  and a nonblank --remote URL prints usage to stderr and exits 2. With a source, semantic
  and other handled failures exit 1; a cache-clearing failure also exits 1.

```

## Output formats

```text
  markdown (default)  Per-page sections, density Overview table, image links inline. For LLM context.
                      The body is rebuilt in visual reading order (lines joined into paragraphs)
                      and layout warnings surface automatically — no --layout needed. --layout adds
                      the structural Layout tables / Blocks / Tables columns on top.
  json                Full DocumentResult schema. For programmatic parsing.
  xml                 Tag-shaped near-parity projection. Page rotation stays; overview rotation is omitted;
                      names, nesting, and empty-field presence can differ. XML-forbidden code units become
                      unambiguous [[pdfvision:U+XXXX]] markers.
  toon                Token-Oriented Object Notation: decodes to exactly the json data model when emitted;
                      an unpaired UTF-16 surrogate errors instead of corrupting it (use json for that case).
                      Arrays whose entries have the same fields can use a tabular form (nested
                      uniform objects fold into the header); mixed-field spans/lines stay in list form.

```

## Examples

```text
  pdfvision document.pdf                                                       # markdown to stdout
  pdfvision report.pdf --map                                                   # what the document is, no page bodies (first move on a long PDF)
  pdfvision document.pdf --json                                                # JSON shortcut
  pdfvision document.pdf -p 1-3 --json                                         # specific pages, JSON
  pdfvision document.pdf -r --render-output ./images                           # render PNGs to ./images
  pdfvision slides.pdf -r --render-scale 1                                     # 1× raster (smaller PNGs)
  pdfvision report.pdf -p 3 -r --render-region 100,200,300,150                 # zoom into a 300×150 page-view-unit box on page 3
  pdfvision report.pdf --search "revenue" --json                               # find emitted "revenue" matches with bboxes; pipe to --render-region
  pdfvision paper.pdf --search "GPT" --search "transformer" --json             # multi-query (each match keeps its source query)
  pdfvision paper.pdf --search "BLEU" --matches-only                           # report metadata + flat match list, without page bodies
  pdfvision report.pdf -p 3-5 -r --render-output ./images --geometry --json    # PNGs + spans for 3-5
  pdfvision slides.pdf --xml --geometry                                        # layout / geometry as XML
  pdfvision report.pdf --toon --geometry                                       # geometry spans in TOON format
  pdfvision report.pdf --layout --strip-repeated                               # markdown w/o repeated chrome
  pdfvision encrypted.pdf --password "secret" --json                           # encrypted PDF
  printf "secret\n" | pdfvision encrypted.pdf --password-stdin --json          # avoid password in argv
  pdfvision scan.pdf --ocr --json                                              # OCR a scanned PDF
  pdfvision scan-ja.pdf --ocr --ocr-lang jpn+eng --json                        # multi-lang OCR
  pdfvision --remote https://example.com/paper.pdf --json                      # fetch + extract JSON
  pdfvision clear-cache                                                        # clear the verified pdfvision cache
  pdfvision docs                                                               # list the built-in documentation topics
  pdfvision docs warnings                                                      # read one topic

```

## Exit codes

```text
  0  Success, including --help, --version, a printed docs topic or index, and a
     successful clear-cache
  1  Option-syntax error; multiple positional arguments; unsupported arguments passed to a
     subcommand; an unknown docs topic; semantic argument failure with a source; file,
     network, cache, or extraction failure (error message on stderr)
  2  With at most one positional argument, no non-empty positional input or nonblank
     --remote URL was provided (usage printed on stderr)
```
