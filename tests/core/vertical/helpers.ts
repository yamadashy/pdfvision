import type { TextSpan } from '../../../src/types/index.js';

export function span(
  text: string,
  x: number,
  y: number,
  fontSize: number,
  width = text.length * fontSize * 0.5,
): TextSpan {
  return {
    text,
    x,
    y,
    width,
    height: fontSize,
    fontSize,
  };
}

export function verticalGlyphs(text: string, x: number, y: number, fontSize: number, step = fontSize): TextSpan[] {
  return Array.from(text).map((glyph, index) => span(glyph, x, y + index * step, fontSize, fontSize));
}

export function verticalSpan(
  text: string,
  x: number,
  y: number,
  fontSize: number,
  height = Array.from(text).length * fontSize,
): TextSpan {
  return {
    text,
    x,
    y,
    width: fontSize,
    height,
    fontSize,
  };
}

export function verticalGlyphTexts(
  texts: readonly string[],
  x: number,
  y: number,
  fontSize: number,
  step = fontSize,
): TextSpan[] {
  return texts.map((text, index) => span(text, x, y + index * step, fontSize, fontSize));
}
