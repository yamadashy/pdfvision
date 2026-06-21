import type { FormField, PageAnnotation, SearchMatch } from '../../types/index.js';
import { round2 } from './boxes.js';
import { type CompiledSearch, nfkc } from './compiler.js';
import { duplicateKey, hasPreciseDuplicateAtBox } from './duplicates.js';

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
        const box = {
          x: round2(annotation.x),
          y: round2(annotation.y),
          width: round2(annotation.width),
          height: round2(annotation.height),
        };
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

export function appendFormFieldMatches(
  matches: SearchMatch[],
  formFields: readonly FormField[] | undefined,
  pageNum: number,
  compiled: CompiledSearch,
  matchCap: number,
  onWarning?: (message: string) => void,
): void {
  if (!formFields || formFields.length === 0) return;
  const formFieldCount = new Map<number, number>();
  const formFieldCapped = new Set<number>();
  for (const field of formFields) {
    const rawSearchValue = formFieldSearchValue(field);
    if (rawSearchValue === undefined) continue;
    const haystack = compiled.normalize ? nfkc(rawSearchValue) : rawSearchValue;
    if (haystack.length === 0) continue;
    for (let mi = 0; mi < compiled.matchers.length; mi++) {
      if (formFieldCapped.has(mi)) continue;
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
        const box = {
          x: round2(field.x),
          y: round2(field.y),
          width: round2(field.width),
          height: round2(field.height),
        };
        if (hasPreciseDuplicateAtBox(matches, compiled, hitKey, box)) continue;
        const context = formFieldMatchContext(field, haystack);
        matches.push({
          page: pageNum,
          query: m.query,
          ...(m.queryIndex !== undefined && { queryIndex: m.queryIndex }),
          bbox: box,
          boxes: [box],
          text: hit[0],
          source: 'formField',
          context,
        });
        const next = (formFieldCount.get(mi) ?? 0) + 1;
        formFieldCount.set(mi, next);
        if (next >= matchCap) {
          formFieldCapped.add(mi);
          onWarning?.(
            `search query ${JSON.stringify(m.query)} hit the per-page form-field match cap of ${matchCap} on page ${pageNum}; subsequent form-field matches for this query on this page were dropped.`,
          );
          break;
        }
      }
    }
    if (formFieldCapped.size === compiled.matchers.length) break;
  }
}

function formFieldMatchContext(field: FormField, value: string): string {
  const text = field.label?.text ? `${field.label.text}: ${value}` : value;
  return text.replace(/\s+/g, ' ').trim().slice(0, 160);
}

function formFieldSearchValue(field: FormField): string | undefined {
  if (!isVisibleFormField(field)) return undefined;
  if (field.type === 'button') return field.caption && field.caption.length > 0 ? field.caption : undefined;
  if (field.type !== 'text' && field.type !== 'choice') return undefined;
  if (!field.value) return undefined;
  if (field.type === 'choice' && field.displayValue) return field.displayValue;
  if (field.type !== 'choice') return field.value;
  const selectedValues = field.value.split(/\s*,\s*/u).filter((value) => value.length > 0);
  const displayValues = selectedValues.map((value) => choiceDisplayValue(field, value));
  if (displayValues.length === 0) return field.value;
  return displayValues.join(', ');
}

function choiceDisplayValue(field: FormField, value: string): string {
  const option = field.options?.find((item) => item.exportValue === value || item.displayValue === value);
  return option?.displayValue ?? value;
}

function isVisibleFormField(field: FormField): boolean {
  const flags = field.flags ?? [];
  return !flags.some((flag) => flag === 'hidden' || flag === 'invisible' || flag === 'noView');
}

function isSearchableAnnotationText(annotation: PageAnnotation): annotation is PageAnnotation & { contents: string } {
  if (annotation.subtype !== 'FreeText') return false;
  if (!annotation.contents) return false;
  const flags = annotation.flags ?? [];
  return !flags.some((flag) => flag === 'hidden' || flag === 'invisible' || flag === 'noView');
}

function annotationMatchContext(annotation: PageAnnotation, contents: string): string {
  return `${annotation.subtype} annotation: ${contents}`.replace(/\s+/g, ' ').trim().slice(0, 160);
}
