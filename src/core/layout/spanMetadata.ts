import type { TextSpan } from '../../types/index.js';

const spansWithExplicitSpaceBefore = new WeakSet<TextSpan>();

/** Record that pdf.js emitted an explicit whitespace item immediately
 * before this span in visual order. Kept outside TextSpan so geometry and
 * layout serializers cannot expose internal reconstruction metadata. */
export function markExplicitSpaceBefore(span: TextSpan): void {
  spansWithExplicitSpaceBefore.add(span);
}

export function hasExplicitSpaceBefore(span: TextSpan): boolean {
  return spansWithExplicitSpaceBefore.has(span);
}

/** Preserve internal reconstruction metadata when a layout pass has to
 * clone a span, such as when horizontal ruby text is attached. */
export function copySpanMetadata(source: TextSpan, target: TextSpan): TextSpan {
  if (hasExplicitSpaceBefore(source)) markExplicitSpaceBefore(target);
  return target;
}
