---
title: "MCP 伺服器"
description: "設定與呼叫 MCP 伺服器：三個工具、回應預算、ref，以及它與 CLI 的差異。只有在沒有 shell 的主機環境下才需要用到。"
sourceHash: 09ac8a401dcc
---

<!-- Translated from docs/src/en/guide/mcp-server.md, which is generated from docs/cli-topics/mcp.md.
     Translate the prose, keep code, field names, flags, and warning codes verbatim, and update
     `sourceHash` to the value reported by `node scripts/build-site-reference.mjs`. -->

# MCP 伺服器參考

`pdfvision mcp` 透過 stdio 以 Model Context Protocol 提供相同的擷取功能。只有在被要求**為其他主機設定 pdfvision**，或你自己正透過 MCP 工具而非 shell 操作時，才需要閱讀本頁。

**如果你有 shell 可用，請使用 CLI。** 以下內容都是建立在相同 `core/` 程式碼之上的較窄介面，而且 MCP 工具的 schema 會在整個 session 期間佔用主機的 context——CLI 加上這份 skill 在被實際使用之前不會佔用任何成本。本頁存在的原因，是因為「把 pdfvision 安裝進 Claude Desktop／Cursor／Cline／Zed／n8n」可能是交給你的任務，而不是因為 MCP 對你來說是更好的途徑。

## 設定

這個伺服器是主要執行檔的子命令，而不是獨立的套件：

```json
{ "mcpServers": { "pdfvision": { "command": "npx", "args": ["-y", "pdfvision", "mcp"] } } }
```

`pdfvision mcp` 不接受任何參數。它在 stdout 上使用 JSON-RPC 通訊，因此處理程序原本要記錄的任何內容都會改為導向 stderr。

## 三個工具

| 工具 | 回傳內容 |
|---|---|
| `read_pdf` | 以 Markdown 格式回傳文字。參數：`source`、`pages`、`ocr`、`attachment`、`password`。 |
| `search_pdf` | 扁平化的命中清單——每筆匹配包含頁碼、來源、上下文、區域，以及一個簡短的 `ref`。參數：`source`、`query`、`pages`、`regex`、`password`。 |
| `render_pdf` | 以圖片區塊回傳頁面或區域的 PNG，每張圖前面都會加上 `Page N:` 標籤。參數：`source`、`pages`、`ref`、`region`、`password`。 |

`source` 可以是本機路徑，**也可以**是 `http(s)` URL——沒有另外獨立的遠端參數。`ocr` 是一個 Tesseract 語言字串，主要語言放在最前面（例如 `"eng"`、`"jpn+eng"`），不是布林值；省略它會使用 PDF 自身的文字層，只有在文件地圖（document map）或品質報告指出某些頁面文字為空或亂碼時才需要用到——例如 `read_pdf(pages: "31", ocr: "jpn+eng")`。

## 與 CLI 之間會讓人意外的差異

