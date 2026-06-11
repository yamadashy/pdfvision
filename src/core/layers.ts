import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type { DocumentLayerGroup, DocumentLayerOrderItem, DocumentLayers, DocumentLayerUsage } from '../types/index.js';

interface BuildLayersOptions {
  normalizeText?: (value: string) => string;
}

interface PdfOptionalContentGroup {
  name?: unknown;
  intent?: unknown;
  usage?: {
    view?: { viewState?: unknown };
    print?: { printState?: unknown };
  };
  visible?: unknown;
  rbGroups?: unknown;
}

interface PdfOptionalContentConfig extends Iterable<[unknown, PdfOptionalContentGroup]> {
  name?: unknown;
  creator?: unknown;
  getOrder?: () => unknown;
}

function textValue(value: unknown, options: BuildLayersOptions): string | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  return options.normalizeText ? options.normalizeText(value) : value;
}

function stringArray(value: unknown, options: BuildLayersOptions): string[] | undefined {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? [value] : [];
  const strings = values
    .filter((item): item is string => typeof item === 'string' && item.length > 0)
    .map((item) => (options.normalizeText ? options.normalizeText(item) : item));
  return strings.length > 0 ? strings : undefined;
}

function usageState(value: unknown): 'ON' | 'OFF' | undefined {
  return value === 'ON' || value === 'OFF' ? value : undefined;
}

function layerUsage(group: PdfOptionalContentGroup): DocumentLayerUsage | undefined {
  const usage = group.usage;
  if (!usage) return undefined;
  const result: DocumentLayerUsage = {};
  const viewState = usageState(usage.view?.viewState);
  const printState = usageState(usage.print?.printState);
  if (viewState) result.viewState = viewState;
  if (printState) result.printState = printState;
  return Object.keys(result).length > 0 ? result : undefined;
}

function rbGroupsValue(value: unknown): string[][] | undefined {
  if (!Array.isArray(value)) return undefined;
  const groups = value
    .map((group) => {
      if (Array.isArray(group)) return group.map(String).filter((id) => id.length > 0);
      if (group instanceof Set) return [...group].map(String).filter((id) => id.length > 0);
      if (
        group !== null &&
        typeof group === 'object' &&
        typeof (group as Iterable<unknown>)[Symbol.iterator] === 'function'
      ) {
        return [...(group as Iterable<unknown>)].map(String).filter((id) => id.length > 0);
      }
      return [];
    })
    .filter((group) => group.length > 0);
  return groups.length > 0 ? groups : undefined;
}

function layerOrderItem(value: unknown, options: BuildLayersOptions): DocumentLayerOrderItem | undefined {
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as { name?: unknown; order?: unknown };
  if (!Array.isArray(raw.order)) return undefined;
  const order = layerOrder(raw.order, options);
  const name = textValue(raw.name, options);
  return name === undefined ? { order } : { name, order };
}

function layerOrder(value: unknown, options: BuildLayersOptions): DocumentLayerOrderItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => layerOrderItem(item, options))
    .filter((item): item is DocumentLayerOrderItem => item !== undefined);
}

function buildLayerGroup(id: unknown, group: PdfOptionalContentGroup, options: BuildLayersOptions): DocumentLayerGroup {
  const name = textValue(group.name, options);
  const intent = stringArray(group.intent, options);
  const usage = layerUsage(group);
  const rbGroups = rbGroupsValue(group.rbGroups);

  return {
    id: String(id),
    ...(name !== undefined && { name }),
    visible: group.visible === true,
    ...(intent !== undefined && { intent }),
    ...(usage !== undefined && { usage }),
    ...(rbGroups !== undefined && { rbGroups }),
  };
}

export async function buildLayers(doc: PDFDocumentProxy, options: BuildLayersOptions = {}): Promise<DocumentLayers> {
  const config = (await doc.getOptionalContentConfig({ intent: 'display' })) as PdfOptionalContentConfig;
  const order = layerOrder(config.getOrder?.(), options);
  const name = textValue(config.name, options);
  const creator = textValue(config.creator, options);

  return {
    ...(name !== undefined && { name }),
    ...(creator !== undefined && { creator }),
    ...(order.length > 0 && { order }),
    groups: [...config].map(([id, group]) => buildLayerGroup(id, group, options)),
  };
}
