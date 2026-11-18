# Survey page with one tall table

- **Stresses:** about 50 rows × 6 columns with no vertical rules; row-group labels as spanning rows; citation markers in cells; dingbat check/cross column; two-line header
- **Families:** tables, encoding
- **Status:** known-gap

TABLE 3: Statistics of the language models covered by this survey. “Params” is the largest released size; “–” means not disclosed. RLHF marks models whose release notes report reinforcement learning from human feedback.

One table, 49 model rows in two groups, header `Model | Release date | Params (B) |
Pre-train tokens | Context length | RLHF`. The RLHF column is a check mark (✓, ZapfDingbats `a19`)
or a cross (✗, `a23`). Each group label is a spanning row that applies to every row under it.

| Group | Model | Release date | Params (B) | Pre-train tokens | Context length | RLHF |
| --- | --- | --- | ---: | ---: | ---: | :---: |
| Open source | Corvid-7B [12] | Feb-2023 | 7 | 1.0T | 2k | ✗ |
| Open source | Corvid-65B [12] | Feb-2023 | 65 | 1.4T | 2k | ✗ |
| Open source | Heron-13B [15] | Apr-2023 | 13 | 1.2T | 4k | ✗ |
| Open source | Heron-70B [15] | Jul-2023 | 70 | 2.0T | 4k | ✓ |
| Open source | Lumen-7B [18] | May-2023 | 7 | 1.5T | 2k | ✗ |
| Open source | Lumen-40B [18] | Jun-2023 | 40 | 1.0T | 2k | ✗ |
| Open source | Pika-3B [21] | Mar-2023 | 3 | 0.8T | 2k | ✗ |
| Open source | Pika-12B [21] | Apr-2023 | 12 | 0.3T | 2k | ✗ |
| Open source | Marten-176B [23] | Nov-2022 | 176 | 0.4T | 2k | ✗ |
| Open source | Galeo-30B [25] | Jun-2023 | 30 | 1.0T | 8k | ✗ |
| Open source | Tarn-7B [27] | Sep-2023 | 7 | 2.0T | 8k | ✗ |
| Open source | Tarn-8x7B [27] | Dec-2023 | 47 | 2.0T | 32k | ✗ |
| Open source | Sable-34B [30] | Nov-2023 | 34 | 3.0T | 4k | ✓ |
| Open source | Quokka-1.8B [31] | Jan-2024 | 1.8 | 2.2T | 4k | ✗ |
| Open source | Quokka-72B [31] | Feb-2024 | 72 | 3.0T | 32k | ✓ |
| Open source | Wren-2B [33] | Feb-2024 | 2 | 2.0T | 8k | ✗ |
| Open source | Wren-27B [33] | Jun-2024 | 27 | 13T | 8k | ✓ |
| Open source | Heron-3-8B [35] | Apr-2024 | 8 | 15T | 8k | ✓ |
| Open source | Heron-3-405B [35] | Jul-2024 | 405 | 15.6T | 128k | ✓ |
| Open source | Ibis-16B [37] | Mar-2024 | 16 | 12T | 32k | ✗ |
| Open source | Kestrel-236B [39] | May-2024 | 236 | 8.1T | 128k | ✓ |
| Open source | Kestrel-671B [39] | Dec-2024 | 671 | 14.8T | 128k | ✓ |
| Open source | Murre-12B [41] | Jul-2024 | 12 | – | 128k | ✗ |
| Open source | Quokka-2.5-32B [43] | Sep-2024 | 32 | 18T | 128k | ✓ |
| Open source | Plover-14B [45] | Dec-2024 | 14 | 9.8T | 16k | ✗ |
| Open source | Tern-1B [47] | Jan-2025 | 1.2 | 4T | 8k | ✗ |
| Open source | Wren-3-27B [33] | Mar-2025 | 27 | 14T | 128k | ✓ |
| Closed source | Atlas-1 [50] | Jun-2022 | 175 | 0.3T | 2k | ✗ |
| Closed source | Atlas-1.5 [50] | Nov-2022 | – | – | 4k | ✓ |
| Closed source | Atlas-2 [51] | Mar-2023 | – | – | 8k | ✓ |
| Closed source | Atlas-2 Turbo [51] | Nov-2023 | – | – | 128k | ✓ |
| Closed source | Atlas-2o [52] | May-2024 | – | – | 128k | ✓ |
| Closed source | Beacon-1 [54] | Mar-2023 | – | – | 9k | ✓ |
| Closed source | Beacon-2 [54] | Jul-2023 | – | – | 100k | ✓ |
| Closed source | Beacon-3 Opal [55] | Mar-2024 | – | – | 200k | ✓ |
| Closed source | Beacon-3.5 [55] | Jun-2024 | – | – | 200k | ✓ |
| Closed source | Gemma-Pro [57] | Dec-2023 | – | – | 32k | ✓ |
| Closed source | Gemma-Ultra [57] | Feb-2024 | – | – | 1M | ✓ |
| Closed source | Gemma-Flash [58] | May-2024 | – | – | 1M | ✓ |
| Closed source | Ernst-4 [60] | Oct-2023 | – | – | 8k | ✓ |
| Closed source | Pangolin-Σ [62] | Mar-2023 | 1085 | 0.3T | 2k | ✗ |
| Closed source | Jurist-2 [64] | Mar-2023 | 178 | – | 8k | ✗ |
| Closed source | Comet-R [66] | Mar-2024 | 104 | – | 128k | ✓ |
| Closed source | Nimbus-Large [68] | Feb-2024 | – | – | 32k | ✓ |
| Closed source | Nimbus-Large-2 [68] | Jul-2024 | 123 | – | 128k | ✓ |
| Closed source | Grebe-1 [70] | Nov-2023 | 314 | – | 8k | ✗ |
| Closed source | Grebe-2 [70] | Aug-2024 | – | – | 128k | ✓ |
| Closed source | Yarrow-Lightning [72] | Oct-2024 | – | – | 16k | ✓ |
| Closed source | Atlas-3 [52] | Feb-2025 | – | – | 128k | ✓ |

Running head: `A SURVEY OF OPEN AND CLOSED LANGUAGE MODELS, 2022–2026`; page 9.

## Questions an agent should be able to answer

1. What context length and how many pre-training tokens does Heron-3-405B have? — 128k; 15.6T
2. Is Pangolin-Σ open or closed source, and how many parameters does it have? — Closed source; 1085B
3. Which open-source models released in 2023 report RLHF? — Heron-70B, Sable-34B
4. Which reference is cited for Kestrel-671B, and when was it released? — [39], Dec-2024
5. How many models in the table are closed source? — 22

The layout table keeps every model row intact (49 rows, each value under the right
column), so questions 1 and 4 are answerable from it plus the header words in the body. The RLHF
marks decode to ✓ and ✗ (`| Heron-3-405B [35] | Jul-2024 | 405 | 15.6T | 128k | ✓ |`, #275), so
question 3 is answerable from the table too.

**Known gap (no issue yet):**
- The layout table has no header (`C1 … C6`) and drops both group-label rows, so membership is
  only recoverable from the body text, where `Open source` comes after the header words and before
  the open-source model list, and `Closed source` before the first closed-source row. Question 2
  needs that inference; question 5 needs counting.
- The body text reads the open-source half column by column (all models, then all dates, …), as the
  survey reported for the real page, and the closed-source half row by row
  (`Atlas-1 [50]` / `Jun-2022` / `175` / `0.3T` / `2k` / `7`).
