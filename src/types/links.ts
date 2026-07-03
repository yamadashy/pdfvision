export type PageLinkType = 'url' | 'destination' | 'attachment';

export type PageLinkTarget = string | unknown[];

export interface PageLinkAttachment {
  /** Filename shown by the PDF viewer for embedded-file jumps. */
  name: string;
  /** Embedded file description when pdf.js exposes one. */
  description?: string;
  /** Attachment byte size, without embedding the bytes in output. */
  size?: number;
  /** Destination inside the embedded file when the link defines one. */
  destination?: PageLinkTarget;
}

export interface PageLink {
  /**
   * `url` for external links, `destination` for named/internal PDF
   * destinations such as citation jumps or table-of-contents anchors,
   * or `attachment` for embedded-file jumps.
   */
  type: PageLinkType;
  /** URL, destination name, attachment filename, or raw destination array. */
  target: PageLinkTarget;
  /** 1-based physical destination page for internal PDF links when it can be resolved. */
  page?: number;
  /** Visible text inside the link rectangle when it can be reconstructed from native text. */
  text?: string;
  /** True when pdf.js only exposes an unsafe URL fallback, such as Launch or GoToR actions. */
  unsafe?: boolean;
  /** Whether the PDF asks the viewer to open the target in a new window. */
  newWindow?: boolean;
  /** Embedded-file jump metadata, without attachment bytes. */
  attachment?: PageLinkAttachment;
  x: number;
  y: number;
  width: number;
  height: number;
}
