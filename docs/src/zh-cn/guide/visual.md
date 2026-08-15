---
title: "视觉区域与渲染"
description: "--image-boxes、--vector-boxes 和 --visual-regions 的结构，以及 --render-scale 和 --render-region 的作用。适用于挑选图、图表、表格或表单区域进行渲染并做视觉检查的场景。"
sourceHash: b268aaef34d7
---

<!-- Translated from docs/src/en/guide/visual.md, which is generated from docs/cli-topics/visual.md.
     Translate the prose, keep code, field names, flags, and warning codes verbatim, and update
     `sourceHash` to the value reported by `node scripts/build-site-reference.mjs`. -->

# 视觉几何信息与渲染

面向 `-f json`、`-f xml` 和 `-f toon` 消费者的参考文档。

## 图像框（`--image-boxes`）

```ts
interface ImageBox {
  x: number; y: number; width: number; height: number;
}
```

每绘制一个实例就生成一条记录——平铺（tiled）的大图会产生多条记录。通过填充路径绘制的、承载图像的平铺图案会以所绘制路径的 bbox 形式呈现，因此被遮罩（mask）或图案化的图像仍然可以成为裁剪目标。指定 `--image-boxes` 时，每页的 `imageCount === imageBoxes.length`；未指定时，`imageCount` 仍会报告数量，但不会出现 `imageBoxes`。对 Form XObject 的 CTM（当前变换矩阵）跟踪确保在 form 内绘制的图像落在正确的页面坐标位置上。
## 矢量框（`--vector-boxes`）

```ts
interface VectorBox {
  x: number; y: number; width: number; height: number;
}
```

每个 pdf.js 报告了路径 bbox 的已绘制矢量路径生成一条记录；当 pdf.js 暴露了当前裁剪 bbox 时，渐变填充（shading fill）也会生成记录；页面大小的白色背景填充则被排除在外。这对地图、符号表、图表、图示、渐变面板、表格线、表单框和幻灯片形状很有用：这些都是人眼能看到、但既不是原生文本也不是位图图像的内容。水平/垂直的描边（stroke）会在退化维度上被扩展到至少 0.5 个原始页面视图单位，以便其框可以作为 `--render-region` 的输入。`vectorCount` 仍然是衡量有意义矢量绘制操作的宽泛密度信号；`vectorBoxes[]` 是可选启用的位置信号，当某个底层操作没有 bbox 时，其长度可能短于 `vectorCount`。
## 视觉区域（`--visual-regions`）

```ts
interface VisualRegion {
  id?: string;              // stable page-local id, e.g. "p3-vr0", present in extracted PageResult
  kind: 'raster' | 'vector' | 'table' | 'form' | 'annotation' | 'mixed';
  x: number; y: number; width: number; height: number;
  areaRatio: number;        // region area / page area, rounded to 3dp
  sourceCount: number;      // total source geometry items represented
  sources: VisualRegionSource[]; // representative refs, capped for large vector clusters
  reason: string;           // short explanation for why this is worth inspecting
  associatedText?: VisualRegionAssociatedText[]; // nearby or in-region captions/form labels/panel titles/chart titles/table lead-ins/image labels/headings included in the region box
  image?: string;           // cropped PNG path, present iff --render-visual-regions rendered this region
  renderContentRatio?: number; // content ratio measured from the cropped PNG
  renderedContentBox?: { x: number; y: number; width: number; height: number }; // tight non-background pixel bbox in page coords, present iff --render-visual-regions measured visible crop content
}

interface VisualRegionSource {
  type: 'imageBox' | 'vectorBox' | 'layoutTable' | 'formField' | 'annotation';
  index: number;            // 0-based index into that page-level source collection, internal if not emitted
}

interface VisualRegionAssociatedText {
  text: string;
  relation: 'caption' | 'label';
  x: number; y: number; width: number; height: number;
  blockIndex?: number;      // 0-based index into layout.blocks[] for captions/headings/table lead-ins
  fieldIndex?: number;      // 0-based index into formFields[] for form labels
}
```

