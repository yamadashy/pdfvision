---
title: Agent Skill
description: 為 Claude Code、Codex、Cursor 和其他支援 skill 的代理安裝並使用 pdfvision agent skill。
---

# Agent Skill

pdfvision 在 `skills/pdfvision/` 中包含一個 agent skill。它告訴代理何時呼叫 CLI、先嘗試哪些參數，以及何時升級到版面、渲染、OCR 或視覺區域裁切。

PDF 工作很少能用一個固定命令解決。一個有用的代理應檢查第一輪結果，發現缺失或可疑證據，並選擇下一次 pdfvision pass。內建 skill 編碼了這個 workflow，使每個 agent session 不必重新發現它。

## 安裝

```bash
npx skills add yamadashy/pdfvision
```

全域安裝：

```bash
npx skills add yamadashy/pdfvision -g
```

## Skill 涵蓋內容

- 可讀 PDF 的預設擷取流程。
- 使用密度訊號發現靜默失敗。
- 何時加入 `--layout`、`--render`、`--ocr`、`--image-boxes` 或 `--visual-regions`。
- 何時用 `--search` 和 `--render-region` 做 evidence-focused crops。
- 結構化輸出參考文件的路由。
- OCR 語言和 traineddata 疑難排解。

skill 的主指令刻意保持簡短，只在任務需要時指向 references。

## 代理工作流程

skill-aware agent 通常應該：

1. 從結構化擷取開始。
2. 檢查 overview fields、page quality 和 warnings。
3. 當位置重要時加入 layout 或 visual boxes。
4. 當使用者詢問特定條款、指標、標籤或欄位值時，搜尋 exact evidence。
5. 只有需要視覺驗證時才渲染頁面或區域。
6. 當原生文字缺失、稀疏或與視覺矛盾時使用 OCR。

這能保持互動高效，同時仍讓代理有機會像人類讀者一樣查看 PDF。

## 何時安裝

在代理經常讀取 PDF、報告、投影片、表單或掃描文件的專案中安裝該 skill。已經使用 Claude Code、Codex、Cursor 或其他 skill-aware agent 環境的 repository 尤其適合。
