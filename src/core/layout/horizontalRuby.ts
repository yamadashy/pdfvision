import type { TextSpan } from '../../types/index.js';
import { type BBox, median, unionBox } from './geometry.js';
import { mergeConsecutiveRubyAssociations, mergeSameOffsetRubyTextAttachments } from './rubyMerge.js';
import { hasVerticalTextShape } from './verticalText.js';

const HORIZONTAL_RUBY_MAX_FONT_RATIO = 0.6;
const HORIZONTAL_RUBY_MAX_TOP_GAP_RATIO = 1.05;
const HORIZONTAL_RUBY_CENTER_SLACK_RATIO = 0.05;
const HORIZONTAL_RUBY_LINE_Y_TOLERANCE_RATIO = 0.45;
const HORIZONTAL_RUBY_MIN_RANGE_OVERLAP_RATIO = 0.45;
const HORIZONTAL_RUBY_MAX_BASE_GAP_RATIO = 0.55;
const HORIZONTAL_RUBY_BASE_CENTER_SLACK_RATIO = 0.12;
const HORIZONTAL_RUBY_AMBIGUOUS_SCORE_RATIO = 0.9;
const HORIZONTAL_RUBY_MERGE_MAX_SPAN_GAP_RATIO = 0.2;
const HORIZONTAL_RUBY_CONTINUATION_LINE_TOLERANCE_RATIO = 0.25;
const HORIZONTAL_RUBY_CONTINUATION_MAX_GAP_RATIO = 0.25;
const HORIZONTAL_RUBY_CONTINUATION_BASE_SLACK_RATIO = 0.45;
const PINYIN_RUBY_MAX_LENGTH = 7;

interface HorizontalBaseChar {
  span: TextSpan;
  start: number;
  end: number;
  x: number;
  width: number;
  text: string;
}

interface HorizontalBaseLine {
  spans: TextSpan[];
  chars: HorizontalBaseChar[];
  box: BBox;
  fontSize: number;
  cjkDominant: boolean;
}

interface HorizontalSpanGroup {
  spans: TextSpan[];
  y: number;
  fontSize: number;
}

interface HorizontalRubyCandidate {
  association?: HorizontalRubyAssociation;
  rubySpan: TextSpan;
  shouldExclude: boolean;
}

interface HorizontalRubyCandidateMatch {
  baseRanges: HorizontalRubyBaseRange[];
  score: number;
  ambiguous: boolean;
}

export interface HorizontalRubyAnalysis {
  rubySpans: TextSpan[];
  rubyAssociations: HorizontalRubyAssociation[];
}

export interface HorizontalRubyAssociation {
  rubySpans: readonly TextSpan[];
  baseRanges: readonly HorizontalRubyBaseRange[];
  reading: string;
}

export interface HorizontalRubyBaseRange {
  span: TextSpan;
  start: number;
  end: number;
}

export interface HorizontalRubyTextAttachment {
  offset: number;
  text: string;
}

