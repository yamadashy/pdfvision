---
title: "輸出格式"
description: "-f json、-f toon 與 -f xml 三者作為輸出契約（contract）的差異、XML 標籤投影（projection）及其跳脫標記，以及 TOON 編碼方式。當你要解析 XML 或 TOON 而非 JSON 時使用。"
sourceHash: 095d3b21d633
---

<!-- Translated from docs/src/en/guide/output.md, which is generated from docs/cli-topics/formats.md.
     Translate the prose, keep code, field names, flags, and warning codes verbatim, and update
     `sourceHash` to the value reported by `node scripts/build-site-reference.mjs`. -->

# XML 與 TOON 輸出格式

各種格式的契約並不相同：

- `-f json` 會序列化匯出的 `DocumentResult`。本參考文件中以 JSON 風格表示的路徑，對 JSON 與 `processDocument()` 而言都是精確對應的。
- 每一份輸出的 `-f toon` 內容，用 `@toon-format/toon` 解碼後都會精確等於 `JSON.parse(formatJson(result))`；未設定的 `undefined` 欄位仍維持不存在。同樣的 JSON 風格路徑在解碼後也是精確對應的。TOON 的語法無法在 UTF-8 中無損表示未配對的 UTF-16 代理項（surrogate），因此 pdfvision 會拒絕這種邊界情況，並引導呼叫者改用 `-f json`。有效的代理對（surrogate pair）與字面上的 `\uD800` 文字則不受影響。
- `-f xml` 是一種標籤形式、近乎對等的**呈現投影（presentation projection）**，而不是可還原的 `DocumentResult` 序列化格式。它的名稱對應、巢狀結構與欄位存在方式記錄於下方的「XML 輸出格式」一節。XML 1.0 中禁止使用的碼元（code unit）會轉換成 `[[pdfvision:U+XXXX]]`；原本就以 `[[pdfvision:` 開頭的字面文字，則會被跳脫成 `[[pdfvision:literal:`，讓標記絕不會與原始文字內容混淆。要在 XML 解析後還原原始字串，只需由左到右掃描一次：對 `[[pdfvision:literal:` 輸出對應的字面前綴且不再重新掃描這段已輸出的前綴，並把每一個產生出來的 `[[pdfvision:U+XXXX]]` 標記解碼回其對應的 UTF-16 碼元。
- Markdown 是一種供閱讀用的呈現方式，帶有刻意的轉換與省略；它不是承載結構化 schema 的格式。Markdown 絕不會輸出 `rawText`，因此只會帶有正規化後的字串；`--strip-repeated` 還會從內文中移除 `repeated` 版面區塊，而 JSON/TOON 會保留 `repeated: true`，XML 則會保留 `<block repeated="true">`。

## XML 輸出格式

`-f xml` 是一種標籤形式、近乎對等的投影。主要的名稱對應包括 `page` → `no`、`pageLabel` → `label`，以及巢狀的 `quality.nativeTextStatus` / `quality.visualStatus` → 攤平成頁面屬性。頁面結果的 `rotation` 是 `<pages><page rotation="...">` 上的屬性；overview 目前則省略了 rotation。`rawText` 是一個並列的 `<rawText>` 元素，重複版面區塊的標記是 `<block repeated="true">`，頂層 JSON/TOON 的 `xfa: true` 則會變成 `<document xfa="true">`。空值可能被省略，也可能以自我封閉標籤表示，因此 XML 的欄位存在方式與 JSON/TOON 並不完全一致。在每一個文字節點與字串屬性中，XML 1.0 中禁止使用的 UTF-16 碼元都會以 `[[pdfvision:U+XXXX]]` 表示；原本就以 `[[pdfvision:` 開頭的內容則會跳脫為 `[[pdfvision:literal:`。這樣可以確保 XML 格式正確，且標記表示法不會互相混淆。

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

空的 `<pageLabels/>`、`<attachments/>`、`<outline/>`、`<viewer/>`、`<layers/>`、`<layout/>`、`<imageBoxes/>`、`<vectorBoxes/>`、`<visualRegions/>`、`<formFields/>`、`<links/>`、`<annotations/>`、`<structure/>` 與 `<ocr/>`（自我封閉標籤）代表「該處理階段已執行但沒有找到任何內容」，這與標籤完全不存在（代表未要求執行該處理階段）不同。
## TOON 輸出格式

`-f toon` 會把 JSON 資料模型編碼成 [Token-Oriented Object Notation](https://toonformat.dev)：巢狀物件與清單採用類似 YAML 的縮排方式，而元素皆為相同欄位物件的陣列，則採用類似 CSV 的表格形式。符合資格的陣列會在 `[N]{fields}:` 標頭中宣告一次欄位，之後每個元素以逗號分隔輸出一列；形狀一致的巢狀物件會摺疊進標頭，成為 `{parent{child}}` 群組。如果陣列中的元素欄位不一致——因為選用值只出現在部分元素、含有陣列型別欄位，或巢狀物件的形狀不同——就會維持清單形式。每一份輸出的 TOON 內容解碼後都精確等於 `JSON.parse(formatJson(result))`；選用的 `undefined` 欄位會直接不存在，而不會變成 `null`。未配對的 UTF-16 代理項會被拒絕並回傳 JSON 備援（fallback）錯誤，因為 TOON 無法在 UTF-8 中無損表示它。

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

可用 `@toon-format/toon` 套件解碼（`decode(toonString)`）。一般情況下 `overview[]` 會表格化，其巢狀的 `quality` 會摺疊進標頭（`quality{nativeTextStatus}`）。像 `spans[]` 或每個區塊的 `lines[]` 這類陣列，只有在每個元素欄位都相同時才能表格化；選用欄位不一致時，陣列會維持清單形式。自由文字內容不會因表格化而縮減大小。實際效益取決於各文件的結構與所選的選項，請在自己的文件上比較不同格式的效果。
