---
title: "表单、链接与注释"
description: "--form-fields、--links 和 --annotations 的字段结构：widget 类型与标签、链接目标、注释 flag 与标注几何信息。适用于 PDF 中可填写的框、可点击目标或批注需要被关注的场景。"
sourceHash: c06a992b886a
---

<!-- Translated from docs/src/en/guide/interactive.md, which is generated from docs/cli-topics/interactive.md.
     Translate the prose, keep code, field names, flags, and warning codes verbatim, and update
     `sourceHash` to the value reported by `node scripts/build-site-reference.mjs`. -->

# 表单字段、链接与注释

面向 `-f json`、`-f xml` 和 `-f toon` 消费者的参考文档。

## 表单字段（`--form-fields`）

```ts
interface FormField {
  name: string;              // PDF field name
  type: 'text' | 'checkbox' | 'radio' | 'choice' | 'signature' | 'button' | 'unknown';
  x: number; y: number; width: number; height: number;
  value?: string;            // current value when present
  checked?: boolean;         // checkbox/radio state when applicable
  readOnly?: boolean;
  required?: boolean;
  multiline?: boolean;
  displayValue?: string;      // viewer-visible selected choice label when different from value
  caption?: string;           // viewer-visible push-button caption when available
  exportValue?: string;       // checkbox/radio submitted value when pdf.js exposes it
  options?: FormFieldChoiceOption[]; // choice-field options when pdf.js exposes them
  combo?: boolean;            // true for combo boxes, false for list boxes
  multiSelect?: boolean;      // true when multiple choices can be selected
  flags?: PageAnnotationFlag[]; // decoded widget annotation flags: hidden, print, noView, locked, ...
  actions?: Record<string, string[]>; // widget-level JavaScript actions such as button scripts
  resetForm?: FormFieldResetFormAction; // non-JavaScript ResetForm button behavior
  label?: FormFieldLabel;    // nearby visible label, when the layout heuristic finds one
}

interface FormFieldChoiceOption {
  exportValue: string;        // submitted/exported form value
  displayValue: string;       // viewer-visible option label
}

interface FormFieldResetFormAction {
  fields: string[];            // field names listed by the ResetForm action
  include: boolean;            // true: reset only listed fields; false: reset all except listed fields
}

interface FormFieldLabel {
  text: string;
  relation: 'left' | 'right' | 'above' | 'below';
  x: number; y: number; width: number; height: number;
}
```

`formFields[]` 会呈现交互式 PDF widget 注释：空白文本输入框、复选框、单选按钮、选择字段、按钮和签名。这对政府和税务表单尤其有用，因为原生文本提取能读到标签文字，却读不到人眼看到的可填写方框。当 pdf.js 暴露了提交值时，复选框和单选 widget 会包含 `exportValue`。选择型 widget 将 `value` 保持为提交/导出的选中项，并在 viewer 可见的选中标签与之不同时包含 `displayValue`；`options[]` 列出所有已导出的值和 viewer 可见值，以及 pdf.js 暴露的 `combo` / `multiSelect` 行为 flag。当 pdfvision 能从 widget 外观特征中恢复出 viewer 可见的 `/MK /CA` 标题（caption）时，按钮会包含 `caption`；Markdown 会在 Value 列中显示该标题，`--search` 也可以把可见的按钮标题作为 `source: "formField"` 匹配结果返回。当选择项的 `displayValue` 与提交的 `value` 不同时，Markdown 会在 Value 列显示 `displayValue`，在 Export 列显示 `value`。`flags[]` 解码底层的 widget 注释 flag，使智能体能够判断某个表单值是否隐藏、仅打印可见、不在屏幕显示、被锁定，或以其他方式受 viewer 状态控制——即便普通屏幕渲染是空白的。当 pdf.js 暴露了 widget 级别的 JavaScript action（例如按钮点击脚本）时，`actions` 会保留它们；而 `resetForm` 会保留非 JavaScript 的 ResetForm 按钮行为，使智能体能够判断某个按钮是重置所有字段、只重置列出的字段，还是重置除列出字段外的所有字段。为了可读性，Markdown 会缩短很长的 JavaScript action 摘要；JSON、XML 和 TOON 则保留完整的结构化值。`label` 是根据可见布局文本重建出的保守的最近行提示；复选框/单选 widget 优先采用同一行左右两侧的标签，而文本输入框优先采用紧邻上方或左侧的标签。当上下相邻的行组成一个完整的可见提示语时会被合并，因此窄字段也可以携带像 "Employer identification number (EIN)" 这样的多行标签，而不仅仅是最近的一行。右侧边缘的复选框/单选提示语可以保留在 widget 所在行结束的换行说明文字，这些提示标签中的点状引导填充符（dotted leader）和行号间隙会被移除；堆叠排列的复选框/单选选项行在遇到相邻 widget 时也会停止，避免一个申报状态选项吞并下一个选项，且带有自身行前缀的后续警示/说明段落不会被当作选项标签的延续。左侧的复选框/单选标签也可以合并紧邻其前的延续行，因此像 "check this box..." 这样的提示语能保留上一行出现的铺垫文字。窄的行内文本字段也优先采用同一行左侧的说明标签，这使得短的税务分类/代码框能与其前面的提示语保持关联，而不是被附近下一字段的标签抢占，并会从这些提示标签中裁掉点状引导填充符；较高的多行文本字段可以跨越较宽的表单间隙保留左侧的短标签。带点状引导符的右侧金额框，可以把紧凑的标记（例如 "1 $" 或 "4(a) $"）展开回其可见的提示语，包括标记行上方的简短多行提示语。系统还会考虑细粒度的文本 span，避免当重建出的布局行比人眼可见的字段单元格更宽时，同一行内相邻的提示语被错误地同时附加到两个字段上。对于语义化命名的字段，附近不相关的文本会被忽略，而不会被当作有误导性的标签输出；与字段名匹配的较窄 span 优先于宽泛合并出的整行。坐标系与 `spans`、`layout.blocks` 和 `imageBoxes` 相同，都是未旋转、以左上角为原点的页面视图坐标系，因此 bbox 可以原样传给 `--render-region`。
## 链接（`--links`）

