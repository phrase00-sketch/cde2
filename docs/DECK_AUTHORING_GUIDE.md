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
- シーン内のアニメーション時間は、シーン開始を0秒とした相対時間で設計します。
- シーン名をCDE2で扱いやすくするため、各シーンの近くに `<!-- SCENE 1: Title -->` のようなコメントを置くことを推奨します。
- ネイティブ形式では、トップレベルの `<sc-if>` をシーン境界に使います。`<sc-if>` は入れ子にしないでください。
- CDE2 v21以降は、`<!-- SCENE n -->` 付きまたは `sN` の `<sc-if>` だけを本編シーンとみなします。字幕行（`c1`…）や `archive` のようなオーバーレイ用 `<sc-if>` はシーン一覧に出しません。
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
素材時刻 = data-vin（省略時は0）+（現在時刻 - シーン開始時刻）
```

- デッキ側で `currentTime` を継続的に操作せず、時刻同期はCDE2または対応レンダラーに任せます。
- URLの `#t=` を正式なイン点指定として使わないでください。
- 移植性を高めるには `autoplay` と `loop` を付けず、`muted playsinline preload="auto"` を使います。
- `素材尺 - data-vin` がシーン尺以上になることを確認します。大幅な区間変更は、素材を事前に切り出してください。

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
- Define animation timing relative to the start of each scene.
- Add labels such as `<!-- SCENE 1: Title -->` near scene boundaries.
- Native decks should use top-level, non-nested `<sc-if>` blocks.
- From CDE2 v21, only `<!-- SCENE n -->` or `sN` `<sc-if>` blocks count as scenes. Caption rows (`c1`…) and overlay flags such as `archive` stay out of the scene list.
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

### 7. Video and `data-vin`

Use `data-vin="seconds"` for a small in-point adjustment to an already prepared clip.

```text
media time = data-vin (default 0) + (current time - scene start)
```

- Let CDE2 or a compatible renderer drive `currentTime`.
- Do not use `#t=` as the formal in-point contract.
- For portability, omit `autoplay` and `loop`; use `muted playsinline preload="auto"`.
- Ensure `media duration - data-vin` is at least the scene duration. Prepare a new clip upstream for large timing changes.

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
- [ ] The package contains no secrets, unintended external URLs, or unlicensed media.
- [ ] Import, text editing, media replacement, seeking, and required exports were tested in CDE2.

## Scope and provenance

This public guide was generalized from a production specification and then checked against the CDE2 v20-4 source in this repository. Historical incident names, private links, local machine commands, unpublished renderer internals, and workflow-specific editorial rules were intentionally excluded.
