---
title: "布局与几何结构"
description: "--layout 的 block / line / table 结构、多栏阅读顺序、重复出现的 chrome、标题层级，以及 --geometry 的 span 约定。适用于需要重建结构或阅读顺序，而非读取扁平文本的场景。"
sourceHash: d1f8f8095566
---

<!-- Translated from docs/src/en/guide/layout.md, which is generated from docs/cli-topics/layout.md.
     Translate the prose, keep code, field names, flags, and warning codes verbatim, and update
     `sourceHash` to the value reported by `node scripts/build-site-reference.mjs`. -->

# 布局与 span 几何信息

面向 `-f json`、`-f xml` 和 `-f toon` 消费者的参考文档。

## 布局（`--layout`）

```ts
interface PageLayout {
  blocks: LayoutBlock[];     // in approximate reading order (multi-column aware)
  tables?: LayoutTable[];    // row-major hints for aligned numeric tables
}

interface LayoutBlock {
  text: string;              // line texts joined with \n
  x: number; y: number; width: number; height: number;
  lines: LayoutLine[];
  writingMode?: 'vertical';  // present for detected CJK top-to-bottom glyph stacks, including body text
  role?: 'heading';          // heuristic heading classification — see `level`
  level?: 1 | 2 | 3;         // present iff role === 'heading': 1=title, 2=section, 3=subsection candidate
  repeated?: boolean;        // chrome (running header / footer / page number / watermark), usually detected across pages
}

interface LayoutLine {
  text: string;
  x: number; y: number; width: number; height: number;
  fontSize: number;          // most common fontSize across the spans in this line
  writingMode?: 'vertical';  // present for top-to-bottom CJK glyph stacks, including body text
}

interface LayoutTable {
  x: number; y: number; width: number; height: number;
  rowCount: number;
  columnCount: number;       // maximum cells in any row
  rows: LayoutTableRow[];
}

interface LayoutTableRow {
  y: number; height: number;
  cells: LayoutTableCell[];  // sorted left-to-right
}

interface LayoutTableCell {
  text: string;
  x: number; y: number; width: number; height: number;
}
```

`--layout` 添加了一个带几何信息和角色（role）提示的替代阅读顺序视图；它绝不会替换原生文本。在 JSON/XML/TOON 中，`pages[].layout` 只有在指定 `--layout` 时才会出现，而 `pages[].text` 始终保持未经改动的 pdf.js 流，因此可以对 block 与原始文本做差异比较。Markdown 是例外：它内部总是会执行布局分析，因此只要存在任何 block，每页正文就是按布局重建的阅读顺序，只有在没有 block 时才会回退到 `pages[].text`；在 Markdown 中，`--layout` 只控制结构性附加内容——即每页的布局表格区块，以及 Overview 中的 `Blocks` / `Tables` 列。注意不存在 `pages[].layout.lines`——行信息位于 `blocks[].lines` 下。

多栏阅读顺序：`blocks[]` 会先自上而下读完左栏，再读右栏。布局分析会把反复出现的窄间隙（gutter）和反复出现的右侧面板起始位置视为分栏/分表边界，包括横向页面中数字侧边面板导致主体正文栏只覆盖物理页面部分宽度的情况。当 pdf.js 将单词以独立 span 形式输出时，它会保留紧凑的拉丁文和阿拉伯文单词间距，把带有展示性字间距的短 CJK 标题行保持在同一行（例如 `科 学`），把带缩进的单行文本归入最近的现存栏，而不是把它们变成横跨整页的分隔符，避免让高大的首字下沉（drop cap）吞并后续段落行，让窄小的独立数字页码标签与周围正文保持分离，并把页面底部的小号版权/页脚说明移到主体双栏正文之后。它还会检测正文字号大小的单字符 CJK 竖排文本行、紧凑的展示性 CJK 字形堆叠，以及视觉上呈竖排的高 CJK span，在几何位置与源顺序一致时，把 tatechuyoko（竖中横）数字组保持在同一竖排栏内联排列，把每一栏自上而下拼接，再把相邻的正文栏按从右到左分组，栏与栏之间用 `\n` 分隔，并给这些 block/line 标记 `writingMode: "vertical"`，使消费者不会将其误认为横排行。当相邻的竖排注音（ruby）栏或行上方的横排假名文字能明确映射到一段无歧义的 CJK 基字范围时，振假名/注音会以 `base《ruby》` 的形式附加到布局文本中；否则会被排除，而不是变成独立的布局噪声。竖排正文栏右侧间隙中的中等大小短注释引用标记同样会被排除，而不是成为独立的布局 block。`pages[].text` 只把同一套正文字号竖排检测器用作按流顺序（stream-order）拼接：当源条目顺序已经与自上而下的几何位置一致时，才会拼接检测到的一栏，否则按每段竖排文本单独回退，而不会重新排序。独立的一级/二级标题会充当分栏符；三级候选标题则保留在原栏内，以避免子章节分隔打乱阅读顺序。block 聚类目前仍是启发式的——表格单元格有时会被合并成同一个 block。

重复 chrome 检测在 block 聚类之后运行。当一个多行的边缘 block 中只有一行是重复的页面 chrome（例如与附近正文粘连在一起的幻灯片页脚）时，pdfvision 会把该行拆分成独立的 `repeated: true` block，并让相邻的正文行保持非重复状态。该字段在 JSON/TOON 中原样存在；XML 使用 `<block repeated="true">`，而 Markdown 只有在指定 `--strip-repeated` 时才会省略该 block。页面左右边缘的窄竖排 block 在被判定为 chrome 之前也需要额外佐证：包含 `。` 或 `、` 的句子式文本，以及超过短 chrome 长度上限的竖排边缘文本，永远不会被标记为 `repeated`；在多页提取中，同一段归一化后的短边缘文本必须在至少两个被选中的页面上重复出现；在单页提取中，只有 `第`、`章`、数字，或 `第1章` 这类保守的短标记才能被标记。像 `Yes.`、`No.`、`STOP` 这样的短表单控件标签，即便在决策树说明中反复出现在页面边缘，也不会被当作页面 chrome。

