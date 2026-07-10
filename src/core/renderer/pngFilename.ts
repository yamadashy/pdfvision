import type { RenderRegion } from '../../types/index.js';

/**
 * Build the on-disk filename for a rendered page. Region-bearing renders
 * encode the bbox in the filename so multiple regions per page can
 * coexist on disk: `page-3_x50_y100_w400_h300.png`. Without a region the
 * legacy `page-N.png` shape is preserved so existing consumers don't
 * have to learn a new pattern. Numbers are normalised through `String`
 * which drops trailing zeros (`50.5` stays `50.5`, `50.0` becomes `50`).
 *
 * Lives in its own module (no `@napi-rs/canvas` import) so the collision
 * resolver in `processor/flatRenderPaths.ts` can reuse it without eagerly
 * loading the native canvas binding.
 */
export function pngFilename(pageNum: number, region: RenderRegion | undefined): string {
  if (!region) return `page-${pageNum}.png`;
  return `page-${pageNum}_x${region.x}_y${region.y}_w${region.width}_h${region.height}.png`;
}
