import type { PageAnnotation, SearchMatch } from '../../../types/index.js';
import { type CompiledSearch, nfkc } from '../compiler.js';
import { duplicateKey, hasPreciseDuplicateAtBox } from '../duplicates.js';
import { cleanContext, roundedBox } from './shared.js';

export function appendAnnotationMatches(
  matches: SearchMatch[],
  annotations: readonly PageAnnotation[] | undefined,
  pageNum: number,
  compiled: CompiledSearch,
  matchCap: number,
  onWarning?: (message: string) => void,
): void {
  if (!annotations || annotations.length === 0) return;
  const annotationCount = new Map<number, number>();
  const annotationCapped = new Set<number>();
  for (const annotation of annotations) {
    if (!isSearchableAnnotationText(annotation)) continue;
    const haystack = compiled.normalize ? nfkc(annotation.contents) : annotation.contents;
    if (haystack.length === 0) continue;
    for (let mi = 0; mi < compiled.matchers.length; mi++) {
      if (annotationCapped.has(mi)) continue;
      const m = compiled.matchers[mi];
      m.regex.lastIndex = 0;
      while (true) {
        const hit = m.regex.exec(haystack);
        if (hit === null) break;
        if (hit[0].length === 0) {
          m.regex.lastIndex++;
          continue;
        }
        const hitKey = duplicateKey(m.queryIndex, m.query, hit[0], m.regex.ignoreCase);
        const box = roundedBox(annotation);
        if (hasPreciseDuplicateAtBox(matches, compiled, hitKey, box)) continue;
        matches.push({
          page: pageNum,
          query: m.query,
          ...(m.queryIndex !== undefined && { queryIndex: m.queryIndex }),
          bbox: box,
          boxes: [box],
          text: hit[0],
          source: 'annotation',
          context: annotationMatchContext(annotation, haystack),
        });
        const next = (annotationCount.get(mi) ?? 0) + 1;
        annotationCount.set(mi, next);
        if (next >= matchCap) {
          annotationCapped.add(mi);
          onWarning?.(
            `search query ${JSON.stringify(m.query)} hit the per-page annotation match cap of ${matchCap} on page ${pageNum}; subsequent annotation matches for this query on this page were dropped.`,
          );
          break;
        }
      }
    }
    if (annotationCapped.size === compiled.matchers.length) break;
  }
}

function isSearchableAnnotationText(annotation: PageAnnotation): annotation is PageAnnotation & { contents: string } {
  if (annotation.subtype !== 'FreeText') return false;
  if (!annotation.contents) return false;
  const flags = annotation.flags ?? [];
  return !flags.some((flag) => flag === 'hidden' || flag === 'invisible' || flag === 'noView');
}

function annotationMatchContext(annotation: PageAnnotation, contents: string): string {
  return cleanContext(`${annotation.subtype} annotation: ${contents}`, 160);
}
