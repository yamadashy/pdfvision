# Paper first page with an author grid and a sideways arXiv stamp

- **Stresses:** title over a grid of three-line author blocks (name, affiliation, email) in two rows of unequal length; one block with no affiliation; footnote marks after names; arXiv identifier rotated 90° in the left margin; narrow single-column abstract
- **Families:** reading-order, structure, vertical-rotated
- **Status:** known-gap

Letter page. Reading order: the title **Sparse Routing Is All You Need for Long Context**, the author grid, the abstract, the introduction,
then the footnotes and the venue line. The sideways margin stamp `arXiv:2611.04172v2 [cs.LG] 9 Nov 2026`
is page furniture; it may come anywhere but must not split a block.

The authors sit in a grid of three-line blocks, 4 in the first row and 3
in the second. Each block reads name, affiliation, email; a reading must keep each affiliation and
email with its own name:

- Mireille Ostrander* — Halcyon Labs — mostrander@halcyon.ai
- Tobiah Kwan* — Halcyon Labs — tkwan@halcyon.ai
- Ines Valcárcel* — Halcyon Research — ivalcarcel@halcyon.ai
- Dmitri Halvorsen* — Halcyon Research — dhalvorsen@halcyon.ai
- Priya Ramaswamy* — Halcyon Research — pramaswamy@halcyon.ai
- Oskar Lindqvist*† — University of Tarrow — oskar@cs.tarrow.edu
- Yusra Haddad*‡ — (no affiliation line) — yusra.haddad@fastmail.org

Footnotes: * Equal contribution. Listing order is random. † Work performed while at Halcyon Research. ‡ Work performed while visiting Halcyon Labs as an independent researcher.

Abstract: Long-context language models spend most of their compute attending to tokens that do not matter for the next prediction. We introduce the Sparse Router, a learned gate that sends each query to at most 64 key blocks chosen from the whole context, and train it jointly with the model. On a 128k-token retrieval benchmark the Sparse Router matches dense attention at 31.4 exact match while using 6.2 times fewer attention FLOPs, and on long-document summarisation it improves ROUGE-L from 24.9 to 26.3. Training a 1.3B-parameter model with routing takes 4.5 days on 16 accelerators, about a third of the dense baseline.

## Questions an agent should be able to answer

1. What is Ines Valcárcel's email address and affiliation? — ivalcarcel@halcyon.ai, Halcyon Research
2. Which authors are at Halcyon Labs (not Halcyon Research)? — Mireille Ostrander and Tobiah Kwan
3. Which author worked on the paper while at Halcyon Research but lists another affiliation? — Oskar Lindqvist (University of Tarrow; footnote †)
4. What is the paper's arXiv identifier and version date? — arXiv:2611.04172v2, 9 Nov 2026
5. How many fewer attention FLOPs does the Sparse Router use at matched exact match? — 6.2 times fewer (31.4 exact match)
6. What is Priya Ramaswamy's affiliation? — Halcyon Research

Questions 2, 3, 4 and 5 are answerable from `read.md`; the footnotes, the abstract and the margin
stamp read cleanly (the stamp last, whole).

**Known gap (no issue yet):** the author grid is read as loose fragments in a mixed order, and
nothing warns about it (the only warning is a `reading_order_divergence` about `1 Introduction`).
`Priya Ramaswamy` (second row) follows `Mireille Ostrander`'s block directly with her email but
without her affiliation; her `Halcyon Research` line is left orphaned between two `*` marks, so
question 6 has no answer. `Dmitri Halvorsen`'s email is glued onto Ines Valcárcel's line
(`ivalcarcel@halcyon.ai dhalvorsen@halcyon.ai`) and his name comes after Yusra Haddad's block,
so question 1 needs a guess between two addresses. Every footnote mark (`*`, `*†`, `*‡`) is cut
from its name and emitted as a line of its own, so which author is † or ‡ is lost from the grid
(question 3 is still answerable from the footnote text plus the affiliation). The `Abstract` and
`1 Introduction` headings are emitted together before the abstract text.
