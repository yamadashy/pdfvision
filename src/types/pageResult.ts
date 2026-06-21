import type { PageAnnotation } from './annotations.js';
import type { RenderRegion } from './common.js';
import type { FormField } from './form.js';

import type { PageLayout, TextSpan } from './layout.js';
import type { PageLink } from './links.js';
import type { PageOcr } from './ocr.js';
import type { PageQuality } from './quality.js';
import type { SearchMatch } from './search.js';
import type { PageStructureNode } from './structure.js';
import type { ImageBox, VectorBox, VisualRegion } from './visual.js';

import type { PageWarning } from './warnings.js';

export interface PageResult {
  page: number;
  /**
   * Viewer-visible page label for this page, only present when
   * `pageLabels: true` was passed and the PDF defines page labels.
   * Examples: `i`, `ii`, `A-1`, or `1`. This can differ from the
   * physical `page` number used by the CLI page selector.
   */
  pageLabel?: string;
  /**
   * Rendered region echoed back when `renderRegion` was passed to the
   * extraction call. Lets consumers tell whether `pages[].image` is the
   * full page or a sub-rectangle without having to track the original
   * request. Coordinates are in PDF points (top-left origin), matching
   * the input. Omitted for full-page renders.
   */
  renderRegion?: RenderRegion;
  text: string;
  /**
   * Pre-normalization form of `text`. Only present when NFKC normalization
   * was applied (the default) AND it actually changed the string — i.e.
   * the source PDF embedded compatibility codepoints. Lets agents diff
   * the two forms without re-running with `--no-normalize`.
   */
  rawText?: string;
  image?: string;
  /** Length (in code units) of `text`. Useful for detecting image-only slides. */
  charCount: number;
  /** Number of raster image objects drawn on the page (XObject + inline + mask). */
  imageCount: number;
  /**
   * Number of vector drawing operations on the page (path construction,
   * filled / stroked paths, and shadings). Raster images are counted
   * separately in {@link imageCount}; this signal catches diagrams,
   * form boxes, slide shapes, rules, and charts that a human can see but a
   * text-only / raster-image-only pass would otherwise miss.
   *
   * The value is a count of paint operations, not geometry area. Treat it
   * as a "there is non-text visual structure here" signal; agents that
   * need visual fidelity should pair it with `--render`.
   */
  vectorCount: number;
  /**
   * Approximate fraction of page area covered by text glyph boxes (0–1).
   * A heuristic — items can overlap, so this is clamped to ≤ 1. Low values
   * (e.g. < 0.05) suggest the page is dominated by images rather than text.
   */
  textCoverage: number;
  /**
   * Ratio of non-printable code points to total code points in `text`
   * (0–1, rounded to 3dp). pdf.js falls back to raw glyph indices
   * (U+0000, U+0001, ...) when a font has no ToUnicode CMap, which makes
   * the page look fully covered by `textCoverage` while the actual text
   * is partly or mostly binary garbage. `>= 0.05` means native text is
   * incomplete or risky; `>= 0.3` means it is mostly unusable. Fall back
   * to `--render` or `--ocr` when this appears. Counts NUL, C0 (except
   * `\t\n\r`), DEL, C1, unpaired surrogates, and Unicode noncharacters.
   * Private Use Area, format controls, and combining marks are
   * intentionally excluded. PUA-dominant pages can still surface through
   * `warnings[].code === 'glyph_garbage_text'` because icon fonts may use
   * sparse PUA glyphs legitimately.
   */
  nonPrintableRatio: number;
  /**
   * Raw count of non-printable code points in `text`. Surfaced alongside
   * the ratio so sparse occurrences (e.g. two stray control bytes inside
   * an arxiv body page) stay discriminable from "zero" — the 3dp
   * `nonPrintableRatio` rounds them down to 0 even though the agent
   * may still want to know "is there ANY garbage?".
   */
  nonPrintableCount: number;
  /**
   * Fraction of pixels in the rasterised page (0–1, rounded to 6dp) that
   * carry visible content — visible alpha (≥ 16 / 255) AND luminance
   * meaningfully different from the page's own dominant background
   * (measured against a 16-bucket luminance histogram so dark / beige /
   * cream pages don't float the ratio). Present only when `--render` or
   * `--ocr` actually rasterised the page; absent when neither caused a
   * raster.
   *
   * Catches a class of silent failure the text-side signals miss: the
   * raster came out blank (or near-blank) even though pdfvision didn't
   * error. Real-world causes include pdf.js + @napi-rs/canvas being
   * unable to decode JPEG2000 / JPX image streams (common in Internet
   * Archive scans) and PDFs whose fonts have no usable ToUnicode CMap
   * (pdf.js can't resolve glyphs and draws nothing). Without this signal
   * the OCR pipeline returns `confidence: 0` and an agent can't tell
   * "OCR saw a blank page" from "OCR genuinely found no text".
   *
   * Rough thresholds (skill doc):
   *   - ≤ 0.001 → effectively blank unless corroborated object geometry
   *     or visible annotation appearance shows a tiny visible trace
   *   - 0.001 – 0.005, or a corroborated tiny trace below 0.001 →
   *     sparse marks only
   *   - > 0.005 → renderer produced visible content
   */
  renderContentRatio?: number;
  /**
   * Page width in PDF user-space units (typically PostScript points = 1/72 in).
   * Derived from the page MediaBox via pdf.js `page.view`.
   */
  width: number;
  /** Page height in PDF user-space units. See {@link width}. */
  height: number;
  /**
   * Per-text-item geometry, only present when `geometry: true` was passed.
   * Each entry is a single pdf.js text run with its bbox + font size, in
   * top-down coordinates so callers can overlay them on the rendered PNG.
   */
  spans?: TextSpan[];
  /**
   * Reconstructed semantic layout, only present when `layout: true` was
   * passed. Blocks are in approximate reading order; `tables[]` adds
   * row-major hints for aligned numeric tables when detected.
   */
  layout?: PageLayout;
  /**
   * Bounding boxes of raster image draws on the page, only present when
   * `imageBoxes: true` was passed. One entry per draw operation (a tiled
   * hero image yields multiple entries); image-bearing tiling pattern
   * fills use the painted path bbox.
   */
  imageBoxes?: ImageBox[];
  /**
   * Bounding boxes of vector drawings on the page, only present when
   * `vectorBoxes: true` was passed. One entry per path paint operation
   * where pdf.js reports a path bbox, plus shading fills when pdf.js
   * exposes the active clipping bbox, excluding page-sized white
   * background fills. Coordinates use the same top-left PDF-point system
   * as `spans`, `layout.blocks`, and `imageBoxes`.
   */
  vectorBoxes?: VectorBox[];
  /**
   * Crop-ready visual regions, only present when `visualRegions: true`
   * was passed. These are padded/clamped PDF-point bboxes intended for
   * direct use with `renderRegion` when an agent needs to inspect the
   * figure, chart, diagram, table, or form area visually.
   */
  visualRegions?: VisualRegion[];
  /**
   * Interactive PDF form/widget fields, only present when
   * `formFields: true` was passed. Coordinates use the same top-left
   * PDF-point system as `spans`, `layout.blocks`, and `imageBoxes`.
   */
  formFields?: FormField[];
  /**
   * Clickable PDF link annotations, only present when `links: true` was
   * passed. Coordinates use the same top-left PDF-point system as
   * `spans`, `layout.blocks`, and `imageBoxes`.
   */
  links?: PageLink[];
  /**
   * Non-link, non-widget PDF annotations, only present when
   * `annotations: true` was passed. Coordinates use the same top-left
   * PDF-point system as `spans`, `layout.blocks`, and `imageBoxes`.
   */
  annotations?: PageAnnotation[];
  /**
   * Tagged-PDF structure tree for this page, present when `structure: true`
   * was passed. `null` means the pass ran and pdf.js found no page
   * structure tree; absent means structure extraction was not requested.
   */
  structure?: PageStructureNode | null;
  /**
   * Page-level JavaScript actions such as PageOpen/PageClose scripts, present
   * when `viewer: true` was passed and the page defines them.
   */
  jsActions?: Record<string, string[]>;
  /**
   * OCR-derived text + confidence + language, only present when
   * `ocr: true` was passed. The pdfjs-derived `text` field is preserved
   * alongside, so an agent can pick whichever signal it trusts more for
   * the page in question.
   */
  ocr?: PageOcr;
  /**
   * Compact derived classification of the page's text and visual state,
   * computed from the raw signals (`charCount`, `nonPrintableRatio`,
   * `imageCount`, `renderContentRatio`) so agents can dispatch on a
   * single field instead of re-implementing the threshold logic. Pure
   * observation — pdfvision deliberately does NOT recommend an action
   * (e.g. "rerun with --ocr"); that judgment stays with the agent.
   *
   * See {@link PageQuality} for the field semantics and the exact
   * derivation rules.
   */
  quality: PageQuality;
  /**
   * Hits for {@link ProcessDocumentOptions.search} queries on this page,
   * one entry per occurrence. Present only when `search` was passed.
   * Empty array is preserved (distinguishes "search ran, no hits" from
   * "search wasn't requested") so consumers can iterate `pages[].matches`
   * uniformly.
   */
  matches?: SearchMatch[];
  /**
   * Page anomalies detected from layout geometry, text-quality signals,
   * or image boxes. Layout-specific warnings require `layout: true`;
   * image-region warnings can use internal image boxes even when
   * `imageBoxes` is false, while `imageBoxIndex` is only emitted when
   * public `pages[].imageBoxes` exists. Localized glyph noise and
   * PUA-dominant glyph-code text can surface from always-on text-quality
   * signals such as non-printable counters, private-use glyph counts/ratios,
   * isolated mojibake in CJK text, Latin-1 printable mojibake, pdf.js
   * font character-map warnings, or high-confidence OCR/native text
   * disagreement. Empty array is omitted; a populated array means at
   * least one rule fired.
   *
   * Same observational stance as {@link PageQuality}: the warning
   * describes what pdfvision saw, not what the agent should do. See
   * {@link PageWarning} for the field semantics and the rule catalog.
   */
  warnings?: PageWarning[];
}
