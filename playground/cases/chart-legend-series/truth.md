# Annual report page with a line chart, a donut and a stacked bar chart

- **Stresses:** line chart with a value label at every point and series told apart only by colour and dash, two series crossing; donut with percentages in the slices and names only in a legend; 100% stacked bars with a percentage per segment and a legend above
- **Families:** vector-meaning
- **Status:** ok
- **Showcase:** Series identity is only colour: two lines cross, the donut keeps its names in a legend beside it, and the stacked bars put their legend over the bars where a table reader takes it for a header.

One Letter page: a heading, an intro paragraph and three charts. The values the charts show:

**Figure 3. Average weekday boardings by line (thousands)**, a line chart; each point carries its value
in the line's colour; the legend says Red Line (solid), Blue Line (dashed), Green Line (dotted).

| Line | 2021 | 2022 | 2023 | 2024 | 2025 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Red Line | 41.2 | 46.8 | 49.5 | 50.1 | 52.3 |
| Blue Line | 35.0 | 42.1 | 51.7 | 55.4 | 58.9 |
| Green Line | 22.4 | 24.0 | 23.1 | 26.8 | 27.5 |

**Figure 4. Fare payment method, 2025 (share of trips)**, a donut; the percentages sit in the slices and
the names only in the legend, matched by colour:

| Method | Share |
| --- | ---: |
| Contactless bank card | 38% |
| Transit app | 27% |
| Monthly pass | 19% |
| Cash | 9% |
| Paper ticket | 7% |

**Figure 5. Trip purpose (share of weekday trips)**, 100% stacked horizontal bars, one per year,
segments in legend order:

| Year | Work | School | Shopping | Other |
| --- | ---: | ---: | ---: | ---: |
| 2023 | 46% | 18% | 15% | 21% |
| 2024 | 43% | 19% | 17% | 21% |
| 2025 | 39% | 20% | 18% | 23% |

## Questions an agent should be able to answer

1. How many average weekday boardings did the Blue Line carry in 2023? — 51.7 thousand
2. In which year did the Blue Line first carry more riders than the Red Line? — 2023 (51.7 vs 49.5)
3. What share of 2025 trips was paid with the transit app? — 27%
4. Which payment method accounts for 9% of trips? — Cash
5. What share of weekday trips in 2025 were for school? — 20%

Fixed in #302: `### Chart values` pairs every value with its series through colour — the legend
swatch's colour is the line's, the slice's or the bar segment's the value is set on.
- Figure 3: a series × year grid (`| Blue Line | 35.0 | 42.1 | 51.7 | 55.4 | 58.9 |`); where two
  series' points crowd, the label's own text colour decides, so questions 1 and 2 are answered.
- Figure 4: `Transit app | 27%`, `Cash | 9%` (questions 3 and 4); the `2025` in the hole is on no slice.
- Figure 5: `| School | 18% | 19% | 20% |` under the years (question 5). The layout table no longer
  takes the legend row as its header: it is the three year rows, `| 2025 | 39% | 20% | 18% | 23% |`.

Every label on the three charts pairs, so `vector_chart_labels` is not raised. The body still lists
Figure 3's values top to bottom with the axis ticks among them, and puts the `2025` axis label
inside Figure 4; the chart values do not depend on that order.
