---
title: "視覚領域とレンダリング"
description: "`--image-boxes`、`--vector-boxes`、`--visual-regions` の形状、および `--render-scale` と `--render-region` の動作について説明します。図、グラフ、表、フォームの領域を選んでレンダリングし、視覚的に確認したいときに使います。"
sourceHash: b268aaef34d7
---

<!-- Translated from docs/src/en/guide/visual.md, which is generated from docs/cli-topics/visual.md.
     Translate the prose, keep code, field names, flags, and warning codes verbatim, and update
     `sourceHash` to the value reported by `node scripts/build-site-reference.mjs`. -->

# 視覚ジオメトリとレンダリング

`-f json`、`-f xml`、`-f toon` を使う場合のリファレンスです。

## 画像 box（`--image-boxes`）

```ts
interface ImageBox {
  x: number; y: number; width: number; height: number;
}
```

描画されたインスタンスごとに 1 エントリです ── タイル状のヒーロー画像は複数エントリを生みます。fill path を通じて描画される画像入りのタイリングパターンは、描画された path の bbox として現れるため、マスクやパターン画像もクロップ対象になります。`--image-boxes` を指定すると、すべてのページで `imageCount === imageBoxes.length` になります。指定しない場合も `imageCount` は件数を報告しますが、`imageBoxes` は現れません。Form XObject の CTM 追跡により、フォーム内に描画された画像もページ空間上の正しい位置に配置されます。
## ベクター box（`--vector-boxes`）

```ts
interface VectorBox {
  x: number; y: number; width: number; height: number;
}
```

pdf.js が path の bbox を報告する、描画されたベクター path ごとに 1 エントリです。加えて、pdf.js がアクティブな clipping bbox を公開している場合はシェーディング塗りも含みますが、ページ全体を覆う白背景の塗りは除外します。これは、地図、記号表、グラフ、ダイアグラム、グラデーションパネル、表罫線、フォームの枠、スライドの図形など、人間の目には見えるがネイティブテキストでもラスター画像でもないコンテンツに役立ちます。水平/垂直のストロークは、退化した次元（線幅がほぼゼロの方向）で少なくとも raw page-view 単位で 0.5 まで拡張されるため、その box を `--render-region` に渡せます。`vectorCount` は、意味のあるベクター描画操作に対する大まかな密度シグナルであり続けます。`vectorBoxes[]` はオプトインの位置シグナルで、低レベルの操作に bbox が無い場合は `vectorCount` より少なくなることがあります。
## 視覚領域（`--visual-regions`）

```ts
interface VisualRegion {
  id?: string;              // stable page-local id, e.g. "p3-vr0", present in extracted PageResult
  kind: 'raster' | 'vector' | 'table' | 'form' | 'annotation' | 'mixed';
  x: number; y: number; width: number; height: number;
  areaRatio: number;        // region area / page area, rounded to 3dp
  sourceCount: number;      // total source geometry items represented
  sources: VisualRegionSource[]; // representative refs, capped for large vector clusters
  reason: string;           // short explanation for why this is worth inspecting
  associatedText?: VisualRegionAssociatedText[]; // nearby or in-region captions/form labels/panel titles/chart titles/table lead-ins/image labels/headings included in the region box
  image?: string;           // cropped PNG path, present iff --render-visual-regions rendered this region
  renderContentRatio?: number; // content ratio measured from the cropped PNG
  renderedContentBox?: { x: number; y: number; width: number; height: number }; // tight non-background pixel bbox in page coords, present iff --render-visual-regions measured visible crop content
}

interface VisualRegionSource {
  type: 'imageBox' | 'vectorBox' | 'layoutTable' | 'formField' | 'annotation';
  index: number;            // 0-based index into that page-level source collection, internal if not emitted
}

interface VisualRegionAssociatedText {
  text: string;
  relation: 'caption' | 'label';
  x: number; y: number; width: number; height: number;
  blockIndex?: number;      // 0-based index into layout.blocks[] for captions/headings/table lead-ins
  fieldIndex?: number;      // 0-based index into formFields[] for form labels
}
```

