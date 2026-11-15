# Two-column paper first page

- **Stresses:** full-width header over two columns; superscript author markers; inline equation; vector chart with text labels; table caption above; footnote; rotated margin stamp
- **Families:** reading-order, math, vector-meaning, vertical-rotated, structure
- **Status:** known-gap (#241)

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

**Known gap (#241):** the subscripts of the inline equation are split off their lines and
emitted later as lone `i` lines (two after the equation, two more inside the Table 1 run), and
the superscript is joined: the body reads `For a token i with embedding k we compute` /
`s = qTk / √d and keep the token when s ≥ τ.` — question 5 cannot be answered correctly
from `read.md`. Author and affiliation markers are joined too (`Lindqvist2`, `2Halden`),
which still lets question 1 be answered.

**Known gap (#242):** the abstract, the whole left column and the figure labels are also
reported as an 8 × 51 “layout table” of prose fragments. No warning accompanies it.

**Known gap (no issue yet):**
- The real Table 1 is detected without its header row (columns `C1…C5`), and it picks up a
  fifth column holding `4 Related Work` from the right column. The header names appear in
  the body as one line, `nDCG@10 R@100 Latency (ms)`, so question 2 is answerable by matching
  column order.
- The author line is emitted after the affiliation and e-mail lines.
- The chart's legend, value labels and benchmark names are emitted at the end of the right
  column, after §4, interleaved as `Full attention / 182 / 88 / LongDocQA / ATP (ours) / 156 / 79 /
  MultiNews-R / 241 / 121 / LegalBench-S`; the axis ticks come before the caption. Question 3
  is answerable only by assuming each pair precedes its benchmark name — the legend entry
  `ATP (ours)` sits next to the MultiNews-R pair, not the ATP bars. No warning covers the chart.
- The centred page number `1` is emitted inside the left column, between Table 1 and the axis ticks.

The left column is correctly read before the right one; the rotated arXiv stamp is read
upright after the abstract (question 4 is answerable).
