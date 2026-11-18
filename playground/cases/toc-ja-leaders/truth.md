# Japanese table of contents (目次) with nested numbering and leaders

- **Stresses:** A4; part headings with no page number; chapters and parenthesised sections at growing indents; dot leaders; page numbers right-aligned under a 頁 column head; labels, leaders and page numbers written as three separate passes
- **Families:** structure, scripts
- **Status:** known-gap

A4 page: the title 目次, the column head 頁 above the page numbers, 18 entries and a note.
Each entry with a page number must be read with its number; part headings (第n部) have none.

刊行にあたって …… 1

**第1部　地域交通の現状**

1. 路線バスの輸送人員の推移 …… 3

　(1) 都市部 …… 4

　(2) 中山間地域 …… 7

2. 鉄道駅の利用状況 …… 11

3. 運転士の年齢構成と確保の課題（注1） …… 15

**第2部　施策の実施状況**

1. デマンド交通の導入事例 …… 21

　(1) 予約型乗合タクシー …… 22

　(2) 自家用有償旅客運送 …… 26

　(3) 貨客混載 …… 29

2. 運賃支援制度の比較 …… 33

3. 交通系ICカードの普及率 …… 38

**第3部　参考資料**

1. 市町村別輸送人員一覧 …… 45

2. 用語の解説 …… 58

3. 調査票（様式第2号） …… 61

（注1）第1部3.の数値は令和7年3月末時点の速報値である。

Then a second list, **図表目次**, set without leaders (label at the left, page number at the right):

図1-1　路線バス輸送人員の推移（平成27年度～令和6年度） …… 3

図1-2　人口密度別のバス停400m圏カバー率 …… 8

表1-3　運転士の年齢階級別構成比 …… 16

表2-1　デマンド交通の運行形態別導入数 …… 21

図2-4　運賃支援の対象者と負担割合 …… 35

表3-1　市町村別輸送人員（令和6年度） …… 45

## Questions an agent should be able to answer

1. 第2部の「2. 運賃支援制度の比較」は何ページから始まるか。 — 33ページ
2. 「(3) 貨客混載」はどの部・どの章に含まれ、何ページか。 — 第2部「1. デマンド交通の導入事例」の節、29ページ
3. 第1部と第3部の両方に「3.」の章がある。それぞれ何ページか。 — 第1部の3.（運転士の年齢構成…）は15ページ、第3部の3.（調査票）は61ページ
4. 用語の解説は何ページにあるか。 — 58ページ
5. 中山間地域の路線バスについての節は何ページから何ページまでか。 — 7ページから（次の項目が11ページなので）10ページまで
6. 「運転士の年齢階級別構成比」の表は何ページにあるか。 — 16ページ（表1-3）

**Known gap (no issue yet):** no entry is read with its page number on one line, and nothing warns.
Each label and its leader come out as one line and the page number as the next paragraph, but the
number column drifts by one row in places: `第1部 地域交通の現状` is followed by `1` (the number of
the line above), `第2部` by `15` and `第3部` by `38`, so a reader pairing "label, then number"
gives part headings page numbers and leaves `3. 運転士の…` and `3. 交通系ICカード…` without one. In the
section groups the labels, then the leaders, then the numbers are emitted as three runs
(`(1) 都市部` / `(2) 中山間地域` / `・・・` / `・・・` / `3` / `4` / `7`), so the pairing rests on
counting. The leaderless 図表目次 is worst: its six labels come out as one block and are followed by
seven numbers, `61` (the last 目次 entry's) then `3 8 16 21 35 45`; read in order, 表1-3 lands on 8
instead of 16, so question 6 is answered wrongly, and questions 1–4 depend on counting lines across
drifted numbers.
