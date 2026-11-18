---
code: symbol_font_substitution
availability: always on (internal spans)
summary: A separate symbol font's signs (minus, `<`, `>`, `±`, `=`) extract as ordinary characters beside numbers, so `−52%` can read as `252%`.
---

It fires when one font on the page is used only for single glyphs set inline at body size directly beside a number in another font, and at least two of those glyphs extract as a digit or a Latin-1 letter (`2`, `þ`, `ð`). Commas, periods, and fractions (`,`, `.`, `¼`) beside numbers are reported alongside once the font qualifies, but never qualify it on their own, because TeX sets the decimal points and commas of math-mode numbers from its math-italic font and those really are punctuation. That is the shape of a separate symbol font whose character map reports minus, `<`, `>`, `±`, or `=` as ordinary characters: `−52%` extracts as `252%`, `<0.001` as `,0.001` (`p < 0.001` as `p , 0.001`), `7.1 ± 0.9` as `7.1 þ 0.9`. The common case is a journal PDF that takes these signs from a symbol font with a wrong character map.

The message names the font alias (the `fontName` in `--geometry` spans), the extracted characters, samples in context, and a `--render-region` covering every affected run.

**Limits:** fonts that set only punctuation or fractions beside numbers, raised or smaller superscripts, fonts that also set longer runs, and pages positioned glyph by glyph do not fire it. A document whose only mis-mapped sign is `<` read as `,` is therefore not flagged.

**Next step:** signs and comparison operators in that text are not trustworthy. The PDF itself states the wrong characters, so pdfvision cannot correct them; render the region the message names and read signs and comparison operators from the image before reporting a direction, a bound, or a p-value.
