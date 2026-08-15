---
name: formats
description: How -f json, -f toon, and -f xml differ as contracts, the XML tag projection with its escaping markers, and the TOON encoding. Use when parsing XML or TOON instead of JSON.
---

# XML and TOON output shapes

Format contracts differ:

- `-f json` serializes the exported `DocumentResult`. JSON-style paths in this reference are exact for JSON and `processDocument()`.
- Every emitted `-f toon` payload decodes with `@toon-format/toon` to exactly `JSON.parse(formatJson(result))`; unset `undefined` fields stay absent. The same JSON-style paths are exact after decoding. TOON's grammar cannot losslessly represent an unpaired UTF-16 surrogate across UTF-8, so pdfvision rejects that edge case and directs callers to `-f json`. Valid surrogate pairs and literal `\uD800` text are unaffected.
- `-f xml` is a tag-shaped near-parity **presentation projection**, not a reversible `DocumentResult` serialization. It maps names, nesting, and presence as documented under "XML output shape". XML-1.0-forbidden code units become `[[pdfvision:U+XXXX]]`; a literal `[[pdfvision:` prefix becomes `[[pdfvision:literal:` so markers never collide with source text. To recover the source string after XML parsing, make one left-to-right pass: emit a literal prefix for `[[pdfvision:literal:` without scanning that emitted prefix again, and decode each generated `[[pdfvision:U+XXXX]]` marker to its UTF-16 code unit.
- Markdown is a reading presentation with deliberate transformations and omissions; it is not a structured-schema carrier. `rawText` is never emitted, so Markdown carries only the single `text` string — NFKC-normalized unless `--no-normalize` is set; `--strip-repeated` additionally drops `repeated` layout blocks from the body, while JSON/TOON keep `repeated: true` and XML keeps `<block repeated="true">`.

## XML output shape

`-f xml` is a tag-shaped near-parity projection. Key mappings are `page` → `no`, `pageLabel` → `label`, and nested `quality.nativeTextStatus` / `quality.visualStatus` → flattened page attributes. Page-result `rotation` is a `<pages><page rotation="...">` attribute; overview rotation is currently omitted. `rawText` is a sibling `<rawText>` element, a repeated layout marker is `<block repeated="true">`, and top-level JSON/TOON `xfa: true` becomes `<document xfa="true">`. Empty values can be omitted or represented by self-closing tags, so XML field presence is not identical to JSON/TOON. In every text node and string attribute, an XML-1.0-forbidden UTF-16 code unit is represented as `[[pdfvision:U+XXXX]]`; an original `[[pdfvision:` prefix is escaped as `[[pdfvision:literal:`. This keeps the XML well-formed and the marker representation non-colliding.

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

Empty `<pageLabels/>`, `<attachments/>`, `<outline/>`, `<viewer/>`, `<layers/>`, `<layout/>`, `<imageBoxes/>`, `<vectorBoxes/>`, `<visualRegions/>`, `<formFields/>`, `<links/>`, `<annotations/>`, `<structure/>`, and `<ocr/>` (self-closing) mean "the pass ran and found nothing", which is distinct from the tag being absent (the pass wasn't requested).
## TOON output shape

`-f toon` encodes the JSON data model as [Token-Oriented Object Notation](https://toonformat.dev): YAML-style indentation for nested objects and lists, plus a CSV-like tabular form for arrays whose entries are objects with the same fields. Eligible arrays declare the fields once in a `[N]{fields}:` header and then stream one comma-delimited row per element; a uniformly-shaped nested object folds into the header as a `{parent{child}}` group. Arrays whose entries' fields differ because optional values are present on only some entries, contain array-valued fields, or nest objects with differing shapes stay in list form. Every emitted TOON payload decodes to exactly `JSON.parse(formatJson(result))`; optional `undefined` fields are absent rather than becoming `null`. An unpaired UTF-16 surrogate is rejected with a JSON-fallback error because TOON cannot represent it losslessly across UTF-8.

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

Decode with the `@toon-format/toon` package (`decode(toonString)`). Normal `overview[]` tabularizes with its nested `quality` folded into the header (`quality{nativeTextStatus}`). Arrays such as `spans[]` or per-block `lines[]` can tabularize only when every entry has the same fields; differing optional fields keep the array in list form. Free text bodies do not compress through tabularization. The benefit depends on each document's structure and selected options, so compare formats on your own documents.
