---
title: "输出格式"
description: "-f json、-f toon 和 -f xml 作为契约有何不同、带转义标记的 XML 标签映射，以及 TOON 编码方式。在解析 XML 或 TOON 而非 JSON 时使用。"
sourceHash: 095d3b21d633
---

<!-- Translated from docs/src/en/guide/output.md, which is generated from docs/cli-topics/formats.md.
     Translate the prose, keep code, field names, flags, and warning codes verbatim, and update
     `sourceHash` to the value reported by `node scripts/build-site-reference.mjs`. -->

# XML 与 TOON 输出结构

不同格式的契约并不相同：

- `-f json` 序列化导出的 `DocumentResult`。本参考文档中的 JSON 风格路径，对 JSON 和 `processDocument()` 都是精确的。
- 每一份 `-f toon` 输出都可以用 `@toon-format/toon` 解码，得到与 `JSON.parse(formatJson(result))` 完全一致的结果；未设置的 `undefined` 字段保持缺失。解码后同样的 JSON 风格路径依然精确。TOON 的语法无法在 UTF-8 中无损表示未配对的 UTF-16 代理项，因此 pdfvision 会拒绝这种边界情况，并引导调用方改用 `-f json`。合法的代理对和字面量 `\uD800` 文本不受影响。
- `-f xml` 是一种标签形式的近似映射**呈现投影**，而不是可逆的 `DocumentResult` 序列化。它按照下面“XML 输出结构”一节所记录的方式映射名称、嵌套关系和字段存在性。XML 1.0 中禁止的码位会变成 `[[pdfvision:U+XXXX]]`；字面量前缀 `[[pdfvision:` 会被转义为 `[[pdfvision:literal:`，这样标记就不会与源文本冲突。要在 XML 解析后还原源字符串，需做一次从左到右的扫描：遇到 `[[pdfvision:literal:` 时输出字面量前缀本身、且不再重复扫描这段已输出的前缀，并把每个生成的 `[[pdfvision:U+XXXX]]` 标记解码为对应的 UTF-16 码元。
- Markdown 是一种带有刻意转换与省略的阅读呈现形式，不是结构化 schema 的载体。`rawText` 永远不会被输出，因此 Markdown 只携带归一化后的字符串；`--strip-repeated` 还会把 `repeated` 布局块从正文中移除，而 JSON/TOON 会保留 `repeated: true`，XML 则保留 `<block repeated="true">`。

## XML 输出结构

`-f xml` 是一种标签形式的近似映射投影。关键映射包括 `page` → `no`、`pageLabel` → `label`，以及嵌套的 `quality.nativeTextStatus` / `quality.visualStatus` → 展平后的页面属性。页面结果的 `rotation` 是 `<pages><page rotation="...">` 属性；overview 中的 rotation 目前会被省略。`rawText` 是一个同级的 `<rawText>` 元素，重复布局标记是 `<block repeated="true">`，顶层 JSON/TOON 中的 `xfa: true` 会变成 `<document xfa="true">`。空值可以被省略，也可以用自闭合标签表示，因此 XML 中字段的存在性与 JSON/TOON 并不完全一致。在每个文本节点和字符串属性中，XML 1.0 禁止的 UTF-16 码元会表示为 `[[pdfvision:U+XXXX]]`；原本就存在的 `[[pdfvision:` 前缀会被转义为 `[[pdfvision:literal:`。这样既能保持 XML 良构，又能避免标记与源文本冲突。

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

空的 `<pageLabels/>`、`<attachments/>`、`<outline/>`、`<viewer/>`、`<layers/>`、`<layout/>`、`<imageBoxes/>`、`<vectorBoxes/>`、`<visualRegions/>`、`<formFields/>`、`<links/>`、`<annotations/>`、`<structure/>` 和 `<ocr/>`（自闭合）表示“该处理流程运行过但没有发现任何内容”，这与标签整个缺失（表示该处理流程未被请求）是两回事。
## TOON 输出结构

`-f toon` 将 JSON 数据模型编码为 [Token-Oriented Object Notation](https://toonformat.dev)：嵌套对象和列表使用类似 YAML 的缩进，而条目字段相同的对象数组则使用类似 CSV 的表格形式。符合条件的数组会在一个 `[N]{fields}:` 表头中声明一次字段，随后逐个元素以逗号分隔的行流式输出；形状一致的嵌套对象会折叠进表头，形成 `{parent{child}}` 这样的分组。如果数组条目的字段因为只有部分条目存在可选值、包含数组类型字段，或嵌套了形状不同的对象而彼此不同，就会保持列表形式。每一份输出的 TOON payload 都能解码为与 `JSON.parse(formatJson(result))` 完全一致的结果；可选的 `undefined` 字段会缺失，而不会变成 `null`。未配对的 UTF-16 代理项会被拒绝并回退为 JSON 报错，因为 TOON 无法在 UTF-8 中无损表示它。

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

使用 `@toon-format/toon` 包解码（`decode(toonString)`）。常规的 `overview[]` 会被表格化，其嵌套的 `quality` 会折叠进表头（`quality{nativeTextStatus}`）。像 `spans[]` 或逐块的 `lines[]` 这样的数组，只有当每个条目字段都相同时才能表格化；可选字段不一致时，数组会保持列表形式。自由文本正文不会因表格化而被压缩。收益大小取决于每份文档的结构和所选选项，因此请在自己的文档上比较各格式的效果。
