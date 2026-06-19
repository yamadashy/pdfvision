---
title: Agent Skill
description: Install and use the bundled pdfvision agent skill for Claude Code, Codex, Cursor, and other skill-aware agents.
---

# Agent Skill

pdfvision ships an agent skill in `skills/pdfvision/`. It teaches a skill-aware agent when to call the CLI, which flags to try first, and when to escalate from native text to layout, rendering, OCR, or visual-region crops.

This matters because PDF work is rarely solved by one fixed command. A useful agent should inspect the first result, notice missing or suspicious evidence, and choose the next pdfvision pass. The bundled skill encodes that workflow so agent sessions do not have to rediscover it.

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
- when to use `--search` and `--render-region` for evidence-focused crops.
- structured output reference routing.
- OCR language and traineddata troubleshooting.

The skill intentionally keeps its main instructions short and points to references only when the task needs them.

## Agent Workflow

A skill-aware agent should usually:

1. Start with a structured extraction.
2. Inspect overview fields, page quality, and warnings.
3. Add layout or visual boxes when placement matters.
4. Search for exact evidence when the user asks about a specific clause, metric, label, or field value.
5. Render pages or regions only when visual verification is needed.
6. Use OCR when native text is missing, sparse, or visibly contradicted.

That keeps the interaction efficient while still giving the agent the option to look at the PDF like a human reader.

## When to Install It

Install the skill in projects where agents often read PDFs, reports, slide decks, forms, or scanned documents. The skill is especially useful in repositories that already use Claude Code, Codex, Cursor, or other skill-aware agent environments.
