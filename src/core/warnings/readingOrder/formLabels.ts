import type { LayoutBlock, PageResult, PageWarning } from '../../../types/index.js';
import { shortTextSample } from '../textSamples.js';

export function detectFormLabelReadingOrderDivergence(
  page: PageResult,
  blocks: LayoutBlock[],
  out: PageWarning[],
): void {
  if (!page.formFields || page.formFields.length < 2) return;
  if (out.some((warning) => warning.code === 'reading_order_divergence')) return;

  const labelCounts = new Map<string, number>();
  for (const field of page.formFields) {
    const label = collapseFormLabelWhitespace((field.label?.text ?? '').normalize('NFKC'));
    if (!isMeaningfulFormLabelProbe(label)) continue;
    labelCounts.set(label, (labelCounts.get(label) ?? 0) + 1);
  }
  const uniqueLabels = new Set([...labelCounts].filter(([, count]) => count === 1).map(([label]) => label));
  if (uniqueLabels.size < 3) return;

  const nativeText = collapseFormLabelWhitespace(page.text.normalize('NFKC'));
  const probes = blocks
    .map((block, index) => ({ block, index, text: collapseFormLabelWhitespace(block.text.normalize('NFKC')) }))
    .filter((probe) => uniqueLabels.has(probe.text))
    .map((probe) => ({ ...probe, nativeIndex: nativeText.indexOf(probe.text) }))
    .filter((probe) => probe.nativeIndex >= 0);
  if (probes.length < 3) return;

  let previous = probes[0];
  for (const probe of probes.slice(1)) {
    if (probe.nativeIndex + 2 >= previous.nativeIndex) {
      previous = probe;
      continue;
    }
    out.push({
      code: 'reading_order_divergence',
      severity: 'warning',
      blockIndex: probe.index,
      message: `form label "${shortTextSample(probe.block.text)}" appears after "${shortTextSample(previous.block.text)}" visually but earlier in the native text stream — native form text order diverges from what a human reads; prefer layout.blocks order when sequence matters`,
    });
    return;
  }
}

function collapseFormLabelWhitespace(text: string): string {
  return text.replace(/\s+/gu, ' ').trim();
}

function isMeaningfulFormLabelProbe(text: string): boolean {
  if (text.length < 5) return false;
  if (/^[,.;:)]/u.test(text)) return false;
  return /[\p{Letter}\p{Number}]/u.test(text);
}