```ts
interface PageLink {
  type: 'url' | 'destination' | 'attachment';
  target: string | unknown[];  // URL, destination, or embedded attachment filename
  page?: number;               // 1-based physical target page when destination can be resolved
  text?: string;                // visible text inside the link rectangle when reconstructed
  unsafe?: boolean;             // true when pdf.js exposed only an unsafe URL fallback
  newWindow?: boolean;          // PDF requested opening the target in a new viewer window
  attachment?: {
    name: string;
    description?: string;
    size?: number;
    destination?: string | unknown[];
  };
  x: number; y: number; width: number; height: number;
}
```

`links[]` 会呈现可点击的 PDF 链接注释：外部 URL、引用跳转、目录跳转目标、内嵌文件跳转，以及交叉引用目标。当 pdfvision 能把目标解析为从 1 开始的物理页码时，内部跳转目标会包含 `page`。对于 pdf.js 只以 `unsafeUrl` 形式暴露的 Launch / remote go-to action，出于兼容性会保留 `type: "url"`，并附加 `unsafe: true`；当 PDF 要求 viewer 在单独窗口打开目标时，会保留 `newWindow`。内嵌 go-to 链接使用 `type: "attachment"`，包含文件名、可选描述、字节大小，以及内嵌跳转目标元数据，但不会内嵌附件字节内容。在能够重建时，`text` 是链接矩形内可见的原生文本；当一个宽大的链接矩形横跨很长的目录区域时，会被截断为一个简短标签；当 PDF 把一个窄链接放在单个行内 token 上时，会从所在行中裁取。坐标系与 `spans`、`layout.blocks` 和 `imageBoxes` 相同，都是未旋转、以左上角为原点的页面视图坐标系，因此 bbox 可以原样传给 `--render-region`。
## 注释（`--annotations`）

```ts
interface PageAnnotation {
  subtype: string;              // Text, Highlight, Underline, StrikeOut, FreeText, Stamp, FileAttachment, Ink, ...
  name?: string;                 // annotation/icon name such as Note, Comment, PushPin, Paperclip
  contents?: string;            // comment / markup contents
  title?: string;               // author/title label
  color?: [number, number, number];
  modified?: string;            // PDF date string
  hasAppearance?: boolean;
  flags?: PageAnnotationFlag[];  // decoded PDF annotation flags: hidden, print, noView, locked, ...
  fileAttachment?: {
    name: string;
    description?: string;
    size: number;               // byte length; bytes are never embedded in JSON/XML/TOON
  };
  x: number; y: number; width: number; height: number;
  border?: {
    width?: number;
    style?: string;             // solid, dashed, beveled, inset, underline, or raw pdf.js value
    dashArray?: number[];
  };
  line?: {
    from: { x: number; y: number };
    to: { x: number; y: number };
    endings?: [string, string]; // PDF line ending names, e.g. None/OpenArrow
  };
  vertices?: { x: number; y: number }[];   // Polygon / PolyLine vertices
  inkPaths?: { x: number; y: number }[][]; // Ink annotation paths
  quadBoxes?: { x: number; y: number; width: number; height: number }[];
}

type PageAnnotationFlag =
  | 'invisible'
  | 'hidden'
  | 'print'
  | 'noZoom'
  | 'noRotate'
  | 'noView'
  | 'readOnly'
  | 'locked'
  | 'toggleNoView'
  | 'lockedContents';
```

`annotations[]` 会呈现非链接、非 widget 的 PDF 注释：便签、批注、高亮、下划线、删除线、图章、自由文本、文件附件图标、形状标注、手写墨迹，以及其他标注。当 pdf.js 暴露了 PDF 注释/图标名称时，`name` 会保留该名称，例如 `Note`、`Comment`、`PushPin` 或 `Paperclip`。`flags[]` 解码 PDF 注释 flag，使智能体能够区分正常屏幕可见的标注，与隐藏、仅打印可见、不在屏幕显示、被锁定，或以其他方式受 viewer 控制的注释；例如 `["hidden","print"]` 表示该注释即便在普通屏幕渲染为空白时也可能存在于 PDF 中。当 pdf.js 暴露相关信息时，文件附件注释会包含文件名/描述/字节大小元数据，但绝不会在上下文中内嵌文件字节内容。当 pdf.js 暴露了 `border`、`line`、`vertices` 或 `inkPaths` 时，形状注释会包含它们，使智能体能够还原可见端点、多边形/折线几何信息和手绘墨迹路径，而不仅仅是外接 bbox。`Link`、`Widget` 和 `Popup` 注释被有意排除，因为链接和表单 widget 已有专门的输出，而弹出框通常与其父注释的内容重复。坐标系与 `spans`、`layout.blocks` 和 `imageBoxes` 相同，都是未旋转、以左上角为原点的页面视图坐标系；当 PDF 提供了 QuadPoints 时，`quadBoxes[]` 会给出精确的标注区域。
