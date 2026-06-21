export {
  detectOptionalContentTextHiddenLayerRisk,
  detectVisibleAnnotationTextMissingFromNative,
} from './visualEvidence/annotations.js';
export {
  detectDenseVectorGraphics,
  detectLargeRasterLowTextOverlap,
  detectVectorGraphicsWithoutNativeText,
} from './visualEvidence/graphics.js';
export {
  detectHighConfidenceOcrNativeMismatch,
  detectLowConfidenceOcr,
  detectRasterBackedTextLayer,
  detectRasterTextLayerSymbolNoise,
} from './visualEvidence/textLayer.js';
