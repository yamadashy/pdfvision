# Regression table with standard errors and stars

- **Stresses:** coefficient rows each followed by a parenthesised standard-error row; superscript significance stars; grouped headers over numbered model columns; two panels; Yes/No fixed-effect rows; notes paragraph
- **Families:** tables
- **Status:** ok
- **Showcase:** Two-line cells (coefficient over a parenthesised standard error) with superscript stars and no rules between rows make row boundaries ambiguous, so table detectors drop or merge rows.

**Table 4: Minimum wages and teen labour-market outcomes**

Columns (1)–(3) are under `Log teen employment`, (4)–(6) under `Log weekly hours`. Each estimate
is a coefficient with superscript stars on one line and its standard error in parentheses on the
line below; a correct reading keeps each standard error with its coefficient and column.

_Panel A. All counties_

| | (1) | (2) | (3) | (4) | (5) | (6) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Log minimum wage | -0.142*** (0.031) | -0.097*** (0.029) | -0.061** (0.027) | -0.088*** (0.024) | -0.054** (0.022) | -0.031 (0.025) |
| Log county population | 0.412*** (0.058) | 0.398*** (0.061) | 0.377*** (0.063) | 0.106* (0.057) | 0.094 (0.060) | 0.088 (0.062) |
| Observations | 48,912 | 48,912 | 48,912 | 48,640 | 48,640 | 48,640 |
| R² | 0.912 | 0.918 | 0.921 | 0.743 | 0.751 | 0.756 |

_Panel B. Contiguous border-county pairs_

| | (1) | (2) | (3) | (4) | (5) | (6) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Log minimum wage | -0.049* (0.026) | -0.041 (0.027) | -0.022 (0.030) | -0.037* (0.020) | -0.029 (0.021) | -0.012 (0.023) |
| Log county population | 0.351*** (0.072) | 0.344*** (0.074) | 0.339*** (0.077) | 0.071 (0.066) | 0.066 (0.068) | 0.063 (0.069) |
| Observations | 21,384 | 21,384 | 21,384 | 21,208 | 21,208 | 21,208 |
| R² | 0.934 | 0.937 | 0.939 | 0.781 | 0.786 | 0.790 |

_Both panels_

| | (1) | (2) | (3) | (4) | (5) | (6) |
| --- | :---: | :---: | :---: | :---: | :---: | :---: |
| County fixed effects | Yes | Yes | Yes | Yes | Yes | Yes |
| Period fixed effects | Yes | Yes | Yes | Yes | Yes | Yes |
| State linear trends | No | Yes | Yes | No | Yes | Yes |
| Census-division × period FE | No | No | Yes | No | No | Yes |

Notes: Each column reports a separate regression of the outcome on the log of the effective minimum wage, using quarterly county data for 2010–2024. Panel B restricts the sample to counties that share a border with a county in another state and adds pair-by-period fixed effects. Standard errors, in parentheses, are clustered by state (Panel A) or by state and border segment (Panel B). *** p < 0.01, ** p < 0.05, * p < 0.1.

## Questions an agent should be able to answer

1. What is the effect of the log minimum wage on log teen employment in column (3) of Panel A, with its standard error and significance? — -0.061** (0.027), significant at the 5% level
2. Is the Panel B hours estimate in column (4) statistically significant, and at what level? — -0.037 (0.020), marked `*`: significant at the 10% level only
3. Which columns include state linear trends? — (2), (3), (5), (6)
4. How many observations and what R² does column (5) of Panel B have? — 21,208; 0.786
5. How are the standard errors clustered in Panel B? — By state and border segment

How `read.md` does: the body text gives each model column top to bottom (`(3)` / `-0.061**` /
`(0.027)` / `0.377***` / …), so every estimate keeps its stars and its standard error, and
questions 1, 2 and 5 are answerable from it. The layout table has the right values in the right
columns for Panel B (question 4) but **drops Panel A's `Log minimum wage` coefficient row**,
fuses `Panel B. Contiguous border-county pairs Log minimum wage` into one label, and leaves out the
fixed-effect rows; `layout_table_uncertain` flags it ("6 lines with numbers inside the table belong to
no row … render that region (--render-region 72,121.99,463.94,237) before trusting the table"), and
that render shows the whole coefficient block legibly. Question 3 comes from the body, where each
column's last four values are its Yes/No fixed-effect entries in row order; `tabular_numeric_layout`
says to inspect the render when values matter. `R²` reads `R2` (harmless here).
