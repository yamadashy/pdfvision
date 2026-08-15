---
title: "文档功能"
description: "文档级输出结构：--structure 标记树与表格、--page-labels、--attachments、--outline、--viewer 状态和 --layers。当导航、无障碍标记、嵌入文件或可选内容有意义时使用。"
sourceHash: d215b9d959bd
---

<!-- Translated from docs/src/en/guide/document-features.md, which is generated from docs/cli-topics/document-features.md.
     Translate the prose, keep code, field names, flags, and warning codes verbatim, and update
     `sourceHash` to the value reported by `node scripts/build-site-reference.mjs`. -->

# 文档级功能

面向 `-f json`、`-f xml` 和 `-f toon` 使用者的参考文档。

## 结构（`--structure`）

```ts
interface PageStructureNode {
  role: string;                 // tagged-PDF role, role-map-resolved by pdf.js when possible
  alt?: string;                 // alternate text, often figure/formula descriptions
  mathML?: string;              // MathML for Formula nodes when pdf.js exposes it
  lang?: string;                // language hint for this structure node
  bbox?: number[];              // [x, y, width, height] in page-view top-left user space
  children: PageStructureItem[];
}

type PageStructureItem = PageStructureNode | PageStructureContent;

interface PageStructureContent {
  type: string;                 // usually "content", "object", or "annotation"
  id: string;                   // pdf.js id that maps to marked content, an object, or an annotation
}

interface PageStructureTable {
  rows: { cells: PageStructureTableCell[] }[];
}

interface PageStructureTableCell {
  text: string;
  header?: 'column' | 'row';
}
```

`pages[].structure` 展示了标记 PDF（tagged-PDF）结构树，人类读者可以通过 PDF viewer 的无障碍层访问到它。这对于无障碍政府 PDF、手册、报告和表单尤其有用，因为其中图形的 `alt` 文本比原生文本提取更能描述一个视觉区域。例如，IRS 说明文件可以通过 `alt` 展示封面图形完整的人工撰写描述，即使原生文本流只列出了片段。结构 `bbox` 值使用 `[x, y, width, height]`，采用与 `spans`、`layout.blocks` 和 `imageBoxes` 相同的未旋转页面视图左上角坐标系统。结构字符串中的杂散控制字节会在输出前被移除，因此格式错误的 `alt` / `lang` 值不会向 JSON、XML、Markdown 或 TOON 泄漏 NUL 字节。`structure: null` 表示该 pass 已运行，但 pdf.js 未找到页面结构树；`structure` 字段缺失则表示未请求 `--structure`。`overview[].structureNodeCount` 镜像结构节点数量，方便多页文档的使用者在遍历每棵树之前先找到带标记的页面。

`pages[].structureTables` 通过关联结构内容 id 与已加载文本流中的 marked-content id 来重建 `Table` role。它支持 `THead` / `TBody` / `TFoot` 包装器以及直接的 `TR` 子节点。`TBody` 中的 `TH` 是行标题；其他被包装的 `TH` 单元格是列标题。对于没有包装的行，`TH` 单元格是行标题，除非第一行全部是 `TH`，此时该行会被归类为列标题。空的标记单元格保持为空字符串。单元格内的段落用 `<br>` 连接，嵌套表格会被拍平进父单元格文本。pdf.js 不暴露表格跨度或显式 `/Scope`，因此无法表示 `RowSpan` / `ColSpan`，标题方向只能靠启发式判断。跨页拆分的表格不会被合并。当不存在带标记的 `Table` 时该字段缺失；它独立于基于几何形状推导的 `layout.tables[]`，因此同时请求 `--layout` 和 `--structure` 可能会让同一个可见表格出现两次。
## 页码标签（`--page-labels`）

`pageLabels[]` 是源 PDF 完整的 viewer 页码标签数组，从物理页 1 对应数组下标 0 开始索引。当 PDF 定义了标签时，`pages[].pageLabel` 和 `overview[].pageLabel` 会镜像所选页面对应的条目。当 PDF viewer 把前置内容显示为 `i`、`ii`……并在正文重新从 `1` 开始编号时，或者当各节使用 `A-1` 这样的前缀时，可以用到这个字段。CLI 的页面选择器仍然使用物理页码；`pageLabel` 告诉智能体人类在 viewer 界面上实际看到的是什么。
## 附件（`--attachments`）

```ts
interface DocumentAttachment {
  name: string;          // decoded filename shown by the PDF viewer
  rawName?: string;      // raw PDF filename when it differs from name
  description?: string;  // file-spec description when present
  size: number;          // embedded file byte length
  path?: string;          // saved path, present when --attachment-output was provided
}
```

`attachments[]` 展示了人类 PDF viewer 会在其附件面板或页面文件附件图标中暴露的嵌入文件附件。附件字节故意不包含在 JSON/XML/Markdown/TOON 输出中；把这些元数据当作 PDF 含有补充文件的信号即可，不会让任意二进制内容淹没智能体的上下文。当智能体需要磁盘上的实际文件时，配合 `--attachments` 传入 `--attachment-output <dir>`；pdfvision 会把文件写入按每个 PDF 指纹划分的子目录下，并填充 `attachments[].path`。
## 大纲（`--outline`）

