---
title: MCP サーバー
description: シェルを持たないホスト（Claude Desktop、Cursor、Cline、Zed、n8n などのワークフローツール）向けに、pdfvision を Model Context Protocol で提供します。
---

# MCP サーバー

`pdfvision mcp` は、同じ抽出エンジンを [Model Context Protocol](https://modelcontextprotocol.io/) 経由で stdio 上に提供します。シェルを実行できないホスト — Claude Desktop、Cursor、Cline、Zed、n8n など、モデルが tool 呼び出ししかできない環境のためのものです。

エージェントがシェルを持つ場合（Claude Code、Codex など CLI を実行できる環境）は、CLI と [Agent Skills](./agent-skill.md) の組み合わせを推奨します。skill は必要になるまで context を消費しませんが、MCP の tool schema はセッションの間ずっとホストの context に常駐します。

## セットアップ

サーバーは別パッケージではなく、メインバイナリのサブコマンドです:

```json
{
  "mcpServers": {
    "pdfvision": { "command": "npx", "args": ["-y", "pdfvision", "mcp"] }
  }
}
```

`pdfvision mcp` は引数を取りません。stdout で JSON-RPC を話すため、プロセスのログはすべて stderr に出ます。

## 3 つの Tool

| Tool | 返すもの | パラメータ |
|---|---|---|
| `read_pdf` | Markdown のテキスト | `source`、`pages`、`ocr`、`attachment`、`password` |
| `search_pdf` | match ごとに短い `ref` の付いたヒット一覧 | `source`、`query`、`pages`、`regex`、`password` |
| `render_pdf` | ページまたは領域の PNG（image block） | `source`、`pages`、`ref`、`region`、`password` |

`source` はローカルパスまたは `http(s)` URL を受け付けます — remote 用の別パラメータはありません。

この surface は CLI より意図的に小さくしてあります。format、include、scale、cache のパラメータはありません: 文書自体から判断できることは、すべてサーバー側が判断します。`read_pdf` は常に layout、form field、link、annotation を実行し、何も見つからなかったセクションは単に省きます。これにより常駐する tool schema を小さく保ち、モデルが設定を誤る余地をなくしています。

## セッションの流れ

20 ページを超える文書への `pages` なしの `read_pdf` は、本文の代わりに**ドキュメントマップ**を返します: ページ数、アウトライン、ページごとの native text 品質と warning code をレンジに集約したもの、そして次に実行すべき具体的な呼び出しです。未知の文書への最初の一手はこれが標準です。

そこからは:

- `read_pdf(pages: "12-18")` でレンジを読む。
- `search_pdf(query: "…")` で語句を探す。各ヒットには `p47m1` のような短い `ref` が付くので、座標を書き写す代わりに `render_pdf(ref: "p47m1")` へそのまま渡してヒット箇所を目視できます。
- 品質レポートが native text は使えないと言っているページは `read_pdf(pages: "31", ocr: "jpn+eng")` で OCR 再読。
- `read_pdf(attachment: "invoice.xml")` — または 1 始まりの番号 — はページの代わりに埋め込みファイルを返します。電子請求書や規制関連の提出書類（Factur-X、ZUGFeRD、XBRL）では**添付こそが正本のデータで、ページはその印刷像にすぎません**。テキスト添付はインラインで、画像は image block で返り、不透明なバイナリは CLI の `--attachments --attachment-output` を案内して拒否されます。

レンダリングは長辺 1568 px にフィットされます — それ以上は vision モデル側でダウンサンプルされるためです。レンダリングが小さくて読めない場合の正解は、より大きいラスタではなく、より小さい `region` です。

## バジェットと正直さ

レスポンスにはバジェットがあります: 本文 30,000 文字、ページあたり 12,000 文字、match 100 件、レンダリング 4 ページ、OCR 5 ページ、画像 6 MB（いずれも 1 呼び出しあたり）。すべての切り詰めは正確なフォローアップ呼び出しを名指しするため、切られた結果は回復可能で、黙って不完全なままになることはありません。

同じ正直さは検索にも適用されます: core の warning はレスポンスに同乗するため、ページあたりの時間バジェットを超えた regex クエリは「0 matches」を装わずに自己申告し、使える native text のないページへの検索は「そこでのミスは不在の証拠ではない」と明言します。

成功した結果の先頭には untrusted-data バナーが付きます（エラー結果には付かず、文書の内容を引用することがあります）。MCP ホストには Agent Skill の指針に相当するものがないため、信頼境界はペイロードと一緒に運ばれます。抽出されたコンテンツは指示ではなくデータとして扱ってください — [セキュリティとプライバシー](./security-and-privacy.md)を参照。

## リモート入力はガードされます

CLI の `--remote` と異なり、MCP サーバーは private、loopback、link-local、CGNAT、NAT64、IPv4-mapped アドレスに解決される URL を拒否し、リダイレクトの各ホップも再検証します。ここでは URL を選ぶのが*モデル*なので、これがなければサーバーは実行先ネットワークへの SSRF の踏み台になってしまいます。

イントラネットのドキュメントストアには `PDFVISION_MCP_ALLOW_PRIVATE_NETWORK=1` を設定してください。既知の制限: 検証したアドレスは fetch に固定されないため、検証と接続の間に変わる DNS 応答はカバーされません。

## エラーは次の呼び出しを名指しします

Tool の失敗はプロトコルエラーではなく、回復手順付きの in-band な結果として返ります。範囲外のページ指定、ページバジェットを超える OCR 要求、未知の ref、不正な region — いずれも代わりに何をすべきかを述べます。メッセージを読んでください。次の呼び出しが書いてあります。
