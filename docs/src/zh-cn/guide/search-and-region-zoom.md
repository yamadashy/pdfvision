---
title: "搜索与区域放大"
description: "SearchMatch 结构以及 --search 的每一种语义：字面量 vs 正则、归一化、搜索哪些来源，以及先搜索再放大的循环。当运行 --search 或解读其匹配结果时使用。"
sourceHash: ad23953812df
---

<!-- Translated from docs/src/en/guide/search-and-region-zoom.md, which is generated from docs/cli-topics/search.md.
     Translate the prose, keep code, field names, flags, and warning codes verbatim, and update
     `sourceHash` to the value reported by `node scripts/build-site-reference.mjs`. -->

# 搜索输出

面向 `-f json`、`-f xml` 和 `-f toon` 使用者的参考文档。

## 搜索（`--search`）

```ts
interface SearchMatch {
  page: number;                // 1-based, mirrors PageResult.page
  query: string;               // verbatim source query
  queryIndex?: number;         // 0-based into the search array; omitted for single-query calls
  bbox: { x, y, width, height }; // union bbox of contributing spans/words/widgets/links/annotations
  boxes: { x, y, width, height }[]; // per-span/word/widget/link/annotation bboxes
  text: string;                // matched substring in the same form as pages[].text
  source: 'native' | 'formField' | 'link' | 'annotation' | 'ocr'; // native/span, formField/widget, link target, annotation, or OCR
  context?: string;            // surrounding line text for human / LLM readability
}
```

仅在传入 `--search` 时才会输出。每一次被输出的查询命中都会成为一条 match —— 如果第 5 页上 `"foo"` 有三次命中被输出，就会得到三条 `page: 5` 的条目。每个页面、查询和来源组合最多输出 10,000 条 match。第一条超出上限的有效 match 会产生一条警告（CLI 中输出到 stderr，库 API 中通过 `onWarning`）；该 match 及该组合后续的 match 都会被丢弃。

**单一流程的先搜索再放大**：pdfvision 输出的每个 box 都已经处于 `--render-region` 的坐标系统中，不需要转换。优先使用 `--matches-only`，它的条目会附带一个已经扩展到包含该命中的表格行或视觉行的、可直接裁剪的 `region`；`bbox` 只裁剪匹配到的字形本身，这在财务表格上只会渲染出行标签而没有任何数值。`region` 只存在于 `--matches-only` 报告中——在完整报告中，需要先按 pdfvision 自身的做法把 `bbox` 扩展一圈再渲染：水平方向每边扩展 `max(60, 0.6 × bbox.width)`，垂直方向扩展 `max(12, 0.3 × bbox.height)`，单位为原始 page-view 单位，并裁到页面边界内（`--render-region` 会拒绝越界矩形而不是自动裁剪它们）。智能体的循环是：

```bash
pdfvision doc.pdf --search "revenue" --json
# pick a match m from pages[N].matches[*]
pdfvision doc.pdf -p <m.page> --render --render-region <m.bbox.x>,<m.bbox.y>,<m.bbox.width>,<m.bbox.height>
```

`--matches-only` 让扁平报告保持紧凑，但仍会以可选的 `pageUserUnits: [{ page, userUnit }]` 元数据（JSON/TOON 中）、等价的 `<pageUserUnits>` 条目（XML 中）以及 `Page UserUnits` 摘要（Markdown 中）保留非默认的物理缩放信息。当所选的每一页都使用 UserUnit 1 时，该字段会被省略。每条 match 都同时带有 `bbox`（紧贴匹配字形的原始 page-view box）和 `region`（扩展到包含该命中的表格行、或页面没有检测到表格时的视觉行的、可直接裁剪的 box）。XML 在 `<match>` 上把这对值暴露为 `x`/`y`/`width`/`height` 加上 `regionX`/`regionY`/`regionWidth`/`regionHeight`。两者都是可以原样传给 `--render-region` 的原始 page-view 值。请传入 `region`：如果传入 `bbox`，裁剪出来的只是匹配到的字形本身，这在财务表格上只会渲染出行标签而没有任何数值。

**语义**：

