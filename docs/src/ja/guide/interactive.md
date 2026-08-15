---
title: "フォームフィールド、リンク、注釈"
description: "`--form-fields`、`--links`、`--annotations` のフィールド形状 ── ウィジェットの種類とラベル、リンクのターゲット、注釈フラグとマークアップのジオメトリについて説明します。PDF の入力可能な欄、クリック可能なターゲット、コメントが重要なときに使います。"
sourceHash: c06a992b886a
---

<!-- Translated from docs/src/en/guide/interactive.md, which is generated from docs/cli-topics/interactive.md.
     Translate the prose, keep code, field names, flags, and warning codes verbatim, and update
     `sourceHash` to the value reported by `node scripts/build-site-reference.mjs`. -->

# フォームフィールド、リンク、注釈

`-f json`、`-f xml`、`-f toon` を使う場合のリファレンスです。

## フォームフィールド（`--form-fields`）

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

`formFields[]` は、インタラクティブな PDF ウィジェット注釈 ── 空のテキスト入力欄、チェックボックス、ラジオボタン、選択フィールド、ボタン、署名欄 ── を表面化します。ネイティブテキスト抽出ではラベルは読めても、人間の目に見える入力可能な欄までは読めない、行政や税務のフォームで特に有用です。チェックボックスとラジオのウィジェットは、pdf.js が送信値を公開している場合に `exportValue` を含みます。選択ウィジェットは、送信/エクスポートされた選択肢を `value` として保持し、viewer 上で見える選択済みラベルが異なる場合は `displayValue` を含みます。`options[]` は、エクスポートされる値と viewer 上で見える値をすべて列挙し、pdf.js がそれらを公開していれば `combo` / `multiSelect` の動作フラグも含みます。プッシュボタンは、ウィジェットの appearance characteristics から viewer 上で見える `/MK /CA` のキャプションを pdfvision が復元できる場合、`caption` を含みます。Markdown はそのキャプションを Value 列に表示し、`--search` は可視のボタンキャプションを `source: "formField"` の一致として返すことがあります。Markdown は、選択フィールドの `displayValue` を Value 列に、送信された `value` が異なる場合は Export 列に表示します。`flags[]` は基盤となるウィジェット注釈フラグをデコードするため、通常の画面レンダリングが空白であっても、フォームの値が hidden、print のみ、no-view、locked、あるいはその他 viewer の状態によって制御されているかをエージェントが判断できます。`actions` は、pdf.js が公開している場合に、ボタンのクリックスクリプトのようなウィジェットレベルの JavaScript action を保持します。一方 `resetForm` は非 JavaScript の ResetForm ボタンの挙動を保持するため、そのボタンがすべてのフィールドをリセットするのか、リストされたフィールドだけをリセットするのか、リストされたフィールド以外すべてをリセットするのかをエージェントが判断できます。Markdown は、可読性のために非常に長い JavaScript action の要約を短縮します。JSON、XML、TOON は完全な構造化された値を保持します。`label` は、可視のレイアウトテキストから再構築された保守的な最近傍行のヒントです。チェックボックス/ラジオのウィジェットは同じ行の右/左にあるラベルを優先し、テキスト入力欄は直上または左のラベルを優先します。上下に積み重なった隣接行は、それらが 1 つの可視のプロンプトを構成している場合にマージされます。そのため、幅の狭いフィールドでも、最も近い行だけでなく「Employer identification number (EIN)」のような複数行のラベルを持てます。右端のチェックボックス/ラジオのプロンプトは、ウィジェットの行で終わる折り返しの説明テキストを保持できます。また、それらのプロンプトラベルからは点線のリーダー（ドットの詰め物）と行番号の gutter が除去されます。積み重なったチェックボックス/ラジオの選択肢行は、隣接するウィジェットで止まるため、1 つの filing-status の選択肢が次の選択肢を飲み込むことはありません。また、自身の行プレフィックスを持つ後続の注意/指示段落は、選択肢ラベルの続きとしては扱われません。左側のチェックボックス/ラジオのラベルも、直前の続き行と直接マージできるため、「check this box...」のようなプロンプトは、上の行にあるセットアップのテキストを保持します。幅の狭いインラインのテキストフィールドも、同じ行の左側にある指示ラベルを優先します。これにより、短い税区分/コードの欄は、次のフィールド用の近くのラベルではなく、その前にあるプロンプトに結び付けられ、それらのプロンプトラベルから点線のリーダーの詰め物が除去されます。縦に長い複数行テキストフィールドは、幅の広いフォームの gutter をまたいでも短い左側ラベルを保持できます。点線のリーダーを持つ右端の金額欄は、「1 $」や「4(a) $」のようなコンパクトなマーカーを、マーカー行の上にある短い複数行のプロンプトを含め、可視のプロンプトまで展開できます。再構築されたレイアウト行が人間の目に見えるフィールドセルより広い場合に、隣接する同じ行のプロンプトが両方のフィールドに潰れて結び付いてしまわないよう、より細かいテキスト span も考慮されます。意味のある名前が付いたフィールドについては、無関係な近くのテキストは紛らわしいラベルとして出力されるのではなく無視され、フィールド名に一致する、より狭い span が、広くマージされた行よりも優先されます。座標は `spans`、`layout.blocks`、`imageBoxes` と同じ、回転前の左上原点の page-view 座標系を使うため、bbox はそのまま `--render-region` に渡せます。
## リンク（`--links`）

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

