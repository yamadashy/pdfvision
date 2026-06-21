/**
 * Alpha threshold below which a pixel counts as transparent. Some PDFs
 * render with translucent overlays whose alpha is very small but nonzero;
 * < 16 is a safe "effectively invisible" cutoff.
 */
const ALPHA_THRESHOLD = 16;
/**
 * Luminance histogram bucket size used by {@link computeContentRatio}.
 * 256 luminance levels / 16 = 16 buckets. Coarse enough that JPEG noise
 * around a uniform background falls into the same bucket; fine enough
 * that real text against that background lands in a different one.
 */
const LUM_BUCKET_SIZE = 16;
/**
 * How far a pixel's luminance must sit from the dominant-background
 * bucket to count as content. Two full buckets apart keeps anti-aliasing
 * fringes (which sit one bucket off) out of the count without losing
 * real ink (which is many buckets darker / lighter).
 */
const CONTENT_LUM_DELTA = LUM_BUCKET_SIZE * 2;

export interface PixelContentBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RenderStats {
  contentRatio: number;
  contentBoxPx?: PixelContentBox;
}

/**
 * Fraction of pixels in `rgba` that look like real content. Returns
 * 0..1 rounded to 6dp; values close to zero are the signal we care
 * about, so coarser rounding would lose discrimination between
 * "0.0001 blank" and "0.005 sparse marks".
 *
 * "Content" is defined relative to the page's own dominant luminance
 * (the *background*) rather than a fixed near-white threshold. White
 * paper, beige scans and dark book covers all converge on the same
 * "near-zero = blank" semantic — without this, an Internet-Archive
 * scan of a dark cover (dominant luminance ~50) reads as
 * `renderContentRatio = 1` even though there is no ink on the page.
 *
 * Algorithm: build a coarse luminance histogram (16 buckets), call the
 * heaviest bucket the background, count the non-transparent pixels
 * whose luminance differs from the background bucket by at least
 * {@link CONTENT_LUM_DELTA}. Luminance uses the perceptual ITU-R
 * BT.601 weights (R*.299 + G*.587 + B*.114) so coloured backgrounds
 * are weighted the way agents see them.
 *
 * 0.001 is still a useful "effectively blank" cutoff. Threshold
 * guidance lives in the skill doc; pdfvision exposes the ratio and
 * the agent decides what to do.
 */
export function computeContentRatio(rgba: Uint8ClampedArray): number {
  return computeContentStats(rgba).contentRatio;
}

export function computeContentStats(rgba: Uint8ClampedArray, width?: number, height?: number): RenderStats {
  const totalPx = rgba.length / 4;
  if (totalPx === 0) return { contentRatio: 0 };

  // Pass 1: luminance histogram of non-transparent pixels.
  const bucketCount = Math.ceil(256 / LUM_BUCKET_SIZE);
  const hist = new Uint32Array(bucketCount);
  let opaque = 0;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < ALPHA_THRESHOLD) continue;
    // BT.601 luma; integer math keeps the hot loop branch-free.
    const lum = (rgba[i] * 299 + rgba[i + 1] * 587 + rgba[i + 2] * 114) / 1000;
    hist[Math.min(bucketCount - 1, lum / LUM_BUCKET_SIZE) | 0]++;
    opaque++;
  }
  if (opaque === 0) return { contentRatio: 0 };

  // Pick the heaviest bucket as background.
  let bgBucket = 0;
  let bgCount = hist[0];
  for (let b = 1; b < bucketCount; b++) {
    if (hist[b] > bgCount) {
      bgCount = hist[b];
      bgBucket = b;
    }
  }
  const bgLum = bgBucket * LUM_BUCKET_SIZE + LUM_BUCKET_SIZE / 2;

  // Pass 2: count pixels whose luminance is at least
  // CONTENT_LUM_DELTA away from background. Operating on totalPx (not
  // opaque) keeps blank transparent canvases at 0 instead of NaN.
  let content = 0;
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = -1;
  let maxY = -1;
  const imageWidth = width ?? 0;
  const imageHeight = height ?? 0;
  const canTrackBox = imageWidth > 0 && imageHeight > 0 && imageWidth * imageHeight === totalPx;
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < ALPHA_THRESHOLD) continue;
    const lum = (rgba[i] * 299 + rgba[i + 1] * 587 + rgba[i + 2] * 114) / 1000;
    if (Math.abs(lum - bgLum) >= CONTENT_LUM_DELTA) {
      content++;
      if (canTrackBox) {
        const pixel = i / 4;
        const x = pixel % imageWidth;
        const y = Math.floor(pixel / imageWidth);
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x);
        maxY = Math.max(maxY, y);
      }
    }
  }
  const contentRatio = Math.round((content / totalPx) * 1_000_000) / 1_000_000;
  return {
    contentRatio,
    ...(content > 0 &&
      canTrackBox && {
        contentBoxPx: {
          x: minX,
          y: minY,
          width: maxX - minX + 1,
          height: maxY - minY + 1,
        },
      }),
  };
}
