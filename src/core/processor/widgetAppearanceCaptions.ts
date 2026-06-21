import { readFileSync } from 'node:fs';
import { extractWidgetAppearanceCaptions } from '../widgetAppearance/index.js';
import { normalizeText } from './textUtils.js';

interface CreateWidgetAppearanceCaptionLoaderOptions {
  pdfData?: Uint8Array;
  filePath: string;
  normalize: boolean;
}

export function createWidgetAppearanceCaptionLoader({
  pdfData,
  filePath,
  normalize,
}: CreateWidgetAppearanceCaptionLoaderOptions): () => ReadonlyMap<string, string> {
  let widgetAppearanceCaptions: ReadonlyMap<string, string> | undefined;
  return () => {
    if (widgetAppearanceCaptions !== undefined) return widgetAppearanceCaptions;
    try {
      const rawCaptions = extractWidgetAppearanceCaptions(pdfData ?? readFileSync(filePath));
      widgetAppearanceCaptions = normalize
        ? new Map(Array.from(rawCaptions, ([id, caption]) => [id, normalizeText(caption)]))
        : rawCaptions;
    } catch {
      widgetAppearanceCaptions = new Map();
    }
    return widgetAppearanceCaptions;
  };
}
