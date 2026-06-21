import type { JsonValue } from './common.js';

import type { PageOverview, PageResult } from './page.js';

export type DocumentOutlineTargetType = 'destination' | 'url' | 'action';

export interface DocumentOutlineItem {
  title: string;
  /**
   * `url` for external outline links, `destination` for named/internal PDF
   * destinations, or `action` for named PDF viewer actions such as NextPage.
   * Omitted when an outline node is only a parent label.
   */
  type?: DocumentOutlineTargetType;
  /** URL, action name, or destination identifier / explicit-destination JSON string. */
  target?: string;
  /** 1-based page number resolved from `target` when pdf.js can map it. */
  page?: number;
  /** Nested outline children, preserving the PDF sidebar hierarchy. */
  items?: DocumentOutlineItem[];
}

export type DocumentPermission =
  | 'print'
  | 'modifyContents'
  | 'copy'
  | 'modifyAnnotations'
  | 'fillInteractiveForms'
  | 'copyForAccessibility'
  | 'assemble'
  | 'printHighQuality';

export interface DocumentPermissions {
  /** Raw PDF permission flag values returned by pdf.js. */
  flags: number[];
  /** Human-readable allowed permissions decoded from `flags`. */
  allowed: DocumentPermission[];
}

export interface DocumentOpenAction {
  type: 'destination' | 'action';
  /** Destination name or explicit-destination JSON when `type` is `destination`. */
  target?: string;
  /** 1-based page number when a PDF destination could be resolved. */
  page?: number;
  /** PDF action name when the open action is not a plain destination. */
  action?: string;
}

export interface DocumentMarkInfo {
  marked: boolean;
  userProperties: boolean;
  suspects: boolean;
}

export interface DocumentViewerState {
  /** Initial page layout requested by the PDF catalog, e.g. `TwoColumnLeft`. */
  pageLayout?: string;
  /** Initial page mode requested by the PDF catalog, e.g. `UseOutlines`. */
  pageMode?: string;
  /** Viewer preferences such as DisplayDocTitle, Direction, or PrintScaling. */
  viewerPreferences?: Record<string, JsonValue>;
  /** Catalog OpenAction resolved to a page when possible. */
  openAction?: DocumentOpenAction;
  /** Document-level JavaScript actions such as auto-print scripts. */
  jsActions?: Record<string, string[]>;
  /** Document permission flags when the PDF defines them. */
  permissions?: DocumentPermissions;
  /** Tagged-PDF MarkInfo flags when present. */
  markInfo?: DocumentMarkInfo;
}

export interface DocumentLayerUsage {
  viewState?: 'ON' | 'OFF';
  printState?: 'ON' | 'OFF';
}

export interface DocumentLayerGroup {
  /** PDF optional-content group id, e.g. `4R`. */
  id: string;
  /** Layer name shown by PDF viewers when present. */
  name?: string;
  /** Visibility for the display intent after the default config is applied. */
  visible: boolean;
  /** OCG intent names such as `View` or `Design`. */
  intent?: string[];
  /** View/print usage states when the PDF defines them. */
  usage?: DocumentLayerUsage;
  /** Radio-button group ids that make this layer mutually exclusive. */
  rbGroups?: string[][];
}

export type DocumentLayerOrderItem = string | { name?: string; order: DocumentLayerOrderItem[] };

export interface DocumentLayers {
  /** Optional-content configuration name. */
  name?: string;
  /** Optional-content configuration creator. */
  creator?: string;
  /** Layer panel order, including nested groups, when provided. */
  order?: DocumentLayerOrderItem[];
  /** All optional-content groups known to the document. */
  groups: DocumentLayerGroup[];
}

export interface DocumentAttachment {
  /** Decoded attachment filename shown by a PDF viewer. */
  name: string;
  /** Raw PDF attachment filename when it differs from the decoded name. */
  rawName?: string;
  /** Optional attachment description from the PDF file specification. */
  description?: string;
  /** Embedded file byte length. Attachment bytes are intentionally not emitted. */
  size: number;
  /** Saved attachment path, present when `attachmentOutput` was provided. */
  path?: string;
}

export interface DocumentMetadata {
  title: string | null;
  author: string | null;
  subject: string | null;
  creator: string | null;
}

export interface DocumentResult {
  file: string;
  totalPages: number;
  metadata: DocumentMetadata;
  /**
   * Full document page-label array, 0-indexed by physical page number,
   * present iff page-label extraction was requested. Empty array means the
   * pass ran and the PDF has no custom page labels.
   */
  pageLabels?: string[];
  /**
   * Document-level embedded file attachment metadata, present iff
   * attachment extraction was requested. Empty array means the pass ran
   * and the PDF has no embedded file attachments.
   */
  attachments?: DocumentAttachment[];
  /**
   * Document outline / bookmarks, present iff outline extraction was
   * requested. Empty array means the pass ran and the PDF has no outline.
   */
  outline?: DocumentOutlineItem[];
  /**
   * Viewer-level document settings, present iff viewer extraction was
   * requested. Empty object means the pass ran and no viewer settings were
   * present.
   */
  viewer?: DocumentViewerState;
  /**
   * PDF optional content groups / layers, present iff layer extraction was
   * requested. `groups: []` means the pass ran and the PDF has no layers.
   */
  layers?: DocumentLayers;
  /**
   * Top-level density summary across the selected pages. Present when
   * more than one page was extracted; omitted for single-page outputs
   * where a one-row summary is just noise.
   */
  overview?: PageOverview[];
  pages: PageResult[];
}
