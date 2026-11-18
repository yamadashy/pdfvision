export type Rgb = readonly [number, number, number];

export const PAGE_WHITE: Rgb = [255, 255, 255];

const MAX_DARK_LUMINANCE = 0.2;
/**
 * Per-channel distance (0-255) below which a text colour, after alpha
 * compositing, is treated as indistinguishable from what is behind it.
 * Deliberately tight: light-grey watermarks and pale captions stay visible
 * to a reader and must not be reported as hidden.
 */
const MAX_INDISTINGUISHABLE_CHANNEL_DISTANCE = 8;

/** pdf.js normalizes device colours in the operator list to `#rrggbb`. */
export function parseHexColor(value: string | undefined): Rgb | undefined {
  if (!value) return undefined;
  const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/iu.exec(value);
  if (short) {
    return [
      Number.parseInt(short[1] + short[1], 16),
      Number.parseInt(short[2] + short[2], 16),
      Number.parseInt(short[3] + short[3], 16),
    ];
  }
  const full = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/iu.exec(value);
  if (!full) return undefined;
  return [Number.parseInt(full[1], 16), Number.parseInt(full[2], 16), Number.parseInt(full[3], 16)];
}

export function isDarkColor(value: string | undefined): boolean {
  const rgb = parseHexColor(value);
  if (!rgb) return false;
  const [red, green, blue] = rgb.map(srgbToLinear);
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue <= MAX_DARK_LUMINANCE;
}

/** True when `foreground` painted at `alpha` over `background` leaves no visible difference. */
export function isIndistinguishable(foreground: Rgb, alpha: number, background: Rgb): boolean {
  const coverage = Math.min(1, Math.max(0, alpha));
  return foreground.every(
    (channel, i) => coverage * Math.abs(channel - background[i]) <= MAX_INDISTINGUISHABLE_CHANNEL_DISTANCE,
  );
}

/**
 * Per-channel distance below which composited text is faint: still drawn,
 * but at a fraction of full contrast. Beamer's covered overlay items
 * (15% opacity) land around 30-40, #ccc on white at 51; #bbb (68), #999 captions (102)
 * stay above it.
 */
const MAX_FAINT_CHANNEL_DISTANCE = 56;

/** True when `foreground` at `alpha` over `background` differs from it only faintly (or not at all). */
export function isFaint(foreground: Rgb, alpha: number, background: Rgb): boolean {
  const coverage = Math.min(1, Math.max(0, alpha));
  return foreground.every((channel, i) => coverage * Math.abs(channel - background[i]) <= MAX_FAINT_CHANNEL_DISTANCE);
}

function srgbToLinear(channel: number): number {
  const normalized = channel / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}