`visualRegions[]` は、人間に近い形で PDF を視覚的に読むための dispatch レイヤーです。既存のジオメトリを、パディングを加えページ内に収めた bbox としてグルーピングします。対象は、重要なラスター画像、コンパクトなラスターテキストの帯、ベクター描画のクラスタ、`layout.tables[]` のヒント、フォームフィールドのクラスタ、そしてハイライト、スタンプ、ink、shape 注釈といった目に見える注釈マークアップです。近くにキャプションやフォームラベル（`Figure`、`Table`、`Plate`、`図`、`表`、`図表`）が検出されると、`associatedText[]` にそのテキストが記録され、クロップの bbox は近くのテキストを含むように拡張されます。これにより、レンダリングされたクロップは、生の画像/ウィジェットの矩形だけでなく、人間が見て分かる説明も伴うようになります。キャプションに一致する行は、それを囲むレイアウト block よりも優先されるため、表のヘッダーやキャプション下の文章が紛らわしい associated text になることはありません。また、ローカルなキャプション対応付けは近くの最良のキャプショングループだけを保持するため、隣接する表のキャプションが下にある図のクロップに付いてしまうこともありません。視覚領域内にある `Fig.4` のような単なる、あるいは極小の参照は、同じテキストが読める大きさで説明的なキャプションの語も伴っていない限り、キャプションとしては無視されます。ラスター画像のクロップは、著作権/ライセンス表記を除外しつつ、直下にある短いプレーンなラベル（例: スライド画像のキャプション）を付与することもあります。大きなラスターおよび mixed の視覚領域は、領域上部にある見出しではない短いチャートタイトルを付与できます。また、大きなラベル無しの領域は、近くの繰り返しではない見出し、あるいは領域上部にある見出しを `relation: "label"` として付与することもあります。これにより、チャート、フォーム/表の背景パネル、心電図のようなパネルは、人間が識別に使う可視のタイトルを保持します。`(a) ...` のような近くのアルファベット付きパネルタイトルもラベルとして付与でき、その領域にすでに埋め込みラベルがある場合でも、チャート/地図/パネルのクロップを上方向に拡張します。表の領域は、可視の表自体にキャプションが無い場合、「The following table...」や「... as follows:」のような短い前置きの文を付与することもあります。ページレベルの `Plate` キャプションは、すべてのクロップにキャプション block を含めるよう拡張することなく、離れた位置にあるパネルのクロップにメタデータとして付与できます。これにより、複数パネルの地図/図のクロップはローカルなまま、共有されたキャプションの文脈も保持されます。`A,B:` や `C,D:` のような手がかりでパネルを明示的に列挙する図のキャプションは、切り離されたベクターのチャート断片を 1 つのクロップにグルーピングし、キャプション全体の block を含めることもできます。複数ページの根拠が利用できる場合、繰り返し現れるヘッダー/フッターのテキストはキャプション対応付けから除外されます。ページ全体を覆うラスター/ベクターの box は、より具体的な前景の box や密なベクターグリッド構造（ページ全体のラスター背景の上にある密で細いベクターグリッドを含む）が存在する場合、背景として扱われます。また、複数の実質的なラスターパネルにまたがる広範なベクターのみの背景パネルは抑制され、パネル単位のクロップが利用可能なまま残ります。これにより、スライドの壁紙、ページ全体のデザインレイヤー、CAD/図面の背景パネルが、実際のダイアグラム/表/図面の領域を飲み込んでしまうことを防ぎます。ページ全体を覆う表紙やスキャンが主要な視覚的根拠であり、それに対抗するのが小さなロゴ、端の chrome、あるいは信頼度の低い OCR 断片の表ヒントだけである場合、回転したスキャンページを含め、ページ全体のラスターは引き続き出力されます。ページ全体のレンダリング根拠がそのページを空白と分類した場合、視覚領域は抑制されます。これにより、空白ページや見えないフォームフィールド/注釈が vision model への dispatch 対象にならないようにします。ページ端の細い chrome は抑制され、余白のリボン、サイドの URL、透かし、ヘッダー/フッターのルールに沿った小さなラスターのロゴ/テキストの帯、ヘッダー/フッターの帯が vision model への dispatch 対象にならないようにします。密なベクターページでは、細いが長いベクターの線 box からフォールバックのクラスタ領域が得られます。これにより、個々の線 box が通常のクラスタリングには細すぎる場合でも、別々の表状のグリッドから別々のクロップを生成できます。小さなベクターマーカーが密集したフィールドも、切り離されたマーカーのクラスタで分割された密な視覚領域のクロップを生成できます。これにより、散布図や点が多い生物医学系の図、地図、パネルのテキストやラベルが抽出可能なテキストではなくベクターアートに埋め込まれているマーカーフィールドを、無関係な領域を 1 つのページ全体のクロップに押し込むことなく捉えられます。浅く、ページ幅いっぱいに広がる 2 行のレイアウト table ヒントや、極端に列数の多い 2 行の table ヒントは、視覚領域の種としては抑制されます。これらは、人間が読める表のクロップというより、グラフの目盛り、OCR の断片、無関係なパネルに由来することが多いためです。密なフォームのページでは、インタラクティブなフィールドをセクション/行サイズのクロップに分割し、そのままではフォームのセクションと重複してしまう大きな、あるいは内包されたベクターのみのフォーム背景パネルを抑制し、hidden/invisible/noView なフォームフィールドや注釈は視覚領域の種としてはスキップしつつ、それらの抽出パスが要求されている場合は `formFields[]` / `annotations[]` には引き続き含め、appearance stream を持たない FreeText 注釈はクロップの種としてはスキップしつつ注釈のメタデータと検索の一致は保持し、フォームフィールドの bbox が実際のページ上の位置を提供している場合は位置情報を持たないウィジェット appearance のベクター box をスキップし、パディングによってクロップが読める場合は細いチェックボックスの行やマークアップの行を保持します。エージェントは、生の `imageBoxes[]`、何百もの `vectorBoxes[]`、注釈の bbox を事前にクラスタリングすることなく、領域をそのまま `--render-region <x,y,width,height>` に渡して図/チャート/表/フォーム/注釈を視覚的に確認できます。領域の座標は `imageBoxes[]` / `layout.blocks[]` と同じ、左上原点の page-view 座標系のままです。回転したページでは、pdfvision は回転した pdf.js の viewport を通してクロップをマッピングするため、出力される PNG は人間の目に見えるページの向きに従います。`--render-visual-regions` は、手動での 2 回目の呼び出しを省略し、提案された各クロップを直接 `visualRegions[].image` にレンダリングします。同時に `renderContentRatio` を付与し、非背景ピクセルがソースジオメトリのクロップより狭い領域に収まる場合は、同じページ座標系での `renderedContentBox` も付与します。`--visual-regions` を暗黙に含みますが、ページ全体の `--render` は必須ではありません。`sourceCount` は表現されているソース item の総数です。`sources[]` は、ベクターの多いページでもコンパクトに保つため上限が設けられています。

