import type { ImageBox, PageResult, PageWarning } from '../../types/index.js';
import type { InvisibleTextEvidence } from '../graphics/invisibleText.js';

interface InvisibleTextWarningContext {
  invisibleText?: InvisibleTextEvidence;
  rasterBackedTextLayer?: boolean;
  imageBoxes?: ImageBox[];
}

export function detectInvisibleText(page: PageResult, context: InvisibleTextWarningContext, out: PageWarning[]): void {
  if (!context.invisibleText || context.rasterBackedTextLayer || hasFullPageRaster(page, context.imageBoxes)) return;
  const sample = context.invisibleText.sampleText;
  out.push({
    code: 'invisible_text',
    severity: 'error',
    message: `page contains text drawn with invisible rendering mode (Tr 3), which is not visible to a human viewer but is included in the extracted text${sample ? ` (sample: ${sampleText(sample)})` : ''} — it may be an OCR remnant, watermark machinery, or deliberately hidden content; use --render to see what a human actually sees`,
  });
}

function hasFullPageRaster(page: PageResult, imageBoxes: readonly ImageBox[] | undefined): boolean {
  const pageArea = page.width * page.height;
  if (!imageBoxes || pageArea <= 0) return false;
  return imageBoxes.some((box) => {
    const left = Math.max(0, box.x);
    const top = Math.max(0, box.y);
    const right = Math.min(page.width, box.x + box.width);
    const bottom = Math.min(page.height, box.y + box.height);
    return (Math.max(0, right - left) * Math.max(0, bottom - top)) / pageArea >= 0.9;
  });
}

function sampleText(text: string): string {
  const normalized = text.replace(/\s+/gu, ' ').trim();
  const sample = normalized.length > 60 ? `${normalized.slice(0, 57).replace(/[\uD800-\uDBFF]$/u, '')}...` : normalized;
  return JSON.stringify(sample);
}
