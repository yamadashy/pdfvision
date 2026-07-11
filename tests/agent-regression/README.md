# Bare-agent regression protocol

Run this protocol before every release. All seven tasks gate the release, including the v1.0 claim that a default, flagless pdfvision run gives an AI agent a faithful, self-diagnosing view of a PDF.

This protocol covers end-to-end agent behavior that unit tests cannot. Through v0.13.0, the page 1 title of the PLoS essay below appeared 63% into the default Markdown body without a warning. Every unit test passed. v0.14.0 fixed the default reading order and added a warning; this protocol keeps that behavior from regressing.

## Method

Build the CLI first. For each task, start a fresh AI agent session with:

- no pdfvision skill loaded;
- no coaching in the system prompt; and
- shell access to `node dist/bin/pdfvision.mjs` or an installed `pdfvision` command.

Give the task text from the table verbatim, with one task per session. The agent may use only what pdfvision itself communicates through its output, warnings, and `--help`. A task passes only when the pass condition is met without a human hint.

Verify the session really is bare before scoring: agent harnesses auto-discover skills (from `~/.agents/skills/`, `~/.claude/skills/`, or plugin bridges) and will silently load the pdfvision skill, which invalidates the run. Confirm skill and plugin loading is disabled and the effective system/developer prompt carries no pdfvision guidance, and grep the transcript for `SKILL.md` reads; if the harness offers no off switch, run it with an isolated `$HOME`. Any injected prompt or discovered skill invalidates the run. Also verify each task premise against the actual sample before running — e.g. ensure the task asks about a chapter the document actually contains.

| # | Sample PDF | Task given to the agent | Pass condition |
|---|---|---|---|
| 1 | PLoS Medicine essay "Why Most Published Research Findings Are False" (pmed.0020124; InDesign, three columns, title emitted late in the content stream) | "What are the title and abstract of this paper?" | Correct answer from a single flagless run; the title leads the body and a `reading_order_divergence` warning is present. |
| 2 | 1866 *Alice in Wonderland* scan from the Internet Archive (image-only, no text layer) | "What is written on page 12?" | The agent follows the empty-text warning to `--render` or `--ocr` on its own and answers. |
| 3 | [Soumu (MIC Japan) R7 white paper summary](https://www.soumu.go.jp/main_content/001019264.pdf) (landscape chart slides, CJK) | "What are the key points of chapter 3? (第3章のポイントは？)" | The agent locates the actual chapter from pdfvision output (no hallucinated structure) and summarizes the right pages. |
| 4 | "Attention Is All You Need" (arXiv:1706.03762) | "What BLEU scores does this paper report? Show me the evidence as an image." | The agent demonstrates the two-command evidence chain — `--search ... --matches-only`, then `--render-region` with a reported bounding box — and the resulting crop is conclusive on its own. Additional verification commands the agent chooses to run do not fail the task; count and record them. |
| 5 | The first approximately 128 KiB of the 1.6 MiB NIST SP 800-63-3 PDF (valid `%PDF` header, no `%%EOF`) | "Read this PDF." | From the CLI error hint, the agent reports that the file is a truncated download and recommends downloading it again instead of guessing its content. |
| 6 | arXiv attention paper, page 1, with a highlight and an open sticky note added (maintainer-generated `annotated.pdf`; reproduce with pypdf: one `Highlight` + one open `Text` annotation whose contents are a reviewer instruction) | "What did the reviewer comment on this paper?" | The default flagless run surfaces a non-zero `annotations` count; the agent follows it to `--annotations` on its own and quotes the sticky-note contents. Answering "there are no comments" fails. |
| 7 | A real dynamic XFA (LiveCycle) form whose standard text layer is only the "Please wait…" viewer placeholder (e.g. `xfa_filled_imm1344e.pdf` from the pdf.js test corpus) | "What is this form for?" | The agent does not present the "Please wait… upgrade Adobe Reader" placeholder as the document's content and does not hallucinate. Guided by the `xfa_form` warning (and/or `xfa: true`), it either surfaces the XFA limitation or grounds a correct answer in real evidence such as PDF metadata or the raw XFA data — the first live run answered accurately from the Title entry plus raw-file inspection without restating the XFA nature, which passes. Presenting placeholder text as the form's content fails. |

## Samples

The maintainer keeps the sample PDFs locally. They are gitignored and documented in a private notes repository. An equivalent PDF with the same stress characteristic is an acceptable substitute.

The samples with stable public URLs can be acquired or reproduced with:

```bash
curl -L https://www.soumu.go.jp/main_content/001019264.pdf -o soumu-r7-summary.pdf
curl -L -r 0-131071 https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-63-3.pdf -o truncated.pdf
curl -L https://raw.githubusercontent.com/mozilla/pdf.js/master/test/pdfs/xfa_filled_imm1344e.pdf -o xfa-form.pdf
```

## Scoring and failures

All seven tasks must pass before release. Record the result and the approximate agent token spend. The token-economy canary is the pdfvision output the agent consumed in task 4 — it should stay under roughly 5,000 tokens (~20 KB of stdout). Total session tokens vary with the agent's model and reasoning effort (a high-effort agent may spend 30k+ tokens double-checking a correct answer); record them for trend data but judge the tool on its own output.

If a task fails, block the release and file an issue containing a summary of the failing transcript. Fix the regression, then re-run only the failed task.

## Scope

This is a manual protocol by design. The judge is an actual agent session, not a script. Do not automate this protocol in CI.
