import type { PageResult, PageWarning } from '../../../types/index.js';
import { shortTextSample } from '../textSamples.js';
import { normalizeComparableText } from './textComparison.js';
import type { VisualWarningContext } from './types.js';

export function detectVisibleAnnotationTextMissingFromNative(page: PageResult, out: PageWarning[]): void {
  const annotations =
    page.annotations?.filter((annotation) => {
      if (annotation.subtype !== 'FreeText') return false;
      if (annotation.hasAppearance !== true) return false;
      if (!annotation.contents?.trim()) return false;
      return !annotation.flags?.some((flag) => flag === 'hidden' || flag === 'invisible' || flag === 'noView');
    }) ?? [];
  if (annotations.length === 0) return;

  const nativeText = normalizeComparableText(page.text);
  const missing = annotations.filter((annotation) => {
    const contents = normalizeComparableText(annotation.contents ?? '');
    return contents.length > 0 && !nativeText.includes(contents);
  });
  if (missing.length === 0) return;

  const sample = shortTextSample(missing[0]?.contents ?? '');
  out.push({
    code: 'annotation_text_missing_from_native',
    severity: 'warning',
    message: `${missing.length} visible FreeText annotation${missing.length === 1 ? '' : 's'} ${missing.length === 1 ? 'is' : 'are'} not present in native page text (sample: ${JSON.stringify(sample)}) — read pages[].annotations or search annotation matches before trusting pages[].text as the full visible text`,
  });
}

export function detectOptionalContentTextHiddenLayerRisk(context: VisualWarningContext, out: PageWarning[]): void {
  if (!context.optionalContentText || !context.hasHiddenOptionalContent) return;
  out.push({
    code: 'optional_content_text_may_include_hidden_layers',
    severity: 'warning',
    message:
      'page text contains optional-content marked text while the PDF has hidden layers; native text may include layer content that is not visible in the default viewer state, so inspect --layers or a render before trusting the text',
  });
}
