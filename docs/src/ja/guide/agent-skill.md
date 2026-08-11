---
title: Agent Skills
description: Claude Code、Codex、Cursor などで使える pdfvision の Agent Skills。
---

# Agent Skills

pdfvision には `skills/pdfvision/` に Agent Skills が同梱されています。エージェントに、いつ CLI を呼ぶか、どのフラグを最初に試すか、いつレイアウト、レンダリング、OCR、視覚領域へ進むかを教えます。

PDF 作業は 1 つの固定コマンドでは解決しないことが多いです。有用なエージェントは、最初の結果を見て、欠けている根拠や怪しい根拠に気づき、次の pdfvision pass を選びます。同梱 Agent Skills はその workflow を encode し、agent session ごとに再発見しなくてよいようにします。

## インストール

```bash
npx skills add yamadashy/pdfvision
```

グローバルに入れる場合:

```bash
npx skills add yamadashy/pdfvision -g
```

## Agent Skills に含まれる内容

- 読める PDF の標準抽出。
- 密度シグナルによるサイレント失敗の検出。
- `--layout`, `--render`, `--ocr`, `--image-boxes`, `--visual-regions` を使う判断。
- `--search` と `--render-region` を使った根拠中心の crop。
- 構造化出力のフィールド形状、警告カタログ、フラグ別の注意点、信頼境界への導線（`pdfvision docs <topic>`）。
- OCR 言語と traineddata のトラブルシュート。

skill は `SKILL.md` 1ファイルです。指示は意図的に短く保ち、詳細はインストール済み CLI がバイナリ内から出力する `pdfvision docs <topic>` に委ねます。そのため詳細は実行中のバージョンと必ず一致し、skill 自体も更新頻度の低い小さなファイルのままで済みます。

## エージェントの流れ

skill-aware agent は通常、次のように動きます。

1. 構造化抽出から始める。
2. overview fields、page quality、warnings を確認する。
3. 配置が重要なら layout または visual boxes を追加する。
4. ユーザーが特定の条項、指標、ラベル、フィールド値を尋ねたら exact evidence を検索する。
5. 視覚検証が必要なときだけページまたは領域をレンダリングする。
6. ネイティブテキストが欠落、疎、または見た目と矛盾する場合に OCR を使う。

これにより、対話を効率よく保ちながら、エージェントが人間のように PDF を見る余地を残せます。

## いつインストールするか

エージェントが PDF、レポート、スライド、フォーム、スキャン文書を頻繁に読む project に入れてください。Claude Code、Codex、Cursor、その他 skill-aware agent 環境をすでに使っている repository では特に有効です。