- **默认按字面子串匹配**（查询中的正则字符会被转义）。传入 `--search-regex` 以启用 JavaScript 正则表达式。
- **默认大小写不敏感**（以召回率为导向）。传入 `--search-case-sensitive` 以进行精确大小写匹配。
- **在字面模式下，当 `--normalize` 开启（默认开启）时会做 NFKC 归一化并清理 C0 控制字符** —— `"fi"` 能找到 `"ﬁ"`（U+FB01 连字）这类外部 grep 会漏掉的 PDF，全角拉丁字符/CJK 兼容形式会做同样的归并，非可见 C0 控制字符的清理规则也和 `pages[].text` 一致。
- **字面模式下感知 CJK 显示间距** —— 查询中相邻的 CJK 字符可以匹配 PDF 文本流中用于视觉排版的标题间距，因此 `科学` 可以找到 `科 学`，同时仍然把较宽的分栏间隙当作搜索行的换行处理。
- **紧凑的表头行可以作为短语整体搜索** —— 像 `"Advance Estimate Second Estimate Third Estimate"` 这样相邻的短列标签，仍可作为一整行被搜索到，而宽泛的正文分栏则保持各自独立。
- **正则查询不会被归一化** —— NFKC 可能把兼容标点转换成正则元字符（导致静默的过度匹配或语法错误）。使用正则的用户拿到的是自己输入的字面码点，针对的是已归一化的文档文本，这种不对称需要使用者自行承担。
- **多查询**通过重复传入 `--search`（或库中的 `search: string[]`）实现。每条 match 都带有 `queryIndex`，方便智能体分辨该 match 来自哪个查询。
- **原生文本按重建后的视觉行级别进行搜索**。一个查询可以跨越同一行内的 pdf.js span / font-run 边界（例如 `"Hello World"` 被拆成 `Hello` + `World`），返回一个联合 `bbox` 加上逐 span 的 `boxes[]`；但窄的水平分栏间隙会被当作换行处理，因此 match 不会把一个水平分栏的末尾和另一个分栏的开头拼接起来。检测到的 CJK 竖排正文列按从上到下、从右到左的阅读顺序搜索；被 `pages[].text` 和 layout 排除的半宽振假名/ruby 列，同样不会出现在原生搜索行中。只有当源文本流本身已经遵循该顺序时，`pages[].text` 才会拼接同样的这些列。跨行短语拼接目前有意未建模，因为拼出的区域通常对视觉放大来说太宽泛了。
- **部分命中的原生 span 会在 span bbox 内部被切片**：水平 span 沿 x 轴切片，竖直/旋转的高 span 沿 y 轴切片，这样 `--render-region` 就能放大到匹配的单词而不是整行。
- **文本/选项类表单字段的值也会被搜索**。表单字段的 match 会带有 `source: 'formField'`，并使用 widget 的 bbox，即使输出时并未请求 `--form-fields`；当 pdf.js 暴露了 `maxLen`/comb 外观元数据时，comb 文本 widget 的 match 会被收窄到匹配的具体格子。对于选项字段，当所选选项的可见显示值与导出值不同时，搜索的是可见显示值。诸如未勾选复选框的 `Off` 值，或隐藏/noView widget 值这类不可见文本的内部值不会被搜索。
- **链接目标也会被搜索**。链接的 match 会带有 `source: 'link'`，并使用可点击链接的 bbox，即使输出时并未请求 `--links`。这使得即便可见链接文本出现字形乱码，针对 URL / destination / 附件目标的搜索依然能成功。
- **可见的 FreeText 注释内容也会被搜索**。注释的 match 会带有 `source: 'annotation'`，并使用注释的 bbox，即使输出时并未请求 `--annotations`。便签弹出内容和其他默认收起的注释评论不会被搜索。
- **当 `--ocr` 开启时，OCR 文本也会被搜索**。来自 OCR 的 match 会带有 `source: 'ocr'`；当存在 `ocr.words[]` 时，`bbox`/`boxes[]` 使用与原生 span 相同的原始 page-view 坐标系统中的 OCR 单词几何信息。如果单词级重建漏掉了一次或多次命中，pdfvision 会从完整的 `ocr.text` 中补充一个页面级 bbox，让无空格文字体系和 OCR 行边界差异仍然可以被搜索到。如果原生文本、表单字段值或可见注释文本已经在该页上产生了相同的查询/文本命中，重复的 OCR 命中会被抑制，从而让更精确的非 OCR bbox 胜出；仅存在于 OCR 中的额外命中仍会被输出。

当 `--search` 已运行但该页没有命中时，`pages[].matches` **以 `[]` 的形式存在** —— 这与字段完全缺失（未请求搜索）是不同的情况。同样的约定也延伸到了 overview，它会得到一个 `matchCount` 镜像字段，具有相同的“存在但为 `0`”语义。
