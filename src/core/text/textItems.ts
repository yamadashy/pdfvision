/**
 * The pdf.js text-content item fields the text-item passes read and
 * rewrite. Passes run before page text, spans and layout are built, so a
 * correction made here reaches every surface that reads text.
 */
export interface RawTextItem {
  str: string;
  width?: unknown;
  height?: unknown;
  transform?: readonly number[];
  fontName?: unknown;
  hasEOL?: unknown;
  dir?: unknown;
}

/** Position of an upright, left-to-right item in PDF user space (y grows upward). */
export interface UprightGeometry {
  left: number;
  right: number;
  baseline: number;
  fontSize: number;
}

export function isRawTextItem(item: unknown): item is RawTextItem {
  return !!item && typeof item === 'object' && 'str' in item && typeof (item as RawTextItem).str === 'string';
}

export function isWhitespaceItem(item: RawTextItem): boolean {
  return item.str.length > 0 && item.str.trim().length === 0;
}

/**
 * Geometry of an item drawn upright and left to right. Rotated, skewed,
 * mirrored, vertical (`ttb`) and right-to-left items yield undefined: the
 * passes reason along a horizontal baseline and leave everything else as
 * pdf.js returned it.
 */
export function uprightGeometry(item: RawTextItem): UprightGeometry | undefined {
  const t = item.transform;
  if (!t || t.length < 6 || item.dir === 'ttb' || item.dir === 'rtl') return undefined;
  const [a, b, c, d, e, f] = t;
  if (!(a > 0) || !(d > 0) || !Number.isFinite(e) || !Number.isFinite(f)) return undefined;
  if (Math.abs(b) > a * 1e-3 || Math.abs(c) > d * 1e-3) return undefined;
  const width = typeof item.width === 'number' && Number.isFinite(item.width) ? item.width : Number.NaN;
  if (!(width >= 0)) return undefined;
  return { left: e, right: e + width, baseline: f, fontSize: d };
}

/** A copy of `item` with new text, starting at `left` and ending at `right`. */
export function withTextAndExtent(item: RawTextItem, str: string, left: number, right: number): RawTextItem {
  const t = item.transform as readonly number[];
  return { ...item, str, width: Math.max(0, right - left), transform: [t[0], t[1], t[2], t[3], left, t[5]] };
}

export function codePointLength(text: string): number {
  let count = 0;
  for (const _ of text) count++;
  return count;
}
