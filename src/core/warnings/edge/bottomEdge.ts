import type { LayoutBlock, PageWarning } from '../../../types/index.js';

/** Bottom-edge threshold. The smaller of `EDGE_NEAR_BOTTOM_ABS` and
 *  `EDGE_NEAR_BOTTOM_REL × pageHeight` — so a tiny page (a slide
 *  thumbnail, a stamp) doesn't trigger on what would be a normal
 *  margin for a US Letter page. 18pt = 0.25 inch; typical body
 *  bottom margins are ≥ 36pt. */
const EDGE_NEAR_BOTTOM_ABS = 18;
const EDGE_NEAR_BOTTOM_REL = 0.025;

/** Caption-vs-body font ratio. A block set at ≤ 70% of the page's
 *  dominant font size near the bottom edge reads as a footnote or
 *  source caption, not as body text crowding the margin. */
const TINY_FONT_CAPTION_RATIO = 0.7;
const TINY_FONT_CAPTION_MAX_CHARS = 300;

/** Max length for a source/footnote caption. Longer than the generic
 *  isBottomReference cap (160) because Japanese statistical footnotes
 *  (※…) routinely run two dense lines. */
const SOURCE_FOOTNOTE_CAPTION_MAX_CHARS = 300;

/** Source attributions and footnotes sit at the bottom edge of chart
 *  slides and report pages by design — 「(出典)…」「※…」「…を基に作成」,
 *  "Source: …". Flagging them as crowded body text is pure noise
 *  (govt white-paper decks fire it on almost every page). Markers are
 *  matched against the NFKC-normalized text the layout pass carries,
 *  so full-width parens appear here in their ASCII form. */
const SOURCE_FOOTNOTE_PREFIX = /^[（(〔[［]?(?:出典|出所|資料|注\d*)[）)〕\]］：:.．]/u;
const SOURCE_FOOTNOTE_SUFFIX =
  /(?:を(?:基|もと)に(?:筆者)?(?:作成|加工|編集)|より(?:筆者)?(?:作成|引用|抜粋|転載))[。.]?$/u;

export function detectNearBottomEdge(
  blocks: LayoutBlock[],
  pageWidth: number,
  pageHeight: number,
  out: PageWarning[],
): void {
  // Only non-repeated body blocks — a footer at the bottom edge is
  // by definition "near the bottom edge" and that's not a finding.
  const threshold = Math.min(EDGE_NEAR_BOTTOM_ABS, pageHeight * EDGE_NEAR_BOTTOM_REL);
  const bodyFontSize = dominantPageFontSize(blocks);
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.repeated) continue;
    if (isBottomReference(b)) continue;
    if (isCenteredBottomLabel(b, pageWidth)) continue;
    if (isSourceFootnoteCaption(b)) continue;
    if (isTinyFontCaption(b, bodyFontSize)) continue;
    const distance = pageHeight - (b.y + b.height);
    if (distance < 0) continue; // off_page handles this case
    if (distance >= threshold) continue;
    out.push({
      code: 'near_bottom_edge',
      severity: 'warning',
      message: `body block ends ${distance.toFixed(1)}pt above the page bottom (threshold ${threshold.toFixed(1)}pt) — text may be crowded against the lower margin`,
      blockIndex: i,
    });
  }
}

function isCenteredBottomLabel(block: LayoutBlock, pageWidth: number): boolean {
  const text = block.text.trim();
  if (text.length === 0 || text.length > 120) return false;
  if (block.lines.length > 2) return false;
  if (block.width > pageWidth * 0.35) return false;
  const center = block.x + block.width / 2;
  return Math.abs(center - pageWidth / 2) <= pageWidth * 0.15;
}

function isBottomReference(block: LayoutBlock): boolean {
  const text = block.text.trim();
  if (text.length === 0 || text.length > 160) return false;
  if (block.width <= 40 && /^\d{1,4}$/u.test(text)) return true;
  if (block.width <= 40 && isRomanNumeralPageLabel(text)) return true;
  if (block.width <= 100 && /^page\s+\d{1,4}(?:\s+of\s+\d{1,4})?$/iu.test(text)) return true;
  if (block.width <= 180 && /^(?:[\w:.-]+\s+)?(?:lecture|slide)\s+\d+\s*[-–]\s*\d{1,4}$/iu.test(text)) {
    return true;
  }
  if (block.width <= 120 && isShortDateFooter(text)) return true;
  return /\b(?:https?:\/\/|www\.|doi:|arxiv:)/i.test(text);
}

/** Char-weighted median font size across every layout line on the
 *  page — the size a human would call "the body text". Returns 0 when
 *  no block carries line data (hand-built layouts in unit tests),
 *  which disables the tiny-font caption rule. */
function dominantPageFontSize(blocks: LayoutBlock[]): number {
  const weighted: { fontSize: number; weight: number }[] = [];
  let total = 0;
  for (const block of blocks) {
    for (const line of block.lines) {
      const weight = line.text.trim().length;
      if (weight === 0 || line.fontSize <= 0) continue;
      weighted.push({ fontSize: line.fontSize, weight });
      total += weight;
    }
  }
  if (total === 0) return 0;
  weighted.sort((a, b) => a.fontSize - b.fontSize);
  let cumulative = 0;
  for (const entry of weighted) {
    cumulative += entry.weight;
    if (cumulative >= total / 2) return entry.fontSize;
  }
  return weighted[weighted.length - 1].fontSize;
}

/** True for short blocks set well below the page's body font size —
 *  e.g. a 6.5pt wrapped citation tail (「(第1回)事務局資料」) at the
 *  bottom of a 9.6pt-body slide. Tiny type at the bottom edge is
 *  always intentional caption/footnote design. */
function isTinyFontCaption(block: LayoutBlock, bodyFontSize: number): boolean {
  if (bodyFontSize <= 0) return false;
  if (block.text.trim().length > TINY_FONT_CAPTION_MAX_CHARS) return false;
  let maxFontSize = 0;
  let hasLine = false;
  for (const line of block.lines) {
    if (line.text.trim().length === 0) continue;
    hasLine = true;
    if (line.fontSize > maxFontSize) maxFontSize = line.fontSize;
  }
  if (!hasLine) return false;
  return maxFontSize <= bodyFontSize * TINY_FONT_CAPTION_RATIO;
}

function isSourceFootnoteCaption(block: LayoutBlock): boolean {
  const text = block.text.trim();
  if (text.length === 0 || text.length > SOURCE_FOOTNOTE_CAPTION_MAX_CHARS) return false;
  if (text.startsWith('※')) return true;
  if (SOURCE_FOOTNOTE_PREFIX.test(text)) return true;
  if (SOURCE_FOOTNOTE_SUFFIX.test(text)) return true;
  if (text.length <= 180 && /資料/u.test(text) && /[」』][）)]?$/u.test(text)) return true;
  // Bare citation shape: organization + quoted publication title,
  // e.g. 総務省「情報通信メディアの利用時間と情報行動に関する調査」.
  if (text.length <= 100 && /^[^「」]{0,30}「[^「」]+」$/u.test(text)) return true;
  return /^(?:sources?|notes?)\s*[:：]/iu.test(text);
}

function isRomanNumeralPageLabel(text: string): boolean {
  const normalized = text.toLowerCase();
  if (!/^[ivxlcdm]{1,12}$/u.test(normalized)) return false;
  return /^m{0,4}(cm|cd|d?c{0,3})(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$/u.test(normalized);
}

function isShortDateFooter(text: string): boolean {
  return /^(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+\d{1,2},?(?:\s+\d{4})?$/iu.test(
    text,
  );
}
