import type { PageResult } from '../../types/index.js';
import { appendJavaScriptActions, escapeAttr, escapeText } from './helpers.js';

export function appendPageVisualSections(out: string[], page: PageResult): void {
  appendVisualRegions(out, page);
  appendFormFields(out, page);
}

function appendVisualRegions(out: string[], page: PageResult): void {
  if (!page.visualRegions) return;

  if (page.visualRegions.length === 0) {
    out.push('<visualRegions/>');
    return;
  }

  out.push('<visualRegions>');
  for (const region of page.visualRegions) {
    const attrs = [
      ...(region.id !== undefined ? [`id="${escapeAttr(region.id)}"`] : []),
      `kind="${region.kind}"`,
      `x="${region.x}"`,
      `y="${region.y}"`,
      `width="${region.width}"`,
      `height="${region.height}"`,
      `areaRatio="${region.areaRatio}"`,
      `sourceCount="${region.sourceCount}"`,
      `reason="${escapeAttr(region.reason)}"`,
    ];
    if (region.image !== undefined) attrs.push(`image="${escapeAttr(region.image)}"`);
    if (region.renderContentRatio !== undefined) attrs.push(`renderContentRatio="${region.renderContentRatio}"`);
    if (region.renderedContentBox !== undefined) {
      attrs.push(
        `renderedContentBoxX="${region.renderedContentBox.x}"`,
        `renderedContentBoxY="${region.renderedContentBox.y}"`,
        `renderedContentBoxWidth="${region.renderedContentBox.width}"`,
        `renderedContentBoxHeight="${region.renderedContentBox.height}"`,
      );
    }
    const associatedText = region.associatedText ?? [];
    if (region.sources.length === 0 && associatedText.length === 0) {
      out.push(`<region ${attrs.join(' ')}/>`);
      continue;
    }

    out.push(`<region ${attrs.join(' ')}>`);
    for (const source of region.sources) {
      out.push(`<source type="${source.type}" index="${source.index}"/>`);
    }
    if (associatedText.length > 0) {
      out.push('<associatedText>');
      for (const item of associatedText) {
        const textAttrs = [
          `relation="${item.relation}"`,
          `x="${item.x}"`,
          `y="${item.y}"`,
          `width="${item.width}"`,
          `height="${item.height}"`,
          ...(item.blockIndex !== undefined ? [`blockIndex="${item.blockIndex}"`] : []),
          ...(item.fieldIndex !== undefined ? [`fieldIndex="${item.fieldIndex}"`] : []),
        ];
        out.push(`<text ${textAttrs.join(' ')}>${escapeText(item.text)}</text>`);
      }
      out.push('</associatedText>');
    }
    out.push('</region>');
  }
  out.push('</visualRegions>');
}

function appendFormFields(out: string[], page: PageResult): void {
  if (!page.formFields) return;

  if (page.formFields.length === 0) {
    out.push('<formFields/>');
    return;
  }

  out.push('<formFields>');
  for (const field of page.formFields) {
    const fieldAttrs = [
      `name="${escapeAttr(field.name)}"`,
      `type="${field.type}"`,
      `x="${field.x}"`,
      `y="${field.y}"`,
      `width="${field.width}"`,
      `height="${field.height}"`,
    ];
    if (field.value !== undefined) fieldAttrs.push(`value="${escapeAttr(field.value)}"`);
    if (field.checked !== undefined) fieldAttrs.push(`checked="${field.checked}"`);
    if (field.readOnly !== undefined) fieldAttrs.push(`readOnly="${field.readOnly}"`);
    if (field.required !== undefined) fieldAttrs.push(`required="${field.required}"`);
    if (field.multiline !== undefined) fieldAttrs.push(`multiline="${field.multiline}"`);
    if (field.displayValue !== undefined) fieldAttrs.push(`displayValue="${escapeAttr(field.displayValue)}"`);
    if (field.caption !== undefined) fieldAttrs.push(`caption="${escapeAttr(field.caption)}"`);
    if (field.exportValue !== undefined) fieldAttrs.push(`exportValue="${escapeAttr(field.exportValue)}"`);
    if (field.combo !== undefined) fieldAttrs.push(`combo="${field.combo}"`);
    if (field.multiSelect !== undefined) fieldAttrs.push(`multiSelect="${field.multiSelect}"`);
    if (field.flags !== undefined) fieldAttrs.push(`flags="${escapeAttr(field.flags.join(','))}"`);
    if (field.label !== undefined) {
      fieldAttrs.push(`label="${escapeAttr(field.label.text)}"`);
      fieldAttrs.push(`labelRelation="${field.label.relation}"`);
      fieldAttrs.push(`labelX="${field.label.x}"`);
      fieldAttrs.push(`labelY="${field.label.y}"`);
      fieldAttrs.push(`labelWidth="${field.label.width}"`);
      fieldAttrs.push(`labelHeight="${field.label.height}"`);
    }
    appendFormField(out, field, fieldAttrs);
  }
  out.push('</formFields>');
}

function appendFormField(
  out: string[],
  field: NonNullable<PageResult['formFields']>[number],
  fieldAttrs: string[],
): void {
  const hasOptions = field.options !== undefined && field.options.length > 0;
  const hasActions = field.actions !== undefined;
  const hasResetForm = field.resetForm !== undefined;
  if (!hasOptions && !hasActions && !hasResetForm) {
    out.push(`<field ${fieldAttrs.join(' ')}/>`);
    return;
  }

  out.push(`<field ${fieldAttrs.join(' ')}>`);
  if (field.resetForm) {
    if (field.resetForm.fields.length === 0) {
      out.push(`<resetForm include="${field.resetForm.include}"/>`);
    } else {
      out.push(`<resetForm include="${field.resetForm.include}">`);
      for (const name of field.resetForm.fields) {
        out.push(`<fieldName>${escapeText(name)}</fieldName>`);
      }
      out.push('</resetForm>');
    }
  }
  if (field.actions) appendJavaScriptActions(out, field.actions);
  if (field.options && field.options.length > 0) {
    out.push('<options>');
    for (const option of field.options) {
      out.push(
        `<option exportValue="${escapeAttr(option.exportValue)}" displayValue="${escapeAttr(option.displayValue)}"/>`,
      );
    }
    out.push('</options>');
  }
  out.push('</field>');
}
