---
title: "MCP 服务器"
description: "配置和调用 MCP 服务器：三个工具、响应预算、ref，以及它与 CLI 的区别。仅在没有 shell 的宿主环境中才需要。"
sourceHash: 09ac8a401dcc
---

<!-- Translated from docs/src/en/guide/mcp-server.md, which is generated from docs/cli-topics/mcp.md.
     Translate the prose, keep code, field names, flags, and warning codes verbatim, and update
     `sourceHash` to the value reported by `node scripts/build-site-reference.mjs`. -->

# MCP 服务器参考

`pdfvision mcp` 通过 stdio 上的 Model Context Protocol 提供与 CLI 相同的提取能力。仅在被要求**为另一个宿主环境搭建 pdfvision**，或者你自己正是通过 MCP 工具而非 shell 操作时，才需要阅读本文。

**如果你有 shell，请使用 CLI。** 下文的一切都只是同一套 `core/` 代码之上的一个更窄的接口，而 MCP 工具的 schema 会在整个会话期间占用宿主的上下文——CLI 加上这个 skill，在未被使用时不占用任何成本。本文件存在的原因是，"把 pdfvision 安装进 Claude Desktop / Cursor / Cline / Zed / n8n" 是一项可能交给你的任务，而不是因为 MCP 对你来说是更好的路径。

## 设置

服务器是主二进制文件的一个子命令，而不是一个独立的包：

```json
{ "mcpServers": { "pdfvision": { "command": "npx", "args": ["-y", "pdfvision", "mcp"] } } }
```

`pdfvision mcp` 不接受任何参数。它在 stdout 上使用 JSON-RPC 通信，因此进程原本会打印的任何日志都会被重定向到 stderr。

## 三个工具

| 工具 | 返回内容 |
|---|---|
| `read_pdf` | Markdown 格式的文本。参数：`source`、`pages`、`ocr`、`attachment`、`password`。 |
| `search_pdf` | 扁平的命中列表——每条匹配的页码、来源、上下文、区域，以及一个简短的 `ref`。参数：`source`、`query`、`pages`、`regex`、`password`。 |
| `render_pdf` | 以图像块形式返回的整页或区域 PNG，每个图像块前面都带有一个 `Page N:` 标签。参数：`source`、`pages`、`ref`、`region`、`password`。 |

`source` 既可以是本地路径，**也**可以是 `http(s)` URL——没有单独的 remote 参数。`ocr` 是一个 Tesseract 语言字符串，主语言排在前面（`"eng"`、`"jpn+eng"`），而不是布尔值；省略它则使用 PDF 自身的文本层，在 document map 或质量报告将某页标记为空或乱码时才用它——例如 `read_pdf(pages: "31", ocr: "jpn+eng")`。

## 会让你意外的、与 CLI 的区别

