# Statistical release table with a figure font that has no ToUnicode

- **Stresses:** landscape; two-level header with a change group; units line; indented stub rows; `*` and `Z` marks; every numeral in a subset font with its ToUnicode CMap removed
- **Families:** encoding, tables, page-geometry
- **Status:** ok
- **Showcase:** The figure font has no ToUnicode map, so every value extracts as raw glyph indices while the page renders perfectly and the labels around the values extract normally.

Table A-2. Households and Median Household Income by Selected Characteristics: 2025 and 2026

(Numbers in thousands. Income in 2026 dollars. Households as of March of the following year. For information on confidentiality protection, sampling error, and definitions, see the technical notes.)

Every numeral inside the table — values, the `65`/`15 to 24` in the age labels, the years
in the header — is drawn in a figure font embedded without a ToUnicode map, so its text is
not recoverable from the file; the page renders correctly. Title, units line, labels
and notes are in Helvetica. A correct reading either recovers the values (from the render or
OCR) or says plainly that they cannot be read from the text layer.

| Characteristic | 2025 Number | 2025 Median income Estimate | 2025 Median income MOE (±) | 2026 Number | 2026 Median income Estimate | 2026 Median income MOE (±) | Change Estimate (%) | Change MOE (±) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| All households | 132,216 | 80,610 | 820 | 133,489 | 81,940 | 710 | *1.6 | 1.2 |
| **Type of Household** |  |  |  |  |  |  |  |  |
|   Family households | 85,012 | 104,250 | 1,040 | 85,640 | 105,380 | 980 | 1.1 | 1.3 |
|     Married-couple | 62,410 | 122,870 | 1,150 | 62,795 | 124,410 | 1,210 | 1.3 | 1.4 |
|     Female householder, no spouse present | 15,206 | 56,030 | 1,320 | 15,388 | 55,170 | 1,410 | −1.5 | 3.3 |
|     Male householder, no spouse present | 7,396 | 80,480 | 2,010 | 7,457 | 80,480 | 2,240 | Z | 3.6 |
|   Nonfamily households | 47,204 | 47,060 | 640 | 47,849 | 48,310 | 700 | *2.7 | 2.0 |
| **Age of Householder** |  |  |  |  |  |  |  |  |
|   Under 65 years | 94,820 | 95,140 | 930 | 94,912 | 97,010 | 880 | *2.0 | 1.3 |
|     15 to 24 years² | 6,388 | 52,950 | 2,300 | 6,301 | 53,460 | 2,410 | 1.0 | 6.3 |
|     25 to 34 years | 21,512 | 89,200 | 1,480 | 21,644 | 91,080 | 1,520 | 2.1 | 2.4 |
|     35 to 44 years | 22,975 | 110,430 | 1,690 | 23,210 | 112,980 | 1,620 | *2.3 | 2.0 |
|     45 to 54 years | 21,384 | 115,120 | 1,830 | 21,206 | 116,050 | 1,910 | 0.8 | 2.3 |
|     55 to 64 years | 22,561 | 90,740 | 1,510 | 22,551 | 91,310 | 1,560 | 0.6 | 2.4 |
|   65 years and older | 37,396 | 56,680 | 840 | 38,577 | 55,990 | 760 | −1.2 | 2.0 |
| **Region** |  |  |  |  |  |  |  |  |
|   Northeast | 23,108 | 86,520 | 1,620 | 23,240 | 87,110 | 1,700 | 0.7 | 2.7 |
|   Midwest | 28,031 | 77,810 | 1,190 | 28,190 | 79,640 | 1,240 | *2.4 | 2.1 |
|   South | 51,407 | 73,940 | 960 | 52,076 | 75,020 | 890 | 1.5 | 1.7 |
|   West | 29,670 | 89,350 | 1,380 | 29,983 | 90,060 | 1,420 | 0.8 | 2.1 |

* An asterisk following the percent change indicates that the change is statistically different from zero at the 90 percent confidence level.
Z Represents or rounds to zero.
¹ A margin of error (MOE) is a measure of an estimate’s variability. The larger the MOE in relation to the size of the estimate, the less reliable the estimate.
² Householders aged 15 to 24 years are shown separately because their estimates are less reliable.

Source: Office for Household Statistics, Annual Social and Economic Survey, 2026 and 2027 releases.

## Questions an agent should be able to answer

1. What was median household income for all households in 2026, and its margin of error? — $81,940 ± 710
2. Did real median income change significantly for householders 65 years and older? — No: −1.2% with MOE 2.0, no asterisk
3. Which household types and age groups had a statistically significant increase? — All households, nonfamily households, under 65 years, 35 to 44 years (and the Midwest region)
4. How many households (in thousands) had a householder under 65 in 2026? — 94,912
5. What does `Z` mean in the male-householder row? — The change represents or rounds to zero

**Current reading (ok — the warning carries it):** `read.md` keeps the title, units line, labels
and notes, but every figure-font run is gone: the values are dropped as non-printable glyph
indices, the age labels lose their numbers (`Under years`, `to years^2`, `years and older`),
the change-group header reads `income (` / `less` / `)`, and only the `*` marks and `Z` survive,
detached from their rows. No question is answerable from the text, and none is answered
*wrongly*: the page header carries `nonPrint: 26% (552)` and `native: mixed_glyph_indices`, and
`glyph_garbage_text` says “inspect the render or run OCR before trusting extracted text”. The
render is exact, so an agent that follows the warning answers all five.
