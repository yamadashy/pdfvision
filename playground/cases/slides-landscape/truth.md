# Three-slide 16:9 deck with a screenshot slide

- **Stresses:** non-Letter landscape page size; repeated footer; nested bullets; vector chart with value labels; a slide whose content is only a raster image
- **Families:** page-geometry, raster-text, vector-meaning
- **Status:** ok

Three 960 × 540 pt slides. Every slide carries the footer `Larkspur Analytics  |  Confidential — internal use only`; slides 2 and 3 carry
their number at the bottom right. A good reading may report the footer as repeated chrome.

**Slide 1 (title):** Q3 FY2026 Business Review — Customer Success & Revenue Operations. Dana Whitfield, VP Revenue Operations. October 14, 2026.

**Slide 2:** Net revenue retention rose for a third straight quarter

- NRR reached 118%, up from 112% in Q2
  - Expansion led by the Analytics Pro tier
- Gross churn held at 4.1% of ARR
- 37 enterprise renewals closed, 6 ahead of plan

Native bar chart “Net revenue retention by quarter” (value labels are text):
Q4 FY25 108%, Q1 FY26 110%, Q2 FY26 112%, Q3 FY26 118%.

**Slide 3:** one raster image (a dashboard screenshot); its text exists only as pixels. Native
text on the slide: the footer and `3`. A correct reading says the slide is an image whose
content needs the render or OCR, rather than presenting the slide as empty or footer-only.
Text inside the image:

Open pipeline by region — Snapshot as of Sep 30, 2026 · stage 2 and later

| Region | Open deals | Pipeline | Win rate (4Q) |
| --- | ---: | ---: | ---: |
| North America | 142 | $48.6M | 31% |
| EMEA | 96 | $29.1M | 27% |
| APAC | 58 | $14.8M | 24% |
| Latin America | 21 | $5.2M | 19% |
| Total | 317 | $97.7M | 28% |

## Questions an agent should be able to answer

1. Who presented the review, and on what date? — Dana Whitfield, VP Revenue Operations, October 14, 2026
2. What was NRR in Q1 FY26, according to the chart? — 110%
3. How many enterprise renewals closed in Q3? — 37
4. What is the open pipeline in EMEA? — $29.1M (in the screenshot only; needs the render or OCR)
5. Which point under “NRR reached 118%” explains the increase? — Expansion led by the Analytics Pro tier (nested under the first bullet)

**Current reading (ok):** questions 1, 2, 3 and 5 are answered from `read.md`; nesting survives
as the `–` sub-bullet glyph, and each chart value label is followed by its quarter. Question 4
cannot be answered from text, which is expected: page 3 carries
`large_raster_low_text_overlap` (“large raster image covers 63.3% of the page … labels, chart
text, or map text inside the image will not appear in native text”) and its native status is
`sparse_text_with_visual_content`, so the agent knows to render or OCR that page. The warning
says what is missing but does not itself name `render_pdf`/OCR as the next step.

The footer is dropped from every page as repeated chrome, and nothing in the response says
so; an agent asked whether the deck is marked confidential cannot tell from `read.md`.
