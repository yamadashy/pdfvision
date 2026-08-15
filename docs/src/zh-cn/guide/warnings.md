---
title: "警告"
description: "pages[].warnings[] 中的每个代码：触发条件、对文本意味着什么，以及支撑 quality 的原始逐页密度信号。当警告需要的说明超出内联消息时使用本文档。"
sourceHash: 0a398b138f64
---

<!-- Translated from docs/src/en/guide/warnings.md, which is generated from docs/cli-topics/warnings.md.
     Translate the prose, keep code, field names, flags, and warning codes verbatim, and update
     `sourceHash` to the value reported by `node scripts/build-site-reference.mjs`. -->

# 警告与原始密度信号参考

`pages[].warnings[]` 携带值得视觉关注的页面异常，密度概览（Overview）携带支撑 `quality` 的原始逐页信号。这里的 JSON 风格路径对 JSON、解码后的 TOON 和 `processDocument()` 都精确适用；XML 使用 [`pdfvision docs formats`](./output.md) 中的映射关系。[`pdfvision docs schema`](./structured-output.md) 携带 `quality.nativeTextStatus` / `quality.visualStatus` 字段摘要；本主题是查阅**每个原始信号的含义**以及**特定警告代码触发时该做什么**的配套文档，覆盖内联 `warning.message` 本身已经说清楚的内容之外的部分。

只有当 `warnings[]` 代码需要超出其内联消息的解读时，或者需要了解 `quality` 状态背后的原始信号阈值时，才需要阅读本文档。

其中机器可读的部分——`PageWarning` TypeScript 接口（`code` 联合类型、`severity`、`message`、`blockIndex` / `otherBlockIndex` / `imageBoxIndex`）、精确的触发条件，以及每个代码所需的 flag——就是紧随其后的 `## 结构` 一节。

pdfvision 刻意止步于观察：它**不会**推荐具体动作。动作取决于智能体基于两个 `quality` 状态和下面的原始信号做出的判断。静默失败——对下游消费者看起来正常的空 `text`，或实际上是 NUL 字节却显示完整的 `text`——会被提前暴露出来；这正是相比直接读取 PDF，更应该优先使用 pdfvision 的原因。

## 结构

```ts
interface PageWarning {
  code:
    | 'text_overlap'
    | 'near_bottom_edge'
    | 'body_near_repeated_chrome'
    | 'page_edge_text_truncated'
    | 'off_page'
    | 'glyph_garbage_text'
    | 'rtl_script_text'
    | 'localized_glyph_noise'
    | 'font_mapping_warning'
    | 'raw_embedded_source_text'
    | 'invisible_text'
    | 'text_under_opaque_fill'
    | 'dense_vector_graphics'
    | 'vector_graphics_no_native_text'
    | 'duplicate_text_layer'
    | 'raster_image_no_native_text'
    | 'tabular_numeric_layout'
    | 'dot_leader_noise'
    | 'tiny_native_text_noise'
    | 'raster_backed_text_layer'
    | 'raster_text_layer_symbol_noise'
    | 'raster_text_layer_word_fragmentation'
    | 'ocr_low_confidence'
    | 'ocr_native_text_mismatch'
    | 'ocr_native_spacing_loss'
    | 'large_raster_low_text_overlap'
    | 'annotation_text_missing_from_native'
    | 'optional_content_text_may_include_hidden_layers'
    | 'reading_order_divergence'
    | 'xfa_form';
  severity: 'warning' | 'error';
  message: string;
  blockIndex?: number;        // 0-based into pages[N].layout.blocks
  otherBlockIndex?: number;   // for pair-wise rules (text_overlap, body_near_repeated_chrome)
  imageBoxIndex?: number;     // 0-based into pages[N].imageBoxes for image-region rules
}
```

