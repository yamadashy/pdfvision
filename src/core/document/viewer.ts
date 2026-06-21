import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type {
  DocumentMarkInfo,
  DocumentOpenAction,
  DocumentPermission,
  DocumentPermissions,
  DocumentViewerState,
  JsonValue,
} from '../../types/index.js';
import { destinationTarget, resolveDestinationPage } from './destinations.js';

interface PdfOpenAction {
  dest?: unknown;
  action?: unknown;
}

interface PdfMarkInfo {
  Marked?: unknown;
  UserProperties?: unknown;
  Suspects?: unknown;
}

const PERMISSION_FLAGS: ReadonlyArray<{ value: number; name: DocumentPermission }> = [
  { value: 0x04, name: 'print' },
  { value: 0x08, name: 'modifyContents' },
  { value: 0x10, name: 'copy' },
  { value: 0x20, name: 'modifyAnnotations' },
  { value: 0x100, name: 'fillInteractiveForms' },
  { value: 0x200, name: 'copyForAccessibility' },
  { value: 0x400, name: 'assemble' },
  { value: 0x800, name: 'printHighQuality' },
];

interface BuildViewerStateOptions {
  normalizeText?: (value: string) => string;
}

export async function buildViewerState(
  doc: PDFDocumentProxy,
  options: BuildViewerStateOptions = {},
): Promise<DocumentViewerState> {
  const [pageLayout, pageMode, viewerPreferences, openAction, jsActions, permissions, markInfo] = await Promise.all([
    doc.getPageLayout(),
    doc.getPageMode(),
    doc.getViewerPreferences(),
    doc.getOpenAction(),
    doc.getJSActions(),
    doc.getPermissions(),
    doc.getMarkInfo(),
  ]);
  const normalizedPageLayout = textValue(pageLayout, options.normalizeText);
  const normalizedPageMode = textValue(pageMode, options.normalizeText);

  return {
    ...(normalizedPageLayout !== undefined && { pageLayout: normalizedPageLayout }),
    ...(normalizedPageMode !== undefined && normalizedPageMode !== 'UseNone' && { pageMode: normalizedPageMode }),
    ...viewerPreferencesValue(viewerPreferences, options),
    ...(await openActionValue(openAction, doc, options)),
    ...jsActionsValue(jsActions, options),
    ...permissionsValue(permissions),
    ...markInfoValue(markInfo),
  };
}

function textValue(value: unknown, normalizeText: ((value: string) => string) | undefined): string | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  return normalizeText ? normalizeText(value) : value;
}

function viewerPreferencesValue(
  value: unknown,
  options: BuildViewerStateOptions,
): Pick<DocumentViewerState, 'viewerPreferences'> {
  const prefs = jsonObject(value, options);
  return prefs && Object.keys(prefs).length > 0 ? { viewerPreferences: prefs } : {};
}

async function openActionValue(
  value: unknown,
  doc: PDFDocumentProxy,
  options: BuildViewerStateOptions,
): Promise<Pick<DocumentViewerState, 'openAction'> | undefined> {
  const action = value as PdfOpenAction | null | undefined;
  const dest = Array.isArray(value) ? value : action?.dest;
  if (dest !== undefined) {
    const openAction: DocumentOpenAction = { type: 'destination' };
    const target = destinationTarget(dest);
    const page = await resolveDestinationPage(doc, dest);
    if (target !== undefined) openAction.target = normalizeTarget(target, options);
    if (page !== undefined) openAction.page = page;
    return { openAction };
  }

  const actionName = textValue(action?.action, options.normalizeText);
  if (!actionName) return undefined;
  return {
    openAction: {
      type: 'action',
      action: actionName,
    },
  };
}

function permissionsValue(value: unknown): Pick<DocumentViewerState, 'permissions'> {
  if (!Array.isArray(value)) return {};
  const flags = value.filter((flag): flag is number => Number.isInteger(flag));
  const flagSet = new Set(flags);
  const permissions: DocumentPermissions = {
    flags,
    allowed: PERMISSION_FLAGS.filter((flag) => flagSet.has(flag.value)).map((flag) => flag.name),
  };
  return { permissions };
}

export function normalizeJavaScriptActions(
  value: unknown,
  options: BuildViewerStateOptions = {},
): Record<string, string[]> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const actions: Record<string, string[]> = {};
  for (const [rawName, rawScripts] of Object.entries(value)) {
    const name = normalizeTarget(rawName, options);
    if (!name) continue;
    const scripts = (Array.isArray(rawScripts) ? rawScripts : [rawScripts])
      // JavaScript bodies are executable source, not display text. Keep
      // them byte-for-byte after pdf.js decoding so NFKC normalization
      // does not rewrite identifiers or string literals.
      .map((script) => textValue(script, undefined))
      .filter((script): script is string => script !== undefined);
    if (scripts.length > 0) actions[name] = [...(actions[name] ?? []), ...scripts];
  }
  return Object.keys(actions).length > 0 ? actions : undefined;
}

function jsActionsValue(value: unknown, options: BuildViewerStateOptions): Pick<DocumentViewerState, 'jsActions'> {
  const jsActions = normalizeJavaScriptActions(value, options);
  return jsActions ? { jsActions } : {};
}

function markInfoValue(value: unknown): Pick<DocumentViewerState, 'markInfo'> {
  if (!value || typeof value !== 'object') return {};
  const markInfo = value as PdfMarkInfo;
  const out: DocumentMarkInfo = {
    marked: markInfo.Marked === true,
    userProperties: markInfo.UserProperties === true,
    suspects: markInfo.Suspects === true,
  };
  return { markInfo: out };
}

function normalizeTarget(target: string, options: BuildViewerStateOptions): string {
  return options.normalizeText ? options.normalizeText(target) : target;
}

function jsonObject(value: unknown, options: BuildViewerStateOptions): Record<string, JsonValue> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const entries: [string, JsonValue][] = [];
  for (const [key, raw] of Object.entries(value)) {
    const json = jsonValue(raw, options);
    if (json !== undefined) entries.push([key, json]);
  }
  return Object.fromEntries(entries);
}

function jsonValue(value: unknown, options: BuildViewerStateOptions): JsonValue | undefined {
  if (value === null) return null;
  if (typeof value === 'string') return options.normalizeText ? options.normalizeText(value) : value;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (Array.isArray(value)) {
    const items = value.map((item) => jsonValue(item, options)).filter((item): item is JsonValue => item !== undefined);
    return items;
  }
  if (value && typeof value === 'object') return jsonObject(value, options);
  return undefined;
}
