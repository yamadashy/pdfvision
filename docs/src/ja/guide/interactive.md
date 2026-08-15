---
title: "Forms, Links, and Annotations"
description: "Field shapes for --form-fields, --links, and --annotations: widget types and labels, link targets, annotation flags and markup geometry. Use when a PDF's fillable boxes, clickable targets, or comments matter."
sourceHash: c06a992b886a
---

<!-- Translated from docs/src/en/guide/interactive.md, which is generated from docs/cli-topics/interactive.md.
     Translate the prose, keep code, field names, flags, and warning codes verbatim, and update
     `sourceHash` to the value reported by `node scripts/build-site-reference.mjs`. -->

# Form fields, links, and annotations

Reference for `-f json`, `-f xml`, and `-f toon` consumers.

## Form Fields (`--form-fields`)

```ts
interface FormField {
  name: string;              // PDF field name
  type: 'text' | 'checkbox' | 'radio' | 'choice' | 'signature' | 'button' | 'unknown';
  x: number; y: number; width: number; height: number;
  value?: string;            // current value when present
  checked?: boolean;         // checkbox/radio state when applicable
  readOnly?: boolean;
  required?: boolean;
  multiline?: boolean;
  displayValue?: string;      // viewer-visible selected choice label when different from value
  caption?: string;           // viewer-visible push-button caption when available
  exportValue?: string;       // checkbox/radio submitted value when pdf.js exposes it
  options?: FormFieldChoiceOption[]; // choice-field options when pdf.js exposes them
  combo?: boolean;            // true for combo boxes, false for list boxes
  multiSelect?: boolean;      // true when multiple choices can be selected
  flags?: PageAnnotationFlag[]; // decoded widget annotation flags: hidden, print, noView, locked, ...
  actions?: Record<string, string[]>; // widget-level JavaScript actions such as button scripts
  resetForm?: FormFieldResetFormAction; // non-JavaScript ResetForm button behavior
  label?: FormFieldLabel;    // nearby visible label, when the layout heuristic finds one
}

interface FormFieldChoiceOption {
  exportValue: string;        // submitted/exported form value
  displayValue: string;       // viewer-visible option label
}

interface FormFieldResetFormAction {
  fields: string[];            // field names listed by the ResetForm action
  include: boolean;            // true: reset only listed fields; false: reset all except listed fields
}

interface FormFieldLabel {
  text: string;
  relation: 'left' | 'right' | 'above' | 'below';
  x: number; y: number; width: number; height: number;
}
```

`formFields[]` surfaces interactive PDF widget annotations: blank text inputs, checkboxes, radio buttons, choice fields, buttons, and signatures. It is especially useful for government and tax forms where native text extraction can read the labels but not the fillable boxes a human sees. Checkbox and radio widgets include `exportValue` when pdf.js exposes the submitted value. Choice widgets keep `value` as the submitted/exported selection and include `displayValue` when the viewer-visible selected label differs; `options[]` lists all exported and viewer-visible values, plus `combo` / `multiSelect` behavior flags when pdf.js exposes them. Push buttons include `caption` when pdfvision can recover the viewer-visible `/MK /CA` caption from the widget appearance characteristics; Markdown shows that caption in the Value column, and `--search` can return visible button captions as `source: "formField"` matches. Markdown shows the choice `displayValue` in the Value column and the submitted `value` in Export when they differ. `flags[]` decodes the underlying widget annotation flags, so agents can tell when a form value is hidden, print-only, no-view, locked, or otherwise controlled by viewer state even if the normal screen render is blank. `actions` preserves widget-level JavaScript actions such as button click scripts when pdf.js exposes them, while `resetForm` preserves non-JavaScript ResetForm button behavior so agents can tell whether a button resets all fields, only listed fields, or all except listed fields. Markdown shortens very long JavaScript action summaries for readability; JSON, XML, and TOON keep the full structured values. `label` is a conservative nearest-line hint reconstructed from visible layout text; checkbox/radio widgets prefer same-line labels to the right/left, while text inputs prefer labels immediately above or to the left. Adjacent stacked above/below lines are merged when they form one visible prompt, so narrow fields can carry multi-line labels like "Employer identification number (EIN)" instead of only the closest line. Right-edge checkbox/radio prompts can keep wrapped instruction text that finishes on the widget row, and dotted leader filler plus line-number gutters are removed from those prompt labels; stacked checkbox/radio option rows also stop at sibling widgets so one filing-status option does not absorb the next option, and following caution/instruction paragraphs with their own row prefix are not treated as option-label continuations. Left-side checkbox/radio labels can also merge directly preceding continuation lines, so prompts such as "check this box..." keep the setup text that appears on the line above. Narrow inline text fields also prefer same-line left instruction labels, which keeps short tax-classification/code boxes attached to the prompt that precedes them instead of a nearby label for the next field and trims dotted leader filler from those prompt labels; tall multiline text fields can keep short left-side labels across wider form gutters. Right-edge amount boxes with dotted leaders can expand compact markers like "1 $" or "4(a) $" back to the visible prompt, including short multi-line prompts above the marker row. Fine-grained text spans are also considered so adjacent same-row prompts do not collapse onto both fields when reconstructed layout lines are wider than the human-visible field cell. For semantically named fields, unrelated nearby text is ignored rather than emitted as a misleading label, and narrower spans that match the field name are preferred over broad merged rows. Coordinates use the same unrotated page-view top-left system as `spans`, `layout.blocks`, and `imageBoxes`, so a bbox passes unchanged to `--render-region`.
## Links (`--links`)