没有规则触发时，`pages[].warnings[]` 会被省略。几何类警告需要 `--layout`，因为它们要绑定到布局块，并且在原生 bbox 不可信的严重字形损坏页面上会被抑制。图像区域警告即使没有请求 `--image-boxes`，也可以使用 pdfvision 内部的图像框检测；只有存在公开的 `pages[].imageBoxes` 时才会输出 `imageBoxIndex`。当 `--image-boxes` 与 `--layout` 或 `--geometry` 结合使用时，`large_raster_low_text_overlap` 能获得更强的重叠证据，因为此时可以将图像框与原生文本 bbox 进行比较。在 `raster_image_no_native_text` 已经触发的空原生文本页面上，不会再输出该警告。`tabular_numeric_layout` 需要 `--layout`，因为它要检查对齐的布局行。`tiny_native_text_noise` 需要 `--layout` 或 `--geometry`，因为它要检查字号几何信息。`duplicate_text_layer` 使用内部 span，不需要 `--layout` 或 `--geometry` 也能出现；它可能与 `off_page` 或 `text_overlap` 同时出现，因为这些都是原生文本层被夸大后在几何层面上的不同表现。即使没有请求 `--annotations`，`annotation_text_missing_from_native` 也可以使用 pdfvision 内部的注释检测；但公开的 `pages[].annotations` 仍然只在设置 `--annotations` 时才会输出。`glyph_garbage_text`、`rtl_script_text`、`localized_glyph_noise`、`font_mapping_warning`、`raw_embedded_source_text`、`invisible_text`、`text_under_opaque_fill`、`dense_vector_graphics`、`vector_graphics_no_native_text`、`dot_leader_noise` 和 `optional_content_text_may_include_hidden_layers` 使用始终开启的页面/文档级信号，不需要布局信息也能出现。`invisible_text` 和 `text_under_opaque_fill` 复用了已经为图像/矢量分析获取的页面操作符列表，并在基于栅格的 OCR 文本层上被抑制；注释外观操作符、复杂路径几何、透明、被裁剪、带软蒙版、透明度组或可选内容的填充，以及非 normal 混合模式的填充，都被排除在不透明填充证据之外。`dense_vector_graphics` 还可以使用内部矢量框几何信息，抑制那些密集矢量只是零散小装饰、以文本为主的页面。`raster_backed_text_layer`、`raster_text_layer_symbol_noise`、`raster_text_layer_word_fragmentation` 和 `raster_image_no_native_text` 使用内部图像框检测，即使没有请求 `--image-boxes` 也可以出现。`ocr_low_confidence`、`ocr_native_text_mismatch` 和 `ocr_native_spacing_loss` 需要 `--ocr`。`xfa_form` 是附加在第一个提取页面上的、文档级的始终开启信号。

当前的规则目录：

