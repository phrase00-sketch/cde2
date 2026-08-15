# CDE2 — Creator Deck Editor 2

> A browser-based last-mile editor for AI-generated motion-design decks.

[Japanese](#日本語) | [English](#english)

![CDE2 editor](docs/cde2-screenshot.png)

## 日本語

CDE2は、AIが生成した動画デザインのZIPや単体HTMLをブラウザで読み込み、コードを直接書かずに仕上げるためのローカルエディタです。

「AIでデザイン案は作れたが、テキスト、素材、音声、BGM、再生位置を実際の制作で調整したい」という、生成と編集の間を埋めます。

このプロジェクトは、GitHubが何かも知らなかった非エンジニアが、自分のYouTube制作の困りごとを解決するために始めました。前身のCDE1（Scene Editor）をv19まで改良し、その後CDE2をv20-4まで発展させています。「アプリを作って終わり」ではなく、毎日使い、問題を発見し、Codexと原因を調べ、修正し、実機で確認するサイクルを続けてきた記録でもあります。

### 主な機能

- AI生成のZIP（JSX + assets）、単体HTML、`.dc.html` の読み込み
- 画面内テキストの自動抽出とライブ編集
- 画像・動画スロットの差し替え、クロップ、動画イン点調整
- ナレーションとBGMの挿入、音量、フェード、倍速プレビュー
- シーンと画面上のコメントをAIへ渡せる形で出力
- 単体HTML、PNG、MP4、RENDERER2用ZIPの書き出し
- バックエンド不要。ファイルは原則としてブラウザ内で処理

### 使い方

1. `index.html` をダウンロードし、ChromeまたはEdgeで開きます。
2. 対応するZIPまたはHTMLをドラッグ＆ドロップします。
3. テキスト、素材、音声、コメントを調整します。
4. 単体HTMLまたは制作パイプライン用ZIPを書き出します。

動作を試すだけなら [`examples/sample-deck.html`](examples/sample-deck.html) を読み込んでください。CDNからライブラリとフォントを読み込むため、初回表示にはネット接続が必要です。

互換パッケージ固有の実行ファイル（例: `support.js` や `image-slot.js`）は、読み込むZIP側に含めてください。公開前の権利確認で出所を断定できなかった実行コードは、CDE2本体から意図的に除外しています。

### データとプライバシー

CDE2自体にファイルを受け取るサーバーはありません。ただし、CDE2のCDN依存関係、Google Fonts、または読み込んだデッキが指定する外部素材にブラウザがアクセスする場合があります。機密性の高い素材は、外部URLを含まないパッケージで利用してください。

## English

CDE2 is a local, browser-based editor for the gap between AI-generated motion design and production-ready delivery. It opens compatible ZIP/HTML deck packages, exposes their text and media slots, provides a live preview, and exports a revised self-contained HTML or a renderer-ready package.

The project was created by a non-engineer who did not know what GitHub was, for a real daily YouTube production workflow. Its predecessor, CDE1 (Scene Editor), reached v19. CDE2 then evolved through v20-4. The version trail represents a repeated cycle of daily use, bug discovery, root-cause work with Codex, implementation, and real-browser verification—not a one-off generated demo.

### Highlights

- Import JSX + assets ZIPs, self-contained HTML, and compatible `.dc.html` decks
- Edit visible text with immediate preview updates
- Replace image/video slots, reframe assets, and adjust video in-points
- Add narration and BGM with volume, fade, seek, and playback-speed controls
- Capture scene comments and export a structured AI handoff
- Export standalone HTML, PNG, MP4, and RENDERER2-ready ZIP packages
- No project backend; processing happens primarily in the browser

### Quick start

1. Download `index.html` and open it in Chrome or Edge.
2. Drop in a supported ZIP or HTML deck.
3. Edit text, media, audio, and review comments.
4. Export a standalone HTML or renderer-ready package.

Use [`examples/sample-deck.html`](examples/sample-deck.html) for a small demo. Internet access is required for CDN-hosted libraries and fonts.

Package-specific runtime files (for example, `support.js` or `image-slot.js`) must be supplied by the imported ZIP. Runtime code whose redistribution provenance could not be established was intentionally removed from this public release.

## Project status

This is the first public release of a tool that has been actively used and maintained in a private production workflow. Public adoption metrics do not exist yet; issues, reproducible test cases, and format-compatibility reports are welcome.

The final CDE1 build is preserved in [`history/cde1-scene-editor-v19.html`](history/cde1-scene-editor-v19.html) as provenance for the product's evolution. It is historical code, not the supported release.

## Compatibility and trademarks

CDE2 can read package shapes produced by several AI-assisted design workflows, including Claude Design-style bundles. CDE2 is an independent community project and is not affiliated with or endorsed by Anthropic, OpenAI, or the maintainers of third-party tools mentioned in this repository.

## Development

Run the dependency-free smoke test:

```bash
python scripts/smoke_test.py
```

For browser testing, serve the repository instead of relying on `file://` behavior:

```bash
python -m http.server 8765
```

Then open `http://127.0.0.1:8765/`.

See [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), [THIRD_PARTY.md](THIRD_PARTY.md), and [CHANGELOG.md](CHANGELOG.md).

## License

MIT. See [LICENSE](LICENSE).