export function extractHorizontalRubyAnalysis(spans: readonly TextSpan[]): HorizontalRubyAnalysis {
  const rubyCandidates = spans.filter(isPotentialHorizontalRubySpan);
  if (rubyCandidates.length === 0) return { rubySpans: [], rubyAssociations: [] };

  const baseLines = buildHorizontalBaseLines(spans);
  if (baseLines.length === 0) return { rubySpans: [], rubyAssociations: [] };
  const maxBaseTopGap = Math.max(
    ...baseLines.map((line) => Math.max(line.fontSize * HORIZONTAL_RUBY_MAX_TOP_GAP_RATIO, line.fontSize + 2)),
  );

  const rubySpans: TextSpan[] = [];
  const rubyAssociations: HorizontalRubyAssociation[] = [];
  let previousAssociation: HorizontalRubyAssociation | undefined;
  for (const rubySpan of rubyCandidates) {
    const candidate = classifyHorizontalRubyCandidate(rubySpan, baseLines, maxBaseTopGap);
    if (!candidate.shouldExclude) {
      if (
        previousAssociation &&
        isStandaloneScriptGText(rubySpan.text) &&
        attachPinyinContinuationRubySpan(rubySpan, previousAssociation, rubySpans)
      ) {
        continue;
      }
      previousAssociation = undefined;
      continue;
    }
    rubySpans.push(rubySpan);
    if (candidate.association) {
      rubyAssociations.push(candidate.association);
      previousAssociation = candidate.association;
    } else {
      previousAssociation = undefined;
    }
  }

  const dedupedAssociations = dedupeRubyAssociations(rubyAssociations, spans).sort(associationSortKey);
  const baseLineBySpan = new Map<TextSpan, HorizontalBaseLine>();
  for (const line of baseLines) {
    for (const span of line.spans) baseLineBySpan.set(span, line);
  }
  return {
    rubySpans: rubySpans.sort((a, b) => a.y - b.y || a.x - b.x),
    rubyAssociations: mergeConsecutiveRubyAssociations(dedupedAssociations, {
      getBaseRanges: (association) => association.baseRanges,
      getReading: (association) => association.reading,
      spanOrder: baseLines.flatMap((line) => line.spans),
      canMerge: (group, association) => {
        const previousRange = group.at(-1)?.baseRanges.at(-1);
        const currentRange = association.baseRanges[0];
        if (!previousRange || !currentRange) return false;
        if (baseLineBySpan.get(previousRange.span) !== baseLineBySpan.get(currentRange.span)) return false;
        if (previousRange.span === currentRange.span) return true;
        return hasTightHorizontalBaseRangeGap(previousRange, currentRange);
      },
      merge: (group, baseRanges, reading) => ({
        rubySpans: group.flatMap((association) => association.rubySpans),
        baseRanges,
        reading,
      }),
    }),
  };
}

export function horizontalRubyTextAttachments(
  associations: readonly HorizontalRubyAssociation[],
): ReadonlyMap<TextSpan, readonly HorizontalRubyTextAttachment[]> {
  const attachments = new Map<TextSpan, HorizontalRubyTextAttachment[]>();
  for (const association of associations) {
    const baseEnd = association.baseRanges.at(-1);
    if (!baseEnd || association.reading.length === 0) continue;
    const existing = attachments.get(baseEnd.span);
    const attachment = { offset: baseEnd.end, text: association.reading };
    if (existing) {
      existing.push(attachment);
    } else {
      attachments.set(baseEnd.span, [attachment]);
    }
  }
  return attachments;
}

export function textWithHorizontalRuby(
  text: string,
  attachments: readonly HorizontalRubyTextAttachment[] | undefined,
): string {
  if (!attachments || attachments.length === 0) return text;
  const sorted = mergeSameOffsetRubyTextAttachments(attachments);
  let out = '';
  let cursor = 0;
  for (const attachment of sorted) {
    const offset = Math.max(cursor, Math.min(text.length, attachment.offset));
    out += text.slice(cursor, offset);
    out += `《${attachment.text}》`;
    cursor = offset;
  }
  return out + text.slice(cursor);
}

export function horizontalRubyReadingText(association: HorizontalRubyAssociation): string {
  return association.reading;
}

function classifyHorizontalRubyCandidate(
  rubySpan: TextSpan,
  baseLines: readonly HorizontalBaseLine[],
  maxBaseTopGap: number,
): HorizontalRubyCandidate {
  const requiresCjkDominantBaseLine = isPinyinRubyText(rubySpan.text);
  let best: HorizontalRubyCandidateMatch | undefined;
  let second: HorizontalRubyCandidateMatch | undefined;
  const minBaseY = rubySpan.y - Math.max(rubySpan.height * 0.25, 1);
  const maxBaseY = rubySpan.y + maxBaseTopGap;
  for (const line of baseLines) {
    if (line.box.y < minBaseY) continue;
    if (line.box.y > maxBaseY) break;
    const match = matchHorizontalRubyToBaseLine(rubySpan, line, requiresCjkDominantBaseLine);
    if (!match) continue;
    if (!best || match.score > best.score) {
      second = best;
      best = match;
    } else if (!second || match.score > second.score) {
      second = match;
    }
  }
  if (!best) return { rubySpan, shouldExclude: false };

  if (best.ambiguous || (second !== undefined && second.score >= best.score * HORIZONTAL_RUBY_AMBIGUOUS_SCORE_RATIO)) {
    return { rubySpan, shouldExclude: true };
  }

  return {
    rubySpan,
    shouldExclude: true,
    association: {
      rubySpans: [rubySpan],
      baseRanges: best.baseRanges,
      reading: normalizeRubyReading(rubySpan.text),
    },
  };
}

