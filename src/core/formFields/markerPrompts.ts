import type { FormField, FormFieldLabel } from '../../types/index.js';
import { SAME_LINE_MARKER_PROMPT_MAX_CHARS } from './constants.js';
import { type BoxLike, centerY, round2, unionBox } from './geometry.js';
import { expandVerticalMarkerPromptLabel, expandVerticalPromptLeftMarkerLabel } from './markerVertical.js';
import { collectConnectedLeftPromptLines, collectSameLineMarkerPromptStack } from './stacks.js';
import {
  isCompactFieldMarker,
  isDotLeaderText,
  isUsableLabelText,
  isUsablePromptFragment,
  normalizePromptLabelText,
} from './text.js';
import type { LabelCandidate, LabelLine } from './types.js';

const SAME_MARKER_PROMPT_BAND_PADDING_PT = 2;

export function expandSameLineMarkerPromptLabel(
  field: FormField,
  candidate: LabelCandidate,
  lines: readonly LabelLine[],
): FormFieldLabel | undefined {
  if (field.type !== 'text') return undefined;
  if (candidate.relation === 'above' || candidate.relation === 'below') {
    return isCompactFieldMarker(candidate.text)
      ? expandVerticalMarkerPromptLabel(field, candidate, lines)
      : expandVerticalPromptLeftMarkerLabel(field, candidate, lines);
  }
  if (!isCompactFieldMarker(candidate.text)) return undefined;
  if (candidate.relation !== 'left') return undefined;

  const sameLinePrompt = collectConnectedLeftPromptLines(candidate.line, lines);
  if (sameLinePrompt.length === 0) return expandSameMarkerPromptBand(candidate, lines);

  const stackedPrompt = collectSameLineMarkerPromptStack(candidate.text, sameLinePrompt, lines);
  const promptLines = [...stackedPrompt, ...sameLinePrompt, { line: candidate.line, text: candidate.text }];
  const textParts = promptLines
    .map(({ text }) => normalizePromptLabelText(text))
    .filter((text) => text.length > 0 && !isDotLeaderText(text));
  const text = normalizePromptLabelText(textParts.join(' '));
  if (!isUsableLabelText(text, SAME_LINE_MARKER_PROMPT_MAX_CHARS) || text === candidate.text) {
    return expandSameMarkerPromptBand(candidate, lines);
  }

  const boxLines = promptLines
    .filter(({ text }) => !isDotLeaderText(text))
    .map(({ line }) => line)
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const labelBox = boxLines.slice(1).reduce<BoxLike>((box, line) => unionBox(box, line), boxLines[0] ?? candidate.line);
  return {
    text,
    relation: candidate.relation,
    x: round2(labelBox.x),
    y: round2(labelBox.y),
    width: round2(labelBox.width),
    height: round2(labelBox.height),
  };
}

function expandSameMarkerPromptBand(
  candidate: LabelCandidate,
  lines: readonly LabelLine[],
): FormFieldLabel | undefined {
  const marker = compactMarkerStem(candidate.text);
  if (!marker) return undefined;

  const lead = findSameMarkerPromptLead(marker, candidate.line, lines);
  if (!lead) return undefined;

  const bandLines = collectPromptBandLines(lead.line, candidate.line, lines);
  const promptLines = dedupePromptLines([lead, ...bandLines, { line: candidate.line, text: candidate.text }]);
  const text = normalizePromptLabelText(
    promptLines
      .map(({ text }) => normalizeMarkerBandText(text))
      .filter((item) => item.length > 0)
      .join(' '),
  );
  if (!isUsableLabelText(text, SAME_LINE_MARKER_PROMPT_MAX_CHARS) || text === candidate.text) return undefined;

  const boxLines = promptLines.map(({ line }) => line).sort((a, b) => a.y - b.y || a.x - b.x);
  const labelBox = boxLines.slice(1).reduce<BoxLike>((box, line) => unionBox(box, line), boxLines[0] ?? candidate.line);
  return {
    text,
    relation: candidate.relation,
    x: round2(labelBox.x),
    y: round2(labelBox.y),
    width: round2(labelBox.width),
    height: round2(labelBox.height),
  };
}

