---
title: Agent Skill
description: 為 Claude Code、Codex、Cursor 和其他支援 skill 的代理安裝並使用 pdfvision agent skill。
---

# Agent Skill

pdfvision 在 `skills/pdfvision/` 中包含一個 agent skill。它告訴代理何時呼叫 CLI、先嘗試哪些參數，以及何時升級到版面、渲染、OCR 或視覺區域裁切。

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
- 結構化輸出參考文件的路由。
- OCR 語言和 traineddata 疑難排解。