function matchHorizontalRubyToBaseLine(
  rubySpan: TextSpan,
  line: HorizontalBaseLine,
  requiresCjkDominantBaseLine: boolean,
): HorizontalRubyCandidateMatch | undefined {
  if (requiresCjkDominantBaseLine && !line.cjkDominant) return undefined;
  if (line.fontSize <= 0 || rubySpan.fontSize <= 0) return undefined;
  if (rubySpan.fontSize > line.fontSize * HORIZONTAL_RUBY_MAX_FONT_RATIO) return undefined;

  const topGap = line.box.y - rubySpan.y;
  if (topGap < -Math.max(rubySpan.height * 0.25, 1)) return undefined;
  if (topGap > Math.max(line.fontSize * HORIZONTAL_RUBY_MAX_TOP_GAP_RATIO, line.fontSize + 2)) return undefined;

  const rubyCenterY = rubySpan.y + rubySpan.height / 2;
  const baseCenterY = line.box.y + line.box.height / 2;
  if (rubyCenterY >= baseCenterY - line.fontSize * HORIZONTAL_RUBY_CENTER_SLACK_RATIO) return undefined;

  const selected = selectOverlappingBaseChars(rubySpan, line);
  if (selected.length === 0) return undefined;

  const ambiguous = hasAmbiguousBaseGaps(selected, line.fontSize);
  const selectedBox = unionHorizontalChars(selected);
  const overlap = horizontalOverlap(rubySpan, selectedBox);
  const rangeOverlapRatio = overlap / Math.max(Math.min(rubySpan.width, selectedBox.width), 0.001);
  if (rangeOverlapRatio < HORIZONTAL_RUBY_MIN_RANGE_OVERLAP_RATIO) return undefined;

  const centerDistance = Math.abs(centerX(rubySpan) - centerX(selectedBox));
  const centerScore = Math.max(0, 1 - centerDistance / Math.max(selectedBox.width, rubySpan.width, 1));
  return {
    baseRanges: baseRangesFromChars(selected),
    score: rangeOverlapRatio + centerScore,
    ambiguous,
  };
}

function attachPinyinContinuationRubySpan(
  continuation: TextSpan,
  association: HorizontalRubyAssociation,
  rubySpans: TextSpan[],
): boolean {
  if (pinyinContinuationAttachmentScore(continuation, association) === undefined) return false;
  association.rubySpans = [...association.rubySpans, continuation];
  association.reading += normalizeRubyReading(continuation.text);
  rubySpans.push(continuation);
  return true;
}

function pinyinContinuationAttachmentScore(
  continuation: TextSpan,
  association: HorizontalRubyAssociation,
): number | undefined {
  const previousRuby = association.rubySpans.at(-1);
  const baseEnd = association.baseRanges.at(-1);
  if (!previousRuby || !baseEnd) return undefined;

  const rubyFontSize = Math.max(previousRuby.fontSize || 0, continuation.fontSize || 0, 1);
  const lineTolerance = Math.max(rubyFontSize * HORIZONTAL_RUBY_CONTINUATION_LINE_TOLERANCE_RATIO, 1);
  if (Math.abs(continuation.y - previousRuby.y) > lineTolerance) return undefined;

  const sizeRatio = continuation.fontSize / Math.max(previousRuby.fontSize, 0.001);
  if (sizeRatio < 0.8 || sizeRatio > 1.2) return undefined;

  const gap = continuation.x - (previousRuby.x + previousRuby.width);
  if (gap < -Math.max(rubyFontSize * 0.15, 1)) return undefined;
  if (gap > Math.max(rubyFontSize * HORIZONTAL_RUBY_CONTINUATION_MAX_GAP_RATIO, 2)) return undefined;

  const baseBox = horizontalBaseRangeBox(baseEnd);
  const baseSlack = Math.max(
    (baseEnd.span.fontSize || rubyFontSize) * HORIZONTAL_RUBY_CONTINUATION_BASE_SLACK_RATIO,
    2,
  );
  if (continuation.x + continuation.width < baseBox.x - baseSlack) return undefined;
  if (continuation.x > baseBox.x + baseBox.width + baseSlack) return undefined;

  return Math.abs(gap) + Math.abs(continuation.y - previousRuby.y);
}