- `text_overlap` — 非重复的布局块以可能打乱阅读顺序的方式发生重叠。行内数学公式、多行数学注释、上标、下标、仅含标点的行内片段、点状地图/装饰纹理块，以及标注标记续行导致的相邻行 bbox 轻微重叠会被抑制。
- `near_bottom_edge` — 正文文本异常地在接近页面底部处结束。
- `body_near_repeated_chrome` — 正文文本与检测到的重复页眉/页脚装饰重叠或几乎相接。
- `page_edge_text_truncated` — 一段至少 8 个码点、6em 长的提取文本，沿其主书写轴到达或越过页面边界，且越界不超过 1.25em，这与 pdf.js 在页面框之外丢弃后续字形时留下的“最后保留字形”特征相符。以标点收尾的自然结束会被抑制。该信号通过内部 span 几何始终开启；当布局信息可用时会带上 `blockIndex`，并且同一个块上的 `off_page` 结果会让位于这个内容丢失警告而被抑制。
- `off_page` — 某个布局块的 bbox 超出了页面范围。
- `glyph_garbage_text` — `quality.nativeTextStatus` 为 `mixed_glyph_indices` 或 `unusable_glyph_indices`，或者原生文本以 Private Use Area 字形代码字符串为主；原生文本部分或大部分是原始字形索引垃圾数据，使用前应对照渲染图/OCR 核实。
- `rtl_script_text` — 页面至少存在 50 个 Unicode 字母，且其中超过 25% 落在希伯来语、阿拉伯语或相关强从右至左（RTL）范围内；逻辑顺序会被保留，但词间空格可能消失，成对括号可能被镜像，因此在措辞准确性很重要时应对照渲染图核实。
- `localized_glyph_noise` — 多个不可打印码点出现但未达到混合字形阈值，原本可用的原生文本中出现了 Unicode 替换字符（`U+FFFD`），私有区字形代码在某个短片段中占主导或在原本可读的文本中反复出现，CJK 文本中出现孤立的拉丁扩展乱码，相邻的 Latin-1 补充可打印乱码在某个短文本片段中占主导，许多相邻的 CJK 字形被疑似人为插入的空格分隔或被重复为相邻对，或者可打印的字体映射噪声将大写 `LJ` 插入到本应全小写的单词中（例如 `veriLJcation`）；常见于损坏的公式、比较符号、单位标记、项目符号、点状引导符、非拉丁自定义字体、图标字体符号、CJK 文本定位伪影、文本层重复，或连字/字体映射替换。
- `font_mapping_warning` — pdf.js 报告字体字符映射数据缺失或可疑，而原生文本在其他方面看起来可用；可见文本可能渲染正确，但提取为可打印的字形替代字符，因此在文本准确性很重要时应对照渲染图核实。
- `raw_embedded_source_text` — 诸如 `<latexit...>` LaTeX 图像源代码这样的长嵌入生成器/源码负载泄漏进了原生文本；在对照渲染图/OCR 核实之前，应将对应的 `pages[].text`、布局文本和搜索命中视为机器残留内容。
- `invisible_text` — 在 PDF 文本渲染模式 `Tr 3` 生效期间执行了一次或多次文本绘制操作。pdf.js 在页面操作符列表中暴露了模式变化和解码后的字形 Unicode，因此警告在可能时会包含一小段示例。该文本仍保留在 `pages[].text` 中，但不会绘制给人类查看者看到；在信任它之前应对照 `--render` 核实。当整页栅格图像表明存在 OCR 文本层时会被抑制，包括低于常规 `raster_backed_text_layer` 阈值的稀疏 OCR 残留。不覆盖白色/与背景同色的文本，因为仅凭操作符填充颜色加上粗粒度的图像/矢量框，无法可靠确定每个字形之下的实际背景。
- `text_under_opaque_fill` — 一个或多个至少含 3 个非空白字符的原生文本 span，其至少 90% 的面积被后绘制的矩形路径填充所覆盖，该填充的 alpha 值在 0.9 到 1 之间、暗部亮度不超过 0.2、混合模式为 normal，且没有生效中的裁剪、软蒙版、透明度组或可选内容边界。警告会报告被覆盖的文本段数量和一小段示例。检测会从末尾开始，将归一化后的 span 与操作符列表中按顺序排列的文本绘制段对齐；一个 span 可能匹配相邻多个绘制段确定性拼接后的结果，只有在最后一次按顺序精确匹配之后绘制的填充才算数。这可以防止在填充之后又重绘了相同前景文本、因而被去重的 span 被误判为隐藏内容。当页面证据超过 4,096 个候选 span、文本绘制段或候选填充；65,536 个 span、原始绘制段或经 NFKC 归一化的 UTF-16 code unit；1,000,000 步绘制段/code unit 比较；或 250,000 次 span/填充覆盖检查时，收集与匹配会安全失败（fail closed）。路径数据本身必须证明在保轴 CTM 下是一个闭合的单一轴对齐矩形。复杂路径（包括带孔洞和不连通子路径的情况）、注释外观操作符、描边、浅色/半透明/透明、被裁剪、带软蒙版、透明度组或可选内容的填充，非 normal 或无法解析的混合模式填充，下划线/部分覆盖，在前景文本之前绘制的填充，旋转或倾斜的路径框，无效几何，以及无法解析的颜色，都会被忽略。CTM、填充颜色/透明度、非描边 alpha、混合模式、裁剪、软蒙版和标记内容状态会通过 save/restore 和 Form XObject 进行跟踪。Form BBox 裁剪会被视为生效中的裁剪。该检测在基于栅格的 OCR 文本层上会被抑制。不需要 `--geometry`、`--vector-boxes` 或 `--annotations` flag，并且该警告不会改变 `quality`。
- `dense_vector_graphics` — 页面包含大量有意义的矢量绘图操作；通常是表单框、表格线、图表路径、复选框或图示，其可见结构没有体现在原生文本中。当矢量框几何信息可用时，那些矢量只是零散小装饰、以文本为主的页面会被抑制。
- `vector_graphics_no_native_text` — 一个非空白的纯矢量页面没有原生文本；符号、图示或用路径绘制的标签可能在渲染图中可见，但不存在于 `pages[].text` 中。
- `tabular_numeric_layout` — 许多简短的数字行形成了多个共享行位置的对齐列；通常是财务报表或密集数字表格，其行/列关系在视觉上很明显，但在纯原生文本中可能会被拉平。图表坐标轴刻度标签和不规则的图表数据标签行会被抑制。
- `dot_leader_noise` — 许多独立的点状引导符/噪声行被提取为独立的布局文本；通常是目录的点状引导线、表格引导线、地图点画纹理，或用于在视觉上连接标签或表现纹理的装饰性点状图案，但在纯原生文本中可能表现为杂乱的点状段落。
- `tiny_native_text_noise` — 一段或多段较长的原生文本以极小字号排版，通常是隐藏的生成器链接或机器可读残留内容。在对照渲染图核实之前，应将对应的 `pages[].text`、链接和搜索命中视为可能对人类不可见。需要 `--layout` 或 `--geometry`。
- `duplicate_text_layer` — 原生文本中隐藏着一份与可见内容几乎重复的图层，位置经过一致的缩放/偏移，因此 `pages[].text` 被夸大，布局块也可能合并了重复的文本段；在可见文本准确性很重要时，应优先使用渲染图或 OCR。它可能与 `off_page` 或 `text_overlap` 同时出现，这两者仍是独立的布局几何信号。
- `raster_backed_text_layer` — 原生文本看起来是覆盖在整页栅格图像之上的 OCR/文本层，包括扫描封面上带有少量装饰性矢量标记的稀疏 OCR 层；文本可能有用，但容易出错，并且 bbox/布局几何可能与人眼看到的像素存在偏差。
- `raster_text_layer_symbol_noise` — 一个基于栅格的原生文本层以可打印的标点/符号噪声为主；常见于旧扫描件的 OCR 标题页，即使原生文本明显不可靠，`quality.nativeTextStatus` 仍可能是 `ok`。
- `raster_text_layer_word_fragmentation` — 一个基于栅格的原生文本层包含许多孤立的拉丁字母片段，这是老式 OCR 常见的失败模式，例如 `report` 会被提取为 `r e p o r t`；准确措辞和原生搜索的漏检应对照 `--ocr` 或渲染图核实。
- `raster_image_no_native_text` — 一张栅格图像占据了页面的主要部分，而原生文本为空，因此图像中人类可见的文字不会出现在 `pages[].text` 中；在文本准确性很重要时应对照渲染图或 OCR 核实。在空原生文本的页面上，该警告会取代 `large_raster_low_text_overlap`。
- `ocr_low_confidence` — 运行了 `--ocr`，置信度低于 0.5，同时原生提取为空、稀疏、字形损坏，或依附于基于栅格的文本层；OCR 文本存在，但在对照渲染图、语言选择或聚焦裁剪核实之前，应视为暂定结果。
- `ocr_native_text_mismatch` — 运行了 `--ocr`，置信度较高，且长度相近的较短 OCR 文本与原本状态为 ok 的原生文本明显不一致；通常是自定义字体正确渲染了单词，但提取为可打印的字形替代字符。
- `ocr_native_spacing_loss` — 在基于栅格的文本层上以高置信度运行了 `--ocr`，OCR 与原生文本包含相近的字符，但原生文本丢失了许多词边界；通常是扫描件的 OCR 层被提取为粘连的单词，尽管 OCR 能恢复正常的间距。
- `large_raster_low_text_overlap` — 一张大幅栅格图像占据了原生文本为空或稀疏的页面的主要部分，或者启用 bbox 的提取只发现极少重叠的原生文本，因此图像内部的标签、图表文字、地图文字或截图文字不会出现在原生文本中。在 `raster_image_no_native_text` 已经触发的空原生文本页面上，不会再输出该警告。
- `annotation_text_missing_from_native` — 一个或多个可见的 FreeText 注释外观的 `contents` 没有体现在 `pages[].text` 中；在将原生文本视为完整之前，应读取 `pages[].annotations` 或使用 `--search` / `--render-region`。即使输出没有请求 `--annotations`，该警告也可能出现。
- `optional_content_text_may_include_hidden_layers` — 页面文本流中包含带可选内容标记的文本，同时该 PDF 至少存在一个默认隐藏的图层；`pages[].text` 可能包含初始 viewer 渲染中并不显示的图层内容，因此应查看 `--layers` 并对照 `--render` 核实。
- `reading_order_divergence` — 视觉阅读顺序与 `pages[].text` 不一致。触发场景包括：在 `layout.blocks` 中位于最前面的标题只出现在原生文本流的后半部分；幻灯片风格中视觉上排在最前的标题/页眉被最后绘制、出现在原生文本末尾；靠后的底部备注或右侧边栏出现在原生文本开头；某个块内重建出的布局行被乱序输出；紧凑的数学式风格块出现字符重排，例如上标在基线表达式之后才被输出；或者 `--form-fields` 暴露的表单标签，其原生文本顺序与可见行顺序不同；诸如 `MM / DD / YYYY` 这样的表单日期占位符会被抑制。当顺序很重要时，应优先使用 `layout.blocks` 顺序而非 `pages[].text`——Markdown 格式化器在这些页面上已经会根据布局块重建正文。需要 `--layout`；`blockIndex` 指向发生错位的标题、幻灯片标题/页眉、靠后块、局部块或表单标签块。
- `xfa_form` — 文档级警告：该 PDF 声明为 XFA（LiveCycle）表单，附加在第一个提取页面上。标准文本层可能只是一个 viewer 占位符（“Please wait...”），真正的表单内容没有被提取——应将占位符文本视为未读取的内容，而不是文档本身。JSON/TOON/library 使用顶层的 `xfa: true`；XML 使用 `<document xfa="true">`。

