---
title: MCP 伺服器
description: 透過 Model Context Protocol，為沒有 shell 的宿主——Claude Desktop、Cursor、Cline、Zed，以及 n8n 等工作流程工具——提供 pdfvision 服務。
---

# MCP 伺服器

`pdfvision mcp` 透過 stdio，在 [Model Context Protocol](https://modelcontextprotocol.io/) 上提供同一套擷取引擎。它是為那些無法執行 shell 的宿主而存在的——Claude Desktop、Cursor、Cline、Zed、n8n，以及模型只能呼叫 tool 的類似環境。

如果你的代理擁有 shell（Claude Code、Codex 或其他支援 CLI 的環境），優先使用 CLI 搭配 [Agent Skills](./agent-skill.md) 的組合。skill 按需載入，尚未使用前不消耗任何 context，而 MCP tool schema 會在整個工作階段期間常駐宿主的 context。

## 設定

伺服器是主要執行檔的子指令，而不是獨立的 package：

```json
{
  "mcpServers": {
    "pdfvision": { "command": "npx", "args": ["-y", "pdfvision", "mcp"] }
  }
}
```

`pdfvision mcp` 不接受任何參數。它在 stdout 上使用 JSON-RPC 通訊，因此程序原本要輸出的記錄都會轉到 stderr。

## 三個 Tool

| Tool | 回傳內容 | 參數 |
|---|---|---|
| `read_pdf` | Markdown 格式的文字 | `source`、`pages`、`ocr`、`attachment`、`password` |
| `search_pdf` | 依命中位置合併的清單，每列帶一個短 `ref` | `source`、`query`、`pages`、`regex`、`password` |
| `render_pdf` | 頁面或區域 PNG（image block） | `source`、`pages`、`ref`、`region`、`password` |

`source` 接受本機路徑或 `http(s)` URL——沒有獨立的遠端參數。

這個 surface 比 CLI 刻意做得更小。沒有 format、include、scale 或 cache 參數：凡是 pdfvision 能從文件本身判斷的事，都由伺服器決定。`read_pdf` 總是會執行 layout、form field、link 和 annotation 擷取，只是省略那些一無所獲的 section。這讓常駐的 tool schema 保持精簡，也不給模型留下設定出錯的餘地。

## 工作階段如何進行

對超過 20 頁的文件執行不帶 `pages` 的 `read_pdf`，回傳的不是本文，而是**文件地圖**：頁數、outline、依區間折疊的每頁原生文字品質與 warning code，以及接下來該呼叫什麼。面對未知文件時，這是標準的第一步。

由此往後：

- `read_pdf(pages: "12-18")` 讀取一個區間。
- `search_pdf(query: "…")` 定位一個詞。來源相同且裁切區域相同的多次出現（通常是同一列或同一表格列內的重複）會合併成一列，並用 `×N` 標出次數（標題處的計數仍然是出現次數）。每列都帶一個像 `p47m1` 這樣的短 `ref`——把它原樣傳給 `render_pdf(ref: "p47m1")`，就能就地查看匹配內容，不必抄寫座標。一個 source 的 ref 集合，來自它最近一次 `search_pdf`，或最近一次在回應中列出視覺區域的整頁 `render_pdf` 登記的內容；這兩者中任意一個都會整體取代掉先前的集合——零命中的搜尋也會用空集合取代它。不登記新 ref 的 `render_pdf` 會讓原有集合保持不變——區域 render（包括所有帶 `ref` 的呼叫），以及回應中沒有列出視覺區域的整頁 render——因此一次搜尋命中的結果可以逐一依序渲染。`ref` 不能與 `pages` 或 `region` 同時使用：ref 本身已經同時指定了頁面與區域，這類呼叫會被直接拒絕，而不是悄悄按 ref 所在的頁面來處理。
- 當 quality 報告說原生文字不可用時，用 `read_pdf(pages: "31", ocr: "jpn+eng")` 對掃描頁重新做 OCR。
- `read_pdf(attachment: "invoice.xml")`——或一個從 1 開始的索引——回傳一個嵌入檔案，而不是頁面。在電子發票和監管申報文件（Factur-X、ZUGFeRD、XBRL）中，附件才是權威資料，頁面只是它的渲染呈現。文字附件會內嵌回傳，影像作為 image block 回傳；不透明的二進位檔案會被拒絕，並指向 CLI 的 `--attachments --attachment-output`。

渲染圖會被調整到最長邊 1568 px，超過這個尺寸 vision 模型本來也會做降採樣。如果渲染圖小到讀不清，該做的是縮小 `region`，而不是放大解析度。

## Budget 與誠實

回應是有 budget 的：本文 30,000 字元、每頁 12,000 字元、100 個 match 位置、4 個渲染頁面、5 個 OCR 頁面，以及每次呼叫 6 MB 的影像。每次截斷都會指明下一步該做什麼，因此被截斷的結果是可復原的，而不是悄悄地不完整——通常是一個比產生它的那次呼叫更窄的頁面呼叫（即便要求的區間寬到連每頁一列的 Overview 表本身就用滿了 budget 也是如此）；只有當單獨一頁都容不下、不存在更窄的頁面呼叫時，才會轉而給出 `search_pdf` 指引。

20 頁這道門檻決定的是回傳 map 還是本文，而不是本文放不放得下：未滿 20 頁的文件會被整篇讀入，超出字元 budget 時同樣會被截斷。截斷提示中視為省略的是頁面的*本文*——那些頁面各自的 Overview 列仍然留在回應中。

同樣的誠實也適用於搜尋：core warning 會隨回應一起傳回，因此當一個 regex query 超出單頁時間 budget 時，它會如實回報，而不是偽裝成「0 matches」；對沒有可用原生文字的頁面搜尋時，也會說明該處的落空並不代表證據缺失。對動態 XFA (LiveCycle) 表單更進一步：當被搜尋的頁面只是「Please wait...」檢視器佔位頁時，無論是否命中，每次回應都會說明這一點——尤其是零命中的回應，它最容易被誤讀為內容不存在——並建議改用 Adobe Acrobat/Reader，而不是算繪頁面。像 IRS 報稅表那樣的 AcroForm+XFA 混合表單可以正常擷取，不會被這樣標記。

每個結果都帶有 untrusted-data 提示條。MCP 宿主沒有 Agent Skill 那樣的指引，所以信任邊界要隨負載一起傳遞。請把擷取出的內容當作資料而非指令來對待——參見[安全與隱私](./security-and-privacy.md)。

## 遠端輸入受到防護

與 CLI 的 `--remote` 不同，MCP 伺服器會拒絕解析到私有位址、迴路位址、鏈路本地位址、CGNAT 位址、NAT64 位址或 IPv4 映射位址的 URL，並重新驗證每一跳重新導向。這裡選擇 URL 的是模型，如果不這樣做，伺服器就會變成通往其所在網路的 SSRF 跳板。

對於內網文件儲存庫，請設定 `PDFVISION_MCP_ALLOW_PRIVATE_NETWORK=1`。已知限制：已驗證的位址不會為這次 fetch 固定下來，因此在驗證與連線之間發生變化的 DNS 回覆不在涵蓋範圍內。

## 錯誤會指明下一次呼叫

Tool 失敗會以帶復原說明的帶內結果傳回，而不是協定錯誤。超出範圍的頁面選擇器、超出頁面 budget 的 OCR 要求、未知的 ref，或格式錯誤的 region，都會說明該怎麼做——讀一下這則訊息，它會指明下一次呼叫。