`links[]` は、クリック可能な PDF のリンク注釈 ── 外部 URL、引用へのジャンプ、目次の宛先、埋め込みファイルへのジャンプ、相互参照のターゲット ── を表面化します。内部宛先は、pdfvision がターゲットを 1 始まりの物理ページ番号に解決できる場合、`page` を含みます。pdf.js が `unsafeUrl` としてしか公開しない Launch / remote go-to action は、互換性のため `type: "url"` を維持したまま `unsafe: true` が付与されます。`newWindow` は、PDF が viewer に対してターゲットを別ウィンドウで開くよう要求している場合に保持されます。埋め込みファイルへの go-to リンクは `type: "attachment"` を使い、添付ファイルのバイト列を埋め込むことなく、ファイル名、任意の説明、バイトサイズ、埋め込み宛先のメタデータを含みます。`text` は、再構築できる場合にリンク矩形内にある可視のネイティブテキストです。広いリンク矩形が長い目次の領域にまたがる場合は短いラベルに切り詰められ、PDF が細いリンクを 1 つのインライントークンの上に配置している場合は周囲の行から切り出されます。座標は `spans`、`layout.blocks`、`imageBoxes` と同じ、回転前の左上原点の page-view 座標系を使うため、bbox はそのまま `--render-region` に渡せます。
## 注釈（`--annotations`）

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

`annotations[]` は、リンクでもウィジェットでもない PDF の注釈 ── 付箋、コメント、ハイライト、下線、取り消し線、スタンプ、フリーテキスト、添付ファイルアイコン、shape マークアップ、ink、その他のマークアップ ── を表面化します。`name` は、pdf.js が公開している場合に、`Note`、`Comment`、`PushPin`、`Paperclip` のような PDF の注釈/アイコン名を保持します。`flags[]` は PDF の注釈フラグをデコードするため、エージェントは通常の画面上で見えるマークアップと、hidden、print のみ、no-view、locked、あるいはその他 viewer によって制御される注釈とを区別できます。例えば `["hidden","print"]` は、通常の画面レンダリングが空白であっても、その注釈が PDF 内に存在しうることを意味します。ファイル添付の注釈は、pdf.js が公開している場合にファイル名/説明/バイトサイズのメタデータを含みますが、ファイルのバイト列がコンテキストに埋め込まれることは決してありません。shape 注釈は、pdf.js が公開している場合に `border`、`line`、`vertices`、`inkPaths` を含むため、エージェントは、それを囲む bbox だけでなく、可視の端点、多角形/折れ線のジオメトリ、手描きの ink パスも復元できます。`Link`、`Widget`、`Popup` の注釈は意図的に除外されています。リンクとフォームウィジェットには専用の出力があり、popup は通常その親注釈と重複するためです。座標は `spans`、`layout.blocks`、`imageBoxes` と同じ、回転前の左上原点の page-view 座標系を使います。`quadBoxes[]` は、PDF が QuadPoints を提供している場合に、正確なマークアップ領域を返します。
