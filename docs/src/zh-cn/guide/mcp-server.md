---
title: MCP 服务器
description: 通过 Model Context Protocol，为没有 shell 的宿主——Claude Desktop、Cursor、Cline、Zed，以及 n8n 等工作流工具——提供 pdfvision 服务。
---

# MCP 服务器

`pdfvision mcp` 通过 stdio，在 [Model Context Protocol](https://modelcontextprotocol.io/) 上提供同一套提取引擎。它是为那些无法运行 shell 的宿主而存在的——Claude Desktop、Cursor、Cline、Zed、n8n，以及模型只能调用 tool 的类似环境。

如果你的智能体拥有 shell（Claude Code、Codex 或其他支持 CLI 的环境），优先使用 CLI 加 [Agent Skills](./agent-skill.md) 的组合。skill 按需加载，未被使用前不消耗任何 context，而 MCP tool schema 会在整个会话期间常驻宿主的 context。

## 设置

服务器是主可执行文件的子命令，而不是单独的 package：

```json
{
  "mcpServers": {
    "pdfvision": { "command": "npx", "args": ["-y", "pdfvision", "mcp"] }
  }
}
```

`pdfvision mcp` 不接受任何参数。它在 stdout 上使用 JSON-RPC 通信，因此进程原本要输出的日志都会转到 stderr。

## 三个 Tool

| Tool | 返回内容 | 参数 |
|---|---|---|
| `read_pdf` | Markdown 格式的文本 | `source`、`pages`、`ocr`、`attachment`、`password` |
| `search_pdf` | 按命中位置合并的列表，每行带一个短 `ref` | `source`、`query`、`pages`、`regex`、`password` |
| `render_pdf` | 页面或区域 PNG（image block） | `source`、`pages`、`ref`、`region`、`password` |

`source` 接受本地路径或 `http(s)` URL——没有单独的远程参数。

这个 surface 比 CLI 刻意做得更小。没有 format、include、scale 或 cache 参数：凡是 pdfvision 能从文档本身判断的事，都由服务器决定。`read_pdf` 总是会运行 layout、form field、link 和 annotation 提取，只是省略那些一无所获的 section。这让常驻的 tool schema 保持精简，也不给模型留下配置出错的余地。

## 会话如何进行

对超过 20 页的文档执行不带 `pages` 的 `read_pdf`，返回的不是正文，而是**文档地图**：页数、outline、按区间折叠的每页原生文本质量与 warning code，以及接下来该调用什么。面对未知文档时，这是标准的第一步。

由此往后：

- `read_pdf(pages: "12-18")` 读取一个区间。
- `search_pdf(query: "…")` 定位一个词。来源相同且裁剪区域相同的多次出现（通常是同一行或同一表格行内的重复）会合并成一行，并用 `×N` 标出次数（标题处的计数仍然是出现次数）。每行都带一个像 `p47m1` 这样的短 `ref`——把它原样传给 `render_pdf(ref: "p47m1")`，就能就地查看匹配内容，不必抄写坐标。一个 source 的 ref 集合，来自它最近一次 `search_pdf`，或最近一次在响应中列出视觉区域的整页 `render_pdf` 登记的内容；这两者中任意一个都会整体替换掉之前的集合——零命中的搜索也会用空集合替换它。不登记新 ref 的 `render_pdf` 会让原有集合保持不变——区域 render（包括所有带 `ref` 的调用），以及响应中没有列出视觉区域的整页 render——因此一次搜索命中的结果可以逐个依次渲染。`ref` 不能与 `pages` 或 `region` 同时使用：ref 本身已经同时指定了页面和区域，这类调用会被直接拒绝，而不是悄悄按 ref 所在的页面来处理。
- 当 quality 报告说原生文本不可用时，用 `read_pdf(pages: "31", ocr: "jpn+eng")` 对扫描页重新做 OCR。
- `read_pdf(attachment: "invoice.xml")`——或一个从 1 开始的索引——返回一个嵌入文件，而不是页面。在电子发票和监管申报文件（Factur-X、ZUGFeRD、XBRL）中，附件才是权威数据，页面只是它的渲染呈现。文本附件会内联返回，图像作为 image block 返回；不透明的二进制文件会被拒绝，并指向 CLI 的 `--attachments --attachment-output`。

渲染图会被适配到最长边 1568 px，超过这个尺寸 vision 模型本来也会做下采样。如果渲染图小到读不清，该做的是缩小 `region`，而不是放大分辨率。

## Budget 与诚实

响应是有 budget 的：正文 30,000 字符、每页 12,000 字符、100 个 match 位置、4 个渲染页面、5 个 OCR 页面，以及每次调用 6 MB 的图像。每次截断都会指明下一步该做什么，因此被截断的结果是可恢复的，而不是悄悄地不完整——通常是一个比产生它的那次调用更窄的页面调用（即便请求的区间宽到让每页一行的 Overview 表本身就用满了 budget 也是如此）；只有当单独一页都容不下、不存在更窄的页面调用时，才会转而给出 `search_pdf` 指引。

20 页这道门槛决定的是返回 map 还是正文，而不是正文能不能放得下：不到 20 页的文档会被整篇读入，超出字符 budget 时同样会被截断。截断提示中被计为省略的是页面的*正文*——那些页面各自的 Overview 行仍然留在响应中，除非同一条提示里还写着 `Overview clipped after page N`。那是行本身也会一起丢失的唯一情形：区间宽到 Overview 表本身就用满了 budget 时，表格也会被截断，截断位置落在提示点名的那一页的行边界上，其后不再有逐页信息。

同样的诚实也适用于搜索：core warning 会随响应一起返回，因此当一个 regex query 超出单页时间 budget 时，它会如实报告，而不是伪装成“0 matches”；对没有可用原生文本的页面搜索时，也会说明该处的落空并不代表证据缺失。对动态 XFA (LiveCycle) 表单更进一步：当被搜索的页面只是“Please wait...”查看器占位页时，无论是否命中，每次响应都会针对本次检索选中的全部页面说明这一点——尤其是零命中的响应，它最容易被误读为内容不存在——并建议改用 Adobe Acrobat/Reader，而不是渲染页面，因为渲染出来同样只是占位页。若提取到的内容太少、无法判断，它会如实说明并建议渲染或 OCR，而不是替你猜一个结论。页面本身带有文字、图片或矢量图形的 AcroForm+XFA 混合表单——比如 IRS 报税表——可以正常提取，不会被这样标记。而静态内容只有字段层的表单介于两者之间：注记会说明字段命中是可信的，但字段周围的页面文本不是文档内容。

每个结果都带有 untrusted-data 提示条。MCP 宿主没有 Agent Skill 那样的指引，所以信任边界要随负载一起传递。请把提取出的内容当作数据而非指令来对待——参见[安全与隐私](./security-and-privacy.md)。

## 远程输入受到防护

与 CLI 的 `--remote` 不同，MCP 服务器会拒绝解析到私有地址、环回地址、链路本地地址、CGNAT 地址、NAT64 地址或 IPv4 映射地址的 URL，并重新验证每一跳重定向。这里选择 URL 的是模型，如果不这样做，服务器就会变成通往其所在网络的 SSRF 跳板。

对于内网文档存储，请设置 `PDFVISION_MCP_ALLOW_PRIVATE_NETWORK=1`。已知限制：已验证的地址不会为这次 fetch 固定下来，因此在验证与连接之间发生变化的 DNS 答案不在覆盖范围内。

## 错误会指明下一次调用

Tool 失败会以带恢复说明的带内结果返回，而不是协议错误。越界的页面选择器、超出页面 budget 的 OCR 请求、未知的 ref，或格式错误的 region，都会说明该怎么做——读一下这条消息，它会指明下一次调用。
