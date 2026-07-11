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
import { buildAttachments, catalogAttachmentsToRecord, mergeAttachmentRecords } from '../document/attachments.js';
import { buildLayers } from '../document/layers.js';
import { buildOutline } from '../document/outline.js';
import { buildViewerState } from '../document/viewer.js';
import { normalizeText } from './textUtils.js';

export interface DocumentFeatures {
  metadata: DocumentMetadata;
  pageLabels?: string[];
  attachments?: DocumentAttachment[];
  attachmentCount?: number;
  outlineCount?: number;
  outline?: DocumentOutlineItem[];
  viewer?: DocumentViewerState;
  layers?: DocumentLayers;
  hasHiddenOptionalContent: boolean;
  isXfaPresent: boolean;
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
  const catalogAttachments = await doc.getAttachments();
  const catalogAttachmentRecords = options.attachments
    ? await catalogAttachmentsToRecord(catalogAttachments, (id) => doc.getAttachmentContent(id))
    : undefined;
  const attachmentRecords = options.attachments
    ? mergeAttachmentRecords(catalogAttachmentRecords, await collectFileAttachmentAnnotations(doc))
    : undefined;
  const attachments: DocumentAttachment[] | undefined = options.attachments
    ? buildAttachments(attachmentRecords, {
        normalizeText: normalize,
        outputDir: attachmentOutputDir,
      })
    : undefined;
  // Presence signal: document-level EmbeddedFiles are counted on every run
  // (one cheap worker call) so a default extraction never hides that the
  // PDF carries attachments. When the full pass ran, its merged view (which
  // also covers per-page file-attachment annotations) is the truth.
  const attachmentCount = attachments?.length ?? catalogAttachments?.size ?? 0;
  const rawOutline = await doc.getOutline();
  const outline: DocumentOutlineItem[] | undefined = options.outline
    ? await buildOutline(rawOutline, doc, {
        normalizeText: normalize,
      })
    : undefined;
  const outlineCount = outline?.length ?? rawOutline?.length ?? 0;
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
    ...(attachmentCount > 0 && { attachmentCount }),
    ...(outlineCount > 0 && { outlineCount }),
    ...(outline !== undefined && { outline }),
    ...(viewer !== undefined && { viewer }),
    ...(layers !== undefined && { layers }),
    hasHiddenOptionalContent: layerState.groups.some((group) => !group.visible),
    isXfaPresent: info?.IsXFAPresent === true,
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
