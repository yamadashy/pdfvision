---
title: "OCR"
description: "OCR 语言代码与顺序、置信度、traineddata 的安装与缓存，以及故障排查。在非英语 OCR 场景下必读，因为语言顺序会改变识别结果。"
sourceHash: bfac4068046b
---

<!-- Translated from docs/src/en/guide/ocr.md, which is generated from docs/cli-topics/ocr.md.
     Translate the prose, keep code, field names, flags, and warning codes verbatim, and update
     `sourceHash` to the value reported by `node scripts/build-site-reference.mjs`. -->

# OCR 参考

关于 `--ocr` flag 的详细说明——何时该用它、多语言行为、置信度的含义、安装/缓存要求，以及故障排查。当你对非英语文本运行 `--ocr`、置信度意外偏低，或需要诊断 `tesseract.js` 安装问题时，请阅读本文档。

对于基本流程（“页面是图像化的，运行 `--ocr -f json`”），`pdfvision --help` 就足够了。

## 结构

```ts
interface PageOcr {
  text: string;              // OCR-derived text, trimmed
  confidence: number;        // 0..1 (rounded to 3dp). Tesseract reports 0..100 internally; pdfvision normalises.
  lang: string;              // canonicalised lang spec — whitespace-trimmed, order preserved
  words?: OcrWord[];         // OCR word boxes in page coordinates, when tesseract returns layout
}

interface OcrWord {
  text: string;
  confidence: number;        // 0..1 (rounded to 3dp)
  x: number; y: number; width: number; height: number;
}
```

`lang` 会回显调用者传入的 `--ocr-lang`，经过空白字符归一化处理，但保留 token 顺序。`eng+jpn` 和 `jpn+eng` 会产生不同的识别器（tesseract 把第一个语言当作主语言），因此会落入不同的缓存槽位，`lang` 的回显值也不同。`words[]` 是可选的，因为较旧的缓存条目或不寻常的 tesseract 输出可能缺少 block/line/word 布局信息；当它存在时，搜索功能可以返回 OCR 单词级别的 bbox。如果单词级重建遗漏了一个或多个在完整 `ocr.text` 中存在的查询命中（例如由于 OCR 行边界或间距差异），搜索会用页面级 bbox 从 `ocr.text` 中补充结果。

## 何时运行 OCR

触发条件是密度概览（Overview），而不是页面内容本身。请留意：

- `coverage: 0%`（或接近 0）且 `imageCount > 0` —— 页面主体被栅格化
- `text` 为空或乱码（例如出现 `r rv` 这类零散字符）—— PDF 字体表损坏
- 整份文档看起来正常，但某一页返回为空 —— 很可能是幻灯片/图形/扫描件

`pdfvision` 永远不会自动触发 OCR。智能体需要在读取密度信号后逐页自行决定。OCR 的成本约为每页 0.5–2 秒（CPU 密集型），外加一次性的几秒 worker 启动时间；对一篇 100 页的论文逐页运行 OCR 通常并不划算。

## 语言代码与顺序

`--ocr-lang` 采用 tesseract.js 的加号分隔形式：一个或多个 3 字母代码（或 `chi_sim` 这类形式）用 `+` 连接。

```bash
npx pdfvision doc.pdf --ocr --ocr-lang eng         # English only (default)
npx pdfvision doc.pdf --ocr --ocr-lang eng+jpn     # English + Japanese
npx pdfvision doc.pdf --ocr --ocr-lang chi_sim     # Simplified Chinese
npx pdfvision doc.pdf --ocr --ocr-lang eng+chi_sim+chi_tra
```

