# Two-column paper first page

- **Stresses:** full-width header over two columns; superscript author markers; inline equation; vector chart with text labels; table caption above; footnote; rotated margin stamp
- **Families:** reading-order, math, vector-meaning, vertical-rotated, structure
- **Status:** known-gap (#242)

Reading order: title, authors, affiliations, e-mails, abstract, then the **whole left column**
(1 Introduction → bullets → 2 Method → equation → Table 1 → footnote) before the **right column**
(Figure 1 → caption → 3 Experiments). The two columns must not be interleaved line by line.

- Title: Adaptive Token Pruning for Efficient Long-Document Retrieval
- Authors: Mira Okafor^1, Tomasz Lindqvist^2, Haruka Senda^1
- Affiliations: ^1 Department of Computer Science, Northgate University; ^2 Halden Research Labs
- Margin stamp (rotated 90°, reads bottom to top): `arXiv:2611.04217v1 [cs.IR] 12 Nov 2026`

Abstract: Late-interaction retrievers score every query token against every document token, which makes long documents expensive to index and slow to search. We present Adaptive Token Pruning (ATP), a scoring rule that drops document tokens whose maximum attention from a learned probe falls below a per-document threshold. ATP needs no change to the encoder and no re-training of the retriever. On three long-document benchmarks it halves query latency while keeping nDCG@10 within 0.4 points of full attention, and it outperforms static length truncation at every budget we test.

Contribution bullets: “a pruning rule that needs only a probe vector and a threshold per document;” / “an analysis of which tokens are pruned, showing that function words and boilerplate dominate;” / “experiments on three benchmarks with latency measured end to end.”

Inline equation in §2 (two lines): `For a token i with embedding k_i we compute s_i = q^T k_i / √d and keep the token when s_i ≥ τ.` — the subscripts and the superscript must stay
distinguishable (`s_i`, `q^T`, `k_i`), not `si = qTki`.

Table 1: Retrieval quality and query latency on LongDocQA.

| Method | nDCG@10 | R@100 | Latency (ms) |
| --- | ---: | ---: | ---: |
| Full attention | 41.2 | 58.7 | 182 |
| Static pruning (k = 512) | 38.9 | 55.1 | 97 |
| ATP (ours) | 40.8 | 58.3 | 88 |

Footnote 1: Code and probe weights: https://example.org/atp (its marker is a superscript after “experiments”).

Figure 1: Median query latency (ms) per benchmark for full attention and ATP. Lower is better. Bars (value labels are text on the page):

| Benchmark | Full attention | ATP (ours) |
| --- | ---: | ---: |
| LongDocQA | 182 | 88 |
| MultiNews-R | 156 | 79 |
| LegalBench-S | 241 | 121 |

Page number: 1.

## Questions an agent should be able to answer

1. Which author is affiliated with Halden Research Labs? — Tomasz Lindqvist
2. What nDCG@10 and latency does ATP reach on LongDocQA in Table 1? — 40.8 nDCG@10, 88 ms
3. What latency does Figure 1 report for ATP on LegalBench-S? — 121 ms
4. What is the paper's arXiv identifier? — arXiv:2611.04217v1
5. What rule decides whether a token is kept? — s_i = q^T k_i / √d ≥ τ

The inline equation keeps its scripts (#241): `For a token i with embedding k_i we compute` /
`s_i = q^Tk_i / √d and keep the token when s_i ≥ τ.`, so question 5 is answerable; author and
affiliation markers read `Lindqvist^2`, `^2Halden Research Labs`, and the footnote marker
`experiments^1`.

Table 1 is the only layout table, `Method | nDCG@10 | R@100 | Latency (ms)` over its three rows:
its rules bound it, so `4 Related Work` from the right column stays out of it (#252) and the
header line between its top rules is split at the columns below it (#253); the abstract and the
two columns of prose are no longer reported as a table (#242, the rotated arXiv stamp beside the
page used to join every row it overlapped). Question 2 is answered from it.

**Known gap (no issue yet):**
- The centred page number `1` is emitted at the end of the right column.

The chart's text is kept together before its caption (#256): the axis ticks, then bar by bar
`Full attention / 182 / 88 / LongDocQA`, `ATP (ours) / 156 / 79 / MultiNews-R`,
`241 / 121 / LegalBench-S`, and `vector_chart_labels` names the chart region to render, since the
legend entries still sit with the wrong groups and the text alone cannot pair a value with its
series — question 3 needs that render. The author line now comes before the affiliations, and
Table 1 reads row by row in the body (`Full attention / 41.2 / 58.7 / 182`).
The left column is correctly read before the right one; the rotated arXiv stamp in the margin is
read upright at the end of the page, after the body (question 4 is answerable).
