# Results page whose symbol font maps signs to the wrong characters

- **Stresses:** minus, <, >, ±, × and = set in a symbol font whose ToUnicode CMap lies; signs inside prose and in an effect-size table with p-values
- **Families:** encoding, tables
- **Status:** known-gap

Page 419 of *Journal of Community Health Outcomes* (Vol. 14, No. 6 · June 2009), running head “Nurse-Led Remote Monitoring in Type 2 Diabetes”. A **Results** section:
two paragraphs, Table 2, two more paragraphs.

Every sign on the page (−, <, >, ±, ×, =) is drawn from a separate symbol font whose
ToUnicode map says something else (`−` → `2`, `<` → `,`, `>` → `.`, `±` → `þ`, `×` → `3`, `=` → `¼`). The page shows the signs correctly; a correct reading reports
what the page shows, or at least flags that the signs cannot be trusted.

Of 1,024 patients screened, 810 were randomised (Fig 1): 412 to remote monitoring and 398 to usual care. Baseline characteristics were balanced between arms (Table 1); mean age was 61.3 ± 9.8 years and mean diabetes duration 8.2 ± 5.1 years.

At 12 months, HbA1c was lower in the remote-monitoring arm (difference −0.5 percentage points, 95% CI −0.7 to −0.3; p < 0.001; Table 2). Hospital admissions fell by 52% relative to usual care (−52%, p < 0.001), whereas emergency visits were essentially unchanged (−2%, p = 0.91).

**Table 2. Primary and secondary outcomes at 12 months.**

| Outcome | Remote monitoring (n = 412) | Usual care (n = 398) | Change | p |
| --- | ---: | ---: | ---: | ---: |
| HbA1c at 12 months, % | 7.1 ± 0.9 | 7.6 ± 1.1 | −0.5 | <0.001 |
| Systolic BP, mmHg | 131 ± 14 | 134 ± 15 | −3 | 0.03 |
| Weight change, kg | −2.4 ± 3.1 | +0.3 ± 2.8 | −2.7 | 0.004 |
| Hospital admissions, n (%) | 38 (9%) | 79 (20%) | −52% | <0.001 |
| Emergency visits, n (%) | 61 (15%) | 64 (16%) | −2% | 0.91 |
| Adverse events, n (%) | 22 (5%) | 19 (5%) | +11% | 0.62 |
| Sites with >25 patients, n (%) | 9 (64%) | 8 (57%) | +7% | 0.71 |

Values are mean ± SD or n (%). Change is the difference in means, or the relative change in proportions. Insulin doses were titrated in steps of 2 × 2 IU. BP, blood pressure.

The effect on HbA1c was consistent across sites with >25 patients and smaller sites (interaction p = 0.48). Adverse events did not differ between arms (+11%, p = 0.62); no event was judged related to the intervention.

In a per-protocol analysis restricted to patients who transmitted readings on >80% of days (n = 351), the HbA1c difference was −0.6 percentage points (p < 0.001).

## Questions an agent should be able to answer

1. How did hospital admissions change with remote monitoring, and was it significant? — They fell by 52% (−52%), p < 0.001
2. What was mean HbA1c at 12 months in each arm? — 7.1 ± 0.9% with remote monitoring, 7.6 ± 1.1% with usual care
3. How many patients were randomised to usual care? — 398
4. Did weight go up or down in the remote-monitoring arm? — Down: −2.4 ± 3.1 kg (usual care +0.3 ± 2.8 kg)
5. Which outcomes reached p < 0.001? — HbA1c and hospital admissions

How the lies read when taken at face value: `252%` for −52%, `,0.001` for <0.001,
`7.1 þ 0.9` for 7.1 ± 0.9, `(n ¼ 398)` for (n = 398), `22.4` for −2.4.

**Known gap (no issue yet):** `read.md` reports every sign as its CMap claims, and no warning
mentions the font. The prose reads `Hospital admissions fell by 52% relative to usual care (252%, p , 0.001)`
and `emergency visits were essentially unchanged (22%, p 1⁄4 0.91)`; the table row reads
`| Hospital admissions, n (%) | 38 (9%) | 79 (20%) | 252% | ,0.001 |`. So question 1 gets “252%”
(an increase), question 4 gets `22.4 þ 3.1`, and “<” and “>” become `,` and `.`
(`Sites with .25 patients`). Questions 3 and 5 survive only by reading `,0.001` as “<0.001”.
`=` comes out as `1⁄4` (¼ after normalisation), exactly the survey's `z 1⁄4 0.09`.

The table also carries `layout_table_uncertain` — its first three rows lose their label and
first value (`|  |  | 7.6 þ 1.1 | 20.5 | ,0.001 |`) — and says to render the table region,
which would happen to show the true signs there; nothing covers the prose, which is where
question 1 is usually answered.
