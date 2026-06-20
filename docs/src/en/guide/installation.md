---
title: Installation
description: Install or run pdfvision with npx, npm, or as a library dependency.
---

# Installation

pdfvision is distributed as an npm package. You can run it directly with `npx`, install it globally for repeated CLI use, or add it as a dependency when your application needs typed PDF evidence.

## Requirements

pdfvision requires Node.js 22.13.0 or newer.

The package installs `@napi-rs/canvas` for rendering. OCR uses `tesseract.js`, which is installed as an optional dependency and loaded only when `--ocr` is requested.

Use a recent Node version because pdfvision relies on modern ESM, pdf.js, rendering, and optional OCR dependencies.

## Run Without Installing

```bash
npx pdfvision document.pdf
```

This is the easiest option for one-off extraction.

Use `npx` when:

- an agent needs to inspect a PDF once.
- you want the latest published version without changing a project.
- a script can tolerate npm startup overhead.

## Install Globally

```bash
npm install -g pdfvision
pdfvision document.pdf
```

Use a global install when agents or local scripts call pdfvision repeatedly.

This is the most convenient setup for local agent workflows because every shell can call `pdfvision` directly.

## Install as a Library

```bash
npm install pdfvision
```

Then import the library API:

```ts
import { processDocument } from 'pdfvision';

const result = await processDocument('./document.pdf', { pages: '1-3', render: true });
console.log(result.totalPages);
```

Use the library when you want to:

- route pages based on `overview[]`, `quality`, or warnings.
- pass rendered image paths to a vision model.
- turn search match boxes into follow-up render regions.
- keep TypeScript types for `DocumentResult`, `PageResult`, and optional PDF feature fields.

## Skip OCR Dependencies

If you never use OCR, install without optional dependencies:

```bash
npm install --omit=optional pdfvision
```

Rendering still works with the normal install path because `@napi-rs/canvas` is a core dependency. Skipping optional dependencies only removes OCR support.

## Verify the Install

```bash
pdfvision --version
pdfvision --help
```

Then run a small extraction:

```bash
pdfvision document.pdf --json
```

If the PDF is scanned, visual, or suspiciously empty, continue with [Rendering and OCR](./rendering-and-ocr.md).
