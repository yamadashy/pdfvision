---
title: "结构化输出"
description: "顶层 DocumentResult、逐页的 PageOverview 与 PageResult 字段、PageQuality，以及每个 bbox 使用的坐标系统。当以编程方式消费 -f json / -f toon / processDocument() 输出时使用。"
sourceHash: c44996363b15
---

<!-- Translated from docs/src/en/guide/structured-output.md, which is generated from docs/cli-topics/schema.md.
     Translate the prose, keep code, field names, flags, and warning codes verbatim, and update
     `sourceHash` to the value reported by `node scripts/build-site-reference.mjs`. -->

# 结构化输出 schema

面向 `-f json`、`-f xml` 和 `-f toon` 使用者的参考文档。当智能体或工具需要以编程方式消费结构化负载，并需要了解每个字段、其形状及坐标约定时，请阅读本文。

下面这些 JSON 风格的字段路径对 `-f json`、解码后的 `-f toon` 和 `processDocument()` 都是精确适用的。`-f xml` 是一种表现层投影，会对其中一些字段重命名并拍平（`page` → `no`、`pageLabel` → `label`、`quality.*` → 页面属性），其空字段的存在方式也可能有所不同；`-f markdown` 会刻意转换或省略部分字段。各格式的具体约定见 [`pdfvision docs formats`](./output.md)，导出的 TypeScript 类型名称列在 [`pdfvision docs library`](./library-api.md) 中。

当 pdf.js 要求提供文档密码时，加密 PDF 需要 `--password <value>`、`--password-stdin` 或 `processDocument(..., { password })`。密码仅用于解密，绝不会出现在 JSON/XML/TOON/Markdown 输出中。在 argv 或 shell 历史暴露有影响的 CLI 工作流中，优先使用 `--password-stdin`；当 stdin 为空时，可以显式提供 `--password` 作为回退。

## DocumentResult（顶层）

```ts
interface DocumentResult {
  file: string;                // path/URL the CLI was invoked with
  totalPages: number;          // total in the source PDF, not in the selection
  metadata: DocumentMetadata;  // title / author / subject / creator (all string | null)
  pageLabels?: string[];       // full 0-indexed viewer page-label array; present iff --page-labels
  attachments?: DocumentAttachment[]; // embedded file metadata; present iff --attachments
  attachmentCount?: number;    // document-level embedded files; always computed, omitted when zero
  javascriptActionCount?: number; // document-level JavaScript scripts; always computed, omitted when zero
  outlineCount?: number;       // top-level outline entries; always computed, omitted when zero
  xfa?: boolean;               // true iff the PDF declares an XFA (LiveCycle) form; see xfa_form warning
  outline?: DocumentOutlineItem[]; // document bookmarks; present iff --outline
  viewer?: DocumentViewerState; // viewer settings; present iff --viewer
  layers?: DocumentLayers;       // optional content groups; present iff --layers
  overview?: PageOverview[];   // per-page density summary; present iff pages.length > 1
  pages: PageResult[];         // one entry per selected page, in page-number order
}
```

命中缓存时，`file` 会被修补为当前调用的路径或 `--remote` URL，因此即使缓存条目来自另一次触碰了相同内容哈希的调用，下游使用者看到的输入标签依然是有意义的。

`javascriptActionCount` 是一个始终开启的存在性信号。它统计 pdf.js 在文档级返回的脚本条目数量，包括 JavaScript catalog `OpenAction` 条目和具名 JavaScript 条目。传入 `--viewer` 可以在 `viewer.jsActions` 中展示它们的名称和脚本源码；pdfvision 只把这些脚本当作数据报告出来，并不会执行它们。
## PageOverview（密度概览）

