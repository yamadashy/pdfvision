# Conference poster, A0 landscape

- **Stresses:** A0 page; full-width banner over four columns of titled blocks of unequal height; vector charts with text tick labels, legends and value labels; table inside a column; QR-like vector square
- **Families:** reading-order, page-geometry, vector-meaning, tables
- **Status:** known-gap

**Thermal drones spot heat stress in dairy cattle before it shows**

Aoife Brennan^1, Kwame Asante^2, Sofia Lindgren^1, Rahul Menon^1,3 — 1 School of Agriculture and Food Science, Corrib Valley University; 2 Institute for Precision Livestock, Tamale Polytechnic; 3 Northfield Dairy Research Farm. International Conference on Precision Livestock Farming · Ghent · 2026.
A QR-code-like square (vector, no text) at the right of the banner, captioned “Paper and code”.

Reading order: the banner, then each column top to bottom, left to right. Each block's text must
stay inside its block; chart labels belong to their figure.

_Column 1_

**Introduction**

Heat stress costs dairy farms milk yield, fertility and animal welfare, and it is getting more common as summers warm. Farmers usually notice it from panting or crowding at water troughs, by which time the cow has already lost condition.

Body-surface temperature rises earlier, but handheld thermometers do not scale to a herd of several hundred animals on pasture.

- Can a drone with a thermal camera find heat-stressed cows earlier than visual checks?
- Does it work across farms with different breeds and pasture layouts?

**Methods**

We flew a quadcopter carrying a radiometric thermal camera over three pasture-based farms twice a day for 62 days in the summer of 2025, a total of 371 flights.

A detector located each cow in the thermal frames and read the maximum temperature over the eye and the muzzle. A cow was flagged when either reading rose 1.2 °C above her own rolling 7-day baseline.

Flags were compared with heat-stress events recorded by trained observers using a panting score, who did not see the drone results.

_Column 2_

**Results**

The drone flagged 87% of the observer-confirmed heat-stress events, with a median lead time of 38 minutes before the first visible panting.

Figure 1. Detection rate by farm (Events detected (%)):

| Farm | Drone | Visual check |
| --- | ---: | ---: |
| Northfield | 91 | 64 |
| Ardmore | 89 | 58 |
| Kilbrack | 78 | 61 |

Detection was lowest on the Kilbrack farm, where tree cover hid cows from the camera during the afternoon flight.

_Column 3_

**Results (continued)**

Figure 2. Separation of stressed and unstressed cows (AUC) by time of day:

| Series | 07:00 | 10:00 | 13:00 | 16:00 | 19:00 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Eye | 0.84 | 0.88 | 0.93 | 0.91 | 0.86 |
| Muzzle | 0.71 | 0.75 | 0.80 | 0.78 | 0.73 |

Eye temperature separated stressed from unstressed cows better than muzzle temperature at every hour of the day.

Table 1. Event-level detection (all farms):

| Method | Precision | Recall | F1 |
| --- | ---: | ---: | ---: |
| Visual check | 0.95 | 0.61 | 0.74 |
| Collar sensor | 0.72 | 0.69 | 0.70 |
| Drone, muzzle | 0.76 | 0.79 | 0.77 |
| Drone, eye | 0.83 | 0.87 | 0.85 |

_Column 4_

**Conclusions**

- Thermal drones detect heat stress earlier than visual checks.
- Eye temperature against each cow’s own baseline is the most reliable signal.
- Tree cover is the main source of missed events; flight timing can reduce it.

**References**

[1] Hale, M. & Ortiz, P. (2023). Heat load and milk yield in pasture dairy herds. J. Dairy Sci. Practice 12, 44–58.

[2] Okonkwo, T. et al. (2024). Infrared thermography of the bovine eye. Vet. Imaging Rev. 9, 101–113.

[3] Varga, L. (2025). Small-object detection in aerial thermal video. Remote Sens. Agric. 5, 7–19.

**Acknowledgements**

Funded by the Corrib Valley Agri-Innovation Fund (grant CVA-2024-031). We thank the three host farms and the observers who scored 9,200 cow-hours.

## Questions an agent should be able to answer

1. What precision, recall and F1 does the eye-temperature drone method reach? — 0.83, 0.87, 0.85
2. Which farm had the lowest drone detection rate, and why? — Kilbrack (78%); tree cover hid cows during the afternoon flight
3. How much earlier than visible panting did the drone flag heat stress? — A median of 38 minutes
4. What eye-temperature AUC does Figure 2 show at 13:00? — 0.93
5. Which institution is Kwame Asante affiliated with, and who funded the work? — Institute for Precision Livestock, Tamale Polytechnic; the Corrib Valley Agri-Innovation Fund (grant CVA-2024-031)

Questions 1, 3 and 5 are answerable from `read.md`; question 2's farm and reason come from the
prose (`Detection was lowest on the Kilbrack farm, where tree cover…`).

The only layout table is Table 1 exactly, header row included (`| Method | Precision | Recall | F1 |`,
`| Visual check | 0.95 | 0.61 | 0.74 |`): its rules bound it, so the Methods and Acknowledgements
prose beside it stays out (#252), and the label that row grouping had given to the prose is put
back on its row. Question 1 is answered from it.

Two lines of each poster column read across as a 2 × 7 table of prose and chart labels are no
longer reported as a table (#242): every row holds running text and it straddles the columns' gutters.

**Known gap (no issue yet):**
- The four poster columns are read one after another, each panel whole, and Table 1 reads row by row
  in the body (`Visual check` / `0.95` / `0.61` / `0.74`). The charts' labels stay inside their
  panel, but no warning names the figures (only the generic `tabular_numeric_layout`): Figure 2's
  values come row by row from the top (`1.0` / `0.93` / `0.91` / `0.88` / …), with the time axis
  after them, so question 4 (0.93 for Eye at 13:00) cannot be attributed. Figure 1's plot is read bar by
  bar after its legend `Drone` / `Visual check`: `100` (the top tick), then each farm's pair
  `91` / `64`, `89` / `58`, `78` / `61`, with the farm names after the axis ticks; the
  Kilbrack drone rate (78%) is recoverable by position (third pair, first of the legend), not by label.

The widely justified first line of Results reads as one line (`The drone flagged 87% of the`, #268):
the line below fills the same measure, so its stretched spaces are word spaces, not gutters.