- **沒有 format、include、scale 或 cache 參數。** 只要 pdfvision 能從文件本身判斷出的事，都由伺服器自行決定。`read_pdf` 一律會執行版面重建、表單欄位、連結與註解的處理，只是把找不到任何內容的區段省略掉。在空白表單上，欄位表格會收合成一個數量與類型細目（`_23 fillable fields on this page, none filled (15 text, 8 checkbox)._`）——已填值、已勾選、有指令碼的 widget，以及隱藏／鎖定的欄位，仍然各自會有一列。不要嘗試尋找對應的旗標，因為根本沒有。
- **在超過 20 頁的文件上呼叫不帶 `pages` 的 `read_pdf`，回傳的是文件地圖而不是內文本身**——頁數、目錄、逐頁原生文字品質與警告代碼收合成頁碼範圍，加上接下來該呼叫哪些具體工具的建議。這是面對不熟悉文件時，正常的第一次呼叫方式。
- **回應內容有預算限制**（每個內文本體 30,000 字元、每頁 12,000 字元、最多 100 筆匹配、最多 4 個已渲染頁面、最多 5 個 OCR 頁面、影像總計最多 6 MB）。每一次截斷都會指出接下來該呼叫的確切動作，因此被裁切的結果一定可以復原，絕不會悄悄地看起來像是完整結果。
- **用 ref 取代座標。** `search_pdf` 以及整頁的 `render_pdf` 都會回傳簡短的代碼（例如 `p47m1`、`p5r2`）。直接把它傳回去，例如 `render_pdf(ref: "p47m1")`，而不是手動抄寫 bbox。*每一次*呼叫都會把 ref 從 `p1m1` 重新編號，因此保留自較早搜尋的 ref，現在可能指向較新的結果——`render_pdf` 會回顯該 ref 實際解析到的內容（`Ref p1m1 → search hit for …`），讓過期的 ref 可以被察覺。若有疑慮，重新執行一次搜尋即可。命中的 ref 會裁切到該命中所在的表格列，或在頁面沒有偵測到表格時裁切到其視覺行，讓一列的數值都在圖片範圍內，而不只有列標籤。當頁面版面沒有涵蓋到該命中——例如來自 OCR 的匹配，或沒有重建出行的掃描頁面——裁切會退回到字符 box 周圍固定的邊距，這在寬列上仍可能窄到難以閱讀；遇到這種情況請明確傳入 `region`。
- **沒有 scale 可調。** 渲染結果會縮放到最長邊 1568 px，反正超過這個尺寸視覺模型也會自行降採樣。如果渲染結果小到難以閱讀，解法是縮小 `region`，而不是放大點陣圖。
- **每一個成功的結果開頭都會附上不受信任資料的 banner。** 伺服器無法假設它的主機帶有相對應的常設指令，因此信任邊界必須跟著回傳內容一起傳遞。錯誤結果不會附帶這個 banner，而且仍可能引用文件內容——詳見 [`pdfvision docs security`](./security-and-privacy.md)。

## 內嵌檔案

`read_pdf(attachment: "invoice.xml")`——或傳入從 1 開始的索引——會回傳內嵌檔案本身，而不是頁面內容。這件事很重要，因為在電子發票與法規申報文件（Factur-X、ZUGFeRD、XBRL）中，**附件才是權威資料，頁面內容只是它的呈現方式**；如果從頁面內容回答問題，等於是在根據事實的一張圖片來作答。任何回報附件的結果，都會指名這個呼叫方式。

文字類附件會以行內方式回傳，影像類附件則以圖片區塊回傳。其他類型——試算表、封存檔——則會被拒絕，並附上指向 `--attachments --attachment-output <dir>` 的說明，因為把這些位元組資料塞進 context window 沒有任何意義。這是 MCP 介面真正需要依賴 CLI 的唯一地方。

## 遠端輸入受到防護

與 CLI 的 `--remote` 不同，MCP 伺服器會拒絕解析到私有位址、loopback、link-local、CGNAT、NAT64，或 IPv4-mapped／-compatible 位址的 URL，並且會對每一次重新導向都重新驗證。原因是這裡由*模型*自行選擇 URL，若不這麼做，伺服器就會變成通往其所在網路的 SSRF 跳板。

若要存取內部網路的文件儲存空間，設定 `PDFVISION_MCP_ALLOW_PRIVATE_NETWORK=1`。這裡有一個已知限制，且已在呼叫處註明：驗證通過的位址並不會被固定（pin）用於實際擷取，因此如果 DNS 解析結果在驗證與連線之間發生變化，這種情況不在防護範圍內。

## 錯誤

工具失敗時會以帶內（in-band）錯誤結果並附上復原指示回傳，而不是協定層級的錯誤——超出範圍的頁面選擇器、超過 5 頁預算的 OCR 請求、未知的 ref、格式錯誤的 `region`，或加密的 PDF，都會告訴呼叫者接下來該怎麼做。請閱讀錯誤訊息，它會指名下一步該呼叫什麼。加密會被回報成兩種不同的失敗，因為復原方式不同：未提供密碼（用 `password` 重試）與密碼錯誤（換一個值重試）。

`search_pdf` 也會在回應內文中轉達核心搜尋的警告：如果某個 regex 超過每頁約 1 秒的時間預算，該頁的結果會被捨棄並附上說明，這樣可避免「0 筆匹配」被誤讀為「確定沒有」。同一個回應也會指出哪些被搜尋的頁面原生文字缺失或損毀——那裡的落空同樣不代表確定沒有，而且說明會指向針對這些頁面使用帶 `ocr` 的 `read_pdf` 或使用 `render_pdf`。