**顺序很重要。** [Tesseract 文档](https://tesseract-ocr.github.io/tessdoc/Command-Line-Usage.html#order-of-multiple-languages)说明第一个语言会被当作主语言，并指出语言顺序会改变 OCR 的输出结果和运行时间。请把主要语言放在前面：

- 对于以日语为主、含英文页眉/标签的幻灯片：`jpn+eng`
- 对于英文文档中夹杂少量日语术语的情况：`eng+jpn`
- 不确定时，两种顺序都运行一遍，比较 `confidence` 和 `text`

pdfvision 在用于缓存 key 之前会对语言字符串中的空白做归一化处理（` eng + jpn ` 和 `eng+jpn` 共享同一个槽位），但**会保留顺序**——`eng+jpn` 和 `jpn+eng` 确实是不同的识别器，因此有意落入不同的缓存槽位。

回显的 `pages[].ocr.lang` 返回的是经过空白归一化、但保留顺序的形式（`'eng+jpn'`，而不是 `' eng + jpn '`）。

## 置信度语义

`pages[].ocr.confidence` 的取值范围是 `0..1`（四舍五入到三位小数）。Tesseract 内部报告的是 `0..100`；pdfvision 会除以 100，以匹配现有的 `textCoverage` 惯例。

以下是大致的解读方式，仅作启发式参考：

- `>= 0.8` —— 高置信度，OCR 文本对大多数智能体用途来说可以直接使用
- `0.5–0.8` —— 可用，但对重要实体（数字、姓名、代码标识符）应加以核实
- `< 0.5` —— 部分识别。原因可能是 `--ocr-lang` 设置有误、扫描分辨率过低，或字体样式特殊。在原生提取为空、稀疏、字形损坏，或依附于位图文本层的类扫描页面上，这种情况也会以 `pages[].warnings[].code === 'ocr_low_confidence'` 的形式出现。在信任这段文本之前，应先通过 `--render` 与渲染出的 PNG 做比对。

高置信度也可能暴露原生文本层的质量问题。在依附于位图的扫描页面上，`pages[].warnings[].code === 'ocr_native_text_mismatch'` 表示 OCR 找到了高置信度的单词，但其最接近的原生 token 与之不同，因此精确的原生搜索可能会漏掉可见的单词。`pages[].warnings[].code === 'ocr_native_spacing_loss'` 表示 OCR 与原生文本包含相近的字符，但原生文本丢失了许多单词边界。在使用 `pages[].text` 中的确切措辞之前，最好先将 `ocr.text` 与渲染结果做比对。

`confidence: 0` 且 `ocr.text` 为空通常意味着栅格化步骤产生了一张空白页面（见下方“故障排查”），而不是 OCR 真的什么都没找到。**请先检查 `pages[].quality.visualStatus`**：当它是 `blank` 时，说明渲染结果是空白的，OCR 无从下手；当它是 `sparse` 时，说明页面上有极小的可见痕迹，在报告“无文本”之前应先用几何信息或裁剪图做检查。

## 输出结构

```ts
interface PageOcr {
  text: string;        // trimmed of trailing whitespace, line breaks preserved
  confidence: number;  // 0..1, page-level mean
  lang: string;        // whitespace-normalised, order-preserved
  words?: OcrWord[];   // OCR word boxes in page coordinates, when tesseract returns layout
}

interface OcrWord {
  text: string;
  confidence: number;  // 0..1, word-level confidence
  x: number; y: number; width: number; height: number;
}
```

`pages[].text`（源自 pdfjs）**永远不会**被 OCR 覆盖——两个信号会共存在同一个页面对象上，供智能体比对并自行判断。扫描版 PDF 通常表现为 `text` 为空而 `ocr.text` 有内容；混合内容的 PDF 则在 `text` 中显示原生文本，在 `ocr.text` 中提供另一种基于 OCR 的读取结果（对含糊字形做合理性检查时很有用）。`ocr.words[]` 是可选的，因为 tesseract 有时会省略布局 block，但当它存在时，可以让 `--search` 返回 OCR 单词级别的 bbox。如果单词级重建遗漏了一个在完整 `ocr.text` 中存在的查询命中（例如由于 OCR 行边界或间距差异），搜索会回退到用页面级 bbox 从 `ocr.text` 中获取结果，而不是直接丢弃该命中。

在 XML 输出中，没有单词框的 OCR 呈现为 `<ocr lang="..." confidence="...">...</ocr>`。当存在单词框时，OCR 元素会包含 `<text>` 和 `<words><word .../></words>` 子元素。自闭合的 `<ocr lang="..." confidence="0"/>` 表示 OCR 已运行但没有产生文本——这与标签完全缺失（表示未请求 OCR）是不同的情况。

## 安装要求

`tesseract.js` 声明在 `optionalDependencies` 中。默认执行 `npm install pdfvision` 会一并安装它（约 30 MB 的 worker 包）；执行 `npm install --omit=optional` 则会跳过它。

当请求了 `--ocr` 但未安装 `tesseract.js` 时，pdfvision 会抛出：

```text
--ocr requires the optional dependency "tesseract.js" (not installed).
Install it with: npm install tesseract.js
```

其他导入期错误（损坏的原生绑定、传递性语法错误）会呈现真实的错误信息，而不是安装提示——这样智能体在诊断时就不会被错误线索误导。

## Traineddata 缓存

Tesseract 会在首次使用时下载各语言对应的 `*.traineddata` 文件（每个约 10–15 MB）：

- `eng.traineddata` ≈ 10 MB
- `jpn.traineddata` ≈ 13 MB
- `chi_sim.traineddata` ≈ 16 MB

pdfvision 会把 tesseract.js 指向 `<cache-root>/ocr-data/`（POSIX 权限 0700），因此：

- 数据会落在 pdfvision 自己的缓存层级下（权限一致，位置单一）
- `npx pdfvision clear-cache` 会连同提取缓存一起清除 traineddata
- 每种语言只需下载一次；之后的运行都是离线的

针对新语言的首次 `--ocr` 调用会因下载多花几秒钟。之后对同一语言的调用在启动步骤上是即时的（worker 初始化仍需约 1–2 秒）。

`--no-cache` 不会禁用这些 OCR 支持文件：OCR 仍会校验所配置的根目录，并把 traineddata 及其 worker 辅助文件持久化在那里。

## 故障排查

### 首次运行 --ocr 时出现的无害 stderr 噪声

当 `--ocr` 在一个会话中首次启动 tesseract.js 时，你可能会看到类似下面的 stderr 输出：

```text
Error opening data file ./.traineddata
Failed loading language ''
```

这些是 tesseract.js 内部启动流程中的**无害预加载探测**，不是致命错误。识别器随后会按照你实际传入的 `--ocr-lang` 工作。可以通过检查 JSON 输出中的 `pages[].ocr.confidence` 来确认——如果它 `> 0` 且 `pages[].ocr.text` 有内容，说明 OCR 成功了。不要把这些 stderr 输出当作中止运行的理由。

### “OCR 已运行，但 `text` 为空且 `confidence: 0`”

最可能的原因是栅格化步骤产生了一张空白页面，而不是 OCR 真正失败了。常见原因：PDF 使用了 pdfjs + `@napi-rs/canvas` 无法解码的图像格式（尤其是 JPEG2000 / JPX，在 Internet Archive 的扫描件中很常见）。首先检查 `pages[].quality.visualStatus`：`blank` 表示 OCR 得到的是近乎均匀的输入，而 `sparse` 表示存在值得用几何信息或裁剪图检查的极小可见痕迹。可以这样验证：

```bash
npx pdfvision doc.pdf -p <page> --render --render-output /tmp/dbg
# Inspect /tmp/dbg/page-<n>.png — if it's blank, OCR has nothing to chew on.
# (--render-output writes flat; a name another PDF already took in the same
# dir gets a -2 suffix and a note on stderr.)
```

这是一个已知限制，作为独立于 OCR 的问题单独跟踪。变通方案：换一份不同来源的 PDF 副本，或者在调用 pdfvision 之前用 wasm 解码器预先解码 JPX 流。

### “置信度中等，但文本明显有乱码”

一种可能是 `--ocr-lang` 不匹配——页面中包含未在规格中列出的语言，或者主要语言没有排在第一位（例如一页以日语为主的内容却用 `eng+jpn` 而不是 `jpn+eng` 运行）。可以尝试另一种顺序并做比较。

另一种可能是分辨率过低。pdfvision 以 2× 栅格化 OCR 输入，并将其作为下限：`--render-scale 1` 会缩小 `--render` 的 PNG，但 OCR 栅格化仍保持 2×，因此只有大于 2 的值才会改变 tesseract 看到的内容。对于确实很细密的印刷体，可以先尝试 `--ocr --render-scale 3`（支持范围为 `(0, 4]`）。如果仍然不够，可以单独渲染一张更高分辨率的 PNG，并直接传给 tesseract.js。

### “OCR 太慢——N 页 × M 秒让人无法忍受”

- 限制页码范围：用 `-p <range>` 只对需要的页面做 OCR（可参考密度概览来选择）。
- 单个 worker 会在一次调用内的多个页面间被复用，因此一次 10 页的 OCR 运行只需支付一次启动成本，外加 N 次的逐页成本。如果拆分成多次调用，每次都要重新支付启动成本。
- pdfvision 的页面级并行**不适用于** OCR（按设计只有单个 worker）。启动多个 worker 会使内存占用按约 30 MB / 语言的倍数增长，却没有实质性的收益。

### “我希望 OCR 覆盖 `text`，这样下游消费者就不用做选择了”

设计上就是不会。由智能体/下游来决定使用哪个信号。如果某个消费方想要单一字段，可以在消费时自行选取：

```ts
const effectiveText = page.text || page.ocr?.text || '';
```

同时保留两个信号，意味着随时都可以做合理性检查（比对原生文本与 OCR 结果以排查歧义）。

## 示例

```bash
# Japanese-dominant slide deck with English titles
npx pdfvision slides.pdf --ocr --ocr-lang jpn+eng -f json

# English paper with embedded Chinese citations
npx pdfvision paper.pdf --ocr --ocr-lang eng+chi_sim -f json

# Scanned book, English only
npx pdfvision scan.pdf -p 1-20 --ocr -f json | \
  jq '.pages[] | {page, conf: .ocr.confidence, head: .ocr.text[0:120]}'
```
