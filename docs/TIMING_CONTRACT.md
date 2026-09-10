# Timeline and media contract / 時間制御規約

Compatibility: CDE2 36.0.3+, RENDERER2 1.8.0+ (CSS capture v4.13).

## 日本語

`data-render-mode="css|vt"`は描画方式、`data-cde-time-mode="absolute|scene-relative"`はCSSアニメーションへ渡す時間の基準です。両者を混同しません。新規CSSデッキは固定寸法の`data-cde-stage`に両方を宣言してください。

| 時間基準 | ホストがCSSへ渡す時刻 | デッキの遅延 |
|---|---|---|
| absolute | 全体時刻T | シーン／字幕／ショットの全体開始時刻を含む |
| scene-relative | T − 現在シーン開始 | シーン内の経過秒。全体開始秒を重ねない |

絶対CSS例：シーンが10秒、内部ショットが12秒なら、遅延はそれぞれ10秒、12秒です。12.5秒への直接シークでも先頭からの再生でも、ショット開始後0.5秒の絵になります。

相対CSSは現在シーンのDOM切替をホストのrenderAt／スライダー等へ接続してください。属性だけではシーンを生成・切替しません。`renderAt(T)`がある場合は絶対秒で呼び、シーン・字幕の選択とアニメーション時刻をデッキが計算します。このフックがCSS時間基準属性より優先します。

CDE2プレビューはOMステージ契約、`__DECK__.renderAt(T)`、`window.renderAt(T)`の順で優先します。RENDERER2のCSS経路では明示renderAtフックを優先し、VT経路の連続合成はOM seek契約を使用します。`data-cde-time-mode`はVTの仮想時間を変更しません。

旧CSSパッケージの互換判定では、ステージの`data-bounds`と、最上位のシーン目印（`data-screen-label`または`section[id^="S_"]`）のcomputed animation-delayが全件一致する場合に絶対時間と推定します。CSS変数名は自由で、字幕・オーバーレイの兄弟要素をシーン数に含めません。判別できない旧パッケージは従来の相対時間処理を保ちます。新規制作は推定に頼らず明示してください。

`fill-mode`は一律bothではありません。待機中の未来シーンが前面を覆わず、直接シーク・後戻りでも表示状態が一意になるよう、both／forwardsと初期opacity・visibilityを選んでください。常時字幕や粒子レイヤーを別配置できます。

### 動画

- `data-t0`：全体タイムライン上の動画開始秒。CSS経路で使用します。
- `data-vin`：素材ファイル内の開始秒。全体開始秒ではありません。
- CSS素材時刻：`data-vin + max(0, T - data-t0)`を素材の再生可能範囲へ制限します。
- CSSでdata-t0未指定の場合、絶対時間構成では動画または最も近いアニメーションラッパーの遅延、従来の相対構成では現在シーン開始を使用します。装飾アニメーションで推定が曖昧になる場合に備え、新規CSS動画ではdata-t0を明記してください。
- VTではこのCSS推定を前提にせず、既存のOM／仮想時間契約で同期し実機確認します。
- 動画の表示・非表示はシーン／ショット側が管理します。data-t0は表示を切り替える属性ではありません。
- デッキ独自のanimationstartやタイマーからplay／pause／currentTime変更を行いません。音声・動画の再生はホストに任せ、muted playsinlineを指定します。

例：`data-t0="12" data-vin="1.8"`なら、全体12.5秒で素材2.3秒を表示します。

### 検収

全シーンへの直接シーク、後戻り、停止・再開、連続再生、全体字幕、シーン途中の動画、CDE2書き出しZIPのRENDERER2確認を行います。BOUNDS・音声実尺・映像総尺の一致を確認し、プレビューだけでMP4合格とはみなしません。

## English

Rendering mode (`css|vt`) and CSS time basis (`absolute|scene-relative`) are separate. New CSS stages should declare both on `data-cde-stage`. Absolute CSS receives global T and encodes global starts in animation delays. Scene-relative CSS receives T minus scene start and must not add that start again; scene selection still needs a working host hook or slider.