- **没有 format、include、scale 或 cache 参数。** 凡是 pdfvision 能从文档本身判断出来的事情，都由服务器决定。`read_pdf` 始终会运行 layout、form fields、links 和 annotations，只是省略掉没有找到内容的部分。在空白表单上，字段表格会坍缩为一个计数和类型细分（`_23 fillable fields on this page, none filled (15 text, 8 checkbox)._`）——已填写的值、已勾选的框、带脚本的 widget，以及隐藏/锁定的字段仍各占一行。不要去找与之等价的 flag；根本没有。
- **在超过 20 页的文档上，不带 `pages` 调用 `read_pdf` 会返回一份 document map，而不是正文**——页数、目录、按页折叠成页码范围的原生文本质量和警告代码，外加接下来应该发起的具体调用。这是面对未知文档时的常规第一次调用。
- **响应有预算限制**（每个 body 30,000 字符，每页 12,000 字符，100 条匹配，4 个渲染页，5 个 OCR 页，6 MB 的图像）。每次截断都会指明确切的后续调用，因此被裁剪的结果是可恢复的，绝不会被悄悄当作完整结果。
- **ref 取代了坐标。** `search_pdf` 和整页的 `render_pdf` 会返回简短的句柄（`p47m1`、`p5r2`）。直接把它传回，如 `render_pdf(ref: "p47m1")`，而不是转录一个 bbox。*每次*调用都会把 ref 从 `p1m1` 重新编号，因此从更早的搜索中保留下来的 ref 现在会指向新的结果——`render_pdf` 会回显该 ref 解析到的内容（`Ref p1m1 → search hit for …`），从而让过期的 ref 变得可见。拿不准时，重新运行搜索。匹配 ref 会裁剪到该命中所在的表格行，如果页面没有检测到表格，则裁剪到其所在的视觉行，因此一行的值会包含在图像内，而不只是其标签。当页面的布局没有覆盖该命中时——例如 OCR 来源的匹配、没有重建出行结构的扫描页——裁剪会回退到围绕字形框的固定内边距，这在较宽的行上仍可能窄到难以阅读；此时应传入显式的 `region`。
- **没有 scale 旋钮。** 渲染图会被适配到最长边 1568 px，超过这个尺寸视觉模型反正也会做下采样。如果渲染图小到难以阅读，正确的做法是缩小 `region`，而不是放大栅格图。
- **每个成功的结果都以一条不可信数据的横幅开头。** 服务器不能假定其宿主携带等效的常设指令，因此信任边界会随负载一起传递。错误结果不带有该横幅，且仍可以引用文档内容——见 [`pdfvision docs security`](./security-and-privacy.md)。

## 内嵌文件

`read_pdf(attachment: "invoice.xml")`——或一个从 1 开始的索引——会返回内嵌文件而不是页面内容。这一点很重要，因为在电子发票和监管申报文件（Factur-X、ZUGFeRD、XBRL）中，**附件才是权威数据，页面只是它的一种渲染呈现**；只根据页面来回答问题，等于是在根据真相的一张图片来回答问题。任何报告了附件的响应都会指明这次调用。

文本附件以内联形式返回，图像以图像块形式返回。其他类型——电子表格、压缩包——会被拒绝，并指向 `--attachments --attachment-output <dir>`，因为把这些字节送进上下文窗口毫无意义。这是 MCP 接口真正需要依赖 CLI 的唯一场景。

## 远程输入受到限制

与 CLI 的 `--remote` 不同，MCP 服务器会拒绝解析到私有、回环、link-local、CGNAT、NAT64 或 IPv4 映射/兼容地址的 URL，并对每一跳重定向重新验证。原因是这里选择 URL 的是*模型*本身，否则服务器就会变成一个 SSRF 跳板，可以进入它所运行的任何网络。

对于内网文档存储，可设置 `PDFVISION_MCP_ALLOW_PRIVATE_NETWORK=1`。有一个已知限制，已在调用处记录：被验证的地址并没有在抓取时被固定，因此在验证与连接之间发生变化的 DNS 应答不在覆盖范围内。

## 错误

工具失败会以带内错误结果的形式返回，并附带恢复说明，而不是作为协议错误——页码选择器越界、OCR 请求超过 5 页预算、未知的 ref、格式错误的 `region`，或者加密的 PDF，都会告诉调用方接下来该怎么做。阅读该消息；它会指明下一步该调用什么。加密会被报告为两种不同的失败，因为恢复方式不同：未提供密码（用 `password` 重试）和密码错误（用另一个值重试）。

`search_pdf` 也会在响应体中转达 core 层的搜索警告：超过每页约 1 秒时间预算的正则会丢弃该页的结果并说明原因，这样它的 "0 matches" 就不会被误读为不存在证据。同一响应还会指明任何被搜索、但原生文本缺失或损坏的页面——那里的未命中同样不是不存在的证据，该提示会指向对这些页面使用带 `ocr` 的 `read_pdf` 或使用 `render_pdf`。