function buildHorizontalBaseLines(spans: readonly TextSpan[]): HorizontalBaseLine[] {
  const horizontalSpans = spans.filter((span) => !hasVerticalTextShape(span));
  const dominanceGroups = groupHorizontalSpansByBaseline(horizontalSpans);
  const candidates = horizontalSpans.filter(spanHasHorizontalRubyBaseText);
  const groups = groupHorizontalSpansByBaseline(candidates);

  return groups
    .map((group) => {
      const spansInLine = [...group.spans].sort((a, b) => a.x - b.x);
      const dominanceSpans = dominanceGroups.find((sourceGroup) =>
        canShareBaselineGroup(spansInLine[0], sourceGroup),
      )?.spans;
      const chars = spansInLine.flatMap(horizontalBaseChars);
      return {
        spans: spansInLine,
        chars,
        box: unionBox(spansInLine),
        fontSize: median(spansInLine.map((span) => span.fontSize || span.height).filter((fontSize) => fontSize > 0)),
        cjkDominant: isCjkDominantTextLine(dominanceSpans ?? spansInLine),
      };
    })
    .filter((line) => line.chars.length > 0 && line.fontSize > 0)
    .sort((a, b) => a.box.y - b.box.y || a.box.x - b.box.x);
}

function groupHorizontalSpansByBaseline(spans: readonly TextSpan[]): HorizontalSpanGroup[] {
  const groups: HorizontalSpanGroup[] = [];
  for (const span of [...spans].sort((a, b) => a.y - b.y || a.x - b.x)) {
    const group = groups.find((item) => canShareBaselineGroup(span, item));
    if (group) {
      const previousCount = group.spans.length;
      group.spans.push(span);
      group.y += (span.y - group.y) / (previousCount + 1);
      group.fontSize += (spanFontSize(span) - group.fontSize) / (previousCount + 1);
    } else {
      groups.push({ spans: [span], y: span.y, fontSize: spanFontSize(span) });
    }
  }
  return groups;
}

function canShareBaselineGroup(span: TextSpan | undefined, group: HorizontalSpanGroup): boolean {
  if (!span) return false;
  const fontSize = spanFontSize(span);
  const tolerance = Math.max(Math.min(fontSize, group.fontSize) * HORIZONTAL_RUBY_LINE_Y_TOLERANCE_RATIO, 2);
  return Math.abs(span.y - group.y) <= tolerance;
}

function spanFontSize(span: TextSpan): number {
  return span.fontSize || span.height || 12;
}

function selectOverlappingBaseChars(rubySpan: TextSpan, line: HorizontalBaseLine): HorizontalBaseChar[] {
  const rubyLeft = rubySpan.x;
  const rubyRight = rubySpan.x + rubySpan.width;
  const slack = Math.max(line.fontSize * HORIZONTAL_RUBY_BASE_CENTER_SLACK_RATIO, 1);
  const selected = line.chars.filter((char) => {
    const overlap = horizontalOverlap(rubySpan, char);
    if (overlap <= 0) return false;
    const charCenter = char.x + char.width / 2;
    return charCenter >= rubyLeft - slack && charCenter <= rubyRight + slack;
  });
  if (selected.length > 0) return selected;

  const best = line.chars
    .map((char) => {
      const overlap = horizontalOverlap(rubySpan, char);
      return { char, overlap };
    })
    .sort((a, b) => b.overlap - a.overlap)[0];
  if (!best || best.overlap <= 0) return [];

  const overlapRatio = best.overlap / Math.max(Math.min(rubySpan.width, best.char.width), 0.001);
  return overlapRatio >= HORIZONTAL_RUBY_MIN_RANGE_OVERLAP_RATIO ? [best.char] : [];
}