Explicit `__DECK__.renderAt(T)` / `window.renderAt(T)` hooks receive absolute seconds and own scene, caption, and cue time calculation. They take precedence over the CSS time-basis attribute. CDE2 prioritizes the OM stage contract before these hooks; RENDERER2 uses explicit hooks in CSS capture and the OM contract in virtual-time continuous compositions. The CSS attribute does not alter VT behavior.

Legacy absolute detection compares declared bounds with computed delays of top-level scene markers, independent of custom-property names and unrelated overlay siblings. Unknown legacy structures retain relative handling. Prefer an explicit declaration for new packages.

Choose fill modes and initial visibility to keep future scenes hidden until needed, including direct and backward seeks. Do not require both for every animation.

In CSS capture, `data-t0` is global clip start and `data-vin` is the source-file offset. Media time is `data-vin + max(0,T-data-t0)`, clamped to the clip. Without data-t0, absolute CSS uses the nearest animated video/wrapper delay; relative CSS uses scene start. Declare data-t0 when decorative motion makes inference ambiguous. These CSS rules do not promise VT support; use its existing stage/time contract and validate it. The deck still owns media visibility, while the host owns playback and seeks. Do not add independent animationstart playback handlers.

Validate forward/backward seeking, pause/resume, continuous playback, global captions, mid-scene shots, audio duration, and the same exported package in RENDERER2.

## Static HTML scene identity and preview geometry (2026-09-11)

CDE2 36.0.4+ recognizes outermost `div`, `section`, `main`, or `article` scene containers by `data-screen-label`, an `id` beginning with `S_`, or an immediately preceding `<!-- SCENE nn: Label -->` / `<!-- SCENE nn -->` comment. Keep scene containers as siblings, give each a stable unique ID and a readable data-screen-label, and keep global captions/overlays outside them without scene markers. Native sc-if and JSX conventions remain supported.

Markers identify editing ranges; they do not switch scenes or set animation time. Keep one ascending BOUNDS entry per scene in DOM order and declare the CSS time basis explicitly. Legacy clock inference still uses data-screen-label or section IDs beginning with S_; comments alone do not enable it. RENDERER2 1.8.0 supports explicitly timed static CSS decks exported by CDE2; 1.8.1 also accepts inert x-dc wrappers directly without requiring React.

Declare the canonical stage dimensions (for example 1080x1920). CDE2 contain/width fitting is preview-only, including static HTML inside an inert x-dc. Do not save the editor's scale wrapper or viewport dimensions into the deck. Verify the scene list, direct/backward seeks, resize, ZIP export/reimport, and renderer output dimensions with the same package.

静的HTMLでは、兄弟のシーン要素に安定したS_始まりのidとdata-screen-labelを付け、必要に応じSCENEコメントを直前に置きます。目印は編集範囲の識別用であり、時間制御はBOUNDS・明示した時間基準・アニメーション側で実装します。字幕と全体オーバーレイはシーン目印を付けず分離します。全体表示／幅に合わせるはプレビュー専用で、書き出しは元のステージ寸法を保持します。


## Declared total duration (2026-09-11)

CDE2 36.0.5+ and RENDERER2 1.8.2+ read a positive finite `data-duration` on the canonical `data-cde-stage` before legacy numeric JavaScript assignments. The OM `data-om-exportable-video-with-duration-secs` attribute is also supported. Keep these declarations consistent with the narration and any runtime `__DECK__.duration` value. Variable-based JavaScript assignments are supported when the stage declares the same total duration.

RENDERER2 CSS/VT capture also reads runtime `__DECK__.duration` for no-slider decks. An explicit `DURATION` environment override still takes precedence. Only decks without usable timing metadata use the legacy last-boundary estimate. CDE2 uses the declared duration for export metadata and the narration/BGM mix (a longer narration is still preserved).

総尺はステージに `data-duration="49.065"` のように秒数で明記できます。CDE2のZIP書き出しとBGM合成、RENDERER2のCSS／VT書き出しがこの宣言を読み取り、変数経由のduration設定を読み落として末尾を数秒延ばすことを防ぎます。ナレーション、ステージ宣言、実行時の総尺は一致させてください。