与 `quality` 采用相同的观察态度：pdfvision 告诉智能体它看到了什么；由智能体决定是否要呈现、重新 OCR，或通过 `--render-region` 放大查看。

## 密度概览

当 `result.pages.length > 1` 时，Markdown 输出会以一个概览（Overview）表格开头：每页的 `Chars / Images / Coverage / Size`，外加 `Rotation`（有任意页面旋转时）、`Vectors`（有任意页面存在矢量绘图操作时）、`NonPrint`（有任意页面的不可打印比例非零时）、`Tables`（`--layout` 发现了行优先的表格线索）和 `Blocks`（开启了 `--layout`）。启用 `--layout` 时，Markdown 还会将检测到的 `layout.tables[]` 渲染为逐页的 `Layout tables` 小节，让财务报表等数字表格在聊天可读的输出中保留行/值关系。

JSON、解码后的 TOON 和 `processDocument()` 会把这些信号放在 `overview[]` 中，字段为 `charCount` / `imageCount` / `vectorCount` / `textCoverage` / `nonPrintableRatio` / `nonPrintableCount` / `rotation` / `width` / `height` / 嵌套的 `quality`。XML 使用 `<overview><page no="..." ...>` 属性，将 `quality` 拉平为 `nativeTextStatus` / `visualStatus`，目前会省略概览中的 rotation。在滚动查看正文之前，先阅读概览。