`tables[]` 是针对对齐数字表格的保守的按行主序（row-major）提示。当多行都含有若干单元格且至少两个数字单元格时会出现该字段，这在财务报表和政府统计表格中很常见；当有足够多的规则行使表格形状清晰可辨时，紧凑的两栏年份/数值表也会被纳入。请把它当作视觉结构辅助手段，而不是完整的表格解析器：合并表头、续接标签和脚注仍可能需要借助 `--render` / `--render-region`，但当表格被拆分成标签列和数字列时，`blocks[]` 常常会丢失行/单元格顺序，而 `rows[].cells[]` 保留了这一顺序。密集且反复出现的数字间隙会在构建表格之前被拆分，这样当视觉网格规则时，相邻数值不会被合并进同一个单元格，包括带逗号格式数值或类似 `13.0x` 比率单元格的紧凑侧边表格。含有三个或更多数字 span 的密集行也会拆分同一行内窄的数字间隙，包括财务报表行中尾随货币符号在视觉上标记下一数值列的情形。含有三列或更多重复数字列的宽表格，也会保留紧邻第一个完整填充行之上的短表头行和稀疏首行，包括类似 `1.0 · 10^20` 的科学计数法单元格和类似 `298 / 400 (~90th)` 的分数/百分位单元格，从而使表格 bbox 从人眼可见的表格顶部开始。在对行进行分组时会忽略出版商表格边框中的装饰性点状分隔线文本，避免一条较高的点状边框把所有单元格吸收进同一行。附近只含标签的续接行会并入下一行的标签，除非它们看起来像章节标题。当带标签的行拥有重复的数字列时，仍然接受不规则的行间距，因此带有多行标签、小计间隙，以及在重复年份列之前有较长的类正文标签的财务表格，仍会保持可见，而不会被当作相邻正文而被裁掉。当行内位置能明确表明关系时，独立出现的货币符号会并入紧随其后的数字单元格。

### 标题层级（`role === 'heading'`）

当一个 block 被判定为标题时会设置 `role`；`level` 则给出视觉层级：

- `level: 1` — 论文/页面标题（fontSize ≥ 正文中位数的 1.40 倍，或位于 ≥ 1.25 倍区间内的页面顶部文档标题）。
- `level: 2` — 章节标题（按旧规则 ≥ 1.25 倍，或在有结构性支持时 ≥ 1.15 倍：文本短，且要么独占一行，要么在局部范围内明显大于相邻文本）。可捕获典型的 LaTeX 12pt-over-10pt 章节样式。
- `level: 3` — 子章节候选（≥ 1.08 倍，单个短行，在局部范围内明显大于同栏相邻文本）。置信度较低；类似 ResNet 论文中 `3.1.`、`3.4.` 这类标题。

根据具体用例选取合适的切片：
- 仅标题：`role === 'heading' && level === 1`。
- 高精度（仅章节）：`role === 'heading' && level <= 2`。
- 侧重召回（包含子章节）：所有 `role === 'heading'`。

重复 chrome 的判定优先于标题分类。当一个形似标题的运行页眉/页脚被标记为 `repeated: true` 时，pdfvision 会丢弃 `role`、`level` 和 `roleConfidence`，使重复的页面 chrome 不会出现在标题列表中。在对正文内容分块时，仍应优先过滤掉 `repeated: true`。
## Span（`--geometry`）

```ts
interface TextSpan {
  text: string;              // NFKC-normalized and C0-cleaned by default (disable with --no-normalize)
  x: number; y: number;      // unrotated page view, top-left origin
  width: number; height: number;
  fontSize: number;          // largest finite non-zero text-matrix scale; otherwise reported/effective item height
  fontName?: string;         // stable page-local alias e.g. "font1"
}
```

每个公开的 span 对应一个被保留下来的、带定位信息的 pdf.js 文本条目，其 `text` 可能是一个字符、一个单词，或更长的字符串。相邻条目在公开的 `spans[]` 中不会被合并或拆分；布局/搜索功能可能会重建行或切分匹配框，但不会改变这一粒度。经过四舍五入的 bbox 是该条目的整体轴对齐外包框，而不是单个字形的轮廓。去重发生在归一化之前。其去重键使用原始 `str`、原始 `fontName`（或空值）、宽度、有效高度，以及每个变换分量四舍五入到三位小数后的值（不存在时为 `no-transform`）。有效高度取自一个为正的已报告高度；若没有，则取最大的有限非零文本矩阵缩放值；若两者都没有，则为零。`fontSize` 优先使用该最大可用矩阵缩放值，只有当两个矩阵缩放值都不可用时，才回退到已报告/有效的条目高度。匹配到相同去重键时保留第一个条目，并对 `hasEOL` 做逻辑或（OR）运算；相同的原始文本在不同变换下仍视为不同条目，而不同的原始条目可能会归一化为相同的公开文本。没有变换信息的条目（可能是印前制作文本）、纯空白条目，以及归一化后变为空的条目会被省略。`fontName` 是一个稳定的页面内本地别名。几何信息可能会大幅增大输出体积。