function hasAmbiguousBaseGaps(chars: readonly HorizontalBaseChar[], fontSize: number): boolean {
  if (chars.length <= 1) return false;
  const sorted = [...chars].sort((a, b) => a.x - b.x);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    const gap = cur.x - (prev.x + prev.width);
    if (gap > Math.max(fontSize * HORIZONTAL_RUBY_MAX_BASE_GAP_RATIO, 3)) return true;
  }
  return false;
}

function baseRangesFromChars(chars: readonly HorizontalBaseChar[]): HorizontalRubyBaseRange[] {
  const ranges: HorizontalRubyBaseRange[] = [];
  for (const char of [...chars].sort((a, b) => a.x - b.x)) {
    const previous = ranges.at(-1);
    if (previous && previous.span === char.span && previous.end === char.start) {
      previous.end = char.end;
    } else {
      ranges.push({ span: char.span, start: char.start, end: char.end });
    }
  }
  return ranges;
}

function horizontalBaseChars(span: TextSpan): HorizontalBaseChar[] {
  const chars = Array.from(span.text);
  const charWidth = span.width / Math.max(chars.length, 1);
  const out: HorizontalBaseChar[] = [];
  let offset = 0;
  for (let index = 0; index < chars.length; index++) {
    const text = chars[index];
    const start = offset;
    const end = start + text.length;
    offset = end;
    if (!isHorizontalRubyBaseChar(text)) continue;
    out.push({
      span,
      start,
      end,
      x: span.x + charWidth * index,
      width: charWidth,
      text,
    });
  }
  return out;
}

function hasTightHorizontalBaseRangeGap(previous: HorizontalRubyBaseRange, current: HorizontalRubyBaseRange): boolean {
  const previousBox = horizontalBaseRangeBox(previous);
  const currentBox = horizontalBaseRangeBox(current);
  const gap = currentBox.x - (previousBox.x + previousBox.width);
  const fontSize = Math.max(previous.span.fontSize || 0, current.span.fontSize || 0, 1);
  return gap >= -fontSize * HORIZONTAL_RUBY_MERGE_MAX_SPAN_GAP_RATIO && gap <= Math.max(fontSize * 0.2, 2);
}

function horizontalBaseRangeBox(range: HorizontalRubyBaseRange): { x: number; width: number } {
  const chars = Array.from(range.span.text);
  const charWidth = range.span.width / Math.max(chars.length, 1);
  const start = Array.from(range.span.text.slice(0, range.start)).length;
  const end = Array.from(range.span.text.slice(0, range.end)).length;
  return {
    x: range.span.x + charWidth * start,
    width: charWidth * Math.max(end - start, 0),
  };
}

