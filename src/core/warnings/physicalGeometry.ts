import type { FormField, LayoutBlock, PageResult, TextSpan } from '../../types/index.js';
import type { OpaqueFillTextEvidence } from '../graphics/opaqueFillText.js';
import type { PageWarningContext } from './index.js';

/**
 * Warning thresholds and pt/pt² messages operate on physical PostScript
 * points. pdf.js deliberately leaves extracted geometry in raw `page.view`
 * units, so a non-default PDF /UserUnit needs a private scaled view before
 * every warning detector runs. The public result is never mutated: its raw
 * bboxes must remain directly reusable as renderRegion input.
 *
 * Keep this clone deliberately bounded to geometry that warning detectors
 * actually read. Large nested payloads such as structure trees, matches, OCR
 * words, annotations, and visual-region provenance stay shared by reference;
 * current detectors read only their text/flags/confidence or do not read them.
 */
export function warningInputsInPhysicalPoints(
  page: PageResult,
  context: PageWarningContext,
): { page: PageResult; context: PageWarningContext } {
  const userUnit = page.userUnit;
  if (userUnit === undefined || userUnit === 1) return { page, context };

  return {
    page: {
      ...page,
      width: page.width * userUnit,
      height: page.height * userUnit,
      ...(page.spans && { spans: page.spans.map((span) => scaleSpan(span, userUnit)) }),
      ...(page.layout && {
        layout: {
          ...page.layout,
          blocks: page.layout.blocks.map((block) => scaleBlock(block, userUnit)),
        },
      }),
      ...(page.imageBoxes && { imageBoxes: page.imageBoxes.map((box) => scaleBox(box, userUnit)) }),
      ...(page.vectorBoxes && { vectorBoxes: page.vectorBoxes.map((box) => scaleBox(box, userUnit)) }),
      ...(page.formFields && { formFields: page.formFields.map((field) => scaleFormField(field, userUnit)) }),
    },
    context: {
      ...context,
      ...(context.spans && { spans: context.spans.map((span) => scaleSpan(span, userUnit)) }),
      ...(context.imageBoxes && { imageBoxes: context.imageBoxes.map((box) => scaleBox(box, userUnit)) }),
      ...(context.vectorBoxes && { vectorBoxes: context.vectorBoxes.map((box) => scaleBox(box, userUnit)) }),
      ...(context.opaqueFillText && { opaqueFillText: scaleOpaqueFillText(context.opaqueFillText, userUnit) }),
    },
  };
}

function scaleBox<T extends { x: number; y: number; width: number; height: number }>(box: T, factor: number): T {
  return {
    ...box,
    x: box.x * factor,
    y: box.y * factor,
    width: box.width * factor,
    height: box.height * factor,
  };
}

function scaleSpan(span: TextSpan, factor: number): TextSpan {
  return { ...scaleBox(span, factor), fontSize: span.fontSize * factor };
}

function scaleBlock(block: LayoutBlock, factor: number): LayoutBlock {
  return {
    ...scaleBox(block, factor),
    lines: block.lines.map((line) => ({ ...scaleBox(line, factor), fontSize: line.fontSize * factor })),
  };
}

function scaleFormField(field: FormField, factor: number): FormField {
  return {
    ...scaleBox(field, factor),
    ...(field.label && { label: scaleBox(field.label, factor) }),
  };
}

function scaleOpaqueFillText(evidence: OpaqueFillTextEvidence, factor: number): OpaqueFillTextEvidence {
  return {
    ...evidence,
    fills: evidence.fills.map((fill) => scaleBox(fill, factor)),
  };
}
