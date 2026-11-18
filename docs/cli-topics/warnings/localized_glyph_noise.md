---
code: localized_glyph_noise
availability: always on (text-quality signal)
summary: Scattered non-printable, replacement, private-use, mojibake, or font-map glyphs appear in otherwise usable native text.
---

It fires when any of these holds:

- multiple non-printable code points appear below the mixed-glyph ratio threshold;
- native text contains Unicode replacement characters (`U+FFFD`);
- private-use glyph codes dominate a short run or repeat throughout otherwise readable text;
- a CJK page contains isolated Latin-extended mojibake characters;
- adjacent Latin-1 supplement printable mojibake dominates a short text run;
- many adjacent CJK glyphs are separated by likely artificial spaces or duplicated as adjacent pairs;
- printable font-map noise puts uppercase `LJ` inside an otherwise lowercase word such as `veriLJcation`.

Common cases: formulas, comparison symbols, unit marks, bullet symbols, dotted leaders, non-Latin custom fonts, icon fonts, CJK text-positioning artifacts, text-layer duplication, or ligature/font-map substitutions that render fine but extract as control characters, replacement glyphs, artificial spaces, duplicated CJK glyphs, or stray printable glyphs.

**Next step:** compare the affected passage against `--render` when its exact characters matter.
