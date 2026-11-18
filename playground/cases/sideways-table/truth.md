# Wide table set sideways on a portrait page

- **Stresses:** portrait page with no /Rotate whose caption and table are drawn turned 90° counter-clockwise; upright running head and page number; two-level header with site groups; em-dash empty cells; table note
- **Families:** tables, vertical-rotated, page-geometry
- **Status:** ok

One portrait Letter page. Upright: the running head `Chapter 4. Field trials` and the page number
`57`. Everything else is turned 90° counter-clockwise (read by turning the page a quarter clockwise):
the caption, the table and its note.

Table 4.3: Field trial yields by variety and site, 2025 season (t/ha). Dashes mark plots lost to flooding.

| Variety | Type | Lowland sites: Ashby | Lowland sites: Brenmoor | Lowland sites: Carrow | Upland sites: Dunhill | Upland sites: Elsted | Upland sites: Farley | Mean |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Aldora | winter | 9.42 | 8.87 | 9.10 | 7.64 | 7.12 | 7.80 | 8.33 |
| Brisk | winter | 9.05 | 9.21 | 8.66 | 7.95 | 7.40 | — | 8.45 |
| Calder | winter | 10.11 | 9.48 | 9.73 | 8.02 | 7.66 | 8.15 | 8.86 |
| Dorran | spring | 7.88 | 7.35 | 7.61 | 6.90 | 6.42 | 6.75 | 7.15 |
| Elvet | spring | 8.14 | — | 7.92 | 7.21 | 6.88 | 7.03 | 7.44 |
| Fennick | spring | 7.52 | 7.09 | 7.30 | 6.65 | 6.20 | 6.48 | 6.87 |
| Galloway | hybrid | 10.48 | 10.02 | 9.95 | 8.41 | 8.10 | 8.62 | 9.26 |
| Hestia | hybrid | 9.87 | 9.66 | 9.40 | 8.88 | 8.35 | 8.70 | 9.14 |

Means are over the plots harvested. Site soils: see Appendix B.

## Questions an agent should be able to answer

1. What did Calder yield at Brenmoor? — 9.48 t/ha
2. Which variety has the highest mean yield, and what is it? — Galloway, 9.26 t/ha
3. Which plots were lost to flooding? — Brisk at Farley and Elvet at Brenmoor
4. Is Dunhill a lowland or an upland site? — Upland
5. What is Dorran's yield at Elsted? — 6.42 t/ha

The caption, table and note are read in their own upright frame (#306): the body reads them in order
after a `Drawn turned on the page (running up the page), read upright; rotation: 90°` note, layout
table 1 carries `rotation 90°` with every row read along its baseline (questions 1, 2, 3 and 5 come
straight from it), and `rotated_text_read_upright` says the render shows the text turned. Question 4
rests on the group row: `Lowland sites` and `Upland sites` land in the middle column of the three
each one centres over, without a `columnSpan` — the same as the table set upright, so not a rotation
gap.
