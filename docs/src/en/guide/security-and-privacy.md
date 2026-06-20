---
title: Security and Privacy
description: Understand how pdfvision handles local files, remote PDFs, passwords, cache directories, OCR traineddata, attachments, JavaScript actions, and sensitive output review.
---

# Security and Privacy

pdfvision runs locally. It does not collect telemetry and does not upload your PDF contents to a service.

## Local Processing

For local files, extraction happens on your machine. Rendered images, OCR traineddata, remote downloads, and cached extraction results are written under the pdfvision cache directory unless you choose output paths explicitly.

Use:

```bash
pdfvision --clear-cache
```

to remove cached extractions, renders, remote downloads, and OCR traineddata managed by pdfvision.

## Remote PDFs

`--remote` downloads an HTTP(S) URL and validates that the body is a PDF before extraction.

```bash
pdfvision --remote https://example.com/document.pdf --format json
```

Only `http:` and `https:` URLs are accepted. Redirects are followed, but non-PDF responses are rejected before they enter the remote cache. pdfvision checks for a PDF header near the start of the body, rejects responses larger than the download limit, and uses a network timeout so a stalled server does not hold the CLI indefinitely.

The remote server still sees the request, including headers your runtime sends by default. Do not use `--remote` for private URLs unless that network access is acceptable. Use `--remote --no-cache` for one-off private or expiring URLs so the downloaded PDF bytes are not written to the remote-PDF cache.

## Passwords

PDF passwords are used only for pdf.js decryption and are never emitted in output.

Prefer stdin for CLI workflows:

```bash
printf "your-password\n" | pdfvision encrypted.pdf --password-stdin --format json
```

`--password <value>` remains available as an explicit fallback, but it can appear in shell history and process listings.

## Cache Location and Permissions

By default, results are cached under the operating system temp directory. Set `PDFVISION_CACHE_DIR` to control the location:

```bash
PDFVISION_CACHE_DIR=/secure/cache pdfvision document.pdf --format json
```

The cache can contain extracted text, rendered PNGs, remote PDFs, OCR traineddata, and OCR output. Choose a cache directory with the same sensitivity level as the PDFs being processed.

pdfvision uses restrictive file permissions on POSIX systems and defends against common symlink and time-of-check/time-of-use cache issues. `--clear-cache` removes pdfvision-managed cache data under the configured cache root.

## Attachments and JavaScript Actions

`--attachments` can expose embedded file metadata and, when `--attachment-output` is used, write embedded files to disk. Treat extracted attachments as untrusted files.

Attachment filenames are sanitized before writing: path separators and control characters are replaced, empty names get a fallback, and duplicate names are disambiguated. pdfvision also refuses to write attachment output into a symlinked output directory. These checks reduce filesystem risk, but they do not make the embedded files safe to open.

`--viewer` and form-field actions can expose PDF JavaScript source as data. pdfvision does not execute PDF JavaScript.

Viewer permissions are reported as document metadata. They describe what the PDF asks a reader to allow or disallow; they are not a security boundary and should not be treated as DRM enforcement.

## Search Regex Safety

Default search treats queries as literal text. `--search-regex` compiles each query as a JavaScript regular expression and runs it against native text, form-field text, visible FreeText annotations, and OCR text when OCR is enabled.

Only enable regex mode for trusted patterns. pdfvision caps emitted matches per query, page, and source, but JavaScript regular expressions can still spend excessive time inside a single catastrophic-backtracking match before any result is emitted. Applications that expose regex search to untrusted users should wrap extraction in their own timeout or worker isolation.

## Review Before Sharing

Structured output can include document text, metadata, annotations, form values, links, JavaScript action bodies, attachment names, and rendered image paths. Review output before sending it to any third-party AI service.
