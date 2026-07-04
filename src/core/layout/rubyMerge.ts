import type { TextSpan } from '../../types/index.js';

export interface RubyBaseRangeLike {
  span: TextSpan;
  start: number;
  end: number;
}

export interface RubyTextAttachmentLike {
  offset: number;
  text: string;
}

interface MergeRubyAssociationOptions<T, R extends RubyBaseRangeLike> {
  getBaseRanges: (association: T) => readonly R[];
  getReading: (association: T) => string;
  merge: (group: readonly T[], baseRanges: readonly R[], reading: string) => T;
  canMerge?: (group: readonly T[], association: T) => boolean;
  spanOrder?: readonly TextSpan[];
}

export function mergeConsecutiveRubyAssociations<T, R extends RubyBaseRangeLike>(
  associations: readonly T[],
  options: MergeRubyAssociationOptions<T, R>,
): T[] {
  const out: T[] = [];
  let group: T[] = [];
  let groupRanges: R[] = [];
  let groupReading = '';

  const flush = () => {
    if (group.length === 0) return;
    out.push(group.length === 1 ? group[0] : options.merge(group, groupRanges, groupReading));
    group = [];
    groupRanges = [];
    groupReading = '';
  };

  for (const association of associations) {
    const ranges = [...options.getBaseRanges(association)];
    if (ranges.length === 0) {
      flush();
      out.push(association);
      continue;
    }

    if (
      group.length > 0 &&
      (options.canMerge?.(group, association) ?? true) &&
      canMergeRubyBaseRanges(groupRanges, ranges, options.spanOrder)
    ) {
      group.push(association);
      groupRanges = mergeRubyBaseRanges(groupRanges, ranges);
      groupReading += options.getReading(association);
      continue;
    }

    flush();
    group = [association];
    groupRanges = ranges;
    groupReading = options.getReading(association);
  }

  flush();
  return out;
}

export function mergeSameOffsetRubyTextAttachments<T extends RubyTextAttachmentLike>(
  attachments: readonly T[],
  merge: (left: T, right: T) => T = (left, right) => ({ ...left, text: left.text + right.text }),
): T[] {
  const sorted = [...attachments].sort((a, b) => a.offset - b.offset);
  const out: T[] = [];
  for (const attachment of sorted) {
    const previous = out.at(-1);
    if (previous && previous.offset === attachment.offset) {
      out[out.length - 1] = merge(previous, attachment);
    } else {
      out.push(attachment);
    }
  }
  return out;
}

function canMergeRubyBaseRanges<R extends RubyBaseRangeLike>(
  previous: readonly R[],
  current: readonly R[],
  spanOrder: readonly TextSpan[] | undefined,
): boolean {
  if (sameRubyBaseRanges(previous, current)) return true;

  if (sameRubyAttachmentEnd(previous, current) && rubyBaseRangesOverlap(previous, current)) return true;

  const previousEnd = previous.at(-1);
  const currentStart = current[0];
  if (!previousEnd || !currentStart) return false;

  if (previousEnd.span === currentStart.span) return previousEnd.end === currentStart.start;
  if (!spanOrder || previousEnd.end !== previousEnd.span.text.length || currentStart.start !== 0) return false;

  const spanIndexes = new Map(spanOrder.map((span, index) => [span, index]));
  const previousIndex = spanIndexes.get(previousEnd.span);
  const currentIndex = spanIndexes.get(currentStart.span);
  return previousIndex !== undefined && currentIndex !== undefined && currentIndex === previousIndex + 1;
}

function sameRubyBaseRanges<R extends RubyBaseRangeLike>(left: readonly R[], right: readonly R[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((range, index) => {
    const other = right[index];
    return range.span === other.span && range.start === other.start && range.end === other.end;
  });
}

function sameRubyAttachmentEnd<R extends RubyBaseRangeLike>(left: readonly R[], right: readonly R[]): boolean {
  const leftEnd = left.at(-1);
  const rightEnd = right.at(-1);
  return !!leftEnd && !!rightEnd && leftEnd.span === rightEnd.span && leftEnd.end === rightEnd.end;
}

function rubyBaseRangesOverlap<R extends RubyBaseRangeLike>(left: readonly R[], right: readonly R[]): boolean {
  return left.some((leftRange) =>
    right.some(
      (rightRange) =>
        leftRange.span === rightRange.span && leftRange.start < rightRange.end && rightRange.start < leftRange.end,
    ),
  );
}

function mergeRubyBaseRanges<R extends RubyBaseRangeLike>(previous: readonly R[], current: readonly R[]): R[] {
  return sameRubyBaseRanges(previous, current) ? [...previous] : [...previous, ...current];
}
