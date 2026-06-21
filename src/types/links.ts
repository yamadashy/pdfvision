export type PageLinkType = 'url' | 'destination';

export type PageLinkTarget = string | unknown[];

export interface PageLink {
  /**
   * `url` for external links, `destination` for named/internal PDF
   * destinations such as citation jumps or table-of-contents anchors.
   */
  type: PageLinkType;
  /** URL, destination name, or raw destination array when pdf.js exposes one. */
  target: PageLinkTarget;
  /** 1-based physical destination page for internal PDF links when it can be resolved. */
  page?: number;
  /** Visible text inside the link rectangle when it can be reconstructed from native text. */
  text?: string;
  x: number;
  y: number;
  width: number;
  height: number;
}
