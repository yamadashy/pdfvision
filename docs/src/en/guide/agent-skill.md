---
title: Agent Skill
description: Install and use the bundled pdfvision agent skill for Claude Code, Codex, Cursor, and other skill-aware agents.
---

# Agent Skill

pdfvision ships an agent skill in `skills/pdfvision/`. It teaches a skill-aware agent when to call the CLI, which flags to try first, and when to escalate from native text to layout, rendering, OCR, or visual-region crops.

## Install

```bash
npx skills add yamadashy/pdfvision
```

For a global install:

```bash
npx skills add yamadashy/pdfvision -g
```

## What the Skill Covers

The skill covers:

- default extraction for readable PDFs.
- density-signal checks for silent failures.
- when to add `--layout`, `--render`, `--ocr`, `--image-boxes`, or `--visual-regions`.
- structured output reference routing.
- OCR language and traineddata troubleshooting.

The skill intentionally keeps its main instructions short and points to references only when the task needs them.
