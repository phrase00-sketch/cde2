# Prompt for creating a CDE2-compatible deck

[日本語](#日本語) | [English](#english)

Use this prompt as a starting point when asking an AI to create a new deck. The default target is a portable, self-contained HTML file. For the underlying rules and alternative package formats, see [Authoring decks for CDE2](DECK_AUTHORING_GUIDE.md).

## 日本語

次のテンプレートをコピーし、角括弧の部分を置き換えてください。

```text
CDE2（Creator Deck Editor 2）で読み込み・編集できる、自己完結型のモーションデザインHTMLを1ファイルで作成してください。

目的:
[動画・プレゼンテーションの目的]

内容:
[台本、要点、シーン案]

素材:
[利用できる画像・動画・音声と、そのファイル名。無ければ「なし」]

画面:
- サイズ: [1920×1080 / 1080×1920 / その他]
- 雰囲気: [色、書体、テンポ、参考イメージ]
- 想定視聴環境: [PC / スマートフォン / 会場スクリーンなど]

必須の互換条件:
1. 完全なHTML文書として出力し、外部ビルド工程を不要にする。
2. デッキ本体を `.stage` クラスの固定ステージ内に置き、widthとheightをpxで明示する。
3. 複数シーンの開始秒を `const BOUNDS = [0, ...]` で累積指定し、総尺を `const duration = ...` で秒指定する。BOUNDSの要素数はシーン数と一致させる。
4. 各シーンの近くに `<!-- SCENE n: 短い名前 -->` コメントを置く。
5. 表示する日本語は、CDE2がフォーム抽出できる確定文字列リテラルまたはHTML/JSXテキストとして書く。`${...}` 補間、実行時の文字列結合、描画後のtextContent書き換えに依存しない。
6. 差し替え可能な画像・動画領域には、一意な `data-img-slot`、分かりやすい `data-slot-label`、`data-fit="cover"` または `contain` を付ける。幅・高さを明示し、未割り当て時は何も表示しない。
7. アニメーションはCSS Animation、CSS Transition、またはWeb Animations APIを基本とする。同じ時刻なら同じ画面になるよう決定的に作り、終了状態はbothまたはforwardsで保持する。シーン内の時間はシーン開始を0秒として設計する。
8. ステージ内に再生ボタン、開始ゲート、編集UIを重ねない。
9. 動画を使う場合は `muted playsinline preload="auto"` とし、autoplayとloopを付けない。開始位置の微調整は `data-vin="秒"` で宣言する。URLの `#t=` や、デッキ側JSによる継続的なcurrentTime操作は使わない。
10. 素材ファイルはHTMLからの相対パスで参照する。素材が提供されていない場合は、外部の写真URLや権利不明素材を勝手に埋め込まず、差し替えスロットを空のまま用意する。
11. APIキー、個人情報、ローカルPCの絶対パス、非公開URLを出力に含めない。
12. 最後に、シーン番号、開始秒、終了秒、画面上の要点、使用する素材スロットを表で示す。

デザイン上の希望:
[文字量、配色、動き、余白、強調方法など]

出力:
- まず完成したHTML全体を1つのコードブロックで出す。
- その後に短いセルフチェックを付け、BOUNDS、duration、ステージ寸法、スロットID、外部依存の有無を報告する。
- 説明だけで終わらず、保存してCDE2へ読み込める完成ファイルを出す。
```

ネイティブ `.dc.html` 形式が必要な既存ワークフローでは、冒頭の1文を次のように置き換えてください。

```text
CDE2で読み込めるネイティブ `.dc.html` と、実行に必要な権利確認済みランタイムおよびassetsを、同じ階層関係を保ったZIP構成として作成してください。`.dc.html` は `<x-dc>` とトップレベルの非入れ子 `<sc-if>` を使い、単体ファイルでは渡さないでください。
```

## English

Copy this template and replace the bracketed fields.

```text
Create one self-contained motion-design HTML file that can be imported and edited in CDE2 (Creator Deck Editor 2).

Purpose:
[What the video or presentation should accomplish]

Content:
[Script, key points, or scene outline]

Assets:
[Available image, video, and audio filenames, or “none”]

Canvas:
- Size: [1920×1080 / 1080×1920 / other]
- Visual direction: [colors, typography, pacing, references]
- Viewing context: [desktop / mobile / venue screen / other]

Compatibility requirements:
1. Return a complete HTML document with no build step.
2. Put the deck inside a fixed `.stage` element with explicit pixel width and height.
3. Declare cumulative scene start times as `const BOUNDS = [0, ...]` and total seconds as `const duration = ...`. Use one BOUNDS entry per scene.
4. Put a `<!-- SCENE n: Short label -->` comment near each scene.
5. Keep user-facing Japanese text, if any, as complete source literals or HTML/JSX text so CDE2 can extract it. Do not depend on `${...}` interpolation, runtime concatenation, or post-render textContent mutation for editable text.
6. Give each replaceable image/video area a unique `data-img-slot`, a useful `data-slot-label`, explicit dimensions, and `data-fit="cover"` or `contain`. Render nothing when the slot is unassigned.
7. Prefer CSS Animation, CSS Transition, or the Web Animations API. Make animation deterministic for a given timeline position, retain end states with both/forwards, and define timing relative to each scene start.
8. Do not overlay play buttons, start gates, or editor UI on the finished stage.
9. For video, use `muted playsinline preload="auto"`, omit autoplay and loop, and declare small in-point adjustments with `data-vin="seconds"`. Do not use URL `#t=` or continuously drive currentTime from deck JavaScript.
10. Reference supplied assets with relative paths. If no asset is supplied, do not invent external photo URLs or embed media with unclear rights; leave a replaceable slot empty.
11. Do not include API keys, personal data, absolute local paths, or private URLs.
12. Finish with a table listing each scene number, start, end, on-screen purpose, and media-slot IDs.

Design preferences:
[Text density, palette, motion, spacing, emphasis]

Output:
- First return the complete HTML in one code block.
- Then provide a short preflight report covering BOUNDS, duration, stage dimensions, slot IDs, and external dependencies.
- Deliver a finished file that can be saved and imported into CDE2, not only an explanation.
```

For an existing workflow that requires native `.dc.html`, replace the opening sentence with:

```text
Create a CDE2-compatible native `.dc.html` deck and package it with every authorized runtime and asset it needs, preserving relative paths in a ZIP. Use `<x-dc>` and top-level, non-nested `<sc-if>` scene blocks. Do not deliver the native `.dc.html` as a bare file.
```
