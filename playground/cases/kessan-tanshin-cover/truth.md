# Japanese interim earnings summary (決算短信) cover page

- **Stresses:** A4; title faked bold by overdrawing the same text five times; two-column label/value block; bordered results tables with △ negatives, ％ rows and ― placeholders; one letter-spaced justified line in a paragraph
- **Families:** encoding, scripts, tables, structure
- **Status:** ok

Dated 2026年11月14日. Title (overdrawn five times to fake bold; a correct reading has it once):

**2027年3月期 第2四半期（中間期）決算短信〔日本基準〕（連結）**

Company block (label → value):

- 上場会社名　株式会社ミナミ精機　／　上場取引所　東
- コード番号　6789　／　URL　https://www.minami-seiki.example
- 代表者　（役職名）代表取締役社長　（氏名）山本 健一
- 問合せ先責任者　（役職名）取締役経理部長　（氏名）佐藤 由美　／　TEL　06-0000-1234
- 半期報告書提出予定日　2026年11月13日　／　配当支払開始予定日　2026年12月5日
- 決算補足説明資料作成の有無　有
- 決算説明会開催の有無　有（機関投資家・アナリスト向け）

（百万円未満切捨て）

**1. 2027年3月期第2四半期（中間期）の連結業績（2026年4月1日～2026年9月30日）**

(1) 連結経営成績（累計）（％表示は対前年同四半期増減率）

| | 売上高 百万円 | 売上高 ％ | 営業利益 百万円 | 営業利益 ％ | 経常利益 百万円 | 経常利益 ％ | 親会社株主に帰属する中間純利益 百万円 | 親会社株主に帰属する中間純利益 ％ |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2027年3月期中間期 | 48,215 | 5.2 | 3,104 | △12.4 | 3,380 | △9.8 | 2,215 | △15.1 |
| 2026年3月期中間期 | 45,832 | 8.9 | 3,543 | 21.0 | 3,748 | 18.7 | 2,609 | 24.3 |

（注）包括利益　2027年3月期中間期　1,904百万円（△38.5％）　2026年3月期中間期　3,096百万円（30.2％）

| | 1株当たり中間純利益 円 銭 | 潜在株式調整後1株当たり中間純利益 円 銭 |
| --- | ---: | ---: |
| 2027年3月期中間期 | 85.42 | 85.10 |
| 2026年3月期中間期 | 100.63 | 100.21 |

(2) 連結財政状態

| | 総資産 百万円 | 純資産 百万円 | 自己資本比率 ％ |
| --- | ---: | ---: | ---: |
| 2027年3月期中間期 | 98,450 | 61,230 | 61.8 |
| 2026年3月期 | 97,112 | 60,104 | 61.4 |

（参考）自己資本　2027年3月期中間期　60,842百万円　2026年3月期　59,620百万円

**2. 配当の状況** — 年間配当金（円 銭）

| | 第1四半期末 | 第2四半期末 | 第3四半期末 | 期末 | 合計 |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2026年3月期 | ― | 30.00 | ― | 35.00 | 65.00 |
| 2027年3月期 | ― | 32.00 |  |  |  |
| 2027年3月期（予想） |  |  | ― | 33.00 | 65.00 |

（注）直近に公表されている配当予想からの修正の有無：無

※ 業績予想の適切な利用に関する説明、その他特記事項

本資料に記載されている業績見通し等の将来に関する記述は、当社が現在入手している情報及び合理的であると判断する一定の前提に基づいており、詳細は当社ウェブサイト（https://www.minami-seiki.example/ir/）に掲載の決算補足説明資料をご覧ください。実際の業績等は様々な要因により大きく異なる可能性があります。

(Line 2 of that paragraph, `ると判断する一定の前提に基づいており、詳細は当社ウェブサイト`, is set with each character placed
individually across the full measure; it reads without spaces.) △ means a negative value.

## Questions an agent should be able to answer

1. Which company is this, and what is its securities code? — 株式会社ミナミ精機, 6789
2. What was interim operating profit, and how did it change year on year? — 3,104百万円, △12.4％ (a 12.4% decrease)
3. When does the dividend payment start, and what is the full-year dividend forecast? — 2026年12月5日; 65.00円 (中間 32.00円 + 期末予想 33.00円)
4. Who should be contacted about the report? — 取締役経理部長 佐藤 由美, TEL 06-0000-1234
5. Which fiscal period and accounting standard does the report cover? — 2027年3月期 第2四半期（中間期）, 日本基準, 連結

The overdrawn title reads once, `2027年3月期 第2四半期(中間期)決算短信〔日本基準〕(連結)` (#267), which
answers question 5, and the justified line reads `ると判断する一定の前提に基づいており、詳細は当社ウェブサイト`
(#268), so 「判断する」 and 「当社ウェブサイト」 can be searched.

The page body reads each company label with its value (`コード番号 6789 URL https://www.minami-seiki.example`,
#301), and a layout table pairs them as cells
(`| 問合せ先責任者 | (役職名)取締役経理部長 (氏名)佐藤 由美 | … | TEL | 06-0000-1234 |`), so questions 1
and 4 are answered from it. The results, balance-sheet and dividend tables are read from their
ruled grids (#277): the results table has its item names (`売上高 | | 営業利益 | | 経常利益 | | 親会社株主に帰属 する中間純利益`,
#253) above its units row, and `3,104` and `△12.4` are separate cells
(`| 2027年3月期中間期 | 48,215 | 5.2 | 3,104 | △12.4 | 3,380 |…`), so question 2 reads the change from
the % column; the dividend table keeps its `―` placeholders (question 3). Each item name sits on
the first of the two columns under it.
