---
code: font_mapping_warning
availability: always on (captured pdf.js font/CMap warnings)
summary: pdf.js reported missing or suspicious font character-map data while native text otherwise looked usable (`ok`).
---

Visible text may render correctly but extract as printable glyph substitutions; the common case is a custom embedded font.

**Next step:** inspect `--render` when exact text matters.