function findSameMarkerPromptLead(
  marker: string,
  candidateLine: LabelLine,
  lines: readonly LabelLine[],
): { line: LabelLine; text: string } | undefined {
  const candidateCenterY = centerY(candidateLine);
  const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const startsWithMarker = new RegExp(`^${escaped}(?:\\b|\\s)`, 'iu');
  let best: { line: LabelLine; text: string; distance: number } | undefined;

  for (const line of lines) {
    if (line === candidateLine) continue;
    if (line.x + line.width > candidateLine.x + 1) continue;
    if (centerY(line) < candidateLine.y - line.height && candidateCenterY < line.y) continue;

    const text = normalizeMarkerBandText(line.text);
    if (!startsWithMarker.test(text)) continue;
    if (!/[\p{Letter}]/u.test(text)) continue;
    if (centerY(line) < candidateLine.y - line.height && candidateLine.y - (line.y + line.height) > 4) continue;
    if (line.y > candidateLine.y + candidateLine.height + 4) continue;

    const distance = Math.abs(centerY(line) - candidateCenterY);
    if (!best || distance < best.distance) best = { line, text, distance };
  }

  return best ? { line: best.line, text: best.text } : undefined;
}

function collectPromptBandLines(
  leadLine: LabelLine,
  candidateLine: LabelLine,
  lines: readonly LabelLine[],
): { line: LabelLine; text: string }[] {
  const top = leadLine.y - SAME_MARKER_PROMPT_BAND_PADDING_PT;
  const bottom = leadLine.y + leadLine.height + SAME_MARKER_PROMPT_BAND_PADDING_PT;
  return lines
    .filter((line) => line !== leadLine && line !== candidateLine)
    .filter((line) => line.x + line.width <= candidateLine.x + 1)
    .filter((line) => centerY(line) >= top && centerY(line) <= bottom)
    .filter((line) => !isContainedTextDuplicate(line, leadLine))
    .map((line) => ({ line, text: normalizeMarkerBandText(line.text) }))
    .filter(({ text }) => isUsablePromptFragment(text) && !isDotLeaderText(text) && !isCompactFieldMarker(text))
    .sort((a, b) => a.line.y - b.line.y || a.line.x - b.line.x);
}

function compactMarkerStem(text: string): string | undefined {
  const normalized = normalizePromptLabelText(text).replace(/\s*\$/u, '').trim();
  const match = /^(?:\(?([a-z])\)?|(\d+(?:\([a-z]\)|[a-z])?))$/iu.exec(normalized);
  return match?.[1] ?? match?.[2];
}

function normalizeMarkerBandText(text: string): string {
  return normalizePromptLabelText(text.replace(/[{}]/gu, ' '));
}

function isContainedTextDuplicate(line: LabelLine, container: LabelLine): boolean {
  const text = normalizeMarkerBandText(line.text);
  if (text.length === 0 || !normalizeMarkerBandText(container.text).includes(text)) return false;
  return (
    line.x >= container.x - 1 &&
    line.y >= container.y - 1 &&
    line.x + line.width <= container.x + container.width + 1 &&
    line.y + line.height <= container.y + container.height + 1
  );
}

function dedupePromptLines(lines: readonly { line: LabelLine; text: string }[]): { line: LabelLine; text: string }[] {
  const seen = new Set<string>();
  const result: { line: LabelLine; text: string }[] = [];
  for (const item of lines) {
    const key = [
      normalizeMarkerBandText(item.text),
      item.line.x.toFixed(2),
      item.line.y.toFixed(2),
      item.line.width.toFixed(2),
      item.line.height.toFixed(2),
    ].join('|');
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}
