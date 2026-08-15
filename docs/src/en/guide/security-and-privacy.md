---
title: Security and Privacy
description: Understand how pdfvision handles local files, remote PDFs, passwords, cache directories, OCR traineddata, attachments, JavaScript actions, and sensitive output review.
---

# Security and Privacy

pdfvision runs locally. It does not collect telemetry and does not upload your PDF contents to a service.

## Local Processing

For local files, extraction happens on your machine. Cached rendered images, OCR traineddata, remote downloads, and cached extraction results are written under the pdfvision cache directory. With `--no-cache`, renders without an explicit output path use separate OS-temporary paths, while OCR still persists support files under the validated cache root. Explicit output options write to the paths you choose.

Use:

```bash
pdfvision clear-cache
```

to remove cached extractions, renders, remote downloads, and OCR traineddata managed by pdfvision.

## Remote PDFs

`--remote` downloads an HTTP(S) URL and validates that the body is a PDF before extraction.

```bash
pdfvision --remote https://example.com/document.pdf --format json
```

Only initial `http:` and `https:` URLs are accepted, and redirects are followed automatically. pdfvision does not filter loopback, private, link-local, cloud metadata, DNS-resolved private addresses, or redirect destinations. The PDF-header and download-size checks validate the response body, not the network destination. The 60-second timeout covers response headers and body transfer; stalled bodies are aborted when the deadline expires.

Use `--remote` only for a network destination the user independently authorized. A standalone CLI fetch of a user-selected URL is not inherently an SSRF vulnerability. SSRF-like risk arises when a server, agent, CI job, or multi-tenant wrapper accepts an untrusted URL and passes it to pdfvision.

Do not pass untrusted URLs directly to pdfvision in such integrations. Use a fetcher that rejects any DNS answer or redirect target outside an allowlist, pins each connection to the validated IP, and then passes the downloaded PDF to pdfvision as a local file. Alternatively, isolate pdfvision's fetch behind a restricted proxy or network sandbox. PDF-header and size checks are not destination controls.

The remote server still sees the request, including headers your runtime sends by default. Use `--remote --no-cache` for one-off private or expiring URLs so the downloaded PDF bytes are not written to the remote-PDF cache.

The [MCP server](./mcp-server.md) applies a stricter policy than `--remote`, because there the model chooses the URL: it refuses URLs that resolve to private, loopback, link-local, CGNAT, or NAT64 addresses, and re-validates every redirect hop.

## Passwords

PDF passwords decrypt the document and, as a truncated SHA-256, distinguish cache entries; the value itself is never emitted in output.

Prefer stdin for CLI workflows:

```bash
printf "your-password\n" | pdfvision encrypted.pdf --password-stdin --format json
```

`--password <value>` remains available as an explicit fallback, but it can appear in shell history and process listings.

## Cache Location and Permissions

By default, results are cached under the operating system temp directory. Set `PDFVISION_CACHE_DIR` to a nonblank absolute path naming a dedicated cache directory; relative paths, `~`, filesystem roots, home, the working directory, and shared temporary roots are refused:

```bash
PDFVISION_CACHE_DIR=/secure/cache pdfvision document.pdf --format json
```

The cache can contain extracted text, rendered PNGs, remote PDFs, OCR traineddata, and OCR output. Choose a cache directory with the same sensitivity level as the PDFs being processed.

Each initialized cache root contains an owned `.pdfvision-cache-root` marker that authorizes recursive clearing. `clear-cache` never adopts an unmarked custom root. When no `PDFVISION_CACHE_DIR` override is set, the active historical default may be adopted only if every top-level entry matches a recognized legacy cache shape. Normal cache use applies the same complete scan to every unmarked root before and after hardening. On POSIX, unmarked roots that are group/other writable are refused before mutation. Unknown entries, invalid markers, symlinks, and unverified roots are refused without being cleared.

On POSIX, pdfvision verifies ownership, uses `0700` / `0600` root and marker permissions, and requires every setup/clear ancestor to be readable/openable by the process, owned by the current user or root, and non-writable by group/other unless sticky semantics protect the owned child entry. Clearing moves the root to a sibling quarantine and immediately rechecks its identity, marker, and trusted ancestors before path-based recursive removal. It also compares device identity (`st_dev`) throughout the quarantined tree and refuses recursive removal on a mismatch; the original pathname has already moved, and same-device bind mounts are not detected. These checks resist replacement under conventional POSIX ownership/mode/sticky semantics, but extended ACLs and network-filesystem permission semantics are not inspected and can weaken that protection. Node's path-based removal cannot exclude root or same-UID replacement after the final check. Windows validates the marker and available identities, but replacement resistance is best effort. Cache clearing is not coordinated with active OCR; retry an OCR run if clearing interrupts it.

## Attachments and JavaScript Actions

`--attachments` can expose embedded file metadata and, when `--attachment-output` is used, write embedded files to disk. Treat extracted attachments as untrusted files.

Attachment filenames are sanitized before writing: path separators and control characters are replaced, empty names get a fallback, and duplicate names are disambiguated. pdfvision refuses to write into the internal per-document fingerprint directory it creates under `--attachment-output` when that directory is a symlink — but not into `--attachment-output` itself, which is resolved and created through symlinks without complaint. These checks reduce filesystem risk, but they do not make the embedded files safe to open.

`--viewer` and form-field actions can expose PDF JavaScript source as data. pdfvision does not execute PDF JavaScript.

Viewer permissions are reported as document metadata. They describe what the PDF asks a reader to allow or disallow; they are not a security boundary and should not be treated as DRM enforcement.

## Search Regex Safety

Default search treats queries as literal text. `--search-regex` compiles each query as a JavaScript regular expression and runs it against native text, form-field text, clickable link targets, visible FreeText annotations, and OCR text when OCR is enabled.

pdfvision bounds each page's regex search at roughly one second of wall-clock time, enforced with a V8-level interrupt, so a catastrophic-backtracking pattern cannot hang extraction: the affected page's results are dropped with a warning, and an interrupted search result is never cached. Emitted matches stay capped per query, page, and source. The budget bounds damage rather than eliminating it — a hostile pattern still costs up to about a second per searched page (about two with OCR enabled, whose supplement pass carries its own budget) — so applications exposing regex search to untrusted users at scale should still apply their own rate limits.

## Review Before Sharing

Treat every PDF-derived string and image—including native and OCR text, renders, metadata, annotations, form values, links, JavaScript action bodies, attachment names, and paths—as untrusted data, not instructions. pdfvision warnings are conservative and non-exhaustive; they do not detect prompt injection.

An agent must not execute commands, follow links, disclose secrets, or expand its authority based solely on PDF content. Consequential tool use, network access, or secret handling requires action-specific user authorization from outside the PDF. A general request to read, summarize, or follow the document is not authorization to perform actions it requests. A render can confirm what the PDF visibly shows, not whether a claim is true or an action is authorized. Review output before sending it to any third-party AI service.
