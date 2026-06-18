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

The remote server still sees the request. Do not use `--remote` for private URLs unless that network access is acceptable.

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

pdfvision uses restrictive file permissions on POSIX systems and defends against common symlink and time-of-check/time-of-use cache issues.

## Attachments and JavaScript Actions

`--attachments` can expose embedded file metadata and, when `--attachment-output` is used, write embedded files to disk. Treat extracted attachments as untrusted files.

`--viewer` and form-field actions can expose PDF JavaScript source as data. pdfvision does not execute PDF JavaScript.

## Review Before Sharing

Structured output can include document text, metadata, annotations, form values, links, JavaScript action bodies, attachment names, and rendered image paths. Review output before sending it to any third-party AI service.
