import { join, dirname as pathDirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ImageOps } from '../graphics/imageBoxes.js';
import type { TextRenderingOps } from '../graphics/invisibleText.js';
import type { OpaqueFillTextOps } from '../graphics/opaqueFillText.js';

interface BuildPdfJsDocumentOptionsInput {
  pdfData?: Uint8Array;
  filePath: string;
  password?: string;
}

export function buildPdfJsDocumentOptions({
  pdfData,
  filePath,
  password,
}: BuildPdfJsDocumentOptionsInput): Record<string, unknown> {
  const docOptions: Record<string, unknown> = pdfData ? { data: pdfData } : { url: filePath };
  if (password !== undefined) {
    docOptions.password = password;
  }
  try {
    // `import.meta.resolve` is sync since Node 20.6 and returns a file://
    // URL for an installed package; convert to a plain directory path so
    // the resulting wasm/cmap dirs work with fs.readFile in Node.
    const pdfjsPkgPath = fileURLToPath(import.meta.resolve('pdfjs-dist/package.json'));
    const pdfjsPkgDir = pathDirname(pdfjsPkgPath);
    // Trailing slash matters: pdf.js appends the filename to this value
    // without an extra separator. pdf.js's `getFactoryUrlProp` only
    // accepts strings ending in `/`, so even on Windows we need to
    // append `/` (not `path.sep`). Inside the path we use `path.join`
    // for platform safety, then concatenate the literal forward slash
    // to satisfy pdf.js's URL contract — Node's `fs.readFile` accepts
    // mixed separators on Windows so this remains portable.
    docOptions.wasmUrl = `${join(pdfjsPkgDir, 'wasm')}/`;
    docOptions.cMapUrl = `${join(pdfjsPkgDir, 'cmaps')}/`;
    docOptions.cMapPacked = true;
    docOptions.standardFontDataUrl = `${join(pdfjsPkgDir, 'standard_fonts')}/`;
  } catch {
    // Best-effort: keep going without the wasm/cmap asset URLs rather
    // than fail the whole extraction over a missing optional asset.
  }
  return docOptions;
}

export function buildImageOps(ops: Record<string, number>): ImageOps {
  // Single-instance image draw opcodes — one image per occurrence.
  // Repeat / Group / inline-Group variants are dispatched separately
  // because their args carry per-instance positions or transforms.
  const singleImageOps = new Set<number>([
    ops.paintImageXObject,
    ops.paintImageMaskXObject,
    ops.paintInlineImageXObject,
  ]);
  const pathPaintOps = new Set<number>([
    ops.stroke,
    ops.closeStroke,
    ops.fill,
    ops.eoFill,
    ops.fillStroke,
    ops.eoFillStroke,
    ops.closeFillStroke,
    ops.closeEOFillStroke,
  ]);
  const pathFillOps = new Set<number>([
    ops.fill,
    ops.eoFill,
    ops.fillStroke,
    ops.eoFillStroke,
    ops.closeFillStroke,
    ops.closeEOFillStroke,
  ]);
  const vectorPaintOps = new Set<number>([...pathPaintOps, ops.shadingFill, ops.rawFillPath]);

  return {
    save: ops.save,
    restore: ops.restore,
    transform: ops.transform,
    formBegin: ops.paintFormXObjectBegin,
    formEnd: ops.paintFormXObjectEnd,
    setFillColorN: ops.setFillColorN,
    fillColorOps: new Set<number>([
      ops.setFillColor,
      ops.setFillColorN,
      ops.setFillRGBColor,
      ops.setFillCMYKColor,
      ops.setFillColorSpace,
    ]),
    singleImageOps,
    constructPath: ops.constructPath,
    pathPaintOps,
    pathFillOps,
    vectorPaintOps,
    shadingFill: ops.shadingFill,
    paintImageXObjectRepeat: ops.paintImageXObjectRepeat,
    paintImageMaskXObjectRepeat: ops.paintImageMaskXObjectRepeat,
    paintImageMaskXObjectGroup: ops.paintImageMaskXObjectGroup,
    paintInlineImageXObjectGroup: ops.paintInlineImageXObjectGroup,
  };
}

export function buildTextRenderingOps(ops: Record<string, number>): TextRenderingOps {
  return {
    save: ops.save,
    restore: ops.restore,
    formBegin: ops.paintFormXObjectBegin,
    formEnd: ops.paintFormXObjectEnd,
    setTextRenderingMode: ops.setTextRenderingMode,
    textShowOps: new Set<number>([
      ops.showText,
      ops.showSpacedText,
      ops.nextLineShowText,
      ops.nextLineSetSpacingShowText,
    ]),
  };
}

export function buildOpaqueFillTextOps(ops: Record<string, number>): OpaqueFillTextOps {
  const imageOps = buildImageOps(ops);
  const textOps = buildTextRenderingOps(ops);
  return {
    save: imageOps.save,
    restore: imageOps.restore,
    transform: imageOps.transform,
    formBegin: imageOps.formBegin,
    formEnd: imageOps.formEnd,
    beginGroup: ops.beginGroup,
    endGroup: ops.endGroup,
    beginAnnotation: ops.beginAnnotation,
    endAnnotation: ops.endAnnotation,
    beginMarkedContent: ops.beginMarkedContent,
    beginMarkedContentProps: ops.beginMarkedContentProps,
    endMarkedContent: ops.endMarkedContent,
    setGState: ops.setGState,
    setFillTransparent: ops.setFillTransparent,
    constructPath: imageOps.constructPath,
    clipOps: new Set<number>([ops.clip, ops.eoClip]),
    fillColorOps: imageOps.fillColorOps,
    pathFillOps: imageOps.pathFillOps,
    textShowOps: textOps.textShowOps,
  };
}
