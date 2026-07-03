import type { FormField, SearchMatch } from '../../../types/index.js';
import { getFormFieldTextAppearance } from '../../formFields/types.js';
import { round2 } from '../boxes.js';
import { type CompiledSearch, nfkc } from '../compiler.js';
import { duplicateKey, hasPreciseDuplicateAtBox } from '../duplicates.js';
import { cleanContext } from './shared.js';

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
        const box = formFieldMatchBox(field, haystack, hit.index, hit[0].length);
        if (hasPreciseDuplicateAtBox(matches, compiled, hitKey, box)) continue;
        matches.push({
          page: pageNum,
          query: m.query,
          ...(m.queryIndex !== undefined && { queryIndex: m.queryIndex }),
          bbox: box,
          boxes: [box],
          text: hit[0],
          source: 'formField',
          context: formFieldMatchContext(field, haystack),
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

function formFieldWidgetBox(field: FormField): SearchMatch['bbox'] {
  return {
    x: round2(field.x),
    y: round2(field.y),
    width: round2(field.width),
    height: round2(field.height),
  };
}

function formFieldMatchBox(field: FormField, value: string, start: number, length: number): SearchMatch['bbox'] {
  const appearance = getFormFieldTextAppearance(field);
  if (
    field.type !== 'text' ||
    !appearance?.comb ||
    !appearance.maxLen ||
    field.width <= 0 ||
    field.value?.length !== value.length ||
    value.length > appearance.maxLen
  ) {
    return formFieldWidgetBox(field);
  }

  const clampedStart = Math.max(0, Math.min(appearance.maxLen, start));
  const clampedEnd = Math.max(clampedStart, Math.min(appearance.maxLen, start + length));
  if (clampedEnd <= clampedStart) return formFieldWidgetBox(field);

  const cellWidth = field.width / appearance.maxLen;
  return {
    x: round2(field.x + cellWidth * clampedStart),
    y: round2(field.y),
    width: round2(cellWidth * (clampedEnd - clampedStart)),
    height: round2(field.height),
  };
}

function formFieldMatchContext(field: FormField, value: string): string {
  const text = field.label?.text ? `${field.label.text}: ${value}` : value;
  return cleanContext(text, 160);
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
