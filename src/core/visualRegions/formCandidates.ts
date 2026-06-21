import type { FormField } from '../../types/index.js';
import { isFinitePositiveBox, touches, unionBox } from './geometry.js';
import type { BoxLike, Candidate } from './types.js';

const FORM_CLUSTER_GAP_PT = 18;
const FORM_LARGE_CLUSTER_MIN_FIELDS = 16;
const FORM_LARGE_CLUSTER_SPLIT_GAP_PT = 13;
const FORM_LARGE_CLUSTER_HEIGHT_RATIO = 0.35;
const FORM_TALL_CLUSTER_MIN_FIELDS = 8;
const FORM_TALL_CLUSTER_HEIGHT_RATIO = 0.2;

export function addFormCandidate(
  formFields: readonly FormField[] | undefined,
  pageHeight: number,
  candidates: Candidate[],
): void {
  if (!formFields || formFields.length === 0) return;
  const usableFields = formFields
    .map((field, index) => ({ field, index }))
    .filter(({ field }) => isFinitePositiveBox(field) && isVisuallyDispatchableFormField(field));
  if (usableFields.length === 0) return;
  for (const cluster of formFieldClusters(usableFields, pageHeight)) {
    const associatedText = cluster.flatMap(({ field, index }) =>
      field.label
        ? [
            {
              text: field.label.text,
              relation: 'label' as const,
              x: field.label.x,
              y: field.label.y,
              width: field.label.width,
              height: field.label.height,
              fieldIndex: index,
            },
          ]
        : [],
    );
    const boxes = [
      ...cluster.map(({ field }) => field),
      ...associatedText.map((label) => ({
        x: label.x,
        y: label.y,
        width: label.width,
        height: label.height,
      })),
    ];
    const box = boxes.slice(1).reduce<BoxLike>((acc, item) => unionBox(acc, item), boxes[0]);
    candidates.push({
      ...box,
      kind: 'form',
      priority: 3,
      reason: `${cluster.length} interactive form fields in one page region`,
      sources: cluster.map(({ index }) => ({ type: 'formField', index })),
      ...(associatedText.length > 0 && { associatedText }),
    });
  }
}

export function isVisuallyDispatchableFormField(field: FormField): boolean {
  return !field.flags?.some((flag) => flag === 'invisible' || flag === 'hidden' || flag === 'noView');
}

function formFieldBox(field: FormField): BoxLike {
  return field.label ? unionBox(field, field.label) : field;
}

function formFieldClusters<T extends { field: FormField; index: number }>(
  fields: readonly T[],
  pageHeight: number,
): T[][] {
  const clusters: { box: BoxLike; fields: T[] }[] = [];
  for (const item of fields) {
    const box = formFieldBox(item.field);
    const matches: number[] = [];
    for (let i = 0; i < clusters.length; i++) {
      if (touches(clusters[i].box, box, FORM_CLUSTER_GAP_PT)) matches.push(i);
    }
    if (matches.length === 0) {
      clusters.push({ box, fields: [item] });
      continue;
    }

    const first = matches[0];
    clusters[first] = {
      box: unionBox(clusters[first].box, box),
      fields: [...clusters[first].fields, item],
    };
    for (let i = matches.length - 1; i >= 1; i--) {
      clusters[first] = {
        box: unionBox(clusters[first].box, clusters[matches[i]].box),
        fields: [...clusters[first].fields, ...clusters[matches[i]].fields],
      };
      clusters.splice(matches[i], 1);
    }
  }
  return clusters.flatMap((cluster) => splitLargeFormCluster(cluster.fields, pageHeight));
}

function splitLargeFormCluster<T extends { field: FormField; index: number }>(
  fields: readonly T[],
  pageHeight: number,
): T[][] {
  const sorted = [...fields].sort((a, b) => a.field.y - b.field.y || a.field.x - b.field.x);
  if (sorted.length === 0) return [];
  const box = sorted.slice(1).reduce<BoxLike>((acc, item) => unionBox(acc, item.field), sorted[0].field);
  const shouldSplit =
    sorted.length >= FORM_LARGE_CLUSTER_MIN_FIELDS ||
    box.height >= pageHeight * FORM_LARGE_CLUSTER_HEIGHT_RATIO ||
    (sorted.length >= FORM_TALL_CLUSTER_MIN_FIELDS && box.height >= pageHeight * FORM_TALL_CLUSTER_HEIGHT_RATIO);
  if (!shouldSplit) {
    return [sorted];
  }

  const groups: T[][] = [];
  let current: T[] = [];
  let previousBottom = Number.NEGATIVE_INFINITY;
  for (const item of sorted) {
    const gap = item.field.y - previousBottom;
    if (current.length > 0 && gap >= FORM_LARGE_CLUSTER_SPLIT_GAP_PT) {
      groups.push(current);
      current = [];
    }
    current.push(item);
    previousBottom = Math.max(previousBottom, item.field.y + item.field.height);
  }
  if (current.length > 0) groups.push(current);
  return groups;
}
