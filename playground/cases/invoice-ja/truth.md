# Japanese invoice (請求書) with seal and embedded XML

- **Stresses:** CJK key-value header; bordered item table with a wrapped name and a negative line; per-rate tax summary; vector seal over the issuer name; XML attachment
- **Families:** scripts, tables, vector-meaning, interactive
- **Status:** ok

An A4 請求書 from **株式会社みなとテック** to **株式会社さくら商事 御中** (経理部 ご担当者様).
Issuer block: 〒105-0011 / 東京都港区芝公園九丁目8番7号 / みなとビル5階 / TEL 03-0000-1234; 登録番号 `T9999012345678`. A red round seal (vector
outlines, no text) is stamped over the end of the issuer name; it must not hide or garble the name.

- 請求書番号: INV-2026-0412
- 発行日: 2026年10月31日
- お支払期限: 2026年11月30日
- ご請求金額: ¥611,884（税込） — shown large near the top

| 品名 | 数量 | 単位 | 単価 | 金額 |
| --- | ---: | --- | ---: | ---: |
| Webサイト保守サービス（2026年10月分） | 1 | 式 | 120,000 | 120,000 |
| クラウドサーバー利用料 | 3 | 台 | 30,000 | 90,000 |
| 業務システム改修（受発注画面の入力項目追加・帳票レイアウト変更・結合テスト一式） | 1 | 式 | 350,000 | 350,000 |
| 会議用弁当（定例打合せ時） ※ | 12 | 個 | 1,080 | 12,960 |
| ペットボトル飲料（500ml） ※ | 24 | 本 | 150 | 3,600 |
| 値引き（長期契約割引） | 1 | 式 | -20,000 | -20,000 |

The third item name wraps onto two lines inside its cell; a correct reading keeps it one item
(`業務システム改修（受発注画面の入力項目追加・帳票レイアウト変更・結合テスト一式）`), not two rows. Two empty ruled rows follow the items.

| 税率区分 | 対象金額（税抜） | 消費税額 |
| --- | ---: | ---: |
| 10%対象 | 540,000 | 54,000 |
| 8%対象（軽減税率） | 16,560 | 1,324 |

- 小計: 556,560
- 消費税: 55,324
- 合計: 611,884

お振込先: 金融機関 あおば銀行 芝公園支店 / 口座 普通 1234567 / 口座名義 カ）ミナトテック. 備考: ※印は軽減税率（8%）対象品目です。 お振込手数料は貴社にてご負担くださいますようお願い申し上げます。

Embedded file `invoice.xml` (application/xml) carries the same invoice; its totals match the page.

## Questions an agent should be able to answer

1. What is the amount billed, tax included? — ¥611,884
2. When is payment due? — 2026年11月30日
3. How much of the invoice is at the reduced 8% rate, and what is the tax on it? — 16,560 taxable, 1,324 tax
4. What is the issuer's qualified-invoice registration number? — T9999012345678
5. What exactly is billed at 350,000? — 業務システム改修（受発注画面の入力項目追加・帳票レイアウト変更・結合テスト一式）

The wrapped item name comes back whole on its own row (`業務システム改修（受発注画面の入力項目追加・ 帳票レイアウト変更・結合テスト一式）`
on the 350,000 row — the join adds a space at the wrap), so question 5 is answerable
from the layout table; fixed in #251, before which the second line was glued onto the
会議用弁当（定例打合せ時） ※ row.

The item table is read from its drawn cells (#252, #277): it starts at its header row
(`| 品名 | 数量 | 単位 | 単価 | 金額 |`) and holds the six items, and the tax summary comes back as
the two grids it is drawn as (`税率区分 | 対象金額(税抜) | 消費税額` and `小計 | 556,560` …).

The block above the item grid is no longer a table of addresses (#242): the recipient block, the
invoice fields and the issuer's address sit side by side on no shared baselines, so only the fields
come back as a 3 × 2 table (`| 請求書番号 | INV-2026-0412 |`, `| お支払期限 | 2026年11月30日 |`), and
both addresses read in order in the body (`東京都港区芝公園九丁目8番7号` / `みなとビル5階` / `TEL …`).
It used to be a 5 × 5 table with the issuer's address lines swapped, and before that the item
table's first five rows. The page body reads the item table row by row (`クラウドサーバー利用料` / `3` / `台` /
`30,000` / `90,000`); only the wrapped item name's second line comes after its row's values.
It used to list the 金額 column as `120,000 / 350,000 / 90,000`, out of row order. Questions 1–5 are answerable from `read.md`. Full-width punctuation comes back
NFKC-normalised (`（` → `(`, `：` → `:`); that is intended.
