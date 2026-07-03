import type { PDFDocumentProxy } from 'pdfjs-dist/legacy/build/pdf.mjs';
import type {
  DocumentAttachment,
  DocumentLayers,
  DocumentMetadata,
  DocumentOutlineItem,
  DocumentViewerState,
  ProcessDocumentOptions,
} from '../../types/index.js';
import { collectFileAttachmentAnnotations } from '../document/attachmentAnnotations.js';
import { buildAttachments, mergeAttachmentRecords } from '../document/attachments.js';
import { buildLayers } from '../document/layers.js';
import { buildOutline } from '../document/outline.js';
import { buildViewerState } from '../document/viewer.js';
import { normalizeText } from './textUtils.js';

export interface DocumentFeatures {
  metadata: DocumentMetadata;
  pageLabels?: string[];
  attachments?: DocumentAttachment[];
  outline?: DocumentOutlineItem[];
  viewer?: DocumentViewerState;
  layers?: DocumentLayers;
  hasHiddenOptionalContent: boolean;
}

export async function extractDocumentFeatures(
  doc: PDFDocumentProxy,
  options: ProcessDocumentOptions,
  attachmentOutputDir?: string,
): Promise<DocumentFeatures> {
  const normalize = options.normalize !== false ? normalizeText : undefined;
  const metadata = await doc.getMetadata();
  const info = metadata.info as Record<string, unknown> | null;
  const rawPageLabels = options.pageLabels ? await doc.getPageLabels() : undefined;
  const pageLabels =
    rawPageLabels === undefined
      ? undefined
      : (rawPageLabels ?? []).map((label) => (normalize ? normalize(label) : label));
  const attachmentRecords = options.attachments
    ? mergeAttachmentRecords(await doc.getAttachments(), await collectFileAttachmentAnnotations(doc))
    : undefined;
  const attachments: DocumentAttachment[] | undefined = options.attachments
    ? buildAttachments(attachmentRecords, {
        normalizeText: normalize,
        outputDir: attachmentOutputDir,
      })
    : undefined;
  const outline: DocumentOutlineItem[] | undefined = options.outline
    ? await buildOutline(await doc.getOutline(), doc, {
        normalizeText: normalize,
      })
    : undefined;
  const viewer: DocumentViewerState | undefined = options.viewer
    ? await buildViewerState(doc, {
        normalizeText: normalize,
      })
    : undefined;
  const layerStateOptions = {
    normalizeText: normalize,
  };
  const layerState = options.layers
    ? await buildLayers(doc, layerStateOptions)
    : await buildLayers(doc, layerStateOptions).catch((): DocumentLayers => ({ groups: [] }));
  const layers: DocumentLayers | undefined = options.layers ? layerState : undefined;

  return {
    metadata: buildDocumentMetadata(info, normalize),
    ...(pageLabels !== undefined && { pageLabels }),
    ...(attachments !== undefined && { attachments }),
    ...(outline !== undefined && { outline }),
    ...(viewer !== undefined && { viewer }),
    ...(layers !== undefined && { layers }),
    hasHiddenOptionalContent: layerState.groups.some((group) => !group.visible),
  };
}

function buildDocumentMetadata(
  info: Record<string, unknown> | null,
  normalize: ((value: string) => string) | undefined,
): DocumentMetadata {
  return {
    title: metaString(info?.Title, normalize),
    author: metaString(info?.Author, normalize),
    subject: metaString(info?.Subject, normalize),
    creator: metaString(info?.Creator, normalize),
  };
}

function metaString(raw: unknown, normalize: ((value: string) => string) | undefined): string | null {
  if (typeof raw !== 'string') return null;
  return normalize ? normalize(raw) : raw;
}