```ts
interface PageLink {
  type: 'url' | 'destination' | 'attachment';
  target: string | unknown[];  // URL, destination, or embedded attachment filename
  page?: number;               // 1-based physical target page when destination can be resolved
  text?: string;                // visible text inside the link rectangle when reconstructed
  unsafe?: boolean;             // true when pdf.js exposed only an unsafe URL fallback
  newWindow?: boolean;          // PDF requested opening the target in a new viewer window
  attachment?: {
    name: string;
    description?: string;
    size?: number;
    destination?: string | unknown[];
  };
  x: number; y: number; width: number; height: number;
}
```

`links[]` surfaces clickable PDF link annotations: external URLs, citation jumps, table-of-contents destinations, embedded-file jumps, and cross-reference targets. Internal destinations include `page` when pdfvision can resolve the target to a 1-based physical page number. Launch / remote go-to actions that pdf.js exposes only as `unsafeUrl` keep `type: "url"` for compatibility and add `unsafe: true`; `newWindow` is preserved when the PDF asks the viewer to open a target in a separate window. Embedded go-to links use `type: "attachment"` and include filename, optional description, byte size, and embedded destination metadata without embedding attachment bytes. `text` is the visible native text inside the link rectangle when it can be reconstructed, capped to a short label when a broad link rectangle spans a long table-of-contents region, and clipped from the surrounding line when the PDF places a narrow link over one inline token. Coordinates use the same unrotated page-view top-left system as `spans`, `layout.blocks`, and `imageBoxes`, so a bbox passes unchanged to `--render-region`.
## Annotations (`--annotations`)

```ts
interface PageAnnotation {
  subtype: string;              // Text, Highlight, Underline, StrikeOut, FreeText, Stamp, FileAttachment, Ink, ...
  name?: string;                 // annotation/icon name such as Note, Comment, PushPin, Paperclip
  contents?: string;            // comment / markup contents
  title?: string;               // author/title label
  color?: [number, number, number];
  modified?: string;            // PDF date string
  hasAppearance?: boolean;
  flags?: PageAnnotationFlag[];  // decoded PDF annotation flags: hidden, print, noView, locked, ...
  fileAttachment?: {
    name: string;
    description?: string;
    size: number;               // byte length; bytes are never embedded in JSON/XML/TOON
  };
  x: number; y: number; width: number; height: number;
  border?: {
    width?: number;
    style?: string;             // solid, dashed, beveled, inset, underline, or raw pdf.js value
    dashArray?: number[];
  };
  line?: {
    from: { x: number; y: number };
    to: { x: number; y: number };
    endings?: [string, string]; // PDF line ending names, e.g. None/OpenArrow
  };
  vertices?: { x: number; y: number }[];   // Polygon / PolyLine vertices
  inkPaths?: { x: number; y: number }[][]; // Ink annotation paths
  quadBoxes?: { x: number; y: number; width: number; height: number }[];
}

type PageAnnotationFlag =
  | 'invisible'
  | 'hidden'
  | 'print'
  | 'noZoom'
  | 'noRotate'
  | 'noView'
  | 'readOnly'
  | 'locked'
  | 'toggleNoView'
  | 'lockedContents';
```

`annotations[]` surfaces non-link, non-widget PDF annotations: sticky notes, comments, highlights, underlines, strikeouts, stamps, free text, file-attachment icons, shape markup, ink, and other markup. `name` preserves the PDF annotation/icon name when pdf.js exposes it, such as `Note`, `Comment`, `PushPin`, or `Paperclip`. `flags[]` decodes the PDF annotation flags so agents can distinguish normal screen-visible markup from hidden, print-only, no-view, locked, or otherwise viewer-controlled annotations; for example `["hidden","print"]` means the annotation can exist in the PDF even when the normal screen render is blank. File-attachment annotations include filename / description / byte-size metadata when pdf.js exposes it, but never embed the file bytes in context. Shape annotations include `border`, `line`, `vertices`, or `inkPaths` when pdf.js exposes them, so agents can recover visible endpoints, polygon/polyline geometry, and freehand ink paths instead of only the enclosing bbox. `Link`, `Widget`, and `Popup` annotations are intentionally excluded because links and form widgets have dedicated outputs and popups usually duplicate their parent annotation. Coordinates use the same unrotated page-view top-left system as `spans`, `layout.blocks`, and `imageBoxes`; `quadBoxes[]` gives precise markup regions when the PDF provides QuadPoints.