```ts
interface PageOverview {
  page: number;
  pageLabel?: string;             // viewer-visible page label; present iff --page-labels and labels exist
  charCount: number;
  imageCount: number;             // raster image draws (XObject + inline + mask + image-bearing patterns), per drawn instance
  vectorCount: number;            // vector drawing ops (paths / shadings), e.g. form boxes, chart rules, slide shapes
  textCoverage: number;           // 0..1, fraction of page area covered by text glyph bboxes
  nonPrintableRatio: number;      // 0..1, pre-C0-strip NUL / control / noncharacter fraction
  nonPrintableCount: number;      // raw count — stays discriminable when the 3dp ratio rounds to 0
  renderContentRatio?: number;    // 0..1, fraction of pixels differing from the page's dominant background (present iff --render or --ocr)
  rotation?: number;               // clockwise page rotation in degrees; present only for rotated pages
  userUnit?: number;               // PDF /UserUnit; omitted when 1; physical points = raw page-view value * userUnit
  quality: PageQuality;           // derived classification — see below
  warningCount?: number;          // mirror of pages[N].warnings.length, omitted when no rule fired
  matchCount?: number;            // mirror of pages[N].matches.length; present-with-0 means "search ran, no hit"
  vectorBoxCount?: number;        // mirror of pages[N].vectorBoxes.length; present iff --vector-boxes
  visualRegionCount?: number;     // mirror of pages[N].visualRegions.length; present iff --visual-regions
  formFieldCount?: number;        // furniture presence count; automatic when non-zero, present-with-0 when the matching flag ran
  linkCount?: number;             // furniture presence count; automatic when non-zero, present-with-0 when the matching flag ran
  annotationCount?: number;       // furniture presence count; automatic when non-zero, present-with-0 when the matching flag ran
  structureNodeCount?: number;    // count of tagged-PDF structure nodes; present iff --structure
  width: number;                  // raw unrotated page-view units
  height: number;
}
```

`overview[]` 是排查静默失败时首先要检查的地方。`quality` 字段给出了一个一步到位的分类；下面这些原始信号则让智能体可以按自己的方式组合信号：
- `imageCount > 0 && textCoverage ≈ 0` → 图像被拍平的页面；文本流为空。
- `imageCount > 0 || vectorCount > 0`，同时 `textCoverage` 很低、`charCount` 很小 → 可见页面大部分内容都在原生文本之外（往往只是幻灯片/图像上叠加了一个页码）。对应 `quality.nativeTextStatus === 'sparse_text_with_visual_content'`。
- 即使 `textCoverage` 不低，极低的 `charCount` 加上密集的矢量结构，也可能同样对应 `sparse_text_with_visual_content`，因为一个巨大的水印文本项就可能覆盖页面的大部分面积，而可见的表单/表格/图表内容实际上是以矢量形式存在的。
- 存在原生文本，但 `quality.visualStatus === 'blank'` → 原生文本在光栅化后的页面上不可见。常见情形包括：隐藏的 OCR 残留、不可见/字体损坏的文本，或渲染层与文本层不匹配。对应 `quality.nativeTextStatus === 'sparse_text_on_blank_visual'`。
- `vectorCount > 0 && textCoverage` 偏低 → 即使 `imageCount` 为零，也存在可见的非光栅结构；表单、图表、图示和幻灯片形状可能需要 `--render`。
- `0.05 <= nonPrintableRatio < 0.3` → 一个或多个字体缺少可用的 ToUnicode CMap；原生文本中可读片段与原始字形索引混杂在一起。即使部分单词看起来可用，原生文本依然是不完整的。对应 `quality.nativeTextStatus === 'mixed_glyph_indices'`。
- `nonPrintableRatio >= 0.3` → 页面大部分内容缺少 ToUnicode CMap；即使 `textCoverage` 看起来正常，文本流大部分也是原始字形索引（NUL + 控制字符）。原生文本不可用；应回退到 `--render` 或 `--ocr`。对应 `quality.nativeTextStatus === 'unusable_glyph_indices'`。
- 归一化后的 `pages[].text` 会剥离不可见的 C0 控制字符（tab / 换行 / 回车除外），但 `nonPrintableRatio` 和 `nonPrintableCount` 仍然使用剥离前的文本信号，因此稀疏的控制字节证据依然可见。
- Private Use Area（私用区）字形码字符串被有意排除在 `nonPrintableRatio` 之外；图标字体合理使用 PUA 是正常的。当页面文本以 PUA 为主时，即使 `quality.nativeTextStatus === 'ok'` 且 `nonPrintableRatio === 0`，`pages[].warnings[].code === 'glyph_garbage_text'` 依然会触发。当原本可读的文本中出现重复的 PUA 字形时，会触发 `localized_glyph_noise`，方便对照渲染检查公式或自定义符号片段。
- `quality.visualStatus === 'sparse'` → 光栅化后的页面并非空白，但可见标记稀疏。这涵盖了 `0.001 < renderContentRatio <= 0.005` 的情况、低于空白阈值但有佐证的极小图像/矢量/注释痕迹，以及可见墨迹非零但低于空白阈值的纯文本或纯注释页面；在断定为渲染失败之前，先检查几何信息或渲染一个裁剪图。
- `quality.visualStatus === 'blank'` → 光栅化后的页面相对于自身的主背景色实际上是空白的（仅在 `--render` 或 `--ocr` 开启时才有意义）。该判断感知背景色，因此深色封面和米黄色扫描件不会被误判。它能捕获 pdfvision 原本无法暴露的渲染管线故障：pdf.js + @napi-rs/canvas 无法解码 JPEG2000 图像流（在 Internet Archive 扫描件中很常见），以及字体没有可解析字形的 PDF 什么都画不出来。当针对这种情况运行 OCR 时，`confidence: 0` *不是* OCR 的失误——输入本身就是一张近乎单一颜色的图像。
## PageResult（逐页）

