# Authoring decks for CDE2

[日本語](#日本語) | [English](#english)

This guide describes the public, implementation-backed contract for creating AI-generated motion-design decks that CDE2 can open and edit. It intentionally separates CDE2 compatibility from rules that may belong to a particular private production or rendering pipeline.

For a ready-to-copy AI instruction, see [AI deck prompt](AI_DECK_PROMPT.md).

## 日本語

### 1. まず選ぶ出力形式

CDE2が直接読み込めるファイルは `.html` / `.htm` と `.zip` です。新しくデッキを作る場合は、次のどれかを選んでください。

1. **自己完結型HTML（公開用途の推奨）**
   - `html` または `body` を持つ完全なHTMLにします。
   - さらに `BOUNDS = [...]`、`.stage`、`@keyframes` のいずれかを含めます。
   - 独自ランタイムを必要としないため、AIに依頼するときの既定形式に向いています。
2. **ZIP（JSX + assets）**
   - `.jsx` と画像・動画・音声などを相対パスのまま同梱します。
   - JSXの実行に必要な `support.js` などがある場合は、ZIP内に含めます。
3. **ネイティブ `.dc.html` を含むZIP**
   - `<x-dc>` と、`<sc-if>`、`data-dc-script`、`<image-slot>` のいずれかを使う形式です。
   - `.dc.html` は単体で渡さず、必要な `support.js` / `image-slot.js` / assetsと一緒にZIPへ入れます。
4. **バンドル単一HTML**
   - `script[type="__bundler/manifest"]` と `script[type="__bundler/template"]` を埋め込んだ既存互換形式です。

公開リポジトリには、出所や再配布条件を確認できないパッケージ固有ランタイムは含まれていません。必要なランタイムは、権利を確認したうえで入力パッケージ側から提供してください。

### 2. ステージ

- デッキ本体を、幅と高さが明示された固定ステージ内に置きます。
- 横型なら `1920 × 1080`、縦型なら `1080 × 1920` が一般的ですが、CDE2はこの2種類に限定されません。
- ネイティブデッキでは、最外殻のステージ要素に `width` と `height` をpxで明示してください。CDE2は実ステージ寸法を検出し、プレビューと書き出しに引き継ぎます。
- 編集画面や再生ボタンなど、作品ではないUIをステージ内に重ねないでください。任意時刻で停止しても、ステージには完成映像だけが見える状態にします。

```html
<main class="stage" style="width:1920px;height:1080px;position:relative;overflow:hidden">
  <!-- deck content -->
</main>
```

### 3. シーンと時間

複数シーンの開始時刻は、秒単位の累積配列 `BOUNDS` で宣言します。総尺は `duration` または `this.duration` として秒で宣言します。

```js
const BOUNDS = [0, 2.4, 5.1, 8.0];
const duration = 11.2;
```

- `BOUNDS[0]` は `0` にします。
- 要素数をシーン数と一致させます。
- 値は昇順にし、最後の境界より `duration` を大きくします。
- CSSの時間基準を`data-cde-time-mode="absolute|scene-relative"`で明示します。全体時刻とシーン内時刻を二重加算しません。[時間制御規約](TIMING_CONTRACT.md)に従ってください。
- シーン名をCDE2で扱いやすくするため、各シーンの近くに `<!-- SCENE 1: Title -->` のようなコメントを置くことを推奨します。
- ネイティブ形式では、トップレベルの `<sc-if>` をシーン境界に使います。`<sc-if>` は入れ子にしないでください。
- ネイティブ形式ではCDE2 v21以降、`<!-- SCENE n -->` 付きまたは `sN` の `<sc-if>` だけを本編シーンとみなします。字幕行（`c1`…）や `archive` のようなオーバーレイ用 `<sc-if>` はシーン一覧に出しません。
- JSX形式では、`S_Title`、`S_Comparison` のような `S_` 始まりの関数・コンポーネント名もシーン検出に利用できます。

### 4. 編集可能なテキスト

CDE2のテキストパネルは、現在、日本語を含む文字列リテラルとJSXテキストノードを抽出します。

```jsx
<h1>編集できる見出し</h1>
<p>{"編集できる説明"}</p>
```

- 画面に見せる日本語は、完成した文字列としてソースに置きます。
- テンプレートリテラル内の `${...}`、実行時の文字列結合、描画後の `textContent` 書き換えは、フォーム編集の対象外になる場合があります。
- 「画面の文字」と「ソースの文字」をできるだけ一致させてください。
- 英語など日本語を含まない文字列は、コードタブから編集できますが、現在の自動テキスト抽出の対象ではありません。

### 5. 画像・動画スロット

利用者が素材を差し替えられる場所には、一意なスロットIDを付けます。

```html
<div
  data-img-slot="hero-media"
  data-slot-label="Hero media"
  data-fit="cover"
  style="position:absolute;width:760px;height:760px;overflow:hidden"
></div>
```

ネイティブ形式では、次の形も利用できます。

```html
<image-slot id="hero-media" placeholder="Hero media" fit="cover"
  style="width:760px;height:760px"></image-slot>
```

- IDはデッキ内で一意にします。
- 幅と高さを明示し、素材の元サイズでレイアウトが動かないようにします。
- `cover` または `contain` の意図を明示します。
- 素材が未割り当てのときは、壊れた画像アイコンや仮素材を出さず、何も表示しない状態にします。
- ZIP内の固定素材は、デッキファイルからの相対パスで参照します。外部URLは、そのURLへブラウザがアクセスすることに注意してください。

### 5.1 フォント

- Google Fonts の `<link rel="preconnect">` と `<link rel="stylesheet">` は、HTMLの `<head>` またはネイティブデッキの `<helmet>` に置けます。
- 独自フォントは `<style>` 内の `@font-face` で宣言できます。フォントファイルをZIPへ同梱する場合は、デッキファイルからの相対パスで参照してください。
- CDE2 v22以降は、これらの宣言をプレビューの `<head>` へ先に載せてからデッキランタイムを起動します。
- 外部フォントはネット接続、配信元の可用性、利用条件に依存します。再現性を優先する書き出しでは、ライセンスを確認したフォントファイルの同梱を推奨します。

### 6. アニメーション

CDE2本体と幅広い書き出し経路に最も互換性が高いのは、CSS Animation、CSS Transition、Web Animations APIです。

```css
@keyframes enter {
  from { opacity: 0; transform: translateY(36px); }
  to   { opacity: 1; transform: translateY(0); }
}

.title {
  animation: enter 600ms ease-out 200ms both;
}
```

- 同じ時刻なら同じ見た目になる、決定的なアニメーションを推奨します。
- 終了状態を保つには `fill-mode: both` または `forwards` を使います。
- 乱数、実時計、前フレームからの累積だけに見た目を依存させないでください。
- `requestAnimationFrame`、canvas、WebGL、タイマーを使うデッキをCDE2が読み込める場合はありますが、それらを正しく動画化できるかは書き出し経路に依存します。外部レンダラーを使う場合は、そのレンダラーの仕様を別途確認してください。

#### 複数のJSX／TSXを読み込む `<x-import>`

CDE2 v33以降は、1つの `<x-import>` の `from` に、ZIP内の複数の `.jsx` / `.tsx` を空白区切りで列挙できます。

```html
<x-import
  component-from-global-scope="MainComposition"
  from="./animation-runtime.jsx ./main-composition.tsx">
</x-import>
```

- 各ローカルソースは記述順に別々のURLとして読み込まれ、最後のソースから指定コンポーネントを解決します。
- CDE2は変換後URLにも元の `.jsx` / `.tsx` パスを残すため、同梱ランタイムのBabel／TypeScript判定を維持できます。
- `./main-composition` のような拡張子省略は、同じ場所の `.jsx` / `.tsx` も候補にします。
- `https:`、`data:`、`blob:` のURLはCDE2がローカル素材へ置き換えません。
- すべてのローカルソースと、それらが必要とするランタイムをZIPへ同梱してください。

#### 連続合成ステージの時刻同期

独自の連続合成ランタイムをCDE2の再生位置と同期させる場合は、完成映像を含む要素を1つだけ `data-om-exportable-video-with-duration-secs="総秒数"` で公開し、同じ要素で `data-om-seek-to-time-frame` を受け取れます。

```js
stage.addEventListener('data-om-seek-to-time-frame', (event) => {
  const { time, playing, sync } = event.detail;
  renderAt(time, { playing, sync });
});
```

- `time` はCDE2の現在時刻（秒）、`playing` は連続再生中かどうかです。
- イベント処理が同期的にDOMへ反映できる場合は、ステージへ `data-om-sync-seek="true"` を付けます。
- エクスポート可能なルートを複数置かないでください。CDE2が誤った要素へ接続する原因になります。
- 音声付きデッキでは、シーク／再生／停止などの音声イベントからもCDE2がこの契約を駆動します。

v36.0.1以降では、このステージ契約を使わないデッキの `window.__DECK__.renderAt(time)`、または `window.renderAt(time)` も毎回のプレビュー更新で呼び出します。`time` は絶対秒です。関数は指定時刻のシーンと字幕を同期的に更新し、同じ時刻の再呼び出しや逆方向のシークにも対応してください。Reactの更新はホストがflushしてから動画を同期し、デッキが設定したアニメーションの時刻を保持します。OMステージ契約がある場合はそちらを優先します。

#### ZIP内のESモジュール

CDE2 v32以降は、ネイティブデッキの `<x-import>` または `<script type="module">` から到達するZIP内の `.js` / `.mjs` を依存グラフとして解決します。

- `./module.js?v=1` のようなクエリ／ハッシュ付き参照、複数階層、静的／動的import、循環参照に対応します。
- プレビューでは各モジュールをBlob URL、単体HTMLではData URLとして分離したままimport mapで接続します。
- モジュール内のリテラル相対パスで参照する同梱画像・JSON等も、プレビュー／単体HTML用URLへ置き換えます。
- `import(variable)` のように実行時に組み立てるローカルパスは追跡できません。ZIP内モジュールは文字列リテラルで参照してください。
- `react` のようなbare package名はCDE2がnpm解決しません。絶対URLを使うか、必要なライブラリをZIPへ入れて相対パスで参照してください。
- WebGL/canvasの表示に対応しても、停止フレーム、PNG、動画書き出しは別の実動作確認が必要です。

### 7. 動画素材と `data-vin`

動画の開始位置を少しだけずらす場合は、秒単位の `data-vin` を宣言できます。

```html
<video
  src="assets/clip.mp4"
  data-vin="1.8"
  muted
  playsinline
  preload="auto"
></video>
```

CDE2のタイムラインでは、素材時刻を次の関係で扱います。

```text
CSS素材時刻 = data-vin（省略時は0）+ max(0, 現在時刻 - 動画開始時刻data-t0)
```

- CSS経路の`data-t0`、省略時の推定、VTとの差は[時間制御規約](TIMING_CONTRACT.md)を参照してください。デッキ側のanimationstart等で独自再生・シークを行いません。
- URLの `#t=` を正式なイン点指定として使わないでください。
- 移植性を高めるには `autoplay` と `loop` を付けず、`muted playsinline preload="auto"` を使います。
- `素材尺 - data-vin` が動画使用区間尺以上になることを確認します。大幅な区間変更は、素材を事前に切り出してください。

### 8. 音声

CDE2ではナレーションとBGMを別々に追加し、プレビューできます。制作パイプライン用ZIPやMP4への書き出し時には、必要に応じてミックス済み音声を生成します。

外部レンダラーへ渡す場合、そのレンダラーが複数トラックや開始オフセットに対応するとは限りません。最も移植しやすい受け渡し方法は、次のとおりです。

- タイムラインの0秒から始まる1本の音声にする。
- 無音区間、クリップ音声、ナレーション、BGMを必要に応じて事前にミックスする。
- デッキ独自の `AUDIO_START` のような宣言に依存しない。

これはCDE2の読み込み条件ではなく、外部パイプライン向けの互換性プロファイルです。

### 9. 出力前チェック

- [ ] `.html` または `.zip` の対応形式になっている。
- [ ] ネイティブ `.dc.html` は必要なランタイムと一緒にZIPへ入っている。
- [ ] ステージの幅と高さがpxで明示されている。
- [ ] 複数シーンでは `BOUNDS` と `duration` が実際のタイミングと一致している。
- [ ] シーン名を示すコメントまたは `S_` 名がある。
- [ ] 編集させたい日本語が確定文字列としてソースにある。
- [ ] 画像・動画スロットのID、寸法、fitが明示されている。
- [ ] 任意時刻に停止しても、ステージ内にプレイヤーUIが出ない。
- [ ] 動画の `data-vin` と残り尺が正しい。
- [ ] ZIP内の相対パスと必要なランタイムを確認した。
- [ ] 複数のJSX／TSXを列挙する場合は、全ソースをZIPへ同梱し、読み込み順を確認した。
- [ ] 連続合成ランタイムを使う場合は、エクスポート可能なルートが1つだけで、シークイベントへ応答する。
- [ ] 外部URL、秘密情報、再配布できない素材を含めていない。
- [ ] CDE2で読み込み、テキスト編集、素材差し替え、シーク、必要な書き出しを実際に試した。

## English

### 1. Choose an input shape

CDE2 directly accepts `.html`, `.htm`, and `.zip` files. Use one of these shapes:

1. **Self-contained HTML (recommended for public examples)**
   - Provide a complete document with `html` or `body`.
   - Include at least one recognizable deck signal: `BOUNDS = [...]`, a `.stage` element, or `@keyframes`.
   - This is the simplest portable target because it does not require a package-specific runtime.
2. **ZIP containing JSX and assets**
   - Preserve relative paths between `.jsx` and its media.
   - Include any runtime required to execute the JSX, such as `support.js`.
3. **ZIP containing native `.dc.html`**
   - Native decks use `<x-dc>` plus one or more of `<sc-if>`, `data-dc-script`, or `<image-slot>`.
   - Package the `.dc.html`, required runtime files, and assets together. Do not deliver native `.dc.html` as a bare file.
4. **Bundled single HTML**
   - Existing compatible bundles embed both `script[type="__bundler/manifest"]` and `script[type="__bundler/template"]`.

The public repository does not redistribute package-specific runtimes whose provenance or redistribution terms could not be established. Supply any required runtime from an authorized source in the input package.

### 2. Stage

- Put the deck in a fixed stage with explicit pixel dimensions.
- `1920 × 1080` for landscape and `1080 × 1920` for portrait are common, but CDE2 is not limited to those sizes.
- For native decks, put explicit `width` and `height` values on the outer stage. CDE2 detects the actual stage and carries its dimensions into preview and export.
- Do not overlay editor controls, play gates, or other non-content UI on the stage.

### 3. Scenes and time

Declare cumulative scene start times in seconds with `BOUNDS`, and the total deck length with `duration` or `this.duration`.

```js
const BOUNDS = [0, 2.4, 5.1, 8.0];
const duration = 11.2;
```

- Start `BOUNDS` at zero, keep it ascending, and use one entry per scene.
- Make `duration` greater than the final scene boundary.
- Declare the CSS time basis explicitly as absolute or scene-relative; follow [the timing contract](TIMING_CONTRACT.md) without adding scene start twice.
- Add labels such as `<!-- SCENE 1: Title -->` near scene boundaries.
- Native decks should use top-level, non-nested `<sc-if>` blocks.
- For native decks from CDE2 v21, only `<!-- SCENE n -->` or `sN` `<sc-if>` blocks count as scenes. Caption rows (`c1`…) and overlay flags such as `archive` stay out of the scene list.
- JSX decks may also use names such as `S_Title` and `S_Comparison`; CDE2 recognizes `S_` functions and components as scene markers.

### 4. Editable text

The current text panel extracts string literals and JSX text nodes that contain Japanese characters.

- Keep user-facing Japanese as complete source literals.
- Template interpolation, runtime concatenation, and post-render `textContent` changes may not be form-editable.
- Keep on-screen text as close as possible to the corresponding source text.
- Text without Japanese characters remains editable in the code panel, but is not currently included in automatic text extraction.

### 5. Image and video slots

Give each replaceable media area a unique ID using `data-img-slot` or native `<image-slot id="...">`.

- Give every slot explicit dimensions.
- Declare `cover` or `contain` intentionally.
- An unassigned slot should render nothing—no broken image icon or baked-in placeholder.
- Keep packaged assets on paths relative to the deck. Remember that external URLs cause the browser to contact external hosts.

### 5.1 Fonts

- Google Fonts `<link rel="preconnect">` and `<link rel="stylesheet">` elements may appear in the document `<head>` or in a native deck's `<helmet>`.
- Custom fonts may be declared with `@font-face` inside `<style>`. When bundling font files in the ZIP, reference them relative to the deck file.
- CDE2 v22 and later hoist these declarations into the preview `<head>` before starting the deck runtime.
- External fonts depend on network access, provider availability, and their terms of use. For reproducible exports, prefer bundling font files whose license permits redistribution.

### 6. Animation

CSS Animation, CSS Transition, and the Web Animations API have the broadest compatibility with CDE2 and downstream export paths.

- Prefer deterministic animation: the same timeline position should produce the same frame.
- Preserve end states with `fill-mode: both` or `forwards`.
- Avoid making the visual result depend only on randomness, wall-clock time, or accumulated previous frames.
- CDE2 may open decks using `requestAnimationFrame`, canvas, WebGL, or timers, but whether those effects can be rendered correctly depends on the export path. Check the separate renderer contract before relying on them.

#### Loading multiple JSX/TSX sources with `<x-import>`

CDE2 v33 and later accept whitespace-separated packaged `.jsx` / `.tsx` sources in one `<x-import from="...">`.

```html
<x-import
  component-from-global-scope="MainComposition"
  from="./animation-runtime.jsx ./main-composition.tsx">
</x-import>
```

- Each local source receives its own URL and loads in authored order; the requested component is resolved from the final source.
- The rewritten URL retains the original `.jsx` / `.tsx` path so a packaged runtime can keep selecting Babel/TypeScript compilation.
- An extensionless reference such as `./main-composition` also tries packaged `.jsx` and `.tsx` files at that location.
- Absolute HTTP(S), Data, and Blob URLs are not replaced with package files.
- Package every local source and its required runtime in the ZIP.

#### Continuous-composition timeline synchronization

A custom continuous-composition runtime can expose exactly one finished-stage element with `data-om-exportable-video-with-duration-secs="total-seconds"` and listen for `data-om-seek-to-time-frame` on that same element.

```js
stage.addEventListener('data-om-seek-to-time-frame', (event) => {
  const { time, playing, sync } = event.detail;
  renderAt(time, { playing, sync });
});
```

- `time` is the current CDE2 time in seconds and `playing` marks continuous playback.
- Add `data-om-sync-seek="true"` when the listener can commit the requested DOM frame synchronously.
- Do not expose more than one exportable root; the host may otherwise bind to the wrong stage.
- For narrated decks, CDE2 also drives this contract from audio seek, play, pause, and timing events.

Starting with v36.0.1, decks without that stage contract can expose `window.__DECK__.renderAt(time)` or `window.renderAt(time)`. CDE2 calls the hook on every preview update with absolute seconds. The hook must update scenes and captions synchronously and support repeated times and backward seeks. The host flushes React updates before synchronizing videos and preserves animation times set by the deck. The OM stage contract takes precedence when present.

#### ES modules inside ZIP packages

CDE2 v32 and later resolve packaged `.js` / `.mjs` files reachable from a native deck's `<x-import>` or `<script type="module">` as a dependency graph.

- Query- or hash-suffixed references, nested static or dynamic imports, and cycles are supported.
- Preview uses per-module Blob URLs connected by an import map; standalone HTML uses independent data-URL modules connected by the same graph.
- Literal relative paths to packaged images, JSON, and similar files inside a module are rewritten for preview and standalone export.
- Runtime-computed local paths such as `import(variable)` cannot be discovered. Use string literals for packaged module imports.
- Bare package names such as `react` are not resolved through npm. Use an absolute URL or package the dependency and reference it relatively.
- A working WebGL/canvas preview does not replace stopped-frame, PNG, and video-export validation.

### 7. Video and `data-vin`

Use `data-vin="seconds"` for a small in-point adjustment to an already prepared clip.

```text
CSS media time = data-vin (default 0) + max(0, current time - clip start data-t0)
```

- Let the host drive playback and currentTime. See [the timing contract](TIMING_CONTRACT.md) for CSS data-t0, defaults, and VT scope.
- Do not use `#t=` as the formal in-point contract.
- For portability, omit `autoplay` and `loop`; use `muted playsinline preload="auto"`.
- Ensure `media duration - data-vin` is at least the clip usage duration. Prepare a new clip upstream for large timing changes.

### 8. Audio

CDE2 can preview narration and BGM separately and can create a mixed track for applicable exports.

For an external renderer, the most portable handoff is one track that starts at timeline zero and already contains any required silence, clip audio, narration, and music. This is an external-pipeline compatibility profile, not a CDE2 import requirement.

### 9. Preflight checklist

- [ ] The deliverable is a supported `.html` or `.zip` shape.
- [ ] Native `.dc.html` is packaged with its authorized runtime and assets.
- [ ] Stage dimensions are explicit.
- [ ] Multi-scene timing has accurate `BOUNDS` and `duration` values.
- [ ] Scene labels or `S_` names are present.
- [ ] User-editable Japanese appears as source literals.
- [ ] Media-slot IDs, dimensions, and fit behavior are explicit.
- [ ] No player UI appears inside the finished stage.
- [ ] Video in-points and remaining clip lengths are valid.
- [ ] Relative paths and required runtime files are present.
- [ ] When one import lists multiple JSX/TSX sources, every source is packaged and the authored load order was checked.
- [ ] A continuous-composition runtime exposes one exportable root and responds to the seek event.
- [ ] The package contains no secrets, unintended external URLs, or unlicensed media.
- [ ] Import, text editing, media replacement, seeking, and required exports were tested in CDE2.

## Scope and provenance

This public guide was generalized from a production specification and then checked against the CDE2 v20-4 source in this repository. Historical incident names, private links, local machine commands, unpublished renderer internals, and workflow-specific editorial rules were intentionally excluded.

### Static CSS composition timing (v36.0.3)

See [the shared timing contract / 時間制御規約](TIMING_CONTRACT.md) for both host versions and media semantics.

A CSS stage can explicitly declare `data-cde-time-mode="absolute"` or `"scene-relative"`. Absolute means every CSS animation is sought to global T; scene-relative means T minus the active scene start. This is separate from `data-render-mode="css|vt"`, which selects the rendering engine.

For older packages without a time-mode declaration, CDE2 recognizes a static absolute timeline when a `data-cde-stage` with `data-render-mode="css"` contains mounted scene markers (`data-screen-label` or `section[id^="S_"]`) whose computed animation delays match every declared `data-bounds` entry in order. CSS variable names are arbitrary; global caption and overlay siblings are allowed. Unrecognized legacy decks retain scene-relative timing. Explicit OM and renderAt hooks retain priority.

For media, `data-t0` means global clip start, while `data-vin` means the offset within the source file. In absolute compositions without `data-t0`, the nearest animated video or wrapper supplies its animation delay. Declare `data-t0` when this inference is ambiguous. Video playback and seeking belong to the host; avoid independent animationstart handlers that call play or reset currentTime.

Verify forward/backward seeks, global captions, a shot starting inside a scene, and CDE2-to-renderer output with the same package. Inferring the clock from one particular variable name or counting every stage child as a scene is insufficient.

## Static HTML scene identity and preview geometry (2026-09-11)

CDE2 36.0.4+ recognizes outermost `div`, `section`, `main`, or `article` scene containers by `data-screen-label`, an `id` beginning with `S_`, or an immediately preceding `<!-- SCENE nn: Label -->` / `<!-- SCENE nn -->` comment. Keep scene containers as siblings, give each a stable unique ID and a readable data-screen-label, and keep global captions/overlays outside them without scene markers. Native sc-if and JSX conventions remain supported.

Markers identify editing ranges; they do not switch scenes or set animation time. Keep one ascending BOUNDS entry per scene in DOM order and declare the CSS time basis explicitly. Legacy clock inference still uses data-screen-label or section IDs beginning with S_; comments alone do not enable it. RENDERER2 1.8.0 supports explicitly timed static CSS decks exported by CDE2; 1.8.1 also accepts inert x-dc wrappers directly without requiring React.

Declare the canonical stage dimensions (for example 1080x1920). CDE2 contain/width fitting is preview-only, including static HTML inside an inert x-dc. Do not save the editor's scale wrapper or viewport dimensions into the deck. Verify the scene list, direct/backward seeks, resize, ZIP export/reimport, and renderer output dimensions with the same package.

静的HTMLでは、兄弟のシーン要素に安定したS_始まりのidとdata-screen-labelを付け、必要に応じSCENEコメントを直前に置きます。目印は編集範囲の識別用であり、時間制御はBOUNDS・明示した時間基準・アニメーション側で実装します。字幕と全体オーバーレイはシーン目印を付けず分離します。全体表示／幅に合わせるはプレビュー専用で、書き出しは元のステージ寸法を保持します。
