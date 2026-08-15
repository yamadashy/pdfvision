---
title: "出力形式"
description: "`-f json`、`-f toon`、`-f xml` が契約としてどう異なるか、エスケープマーカーを伴う XML タグへの投影、TOON のエンコーディングについて説明します。JSON の代わりに XML や TOON をパースするときに使います。"
sourceHash: 095d3b21d633
---

<!-- Translated from docs/src/en/guide/output.md, which is generated from docs/cli-topics/formats.md.
     Translate the prose, keep code, field names, flags, and warning codes verbatim, and update
     `sourceHash` to the value reported by `node scripts/build-site-reference.mjs`. -->

# XML と TOON の出力形状

フォーマットごとの契約は異なります。

- `-f json` はエクスポートされた `DocumentResult` をシリアライズします。このリファレンスにある JSON 形式のパスは、JSON と `processDocument()` に対して正確です。
- 出力される `-f toon` のペイロードはすべて、`@toon-format/toon` でデコードするとちょうど `JSON.parse(formatJson(result))` になります。未設定の `undefined` フィールドは省略されたままです。同じ JSON 形式のパスは、デコード後も正確です。TOON の文法は、対になっていない UTF-16 サロゲートを UTF-8 上でロスレスに表現できないため、pdfvision はそのエッジケースを拒否し、呼び出し側に `-f json` を使うよう案内します。正しいサロゲートペアやリテラルの `\uD800` テキストは影響を受けません。
- `-f xml` はタグ形状のほぼ等価な **プレゼンテーション投影** であり、可逆な `DocumentResult` のシリアライズではありません。名前、ネスト、存在有無は「XML の出力形状」に記載の通りにマッピングされます。XML 1.0 で禁止されているコード単位は `[[pdfvision:U+XXXX]]` になります。リテラルの `[[pdfvision:` プレフィックスは `[[pdfvision:literal:` としてエスケープされるため、マーカーが元のテキストと衝突することはありません。XML をパースした後に元の文字列を復元するには、左から右へ 1 パス処理します ── `[[pdfvision:literal:` に対してはリテラルのプレフィックスを出力し、その出力済みプレフィックスを再スキャンせず、生成された各 `[[pdfvision:U+XXXX]]` マーカーはその UTF-16 コード単位にデコードします。
- Markdown は、意図的な変換と省略を伴う閲覧用のプレゼンテーションであり、構造化スキーマの運び手ではありません。`rawText` は決して出力されないため、Markdown は正規化済みの文字列だけを運びます。`--strip-repeated` を指定すると、さらに本文から `repeated` なレイアウト block が取り除かれます。一方 JSON/TOON は `repeated: true` を、XML は `<block repeated="true">` を保持します。

## XML の出力形状

`-f xml` はタグ形状のほぼ等価な投影です。主なマッピングは `page` → `no`、`pageLabel` → `label`、そしてネストされた `quality.nativeTextStatus` / `quality.visualStatus` → フラット化されたページ属性です。ページ結果の `rotation` は `<pages><page rotation="...">` の属性で、overview の rotation は現時点では省略されます。`rawText` は兄弟要素の `<rawText>` になり、繰り返しレイアウトのマーカーは `<block repeated="true">` になり、トップレベルの JSON/TOON の `xfa: true` は `<document xfa="true">` になります。空の値は省略されるか自己終了タグで表現されることがあるため、XML でのフィールドの有無は JSON/TOON と同一ではありません。すべてのテキストノードと文字列属性において、XML 1.0 で禁止されている UTF-16 コード単位は `[[pdfvision:U+XXXX]]` として表現されます。元の `[[pdfvision:` プレフィックスは `[[pdfvision:literal:` としてエスケープされます。これにより、XML は well-formed に保たれ、マーカーの表現が衝突することもありません。

