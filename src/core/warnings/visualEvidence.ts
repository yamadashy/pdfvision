export {
  detectOptionalContentTextHiddenLayerRisk,
  detectVisibleAnnotationTextMissingFromNative,
} from './visualEvidence/annotations.js';
export {
  detectDenseVectorGraphics,
  detectLargeRasterLowTextOverlap,
  detectRasterImageWithoutNativeText,
  detectVectorGraphicsWithoutNativeText,
} from './visualEvidence/graphics.js';
export {
  detectHighConfidenceOcrNativeMismatch,
  detectHighConfidenceOcrNativeSpacingLoss,
} from './visualEvidence/ocrNative.js';
export {
  detectLowConfidenceOcr,
  detectRasterBackedTextLayer,
  detectRasterTextLayerSymbolNoise,
  detectRasterTextLayerWordFragmentation,
} from './visualEvidence/textLayer.js';
