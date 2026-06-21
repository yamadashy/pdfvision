import type { PageAnnotation } from '../../types/index.js';
import { isFinitePositiveBox, unionBox } from './geometry.js';
import type { BoxLike, Candidate } from './types.js';

export function addAnnotationCandidates(
  annotations: readonly PageAnnotation[] | undefined,
  candidates: Candidate[],
): void {
  if (!annotations || annotations.length === 0) return;
  for (const [index, annotation] of annotations.entries()) {
    if (!isVisuallyDispatchableAnnotation(annotation)) continue;
    const box = annotationVisualBox(annotation);
    if (!box) continue;
    candidates.push({
      ...box,
      kind: 'annotation',
      priority: 3,
      reason: `${annotation.subtype} annotation markup`,
      sources: [{ type: 'annotation', index }],
    });
  }
}

function isVisuallyDispatchableAnnotation(annotation: PageAnnotation): boolean {
  if (annotation.subtype === 'FreeText' && annotation.hasAppearance === false) return false;
  return !annotation.flags?.some((flag) => flag === 'invisible' || flag === 'hidden' || flag === 'noView');
}

function annotationVisualBox(annotation: PageAnnotation): BoxLike | undefined {
  const boxes = (annotation.quadBoxes && annotation.quadBoxes.length > 0 ? annotation.quadBoxes : [annotation]).filter(
    isFinitePositiveBox,
  );
  if (boxes.length === 0) return undefined;
  return boxes.slice(1).reduce<BoxLike>((acc, box) => unionBox(acc, box), boxes[0]);
}
