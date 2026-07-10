# Bare-agent regression protocol

Run this protocol before every release. All five tasks gate the release, including the v1.0 claim that a default, flagless pdfvision run gives an AI agent a faithful, self-diagnosing view of a PDF.

This protocol covers end-to-end agent behavior that unit tests cannot. Through v0.13.0, the page 1 title of the PLoS essay below appeared 63% into the default Markdown body without a warning. Every unit test passed. v0.14.0 fixed the default reading order and added a warning; this protocol keeps that behavior from regressing.

## Method

Build the CLI first. For each task, start a fresh AI agent session with:

- no pdfvision skill loaded;
- no coaching in the system prompt; and
- shell access to `node dist/bin/pdfvision.mjs` or an installed `pdfvision` command.

Give the task text from the table verbatim, with one task per session. The agent may use only what pdfvision itself communicates through its output, warnings, and `--help`. A task passes only when the pass condition is met without a human hint.

| # | Sample PDF | Task given to the agent | Pass condition |
|---|---|---|---|
| 1 | PLoS Medicine essay "Why Most Published Research Findings Are False" (pmed.0020124; InDesign, three columns, title emitted late in the content stream) | "What are the title and abstract of this paper?" | Correct answer from a single flagless run; the title leads the body and a `reading_order_divergence` warning is present. |
| 2 | 1866 *Alice in Wonderland* scan from the Internet Archive (image-only, no text layer) | "What is written on page 12?" | The agent follows the empty-text warning to `--render` or `--ocr` on its own and answers. |
| 3 | [Soumu (MIC Japan) R7 white paper summary](https://www.soumu.go.jp/main_content/001019264.pdf) (landscape chart slides, CJK) | "What are the key points of chapter 5?" | The agent narrows to the correct pages using the density Overview table. |
| 4 | "Attention Is All You Need" (arXiv:1706.03762) | "What BLEU scores does this paper report? Show me the evidence as an image." | The agent uses `--search ... --matches-only`, then `--render-region` with the reported bounding box, within two pdfvision commands total. |
| 5 | The first approximately 128 KiB of the 1.6 MiB NIST SP 800-63-3 PDF (valid `%PDF` header, no `%%EOF`) | "Read this PDF." | From the CLI error hint, the agent reports that the file is a truncated download and recommends downloading it again instead of guessing its content. |

## Samples

The maintainer keeps the sample PDFs locally. They are gitignored and documented in a private notes repository. An equivalent PDF with the same stress characteristic is an acceptable substitute.

The samples with stable public URLs can be acquired or reproduced with:

```bash
curl -L https://www.soumu.go.jp/main_content/001019264.pdf -o soumu-r7-summary.pdf
curl -L -r 0-131071 https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-63-3.pdf -o truncated.pdf
```

## Scoring and failures

All five tasks must pass before release. Record the result and the approximate agent token spend. Task 4 should remain under approximately 5,000 total agent tokens as a token-economy canary.

If a task fails, block the release and file an issue containing a summary of the failing transcript. Fix the regression, then re-run only the failed task.

## Scope

This is a manual protocol by design. The judge is an actual agent session, not a script. Do not automate this protocol in CI.