`visualRegions[]` 是一层面向类人 PDF 视觉理解的分发层。它把已有的几何信息归并成带内边距、并限制在页面范围内的 bbox，覆盖重要的位图图像、紧凑的位图文字条、矢量绘图簇、`layout.tables[]` 提示、表单字段簇，以及高亮、图章、手写墨迹和形状注释等可见的标注内容。当检测到附近的图注或表单标签（`Figure`、`Table`、`Plate`、`図`、`表`、`図表`）时，`associatedText[]` 会记录该文本，裁剪 bbox 也会扩展以包含附近文本，使渲染出的裁剪图带有人眼可见的说明，而不仅仅是原始图片/widget 矩形；系统优先使用与图注匹配的行，而不是其所在的整个布局 block，以避免图注下方的表头或正文成为有误导性的关联文本；局部图注关联只保留附近最佳的图注组，以避免相邻的表格图注被错误地关联到下方的图形裁剪图上。视觉区域内类似 `Fig.4` 这种孤立或极小的引用不会被当作图注，除非同一段文本还带有以可读字号呈现的描述性图注词汇。位图图像裁剪图也可以附加正下方的简短纯文本标签（例如幻灯片图片说明），同时会过滤掉版权/许可声明。较大的位图和混合型视觉区域可以附加位于区域顶部内侧的非标题类简短图表标题；较大的无标签区域也可以附加附近的非重复标题，或位于区域顶部内侧的标题，标记为 `relation: "label"`，从而使图表、表单/表格背板和心电图（ECG）式面板保留人眼用来识别它们的可见标题。附近类似 `(a) ...` 的字母面板标题也可以作为标签附加，并向上扩展图表/地图/面板裁剪图，即便该区域已经有内嵌标签。当可见表格本身没有图注时，表格区域也可以附加简短的纯文本引导语，例如 "The following table..." 或 "... as follows:"。页面级的 `Plate` 图注可以作为元数据附加到较远的面板裁剪图上，而不必扩展每一张裁剪图去包含图注 block，这样既能让多面板地图/图形裁剪图保持局部化，又能保留共享的图注上下文；用 `A,B:`、`C,D:` 这类标记明确枚举面板的图注，也可以把互不相连的矢量图表碎片归并到同一张裁剪图中，并包含完整的图注 block。当有多页证据可用时，重复的页眉/页脚文本会被排除在图注关联之外。当存在更具体的前景框或密集的矢量网格结构时，页面大小的位图/矢量框会被视为背景，包括覆盖在整页位图背景之上的密集细矢量网格；跨越多个较大位图面板的、纯矢量的宽背板也会被抑制，从而使面板级裁剪图依然可用；这样可以避免幻灯片壁纸、整页设计图层，以及 CAD/绘图背板吞掉实际的图示/表格/平面图区域。如果整页封面或扫描件是主要的视觉证据，而与之竞争的只是小 logo、边缘 chrome，或低置信度的 OCR 碎片表格提示，那么整页位图仍会被输出，包括旋转过的扫描页面。当整页渲染证据将该页判定为空白时，视觉区域会被抑制，从而使空白页面以及不可见的表单字段或注释不会成为视觉模型的分发目标。窄的页面边缘 chrome 会被抑制，从而使边缘色带、侧边 URL、水印、与页眉/页脚线对齐的小位图 logo/文字条，以及页眉/页脚区带都不会成为视觉模型的分发目标。矢量密集的页面会从细而长的矢量线框中得到回退式的聚类区域，因此即便单条线框细到无法参与正常聚类，独立的类表格网格仍可以各自产生独立的裁剪图。密集的小矢量标记场也可以产生密集的视觉区域裁剪图，按互不相连的标记簇拆分，这可以捕获散点/密集点状的生物医学图形、地图，以及那些面板文字或标签是以矢量图形而非可提取文本形式嵌入的标记场，而不会把互不相关的区域强行合并成一张整页裁剪图。浅而窄、横跨整页的两行布局表格提示，以及列数极端的两行表格提示，会被抑制而不作为视觉区域的种子，因为它们往往来自图表刻度、OCR 碎片或不相关的面板，而不是人类可读的表格裁剪图。字段密集的表单页面会把交互式字段拆分成按区块/行大小划分的裁剪图，抑制那些本会与表单区块重复的大型或被包含的纯矢量表单背板，在请求了相应提取步骤时，跳过隐藏/不可见/noView 的表单字段和注释作为视觉区域种子，但仍会将其保留在 `formFields[]` / `annotations[]` 中；跳过没有外观流（appearance stream）的 FreeText 注释作为裁剪种子，但仍保留其注释元数据和搜索匹配；当表单字段 bbox 已提供真实页面位置时，跳过未定位的 widget 外观矢量框；并在内边距能使裁剪图可读时保留细小的复选框行或标注行。智能体可以把某个区域直接输入 `--render-region <x,y,width,height>`，从视觉上检查该图/图表/表格/表单/注释，而无需先对原始的 `imageBoxes[]`、成百上千的 `vectorBoxes[]` 或注释 bbox 做聚类。区域坐标与 `imageBoxes[]` / `layout.blocks[]` 使用相同的、以左上角为原点的页面视图坐标系；在旋转过的页面上，pdfvision 会通过旋转后的 pdf.js viewport 来映射裁剪区域，使输出的 PNG 遵循人眼可见的页面朝向。`--render-visual-regions` 省去了手动的第二次调用，直接把每个建议的裁剪图渲染进 `visualRegions[].image`；它还会附加 `renderContentRatio`，并且当非背景像素占据的区域比源几何裁剪图更紧凑时，附加同一页面坐标系下的 `renderedContentBox`。它隐含了 `--visual-regions`，但不要求整页的 `--render`。`sourceCount` 是所代表的源条目的完整数量；`sources[]` 有上限，以保持矢量密集页面输出的紧凑性。