function unionHorizontalChars(chars: readonly HorizontalBaseChar[]): BBox {
  const minX = Math.min(...chars.map((char) => char.x));
  const maxX = Math.max(...chars.map((char) => char.x + char.width));
  const minY = Math.min(...chars.map((char) => char.span.y));
  const maxY = Math.max(...chars.map((char) => char.span.y + char.span.height));
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function associationSortKey(a: HorizontalRubyAssociation, b: HorizontalRubyAssociation): number {
  const aRange = a.baseRanges[0];
  const bRange = b.baseRanges[0];
  if (!aRange || !bRange) return 0;
  return aRange.span.y - bRange.span.y || aRange.span.x - bRange.span.x || aRange.start - bRange.start;
}

function dedupeRubyAssociations(
  associations: readonly HorizontalRubyAssociation[],
  spans: readonly TextSpan[],
): HorizontalRubyAssociation[] {
  const spanIndices = new Map(spans.map((span, index) => [span, index]));
  const seen = new Set<string>();
  const out: HorizontalRubyAssociation[] = [];
  for (const association of associations) {
    const key = [
      association.reading,
      ...association.baseRanges.map((range) => `${spanIndices.get(range.span) ?? -1}:${range.start}:${range.end}`),
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(association);
  }
  return out;
}

function isPotentialHorizontalRubySpan(span: TextSpan): boolean {
  if (span.text.trim().length === 0) return false;
  if (hasVerticalTextShape(span)) return false;
  if (span.fontSize <= 0 || span.width <= 0 || span.height <= 0) return false;
  return isKanaOnlyRubyText(span.text) || isPinyinRubyText(span.text);
}

function spanHasHorizontalRubyBaseText(span: TextSpan): boolean {
  return Array.from(span.text).some(isHorizontalRubyBaseChar);
}

function isKanaOnlyRubyText(text: string): boolean {
  const compact = normalizeRubyReading(text);
  return compact.length > 0 && Array.from(compact).every(isKanaRubyChar);
}

function isPinyinRubyText(text: string): boolean {
  const compact = normalizeRubyReading(text);
  const chars = Array.from(compact);
  if (chars.length === 0 || chars.length > PINYIN_RUBY_MAX_LENGTH) return false;
  if (chars.some(isDigitChar)) return false;
  return (
    chars.every(isPinyinRubyChar) &&
    (chars.some(isPinyinVowelChar) || isStandaloneScriptGReading(chars)) &&
    hasPinyinReadingSignal(chars)
  );
}

function normalizeRubyReading(text: string): string {
  return text.replace(/\s+/gu, '');
}

function isKanaRubyChar(char: string): boolean {
  return /^[\u3040-\u309f\u30a0-\u30ff\uff66-\uff9f]$/u.test(char);
}

function isPinyinRubyChar(char: string): boolean {
  if (/^[a-z]$/u.test(char)) return true;
  if (isPinyinScriptGChar(char)) return true;
  return /^[\u00e0-\u01d4\u01d6\u01d8\u01da\u01dc]$/u.test(char) && isPinyinVowelChar(char);
}

function isPinyinScriptGChar(char: string): boolean {
  return char === '\u0261';
}

function isPinyinVowelChar(char: string): boolean {
  const base = char.normalize('NFD').replace(/\p{Mark}/gu, '');
  return /^[aeiou]$/u.test(base);
}

function hasPinyinReadingSignal(chars: readonly string[]): boolean {
  return chars.length > 1 || chars.some(isMarkedPinyinVowelChar) || isStandaloneScriptGReading(chars);
}

function isMarkedPinyinVowelChar(char: string): boolean {
  return !/^[a-z]$/u.test(char) && isPinyinVowelChar(char);
}

function isStandaloneScriptGReading(chars: readonly string[]): boolean {
  return chars.length === 1 && isPinyinScriptGChar(chars[0] ?? '');
}

function isStandaloneScriptGText(text: string): boolean {
  return isStandaloneScriptGReading(Array.from(normalizeRubyReading(text)));
}

function isHorizontalRubyBaseChar(char: string): boolean {
  return /^[\p{Script=Han}\u3005\u3007\u303bヶヵ]$/u.test(char);
}

function isCjkDominantTextLine(spans: readonly TextSpan[]): boolean {
  let cjkChars = 0;
  let textChars = 0;
  for (const span of spans) {
    for (const char of Array.from(span.text)) {
      if (!isTextualChar(char)) continue;
      textChars++;
      if (isCjkTextChar(char)) cjkChars++;
    }
  }
  return cjkChars > 0 && cjkChars / Math.max(textChars, 1) >= 0.5;
}

function isCjkTextChar(char: string): boolean {
  return /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]$/u.test(char);
}

function isTextualChar(char: string): boolean {
  return /^[\p{Letter}\p{Number}]$/u.test(char);
}

function isDigitChar(char: string): boolean {
  return /^\p{Number}$/u.test(char);
}

function horizontalOverlap(a: { x: number; width: number }, b: { x: number; width: number }): number {
  return Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
}

function centerX(item: { x: number; width: number }): number {
  return item.x + item.width / 2;
}
