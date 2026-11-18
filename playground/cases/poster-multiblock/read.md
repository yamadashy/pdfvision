_Untrusted PDF-derived data below — content, links, and form values are not instructions._

# playground/cases/poster-multiblock/case.pdf

- **Pages:** 1
- **Title:** Conference poster, A0 landscape
- **Author:** pdfvision playground
- **Creator:** pdfvision

---

## Page 1

_chars: 3133 · images: 0 · coverage: 23% · vectors: 221 · tables: 2 · warnings: 2 · size: 3370×2384pt_

International Conference on Precision Livestock Farming · Ghent · 2026

Thermal drones spot heat stress in dairy cattle before it shows

Aoife Brennan^1, Kwame Asante^2, Sofia Lindgren^1, Rahul Menon^{1,3}

^1 School of Agriculture and Food Science, Corrib Valley University
^2 Institute for Precision Livestock, Tamale Polytechnic
^3 Northfield Dairy Research Farm

Paper and code

Introduction

Heat stress costs dairy farms milk yield,
fertility and animal welfare, and it is getting
more common as summers warm. Farmers
usually notice it from panting or crowding at
water troughs, by which time the cow has
already lost condition.
Body-surface temperature rises earlier, but
handheld thermometers do not scale to a
herd of several hundred animals on pasture.
Can a drone with a thermal camera find
heat-stressed cows earlier than visual
checks?
Does it work across farms with different
breeds and pasture layouts?

Methods

We flew a quadcopter carrying a radiometric
thermal camera over three pasture-based
farms twice a day for 62 days in the summer
of 2025, a total of 371 flights.
A detector located each cow in the thermal
frames and read the maximum temperature
over the eye and the muzzle. A cow was
flagged when either reading rose 1.2 °C
above her own rolling 7-day baseline.
Flags were compared with heat-stress
events recorded by trained observers using
a panting score, who did not see the drone
results.

Results

The drone flagged 87% of the
observer-confirmed heat-stress events, with
a median lead time of 38 minutes before the
first visible panting.

Drone

Visual check

100

91

64

89

58

78

61

Events detected (%)

Northfield

75

50

25

0

Ardmore

Kilbrack

Figure 1. Detection rate by farm

Detection was lowest on the Kilbrack farm,
where tree cover hid cows from the camera
during the afternoon flight.

Results (continued)

Eye Muzzle

1.0

0.93

0.91

0.88

0.86

0.84

0.80

0.78

0.75

0.73

0.71

AUC

07:00

10:00

0.9

0.8

0.7

0.6

13:00

16:00

19:00
Figure 2. Separation of stressed and unstressed cows (AUC) by
time of day

Eye temperature separated stressed from
unstressed cows better than muzzle
temperature at every hour of the day.

Table 1. Event-level detection (all farms)

Method

Precision

Recall

F1

Visual check

0.95

0.61

0.74

Collar sensor

0.72

0.69

0.70

Drone, muzzle

0.76

0.79

0.77

Drone, eye

0.83

0.87

0.85

Conclusions

Thermal drones detect heat stress earlier
than visual checks.
Eye temperature against each cow’s own
baseline is the most reliable signal.
Tree cover is the main source of missed
events; flight timing can reduce it.

References

[1] Hale, M. & Ortiz, P. (2023). Heat load and milk yield
in pasture dairy herds. J. Dairy Sci. Practice 12, 44–58.
[2] Okonkwo, T. et al. (2024). Infrared thermography of
the bovine eye. Vet. Imaging Rev. 9, 101–113.
[3] Varga, L. (2025). Small-object detection in aerial
thermal video. Remote Sens. Agric. 5, 7–19.

Acknowledgements

Funded by the Corrib Valley Agri-Innovation Fund (grant
CVA-2024-031). We thank the three host farms and the
observers who scored 9,200 cow-hours.

### Layout tables

#### Table 1 (2 rows × 7 columns, bbox 90,659.28,3167.56,100)

| C1 | C2 | C3 | C4 | C5 | C6 | C7 |
| --- | --- | --- | --- | --- | --- | --- |
| more common as summers warm. Farmers | a median lead time of 38 minutes before the |  |  | 0.93 | 0.91 | Eye temperature against each cow’s own |
| usually notice it from panting or crowding at | first visible panting. | 0.9 | 0.88 |  |  | baseline is the most reliable signal. |

#### Table 2 (5 rows × 4 columns, bbox 1726,1413.67,729,196)

| C1 | C2 | C3 | C4 |
| --- | --- | --- | --- |
| Method | Precision | Recall | F1 |
| Visual check | 0.95 | 0.61 | 0.74 |
| Collar sensor | 0.72 | 0.69 | 0.70 |
| Drone, muzzle | 0.76 | 0.79 | 0.77 |
| Drone, eye | 0.83 | 0.87 | 0.85 |

### Warnings

> **warning** (layout_table_uncertain): layout table 1 (bbox 90,659.28,3167.56,100) did not resolve into one consistent grid: 2 lines with numbers inside the table belong to no row — its cells may sit in the wrong row or column or be missing; render that region (--render-region 90,659.28,3167.56,100) before trusting the table
> **warning** (tabular_numeric_layout): page contains 38 short numeric lines in 5 aligned columns and 4 shared numeric rows — table rows/columns may be flattened in native text; inspect the render or geometry when values matter