```ts
interface PageResult {
  page: number;
  pageLabel?: string;           // viewer-visible label such as i, ii, A-1, 1; present iff --page-labels and labels exist
  text: string;                  // NFKC-normalized and C0-cleaned unless --no-normalize
  rawText?: string;              // pre-normalization text — present when normalization changed it
  charCount: number;
  imageCount: number;
  vectorCount: number;
  textCoverage: number;
  nonPrintableRatio: number;     // pre-C0-strip NUL / control / noncharacter ratio
  nonPrintableCount: number;     // pre-C0-strip raw count alongside the ratio
  renderContentRatio?: number;   // pixel fraction differing from the page's dominant background (present iff --render or --ocr)
  quality: PageQuality;          // derived per-page classification — agent-side dispatch lives on this field
  rotation?: number;              // clockwise page rotation in degrees; present only for rotated pages
  userUnit?: number;              // PDF /UserUnit; omitted when 1; mirrored in overview[]
  width: number;
  height: number;
  image?: string;                // absolute PNG path — present iff --render
  renderRegion?: { x, y, width, height }; // echoed back when --render-region was set; lets consumers tell crop vs full
  spans?: TextSpan[];            // present iff --geometry
  layout?: PageLayout;           // present iff --layout
  imageBoxes?: ImageBox[];       // present iff --image-boxes
  vectorBoxes?: VectorBox[];     // present iff --vector-boxes
  visualRegions?: VisualRegion[]; // present iff --visual-regions
  formFieldCount?: number;       // always computed; omitted when zero
  formFields?: FormField[];      // present iff --form-fields
  linkCount?: number;            // always computed; omitted when zero
  links?: PageLink[];            // present iff --links
  annotationCount?: number;      // always computed; omitted when zero
  annotations?: PageAnnotation[]; // present iff --annotations
  structure?: PageStructureNode | null; // present iff --structure; null means no page structure tree
  structureTables?: PageStructureTable[]; // tagged tables; present iff --structure found Table nodes
  jsActions?: Record<string, string[]>; // page-level JavaScript actions, present iff --viewer and the page defines them
  ocr?: PageOcr;                 // present iff --ocr
  warnings?: PageWarning[];      // omitted when no rule fired on the page
  matches?: SearchMatch[];       // present iff --search; empty array means "search ran, no hit on this page"
}

interface PageQuality {
  nativeTextStatus:
    | 'ok'                       // usable native text that is not sparse relative to non-text visuals
    | 'mixed_glyph_indices'      // 0.05 <= nonPrintableRatio < 0.3 — readable fragments mixed with glyph garbage
    | 'unusable_glyph_indices'   // nonPrintableRatio >= 0.3 — fall back to --ocr / --render
    | 'sparse_text_on_blank_visual' // native text exists but the rendered page is effectively blank
    | 'sparse_text_with_visual_content' // native text exists but is too sparse for a visual page
    | 'empty_but_visual_content' // no native text but the page has images / vectors / non-blank pixels / visible annotations not contradicted by a blank render
    | 'empty';                   // no text, no detected visual content
  visualStatus?:                 // present iff --render or --ocr triggered a raster
    | 'ok'                       // renderContentRatio > 0.005 — renderer drew clearly populated content
    | 'sparse'                   // sparse marks: 0.001 < ratio <= 0.005, or corroborated tiny visual traces
    | 'blank';                   // effectively blank against the page's own background
}
```