```ts
interface DocumentOutlineItem {
  title: string;
  type?: 'destination' | 'url' | 'action';
  target?: string;              // named/internal destination, explicit-destination JSON, URL, or action name
  page?: number;                // 1-based, resolved when pdf.js can map the destination
  items?: DocumentOutlineItem[];
}
```

`outline[]` 展示了人类 PDF viewer 侧边栏中显示的文档大纲/书签。它保留嵌套结构、外部 URL、`NextPage` 这样的具名 viewer action，并在可能的情况下把具名或显式的 PDF 目标解析为从 1 开始的页码。空的 `outline: []` 表示该 pass 已运行且 PDF 没有大纲；`outline` 字段缺失则表示未请求 `--outline`。
## Viewer 状态（`--viewer`）

```ts
interface DocumentViewerState {
  pageLayout?: string;          // initial layout such as TwoColumnLeft
  pageMode?: string;            // initial mode such as UseOutlines or UseThumbs
  viewerPreferences?: Record<string, JsonValue>;
  openAction?: {
    type: 'destination' | 'action';
    target?: string;            // destination JSON/name when type is destination
    page?: number;              // 1-based, resolved when possible
    action?: string;            // PDF action name for non-destination actions
  };
  jsActions?: Record<string, string[]>; // document-level JavaScript action scripts
  permissions?: {
    flags: number[];            // raw PDF permission flags
    allowed: string[];          // decoded names; empty means permissions were present but none matched
  };
  markInfo?: {
    marked: boolean;            // tagged-PDF / structure presence signal
    userProperties: boolean;
    suspects: boolean;
  };
}
```

`viewer` 展示了人类 PDF viewer 在阅读页面文本之前会用到的文档级状态：侧边栏/页面模式、页面布局、`DisplayDocTitle` 这样的 preferences、catalog `OpenAction`、诸如自动打印脚本这样的文档级 JavaScript actions、权限 flags，以及标记 PDF 的 `MarkInfo`。文档级 JavaScript 的存在与否始终可以通过 `javascriptActionCount` 获知；`--viewer` 会把它展开为 `viewer.jsActions` 下的 action 名称和脚本源码。同一次 `--viewer` pass 还会在页面定义了 `PageOpen` / `PageClose` 这类页面级 JavaScript actions 时，把它们输出到 `pages[].jsActions`。为了可读性，Markdown 会缩短过长的 JavaScript action 摘要；JSON、XML 和 TOON 保留完整的结构化值。当打开位置、书签/侧边栏模式、由 JavaScript 触发的 viewer 行为、复制/打印权限或标记 PDF 结构会影响导航或无障碍体验时，可以在规格书、手册、论文、表单和长报告上使用它。空的 `viewer: {}` 表示该 pass 已运行且不存在 viewer 级设置；`viewer` 字段缺失则表示未请求 `--viewer`。
## 图层（`--layers`）

```ts
interface DocumentLayers {
  name?: string;                 // optional-content configuration name
  creator?: string;              // optional-content configuration creator
  order?: DocumentLayerOrderItem[]; // viewer layer-panel order, including nested groups
  groups: DocumentLayerGroup[];
}

type DocumentLayerOrderItem = string | { name?: string; order: DocumentLayerOrderItem[] };

interface DocumentLayerGroup {
  id: string;                    // PDF optional-content group id, e.g. "4R"
  name?: string;                 // layer name shown by PDF viewers
  visible: boolean;              // display-intent visibility after the default config is applied
  intent?: string[];             // OCG intent names such as View or Design
  usage?: {
    viewState?: 'ON' | 'OFF';
    printState?: 'ON' | 'OFF';
  };
  rbGroups?: string[][];         // mutually exclusive radio-button layer groups
}
```

`layers` 展示了 PDF 的 optional content group，也就是人类 PDF viewer 可能为地图、CAD/设计文件、多语言变体和叠加层密集的文档暴露出的图层面板。当可见内容可能依赖于某个被切换的图层时，或当仅凭文本、矢量和图像看起来地图/设计页面内容不完整时，可以用到它。`groups[].visible` 反映的是应用文档默认 optional-content 配置之后，pdf.js 的 display-intent 可见性。pdf.js 的文本提取可能包含来自在默认 viewer 状态下被隐藏的图层的 optional-content marked 文本；当 `pages[].warnings[].code === "optional_content_text_may_include_hidden_layers"` 时，在把该文本当作完全对人类可见之前，先对照 `--render` 检查 `pages[].text` 并查看 `--layers`。空的 `layers: { groups: [] }` 表示该 pass 已运行且 PDF 没有 optional content group；`layers` 字段缺失则表示未请求 `--layers`。