ベクターのみでテキストが空のページでは、それが唯一の非空白な視覚的根拠である場合、ページ全体サイズの単一のベクター box が出力されます。これにより、path で描かれた記号表やベクターのみのダイアグラムでも、クロップ可能な領域が生成されます。
## レンダリング: `--render-scale` と `--render-region`

両方のフラグは、`--render`（または内部でラスタライズする `--ocr`）が有効な場合にのみ効果を持ちます。

- **`--render-scale <n>`**: ラスタライズのスケール倍率。デフォルトは `2`（約 144 DPI）。範囲は `(0, 4]`。値を小さくすると vision model へのペイロードが縮小し、大きくするとより細かいディテールを捉えられます。
- **`--render-region <x,y,w,h>`**: `imageBoxes` / `layout.blocks` と同じ、生の回転前の左上原点 page-view 座標系で、ページの部分矩形を 1 つレンダリングします。bbox はそのまま渡されます。ピクセル寸法は raw region × UserUnit × render scale で決まります。回転したページでは、クロップが人間の目に見える viewport を通してマッピングされるため、出力ピクセルの幅/高さが入れ替わることがあります。単一ページのみに対応し、範囲外の領域は拒否されます。このタプルはキャッシュキーとファイル名に含まれ、`PageResult.renderRegion` にも反映されます。
- **`--render-visual-regions`**: すべての `visualRegions[]` クロップをレンダリングし、各領域に `image` / `renderContentRatio` を付与します。レンダリングされたクロップに計測可能な非背景ピクセルが含まれる場合、`renderedContentBox` が、ソースジオメトリの領域はそのままに、ページ座標系でのより厳密なレンダリング済みピクセル bbox を返します。領域の box には、検出された場合は関連するキャプション/フォームラベル、近くのパネルタイトル、短い表の前置き、短い画像ラベル、近くの見出しが含まれるため、クロップは通常、vision model に読ませる前に人間が選ぶであろう範囲に近くなります。これは、ページ全体の `--render` と同じ出力ディレクトリ、`--render-scale`、キャッシュ画像の検証、PDF ごとの安全なサブディレクトリのルールを使いますが、`--render` も同時に要求されていない限り `pages[].image` は現れません。

典型的なエージェントのフロー: `--layout` を付けて抽出し、`layout.blocks[i]` の中から疑わしい block を見つける（あるいは `warnings[i].blockIndex` からそのインデックスを得る）。その後、`blocks[i]` の bbox を使って `--pages <N> --render --render-region <x,y,w,h>` で再実行し、ズームインします。