`text` 是 pdfjs 派生出的文本流。原始文本项会先按照 [`pdfvision docs layout`](./layout.md) 中的约定去重，再进行归一化，因此 optional-content 和 overprint 造成的重复内容不会读成重复的单词。检测到的正文尺寸日文竖排列，当源文本流顺序与检测到的从上到下的列顺序一致时，会按源文本流顺序拼接；如果某一段不一致，只有那一段会回退到按原始文本项拼接。当源文本流顺序与几何信息一致时，日文竖排列中的行内縦中横（tatechuyoko）数字组（例如 `10`）会保留在该列文本中。在带注音的日文和中文页面上，当 pdfvision 能把较小的假名或拼音状的文本片段关联到一个明确的 CJK 基准范围时，振假名/ruby 会以内联形式附加为 `base《ruby》`，这包括相邻的半宽竖排 ruby 列、位于横排基准文本上方的小假名，以及位于横排 CJK 基准文本上方的拼音状拉丁注音；含糊或无法关联的 ruby 仍会被排除，搜索会同时使用包含 ruby 和剥离 ruby 的行，因此针对基准词的查询依然能匹配。竖排正文列右侧栏中简短的中等大小注释标记同样会被排除在重建后的文本/布局之外；`--geometry` 仍会暴露它们保留下来的源文本项 span。`rawText`（如果存在）在 JSON 和成功的 TOON 输出中是精确对应的同级字段，在 XML 中是同级的 `<rawText>` 元素（XML 禁止的码位用文档中说明的标记表示），在 Markdown 中会被省略。`ocr.text`（当 `--ocr` 开启时）是与之并存的 OCR 结果，**绝不会覆盖 `text`**——使用者可以自行比对两者，或选择该页看起来更好的那个信号。

`quality` 是纯粹的观察结果，而不是建议：pdfvision 告诉智能体它看到了什么，接下来做什么由智能体自己决定。

功能性负载都是按需开启的，因此传入 `--layout --form-fields` 得到的结果形状，和没有传入这些 flag 时是不同的；只有上面提到的这些辅助性存在计数是自动生成的。一个已运行但没有发现任何内容的 flag，仍然会输出对应字段：`--form-fields`、`--links`、`--annotations` 和 `--search` 在没有条目的页面上会产出 `[]`，`--structure` 会产出 `null`，这样使用者就能区分“未请求”和“请求了但结果为空”。

## 坐标系统