## 原始信号（`quality` 的输入）

- `textCoverage: 0`（在 markdown 中渲染为 `coverage: 0%`）+ `imageCount > 0` → 页面正文是一张栅格化图像。文本流为空。请用 `--ocr` 或 `--render` 重新运行。
- `textCoverage` 极低，加上 `imageCount > 0` / `vectorCount > 0` 且只有少量字符 → 可见页面的大部分内容都在原生文本之外（`quality.nativeTextStatus === 'sparse_text_with_visual_content'`）。在信任这份稀疏文本之前，先渲染查看。
- 极低的 `charCount` 加上密集的矢量结构，即使 `textCoverage` 不低，也可能同样映射到 `sparse_text_with_visual_content`，因为一个大水印文本项就可能覆盖页面的大部分面积，而可见的表单/表格/图表内容实际存在于矢量中。
- 存在原生文本，但 `quality.visualStatus === 'blank'` → 原生文本在渲染出的页面中不可见（`quality.nativeTextStatus === 'sparse_text_on_blank_visual'`）。常见于扫描书籍的前置页、不可见/字体损坏的文本，以及渲染失败的情况；不要将这段文本视为人类可见的页面内容。
- `vectorCount > 0` 且文本覆盖率低 → 即使 `imageCount` 为零，仍存在可见的非栅格结构（表单、图表路径、幻灯片形状、图示）。当视觉布局很重要时，请用 `--render` 检查。
- `nonPrintableRatio >= 0.05` → pdf.js 在页面至少部分区域回退到了原始字形索引，因为某些字体缺少 ToUnicode CMap（常见于希伯来语、较旧的 CJK 字体、自定义符号字体，以及带有品牌定制字体的年度报告）。`0.05–0.3` 对应 `quality.nativeTextStatus === 'mixed_glyph_indices'`：部分文本可能可读，但原生提取并不完整。`>= 0.3` 对应 `unusable_glyph_indices`：应将原生文本视为大部分是垃圾数据。原始计数在 `nonPrintableCount` 中——当保留三位小数的比例四舍五入为 0 时，该计数仍能告诉你是否有任何不可打印码点混入其中（对于“这一页里有没有任何垃圾数据”这类过滤条件很有用）。归一化后的 `pages[].text` 会剥离除 tab / 换行 / 回车之外的不可见 C0 控制字符，但这些计数器仍使用剥离前的文本信号，因此稀疏的控制字节证据依然可见。
- `charCount: 0` 但 `imageCount: 0` → 真正的空白页（分隔页、结尾页）。
- 在一份整体文本密集的文档中，某一页的 `textCoverage` 突然骤降 → 该页很可能是一张图、一份扫描件或一个图表。请用 `--render` 检查。
- `quality.visualStatus === 'sparse'` → 栅格化后的页面不是空白的，但可见标记太小/太稀疏，无法称得上页面视觉上有内容。这既可能是只有一行文字的页面，也可能是一个极小的图像/矢量/注释标记。应使用对象几何信息（`spans`、`vectorBoxes`、`imageBoxes`、`annotations`、`visualRegions`）或 `--render-region` 来检查这个标记，而不要将其视为渲染失败。
- `quality.visualStatus === 'blank'` → 栅格化后的页面**相对于自身的主导背景**呈现为空白。这可能是渲染流程失败（pdf.js + @napi-rs/canvas 无法解码 JPEG2000 图像流，或者字体没有可解析的字形），也可能是真正的空白页。该比例是感知背景的——深色书籍封面和米色扫描纸不会误触发它。这一页上的 OCR 会返回 `confidence: 0`，不是因为 OCR 失败，而是因为输入图像近乎单一色调。

## 警告目录（每个代码对应的智能体应对方式）

