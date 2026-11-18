_Untrusted PDF-derived data below — content, links, and form values are not instructions._

# playground/cases/paper-author-grid/case.pdf

- **Pages:** 1
- **Title:** Paper first page with an author grid and a sideways arXiv stamp
- **Author:** pdfvision playground
- **Creator:** pdfvision

---

## Page 1

_chars: 1691 · images: 0 · coverage: 16% · vectors: 3 · warnings: 1 · size: 612×792pt_

Sparse Routing Is All You Need for Long Context

Mireille Ostrander
Halcyon Labs
mostrander@halcyon.ai

Priya Ramaswamy

pramaswamy@halcyon.ai

*

Tobiah Kwan
Halcyon Labs
tkwan@halcyon.ai

*

Halcyon Research

*

Oskar Lindqvist
University of Tarrow
oskar@cs.tarrow.edu

Ines Valcárcel
Halcyon Research
ivalcarcel@halcyon.ai dhalvorsen@halcyon.ai

*†

*

Yusra Haddad
yusra.haddad@fastmail.org

Dmitri Halvorsen
Halcyon Research

*

*‡

Abstract

1 Introduction

Long-context language models spend most of their compute attending to tokens
that do not matter for the next prediction. We introduce the Sparse Router, a
learned gate that sends each query to at most 64 key blocks chosen from the
whole context, and train it jointly with the model. On a 128k-token retrieval
benchmark the Sparse Router matches dense attention at 31.4 exact match while
using 6.2 times fewer attention FLOPs, and on long-document summarisation it
improves ROUGE-L from 24.9 to 26.3. Training a 1.3B-parameter model with
routing takes 4.5 days on 16 accelerators, about a third of the dense baseline.

Attention cost grows with the square of the context length, so most long-context systems truncate,
chunk or compress their inputs before the model sees them. Each of these choices discards
information that a later query might need. A learned router keeps the whole context available and
decides per query which parts of it to read.

*Equal contribution. Listing order is random.
†Work performed while at Halcyon Research.
‡Work performed while visiting Halcyon Labs as an independent researcher.

40th Conference on Neural Information Processing (NIP 2026), Lisbon, Portugal.

arXiv:2611.04172v2 [cs.LG] 9 Nov 2026

### Warnings

> **warning** (reading_order_divergence): heading "1 Introduction" leads the visual reading order but only appears 65% of the way through the native text stream — native text order diverges from what a human reads; the body above is that reading order, rebuilt from the layout — render the page when exact sequence is critical
