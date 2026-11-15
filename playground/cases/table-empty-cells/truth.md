# Table with empty cells under grouped headers

- **Stresses:** column assignment when a row leaves value cells empty; two-level header with centred group labels
- **Status:** ok

The page holds one caption paragraph and one table of 7 data rows.
Every value belongs to the column it is drawn under; an empty cell stays empty
and must not pull the values to its right one column left.

Column groups: **BLEU** spans the first two value columns,
**Training Cost (EFLOPs)** the last two.

| Model | BLEU EN-DE | BLEU EN-FR | Training Cost (EFLOPs) EN-DE | Training Cost (EFLOPs) EN-FR |
| --- | ---: | ---: | ---: | ---: |
| ByteNet | 23.75 |  |  |  |
| Deep-Att + PosUnk |  | 39.2 |  | 100 |
| GNMT + RL | 24.6 | 39.92 | 23 | 140 |
| ConvS2S | 25.16 | 40.46 | 9.6 | 150 |
| MoE | 26.03 | 40.56 | 20 | 120 |
| Transformer (base model) | 27.3 | 38.1 | 3.3 |  |
| Transformer (big) | 28.4 | 41.8 | 23 |  |
