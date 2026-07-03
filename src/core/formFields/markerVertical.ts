import type { FormField, FormFieldLabel } from '../../types/index.js';
import { SAME_LINE_MARKER_PROMPT_MAX_CHARS, SAME_LINE_TEXT_PROMPT_MAX_GAP_PT } from './constants.js';
import { type BoxLike, round2, unionBox } from './geometry.js';
import { collectStackedLabelLines } from './stacks.js';
import {
  isCompactFieldMarker,
  isUsableLabelText,
  normalizePromptLabelText,
  startsWithPromptItemMarker,
} from './text.js';
import type { LabelCandidate, LabelLine } from './types.js';

export function expandVerticalPromptLeftMarkerLabel(
  field: FormField,
  candidate: LabelCandidate,
  lines: readonly LabelLine[],
): FormFieldLabel | undefined {
  const promptText = normalizePromptLabelText(candidate.text);
  if (startsWithPromptItemMarker(promptText)) return undefined;

  const marker = findSameRowLeftMarkerLine(candidate.line, lines);
  if (!marker) return undefined;

  const stack = collectStackedLabelLines(field, candidate, lines);
  const textParts = stack.map(({ text }) => normalizePromptLabelText(text));
  textParts[0] = `${marker.text} ${textParts[0]}`;
  const text = normalizePromptLabelText(textParts.join(' '));
  if (!isUsableLabelText(text, SAME_LINE_MARKER_PROMPT_MAX_CHARS) || text === candidate.text) return undefined;

  const boxLines = [marker.line, ...stack.map(({ line }) => line)].sort((a, b) => a.y - b.y || a.x - b.x);
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

export function expandVerticalMarkerPromptLabel(
  field: FormField,
  candidate: LabelCandidate,
  lines: readonly LabelLine[],
): FormFieldLabel | undefined {
  const sameRowPrompt = collectSameRowMarkerPromptLines(candidate, lines);
  if (sameRowPrompt.length === 0) return undefined;

  const promptCandidate: LabelCandidate = {
    ...candidate,
    line: sameRowPrompt[0].line,
    text: sameRowPrompt[0].text,
  };
  const promptLines = collectStackedLabelLines(field, promptCandidate, lines);
  const text = normalizePromptLabelText(promptLines.map(({ text }) => text).join(' '));
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

function findSameRowLeftMarkerLine(
  candidateLine: LabelLine,
  lines: readonly LabelLine[],
): { line: LabelLine; text: string } | undefined {
  const candidateCenterY = candidateLine.y + candidateLine.height / 2;
  let best: { line: LabelLine; text: string; gap: number } | undefined;
  for (const line of lines) {
    if (line === candidateLine) continue;
    const text = normalizePromptLabelText(line.text);
    if (!isCompactFieldMarker(text)) continue;
    if (line.x + line.width > candidateLine.x + 1) continue;

    const gap = candidateLine.x - (line.x + line.width);
    if (gap < -2 || gap > SAME_LINE_TEXT_PROMPT_MAX_GAP_PT) continue;
    if (Math.abs(line.y + line.height / 2 - candidateCenterY) > Math.max(4, candidateLine.height)) continue;

    if (!best || gap < best.gap) best = { line, text, gap };
  }
  return best ? { line: best.line, text: best.text } : undefined;
}

function collectSameRowMarkerPromptLines(
  candidate: LabelCandidate,
  lines: readonly LabelLine[],
): { line: LabelLine; text: string }[] {
  const marker = normalizePromptLabelText(candidate.text);
  const markerCenterY = candidate.line.y + candidate.line.height / 2;
  const sameRow = lines
    .filter((line) => line !== candidate.line)
    .filter((line) => Math.abs(line.y + line.height / 2 - markerCenterY) <= Math.max(4, candidate.line.height))
    .map((line) => ({ line, text: markerPromptText(marker, normalizePromptLabelText(line.text)) }))
    .filter((item): item is { line: LabelLine; text: string } => item.text !== undefined)
    .sort((a, b) => b.line.width - a.line.width);
  return sameRow.slice(0, 1);
}

function markerPromptText(marker: string, text: string): string | undefined {
  if (text.length <= marker.length) return undefined;
  if (text.startsWith(`${marker} `)) return text;
  const escaped = marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const seeMatch = text.match(new RegExp(`^See\\s+${escaped}\\s+(.+)`, 'iu'));
  return seeMatch ? `${marker} ${seeMatch[1]}` : undefined;
}