```xml
<document file="..." totalPages="14" javascriptActionCount="..." outlineCount="..." xfa="true">
  <metadata>
    <title>...</title>
    <author>...</author>
  </metadata>
  <overview>
    <page no="1" label="i" charCount="..." imageCount="..." vectorCount="..." textCoverage="..." nonPrintableRatio="..." nonPrintableCount="..." nativeTextStatus="..." visualStatus="..." userUnit="2" width="..." height="..."/>
    ...
  </overview>
  <pages>
    <page no="1" label="i" charCount="..." imageCount="..." vectorCount="..." textCoverage="..." nonPrintableRatio="..." nonPrintableCount="..." formFieldCount="..." linkCount="..." annotationCount="..." nativeTextStatus="..." visualStatus="..." rotation="90" userUnit="2" width="..." height="..." image="...">
      <spans>
        <span text="..." x="..." y="..." width="..." height="..." fontSize="..." fontName="..."/>
        ...
      </spans>
      <layout>
        <block x="..." y="..." width="..." height="..." role="heading" repeated="true">
          <line x="..." y="..." width="..." height="..." fontSize="...">...</line>
          ...
        </block>
        ...
      </layout>
      <imageBoxes>
        <imageBox x="..." y="..." width="..." height="..."/>
        ...
      </imageBoxes>
      <vectorBoxes>
        <vectorBox x="..." y="..." width="..." height="..."/>
        ...
      </vectorBoxes>
      <text>
...page text body...
      </text>
      <rawText>
...pre-normalization text, when normalization changed it...
      </rawText>
      <ocr lang="eng" confidence="0.91">
        <text>
...OCR text...
        </text>
        <words>
          <word text="..." confidence="..." x="..." y="..." width="..." height="..."/>
          ...
        </words>
      </ocr>
    </page>
    ...
  </pages>
</document>
```

空の `<pageLabels/>`、`<attachments/>`、`<outline/>`、`<viewer/>`、`<layers/>`、`<layout/>`、`<imageBoxes/>`、`<vectorBoxes/>`、`<visualRegions/>`、`<formFields/>`、`<links/>`、`<annotations/>`、`<structure/>`、`<ocr/>`（自己終了タグ）は「そのパスは実行されたが何も見つからなかった」ことを意味し、タグが存在しないこと（そのパスが要求されなかったこと）とは区別されます。
## TOON の出力形状

`-f toon` は、JSON のデータモデルを [Token-Oriented Object Notation](https://toonformat.dev) としてエンコードします ── ネストされたオブジェクトやリストには YAML スタイルのインデントを使い、同じフィールドを持つオブジェクトの配列には CSV ライクな表形式を使います。対象となる配列は、フィールドを `[N]{fields}:` ヘッダーで一度だけ宣言し、その後、要素ごとにカンマ区切りの行を 1 行ずつ流します。均一な形のネストされたオブジェクトは `{parent{child}}` グループとしてヘッダーに畳み込まれます。一部のエントリにだけオプションの値が存在する、配列値のフィールドを含む、あるいは形の異なるオブジェクトをネストしているといった理由でフィールドが揃わない配列は、リスト形式のままになります。出力される TOON のペイロードはすべて、ちょうど `JSON.parse(formatJson(result))` にデコードされます。オプションの `undefined` フィールドは `null` になるのではなく省略されます。対になっていない UTF-16 サロゲートは、TOON が UTF-8 上でロスレスに表現できないため、JSON フォールバックのエラーとして拒否されます。

```text
file: /path/doc.pdf
totalPages: 14
metadata:
  title: ...
overview[2]:
  - page: 1
    charCount: 40
    quality:
      nativeTextStatus: ok
    width: 612
    height: 792
  - page: 2
    ...
pages[2]:
  - page: 1
    text: "line one\nline two"
    charCount: 40
    spans[2]{text,x,y,width,height,fontSize,fontName}:
      pdfvision headers fixture,50,27.18,108.38,10,10,font1
      Body of page 1,50,194.36,134.54,20,20,font1
    layout:
      blocks[2]:
        - text: ...
          lines[1]{text,x,y,width,height,fontSize}:
            ...
```

デコードには `@toon-format/toon` パッケージ（`decode(toonString)`）を使います。通常の `overview[]` は、ネストされた `quality` がヘッダーに畳み込まれた形（`quality{nativeTextStatus}`）で表形式化されます。`spans[]` やブロックごとの `lines[]` のような配列は、すべてのエントリが同じフィールドを持つ場合にのみ表形式化できます。オプションフィールドが異なる場合は、配列はリスト形式のままになります。自由記述のテキスト本文は、表形式化によって圧縮されることはありません。効果は文書の構造や選択したオプションによって変わるため、手元の文書でフォーマットを比較してください。
