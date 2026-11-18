# Annual report page with a line chart, a donut and a stacked bar chart

- **Stresses:** line chart with a value label at every point and series told apart only by colour and dash, two series crossing; donut with percentages in the slices and names only in a legend; 100% stacked bars with a percentage per segment and a legend above
- **Families:** vector-meaning
- **Status:** known-gap

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

**Known gap (no issue yet):** the page has no warning at all, and none of the three charts can be
read without the render.
- Figure 3: the legend (`Red Line Blue Line` / `Green Line`) comes first, then the fifteen values
  sorted top to bottom with the y-axis ticks among them (`58.9` / `60` / `55.4` / `51.7` / `52.3` /
  …); nothing says which line a value is on or which year it is, and the `2025` axis label is
  emitted later, inside Figure 4. Questions 1 and 2 have no answer; `vector_chart_labels` does not
  fire because the chart has no bars.
- Figure 4: the slice percentages come out in an order unrelated to the legend
  (`7%` / `9%` / `38%` / `19%` / `2025` / `27%`) and the legend names follow later, so
  questions 3 and 4 have no answer.
- Figure 5: the body reads each bar's percentages in legend order, which answers question 5, but
  the page's only layout table gives the bars a shifted header: `| Work | School Shopping | Other | | |`
  over `| 2025 | 39% | 20% | 18% | 23% |`, which puts `Work` over the year column and labels
  39% (Work) as `School Shopping`. An agent that trusts the table answers question 5 with 39%.
