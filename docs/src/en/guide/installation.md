---
title: Installation
description: Install or run pdfvision with npx, npm, or as a library dependency.
---

# Installation

## Requirements

pdfvision requires Node.js 22.13.0 or newer.

The package installs `@napi-rs/canvas` for rendering. OCR uses `tesseract.js`, which is installed as an optional dependency and loaded only when `--ocr` is requested.

## Run Without Installing

```bash
npx pdfvision document.pdf
```

This is the easiest option for one-off extraction.

## Install Globally

```bash
npm install -g pdfvision
pdfvision document.pdf
```

Use a global install when agents or local scripts call pdfvision repeatedly.

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

## Skip OCR Dependencies

If you never use OCR, install without optional dependencies:

```bash
npm install --omit=optional pdfvision
```