在纯矢量、无文本的页面上，当页面大小的矢量框是唯一的非空视觉证据时，会输出这样一个矢量框，因此以路径绘制的符号表和纯矢量图示仍能生成可供裁剪的区域。
## 渲染：`--render-scale` 与 `--render-region`

这两个 flag 只有在开启 `--render`（或内部会执行栅格化的 `--ocr`）时才生效。

- **`--render-scale <n>`**：栅格化的缩放倍数。默认值为 `2`（约合 144 DPI）。取值范围为 `(0, 4]`。较小的值会缩小视觉模型的输入体积；较大的值能捕获更精细的细节。
- **`--render-region <x,y,w,h>`**：渲染页面上的一个子矩形，坐标系与 `imageBoxes` / `layout.blocks` 相同，都是未旋转、以左上角为原点的原始页面视图坐标系；bbox 会原样传入。像素尺寸等于原始区域 × UserUnit × 渲染缩放倍数。对于旋转过的页面，由于裁剪是通过人眼可见的 viewport 映射的，输出像素的宽/高可能会互换。该 flag 仅支持单页，且会拒绝越界区域。这个四元组会出现在缓存 key 和文件名中，并会在 `PageResult.renderRegion` 中回显。
- **`--render-visual-regions`**：渲染每一张 `visualRegions[]` 裁剪图，并在每个区域上附加 `image` / `renderContentRatio`。当渲染出的裁剪图中包含可测量的非背景像素时，`renderedContentBox` 会给出页面坐标系下更紧凑的渲染像素 bbox，同时保持源几何区域不变。检测到时，区域框会包含关联的图注/表单标签、附近的面板标题、简短的表格引导语、简短的图片标签，以及附近的标题，因此裁剪图通常更接近人类在请求视觉模型阅读之前会自行选取的范围。它使用与整页 `--render` 相同的输出目录、`--render-scale`、缓存图像校验和按 PDF 划分子目录的安全规则，但除非同时请求了 `--render`，否则不会填充 `pages[].image`。

典型的智能体流程：先用 `--layout` 提取，在 `layout.blocks[i]` 中找到可疑的 block（或从 `warnings[i].blockIndex` 得到其索引），再用 `blocks[i]` 的 bbox，通过 `--pages <N> --render --render-region <x,y,w,h>` 重新运行来放大查看。
