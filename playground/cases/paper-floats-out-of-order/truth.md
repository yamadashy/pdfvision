# Journal first page with floats out of stream order

- **Stresses:** metadata sidebar column; title block drawn last in the content stream; table and figure floated to column tops but written after the body; footer line under the sidebar
- **Families:** reading-order, structure
- **Status:** known-gap

Visual reading order: journal header, **title**, authors, affiliations, abstract, then the
sidebar (left), then the main columns — Table 1 (top of the left body column), the body of the
left column, Figure 1 (top of the right body column) and the rest of the body. The content
stream is in a different order on purpose: body text first, then Figure 1, then Table 1, then
the sidebar, the abstract, and the title block last.

- Journal: Journal of Occupational Microbiome Research — RESEARCH ARTICLE
- Title: Night-shift work and gut microbial diversity: a cross-sectional study of hospital staff
- Authors: Lena Marwick^1, Osei Bannerman^1,2, Priya Ramaswamy^2, Jonas Feldt^1*
- Affiliations: 1 Institute of Occupational Health, Ravelin University Medical Centre, Ravelin, Norway; 2 Department of Microbiology, Kestrel Bay Hospital, Kestrel Bay, Ireland; correspondence * jonas.feldt@ravelin.example.no

Abstract: Circadian disruption alters host metabolism, but its association with the gut microbiome in working adults is poorly characterised. We sequenced stool samples from 410 nurses and porters at two hospitals, 198 of whom had worked rotating night shifts for at least two years. Night-shift workers had lower alpha diversity than day-shift colleagues (mean Shannon index 3.41 versus 3.87) after adjustment for age, sex, diet score and antibiotic use in the preceding year. The difference grew with years of night work and was not explained by sleep duration alone. These findings support including shift pattern as a covariate in microbiome studies of working populations.

Sidebar:

- **Citation:** Marwick L, Bannerman O, Ramaswamy P, Feldt J (2026) Night-shift work and gut microbial diversity: a cross-sectional study of hospital staff. J Occup Microbiome Res 14(3): e0312.
- **Editor:** Tamsin Achterberg, Leiden Centre for Infection Biology, NETHERLANDS
- **Received:** May 4, 2026
- **Accepted:** August 19, 2026
- **Published:** September 30, 2026
- **Copyright:** © 2026 Marwick et al. This is an open access article distributed under the terms of a Creative Commons Attribution licence, which permits unrestricted use and reproduction provided the original authors are credited.
- **Data Availability:** Sequence reads are deposited under accession PRJ-OMR-55821.
- **Funding:** This work was funded by the Nordic Shift Health Foundation (grant NSHF-2024-117 to JF). The funder had no role in study design or analysis.
- **Competing interests:** The authors have declared that no competing interests exist.

Table 1. Characteristics of participants by shift pattern.

| Characteristic | Day shift (n = 212) | Night shift (n = 198) | p |
| --- | ---: | ---: | ---: |
| Age, years, mean (SD) | 41.2 (9.8) | 38.6 (8.9) | 0.006 |
| Female, n (%) | 163 (76.9) | 149 (75.3) | 0.70 |
| BMI, kg/m², mean (SD) | 25.1 (3.9) | 26.4 (4.2) | 0.001 |
| Sleep, h/day, median | 7.1 | 6.2 | <0.001 |
| Diet quality score | 61 (12) | 57 (13) | 0.002 |
| Antibiotics past year, n (%) | 31 (14.6) | 33 (16.7) | 0.57 |

SD, standard deviation; BMI, body mass index.

Fig 1. Mean Shannon diversity index by shift exposure. Night-shift workers are split by years of night work. Error bars show 95% confidence intervals. Bar values (text labels on the bars): Day shift 3.87, Night < 5 y 3.58, Night ≥ 5 y 3.24.

Body, in order:

**Introduction**

Shift work is common in health care, and roughly one in five hospital employees in Northern Europe works a rotating pattern that includes nights. Disrupted circadian rhythm has been linked to weight gain, impaired glucose tolerance and gastrointestinal complaints, and animal studies suggest that the gut microbiota follows a daily cycle of its own that is entrained by feeding time.

Human evidence is thinner. Small studies of airline crews and military personnel reported shifts in community composition after short periods of jet lag or sleep restriction, but few have examined workers exposed to night shifts over years, and fewer still have adjusted for diet, which differs systematically between shift patterns.

We therefore compared stool microbial diversity between day-shift and night-shift staff at two hospitals, and asked whether any difference scaled with cumulative years of night work.

**Methods**

**Study population**

Nurses, healthcare assistants and porters aged 25 to 60 years were invited between January and June 2025. Night-shift workers were eligible if they had worked at least four night shifts a month for the previous two years. Exclusion criteria were inflammatory bowel disease, pregnancy, and antibiotic use in the eight weeks before sampling.

**Sample collection and sequencing**

Participants collected a stool sample at home within 48 hours of a day off and returned it by courier on ice packs. DNA was extracted with a bead-beating protocol and the V4 region of the 16S rRNA gene was sequenced on a paired-end platform.

**Statistical analysis**

Alpha diversity was summarised by the Shannon index on rarefied counts. Differences between shift groups were estimated by linear regression adjusted for age, sex, body mass index, diet quality score and antibiotic use in the past year. Years of night work were analysed in two bands, under five years and five years or more.

Footer: `Journal of Occupational Microbiome Research | https://doi.org/10.5555/jomr.0312  September 30, 2026  1 / 11`.

## Questions an agent should be able to answer

1. What is the article's title? — Night-shift work and gut microbial diversity: a cross-sectional study of hospital staff
2. When was the article accepted, and who was the academic editor? — August 19, 2026; Tamsin Achterberg
3. Who funded the study? — Nordic Shift Health Foundation (grant NSHF-2024-117)
4. What median daily sleep did night-shift workers report (Table 1)? — 6.2 h (day shift 7.1 h, p <0.001)
5. What Shannon index does Figure 1 show for workers with five or more years of night shifts? — 3.24

Questions 1, 2, 3 and 5 are answerable from `read.md`: the title is moved to the top despite
being last in the stream, every sidebar label keeps its value, and each bar value sits just
before its group label (`3.24` / `Night ≥ 5 y`).

Lines no longer cross the narrow gaps between the sidebar and the body or between the two body
columns (#273): the Introduction's second line `one in five hospital employees in Northern Europe`
stays in its sentence, and the left column is read whole, `Introduction` through `…invited
between January and`, before the right column.

**Known gap (no issue yet):** `reading_order_divergence` fires on the title and says "the body
above is that reading order, rebuilt from the layout", but the rebuilt body is still wrong
around the abstract and the floats:
- The sidebar is interleaved with the abstract line by line (`Circadian disruption … in working` /
  `diversity: a cross-sectional study of` / `adults is poorly characterised. …`).
- Table 1 is not detected as a table: its row labels come first, then the values column by column
  (`41.2 (9.8)` / `163 (76.9) 149 (75.3)` / `25.1 (3.9)` / `7.1` / `61 (12)` / `38.6 (8.9)` / …),
  with the first two value columns partly fused and the left column's text between the labels and
  the values. Question 4 is answerable only by counting positions in each value list (the fourth
  value of each column), which an agent cannot do safely when `163 (76.9) 149 (75.3)` shares a line.
- The right column is read after Table 1's values and the figure (#274), so the sentence
  `…invited between January and` / `June 2025. Night-shift workers were eligible…` is cut by
  Table 1's values, the footer date `September 30, 2026`, the axis ticks and the caption.
