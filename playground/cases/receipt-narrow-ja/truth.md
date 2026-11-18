# Supermarket receipt (レシート) on a 58 mm page

- **Stresses:** 164 × 640 pt page; item names left and prices right-aligned to the edge; ※ marks for reduced-rate items; quantity × unit-price lines under items; a discount applied to the line above; large total; per-rate taxable amounts and included tax; cash and change; vector barcode
- **Families:** page-geometry, scripts, tables
- **Status:** ok

One 164 × 640 pt page (58 mm wide). Store: まるみ屋 青葉台店, 2026年11月15日(土) 18:42, レジ03.

| Item | Qty × unit | Price | Rate |
| --- | --- | ---: | --- |
| ※国産若鶏もも肉 |  | ¥498 | 8% |
| ※たまご10コ |  | ¥258 | 8% |
| ※ほうれん草 | 2コ × 単158 | ¥316 | 8% |
| 食器用洗剤 詰替 |  | ¥328 | 10% |
| ※ミネラルウォーター2L | 3コ × 単98 | ¥294 | 8% |
| ゴミ袋45L 20枚 |  | ¥248 | 10% |
| ※食パン6枚切 |  | ¥178 | 8% |
| 値引（タイムセール） (on 国産若鶏もも肉) | | -100 | 8% |

小計 ¥2,120, 合計 **¥2,020** (10点). 8%対象 ¥1,444（内消費税 ¥106）,
10%対象 ¥576（内消費税 ¥52）. お預り ¥3,000, お釣り ¥980.
※印は軽減税率（8%）対象商品です。

## Questions an agent should be able to answer

1. 合計金額はいくらか。 — ¥2,020
2. ミネラルウォーターはいくつ買い、いくら払ったか。 — 3本（単価98円）、¥294
3. 値引はどの商品に、いくら適用されたか。 — 国産若鶏もも肉に100円
4. 軽減税率（8%）の対象でない商品はどれか。 — 食器用洗剤 詰替、ゴミ袋45L 20枚
5. 8%対象の消費税額とお釣りはいくらか。 — 内消費税 ¥106、お釣り ¥980

**Reads correctly, with a fragile totals block:** the item lines come out in order, each name followed
by its price, the quantity line under its item and the discount right after the chicken
(`※国産若鶏もも肉` / `¥498` / `値引(タイムセール)` / `-100`), so questions 2–4 are answered directly.
The totals block is read as two runs, eight labels (`小計` / `合計 10点` / `(8%対象` / `(内消費税` /
… / `お釣り`) and then eight amounts (`¥2,120` / `¥2,020` / `¥1,444)` / `¥106)` / …), so questions 1
and 5 are answered by pairing the two runs in order; they line up one to one, and the closing
parentheses on the per-rate amounts help, but nothing but order ties `(内消費税` (twice) to `¥106)`
and `¥52)`.