每个代码所需的 flag 已在行内标注。几何类警告绑定到布局块，因此需要 `--layout`；一些文本质量和图像警告依托始终开启的信号或内部检测流程，即使没有对应的输出 flag 也会出现。精确的触发/抑制条件参见上文的 `## 结构`。

- **`text_overlap`**（需要 `--layout`）— 非重复的布局块以可能打乱阅读顺序的方式发生重叠。应优先使用 `layout.blocks` 顺序；当顺序很重要时渲染该区域。
- **`near_bottom_edge`**（需要 `--layout`）— 正文文本异常地在接近页面底部处结束。
- **`body_near_repeated_chrome`**（需要 `--layout`）— 正文文本与检测到的重复页眉/页脚装饰重叠或几乎相接。
- **`page_edge_text_truncated`**（始终开启的文本几何信号）— 一段较长的提取文本沿其书写轴到达或轻微越过页面边界，这与 pdf.js 在页面框之外丢弃后续字形时留下的特征相符。原生文本可能不完整；请用 `--render` 或 `--render-region` 查看页面实际显示的内容。在齐边处以标点自然收尾的情况会被抑制。
- **`off_page`**（需要 `--layout`）— 某个布局块的 bbox 超出了页面范围。
- **`glyph_garbage_text`**（始终开启的文本质量信号）— 当 `quality.nativeTextStatus` 为 `mixed_glyph_indices` 或 `unusable_glyph_indices` 时触发，或者当原生文本以 Private Use Area 字形代码字符串为主时触发，即使此时 `nonPrintableRatio` 为 0。应将原生 `text`、`spans`、搜索命中和布局文本视为不完整或不可靠；用 `--render` 检查，并考虑使用 `--ocr`。
- **`rtl_script_text`**（始终开启的文本质量信号）— 当页面至少存在 50 个 Unicode 字母，且其中超过 25% 落在希伯来语、阿拉伯语或相关强从右至左（RTL）范围内时触发。原生提取仍保持逻辑顺序，但词间空格可能消失，成对括号可能被镜像；在措辞准确性很重要时应对照 `--render` 核实。
- **`localized_glyph_noise`**（始终开启的文本质量信号）— 当多个不可打印码点出现但未达到混合字形比例阈值时触发，当原生文本包含 Unicode 替换字符（`U+FFFD`）时触发，当私有区字形代码在某个短片段中占主导时触发，当 CJK 页面包含孤立的拉丁扩展乱码字符时触发，当文本以 Latin-1 补充可打印乱码为主时触发，当许多相邻 CJK 字形被疑似人为插入的空格分隔或被重复为相邻对时触发，或当可打印的字体映射噪声将大写 `LJ` 插入到本应全小写的单词中（例如 `veriLJcation`）时触发。常见情形：公式、比较符号、单位标记、项目符号、点状引导符、非拉丁自定义字体、图标字体、CJK 文本定位伪影、文本层重复，或连字/字体映射替换——这些在渲染时表现正常，但提取时变成控制字符、替换字形、人为插入的空格、重复的 CJK 字形，或散落的可打印字形。
- **`font_mapping_warning`**（捕获到的 pdf.js 字体/CMap 警告）— 当原生文本状态原本为 `ok`，但 pdf.js 报告字符映射数据缺失时触发。常见情形：自定义嵌入字体渲染可见，但提取为可打印的字形替代字符；当文本准确性很重要时用 `--render` 检查。
- **`raw_embedded_source_text`**（始终开启的文本质量信号）— 当诸如 `<latexit...>` LaTeX 图像源代码这样的长嵌入生成器/源码负载泄漏进原生文本时触发。在对照 `--render` 或 `--ocr` 核实之前，应将对应的 `pages[].text`、布局文本和搜索命中视为机器残留内容。
- **`invisible_text`**（始终开启的操作符列表信号）— 页面包含以 PDF 渲染模式 `Tr 3` 绘制的文本：它被包含在原生提取中，但人类查看者看不到它。这是一个 error 级别的信任信号；在对照 `--render` 核实之前，应将采样文本和匹配的原生搜索命中视为未经验证。整页栅格/OCR 文本层会被抑制，因为在那里出现不可见文本是预期行为，现有的扫描件警告已经说明了那种信任边界，包括低于常规 `raster_backed_text_layer` 阈值的稀疏 OCR 残留。颜色匹配的文本（例如白底白字）刻意不做检测：仅凭填充颜色，无法以可接受的精度区分隐藏内容与深色图像、矢量面板或非白色页面背景之上的合法浅色文本。
- **`text_under_opaque_fill`**（始终开启的操作符列表信号）— 即使后绘制的不透明深色矩形路径填充覆盖了原生文本至少 90% 的 span 面积，该文本仍可被提取。这是一个 error 级别的信任信号，可能意味着一次仅在视觉层面无效的涂黑处理。检测器要求路径几何为正向矩形，且最多用 16 个路径数值编码；复杂路径（包括带孔洞的奇偶规则边框）、注释外观操作符、透明填充、生效中的裁剪或软蒙版、透明度组填充、可选内容填充，以及非 normal 混合模式的填充都被排除在外。相邻的文本绘制段只能通过确定性的按序拼接与一个提取出的 span 对齐；当提取过程对相同的文本绘制做了去重时，由最后一次按顺序精确匹配来判断该填充是否真的绘制在后面。当每页超过 4,096 个候选 span、文本绘制段或候选填充；65,536 个 span、原始绘制段或经 NFKC 归一化的 UTF-16 code unit；共享的 1,000,000 步绘制段/code unit 比较预算；或 250,000 次 span/填充覆盖检查时，收集与对齐会安全失败（fail closed）。应将该示例和匹配的原生搜索命中视为已暴露的隐藏内容；在重复使用或信任被覆盖的文本之前，应对照 `--render` 核实。该检测在基于栅格的 OCR 文本层上会被抑制。不需要 `--geometry`、`--vector-boxes` 或 `--annotations` flag。
- **`dense_vector_graphics`**（始终开启的 `vectorCount` 信号）— 在以有意义的矢量绘图操作为主的页面上触发。那些矢量只是零散小装饰、以文本为主的页面会被抑制。常见触发情形：表单、复选框、表格线、图表路径，以及可见结构未体现在原生文本中的图示。
- **`vector_graphics_no_native_text`**（始终开启的 `vectorCount` 信号）— 当一个非空白的纯矢量页面没有原生文本时触发。常见情形：可见渲染但不出现在 `pages[].text` 中的符号、图示或路径绘制的标签；用 `--render`、`--vector-boxes` 或 `--visual-regions` 检查。
- **`tabular_numeric_layout`**（需要 `--layout`）— 当许多简短的数字行形成多个共享行位置的对齐列时触发。常见情形：财务报表和密集数字表格，其行/列关系在视觉上很明显，但在纯原生文本中可能被拉平。不规则的财务表格，只要带标签的行存在重复出现的数字列，仍然可能触发该警告；图表坐标轴刻度标签和不规则的图表数据标签行会被抑制。
- **`dot_leader_noise`**（原生文本/布局信号）— 当许多独立的点状引导符/噪声行被提取为独立文本时触发。常见情形：目录的点状引导线、表格引导线、地图点画纹理，以及用于在视觉上连接标签或表现纹理的装饰性点状图案，这些在纯原生文本中可能表现为杂乱的点状段落。
- **`tiny_native_text_noise`**（需要 `--layout` 或 `--geometry`）— 当较长的原生文本段以极小字号排版时触发，例如隐藏的生成器链接。在对照 `--render` 核实之前，应将对应的 `pages[].text`、链接和搜索命中视为可能对人类不可见。
- **`duplicate_text_layer`**（内部 span；无需 flag）— 当原生文本中隐藏着一份与可见文本几乎重复的图层、位置经过一致的缩放/偏移时触发。它可能与 `off_page` 或 `text_overlap` 同时出现，因为这些是独立的几何层面表现；在可见文本准确性很重要时，应优先使用渲染图或 OCR。
- **`raster_backed_text_layer`**（内部图像框检测；无需 flag）— 原生文本看起来是覆盖在整页栅格扫描件之上的 OCR/文本层，包括扫描封面上带有少量装饰性矢量标记的稀疏 OCR 层。应将该文本视为可能有用但容易出错：识别结果可能有误，精确的原生 `--search` 可能漏掉可见单词，`spans` / `layout.blocks` 也可能与人眼看到的像素对不齐。当措辞或搜索召回率很重要时，请用 `--ocr` 重新运行。
- **`raster_text_layer_symbol_noise`**（发生在基于栅格的文本层上）— 原生文本以可打印的标点/符号噪声为主（例如旧扫描件的 OCR 标题页上布满 `^`、`_` 和零散标记）。即使 `quality.nativeTextStatus` 仍是 `ok`，也应将原生文本视为格外可疑。
- **`raster_text_layer_word_fragmentation`**（发生在基于栅格的文本层上）— 许多拉丁单词被拆分成了孤立的字母片段（例如 `r e p o r t`）。应将准确措辞和原生搜索的漏检视为可疑；对照渲染图核实，或用 `--ocr` 重新运行。
- **`raster_image_no_native_text`**（内部图像框检测；无需 flag）— 一张栅格图像占据了页面的主要部分，但原生文本为空。图像中人类可见的文字不会出现在 `pages[].text` 中；在文本准确性很重要时应对照渲染图或 OCR 核实。在空原生文本的页面上，该警告会取代 `large_raster_low_text_overlap`。
- **`large_raster_low_text_overlap`**（内部图像检测；配合 `--image-boxes` + `--layout`/`--geometry` 时证据更强）— 当内部图像检测发现一张大幅栅格图像时，出现在空/稀疏文本的视觉页面上。配合 `--image-boxes` 加上 `--layout` 或 `--geometry`，它会将原生文本 bbox 与栅格区域进行比较，并附带 `imageBoxIndex` 以便精确定位后续操作。在 `raster_image_no_native_text` 已经触发的空原生文本页面上，不会输出该警告。可以理解为“这张图像内部的标签、图表文字、地图文字或截图文字可能需要 `--render` / `--render-region` / OCR”。
- **`ocr_low_confidence`**（需要 `--ocr`）— OCR 置信度低于 0.5，同时原生提取为空、稀疏、字形损坏，或依附于基于栅格的文本层。应将 OCR 文本视为暂定结果；在信任表单标签或小字号文本之前，先对照 `--render` 核实、调整 `--ocr-lang`，或裁剪/重试。参见 [`pdfvision docs ocr`](./ocr.md)。
- **`ocr_native_text_mismatch`**（需要 `--ocr`）— OCR 置信度较高，原生提取本身状态为 `ok`，但 OCR 与原生文本明显不一致。常见情形：自定义字体正确渲染了单词，但原生文本提取为可打印的字形替代字符；或者基于栅格的扫描件中，高置信度的 OCR 单词对应的最接近原生 token 是错误的。应对照 `--render` 核实；对于基于栅格的页面，应优先信任 OCR 的搜索命中，而非原生搜索的漏检。参见 [`pdfvision docs ocr`](./ocr.md)。
- **`ocr_native_spacing_loss`**（需要 `--ocr`）— OCR 在基于栅格的文本层上运行，置信度较高，OCR 与原生文本包含相近的字符，但原生文本丢失了许多词边界（`Ourwebsite` / `valuableresourcefor`），而 OCR 能恢复正常的间距。当准确措辞很重要时，应将 `ocr.text` 与渲染图对照。参见 [`pdfvision docs ocr`](./ocr.md)。
- **`annotation_text_missing_from_native`**（内部注释检测；无需 flag）— 可见 FreeText 注释的内容没有体现在 `pages[].text` 中，即使没有设置 `--annotations` 也是如此。应将原生文本视为不完整；在可见文本准确性很重要时，读取 `pages[].annotations`、使用 `--search`，或渲染该注释的 bbox。
- **`optional_content_text_may_include_hidden_layers`**（始终开启的信号）— 页面文本流中包含带可选内容标记的文本，且该 PDF 至少存在一个在默认 viewer 状态下隐藏的图层。pdf.js 的文本提取可能包含人类最初看不到的图层文本；在把 `pages[].text` 当作可见文本来信任之前，应查看 `--layers` 并对照 `--render` 核实。
- **`reading_order_divergence`**（需要 `--layout`）— 在视觉阅读顺序中排在最前面的标题，只出现在原生文本流的后半部分（杂志式的分栏版面被乱序输出——页面标题被埋在 `text` 中间）；幻灯片风格中视觉上排在最前的标题/页眉被最后绘制、出现在原生文本末尾；靠后的底部备注或右侧边栏出现在原生文本开头；某个块内重建出的布局行被乱序输出；紧凑的数学文本以偏离视觉顺序的方式被提取；或者 `--form-fields` 暴露的表单标签，其原生文本顺序与可见行顺序不同。当顺序很重要时，应优先使用 `layout.blocks` 顺序而非 `pages[].text`——这是消息在 JSON、XML 和 TOON 中给出的应对方式。Markdown（因而也包括 MCP 工具）在这些页面上已经切换为基于布局重建的正文，因此在那里消息会改为说明：这种偏差是真实存在的，你手上的文本已经是视觉顺序，当顺序至关重要时，`--render-region` / `render_pdf` 是确认步骤。
- **`xfa_form`**（始终开启的文档级信号，附加在第一个提取页面上）— 该 PDF 声明为 XFA（LiveCycle）表单，常见于政府表单。动态 XFA 会把真正的表单内容存放在标准提取永远看不到的 XML 流中：文本层往往只是一个“Please wait... upgrade Adobe Reader”式的 viewer 占位符，报告的页数也可能坍缩为一个占位页。绝不要依据占位符文本作答；应报告该文档是一个 pdfvision 无法提取其内容的 XFA 表单，并建议在 Adobe Acrobat/Reader 中打开它。JSON/TOON/library 使用顶层的 `xfa: true`；XML 使用 `<document xfa="true">`。
