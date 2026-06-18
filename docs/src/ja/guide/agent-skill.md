---
title: Agent Skill
description: Claude Code、Codex、Cursor などで使える pdfvision の Agent Skill。
---

# Agent Skill

pdfvision には `skills/pdfvision/` に Agent Skill が同梱されています。エージェントに、いつ CLI を呼ぶか、どのフラグを最初に試すか、いつレイアウト、レンダリング、OCR、視覚領域へ進むかを教えます。

## インストール

```bash
npx skills add yamadashy/pdfvision
```

グローバルに入れる場合:

```bash
npx skills add yamadashy/pdfvision -g
```

## 含まれる内容

- 読める PDF の標準抽出。
- 密度シグナルによるサイレント失敗の検出。
- `--layout`, `--render`, `--ocr`, `--image-boxes`, `--visual-regions` を使う判断。
- 構造化出力リファレンスへの導線。
- OCR 言語と traineddata のトラブルシュート。