所有坐标（spans、layout blocks、image boxes、vector boxes、visual regions、form fields、`renderRegion`）都使用来自未旋转的 pdf.js `page.view` 可见区域的原始单位，`(0, 0)` 位于其左上角，`y` 向下增长。当存在一个不同且有效的 CropBox 时，该区域为 CropBox ∩ MediaBox，否则为 MediaBox。`pages[].userUnit` 和 `overview[].userUnit` 会暴露非默认的 PDF `/UserUnit`，当其值为 1 时会被省略。物理点数 = 原始 page-view 值 × UserUnit；渲染像素 = 原始区域 × UserUnit × 渲染缩放比例（在旋转交换坐标轴之前）。`pages[].width` / `height` 以及 `renderRegion` 的边界都是相对于可见区域的原始值，同一个 bbox 可以原样传给 `--render-region`。JSON、解码后的 TOON 和库都在 `pages[].rotation` 和 `overview[].rotation` 中保留顺时针旋转角度；XML 在 `<pages><page rotation="...">` 上保留了逐页结果的旋转角度，但目前省略了 overview 的旋转角度。

警告检测器的阈值以及 `pt` / `pt²` 消息使用的是已提取几何信息的一个内部物理点视图，而对外的 bbox 则保持原始单位。这并不能让整个提取管线在物理尺度上保持不变：布局分组、表单标签重建、矢量框整形和视觉区域生成仍然包含基于原始单位的启发式规则，对于物理上等价但 UserUnit 非默认的 PDF，可能产生不同的上游信号。

要把未旋转的页面坐标映射到一张未旋转的整页 PNG 上：

```ts
const sx = image.width / page.width;
const sy = image.height / page.height;
const pixelBox = { x: box.x * sx, y: box.y * sy, width: box.width * sx, height: box.height * sy };
```

这种直接缩放只对未旋转的页面有效。对于旋转过的页面，请使用 `pages[].rotation` 和 PDF viewport 变换（或者 `--render-region`），因为整页 PNG 的宽/高可能相对于 `page.width` / `page.height` 发生了互换。

每一个带坐标的字段——spans、layout blocks 与 lines、image boxes、vector boxes、visual regions、form fields、链接和注释的 boxes、structure node 的 bbox、OCR words、搜索 matches——都使用同一套坐标系统，因此从一个结构化字段过渡到一次视觉裁剪，永远不需要再发明第二套坐标系统。

## 按任务查找字段

哪些字段回答哪些问题，以及完整记录它们的 topic：

- 文本阅读 — `pages[].text`、`rawText`、`quality`、`warnings[]`（[`pdfvision docs warnings`](./warnings.md)）。
- 对布局敏感的阅读 — `layout.blocks[]`、`layout.blocks[].lines[]`、`layout.tables[]`、`spans[]`（[`pdfvision docs layout`](./layout.md)）。
- 视觉检查 — `image`、`renderContentRatio`、`imageBoxes[]`、`vectorBoxes[]`、`visualRegions[]`（[`pdfvision docs visual`](./visual.md)）。
- 扫描件恢复 — `ocr.text`、`ocr.confidence`、`ocr.words`、`quality.visualStatus`（[`pdfvision docs ocr`](./ocr.md)）。
- 证据搜索 — `matches[].source`、`matches[].bbox`、`matches[].context`（[`pdfvision docs search`](./search-and-region-zoom.md)）。
- 表单分析 — `formFields[]`：`value`、`checked`、`flags`、`actions`、`label`，加上 widget 的 bbox（[`pdfvision docs interactive`](./interactive.md)）。
- 导航与文档功能 — `pageLabels`、`outline`、`links[]`、`viewer`、`layers`、`structure`（[`pdfvision docs document-features`](./document-features.md)）。
- 文件清单 — `attachments[]` 元数据，以及一旦 `--attachment-output` 写入了字节后的 `attachments[].path`（[`pdfvision docs document-features`](./document-features.md)）。

当某个结论依赖于以上任意一项时，保留产生该结论的页码和 bbox；这一对信息正是后续 `--render-region` 裁剪展示证据所需要的。
