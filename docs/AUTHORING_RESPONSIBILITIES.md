# Authoring and local validation responsibilities

## 日本語

制作側は提供された素材・コードと自身の環境で利用可能な機能を使い、対応パッケージを作ります。ユーザーPCの任意フォルダ、CDE2、RENDERER2へのアクセスを前提にしません。構文、相対パス、素材同梱、寸法、総尺、時間同期の実装を確認し、自環境でプレビューできる場合はその結果も扱います。

CDE2での読込・編集・シーク・表示枠のリサイズ・保存復元・書き出し再読込、RENDERER2でのMP4検査はローカル担当が行います。実機確認ができないことだけで制作ZIPの納品を止めず、実施できた範囲と未実施を区別します。最終的な内容・画面・音声の検収は人間が担当します。

技術契約は採用する方式に該当する条件を適用します。静的HTMLに専用ランタイムやsc-ifを強制せず、CSS作品にWebGLの実装条件を適用しません。過去の事故・互換処理・変更履歴は、現在の作品への追加の禁止事項ではありません。

ローカル担当は同じZIPで順逆シーク、連続再生、字幕、シーン途中の動画、出力寸法と音声実尺を確認します。検査したfps・時点・範囲を記録し、間引き確認を全フレーム検査としません。問題が出た場合はデッキ・エディタ・レンダラーのどこで状態が変わったかを切り分けます。

## English

Authors build a compatible package using the supplied files and tools available in their own environment. Access to arbitrary folders on the user's computer, CDE2, or RENDERER2 is not assumed. Check source syntax, relative references, packaged assets, dimensions, duration, and synchronization implementation; use an author-side preview when available.

The local operator performs live CDE2 import, editing, seeking, resizing, save/restore, export/reimport, and RENDERER2 MP4 validation. Unavailable local tests do not block delivery of the authored package. Report what was checked and what remains untested separately. Humans perform final content, visual, and audio acceptance.

Apply only the contract for the chosen implementation. Static HTML does not require a native runtime or sc-if, and CSS-only work does not inherit WebGL-specific implementation requirements. Historical incidents, compatibility fallbacks, and release notes do not add universal restrictions to new work.

Local checks use the same package for forward/backward seeks, continuous playback, captions, mid-scene media, output dimensions, and narration duration. Record the actual frame rate and sampling coverage. Diagnose whether a discrepancy originates in the deck, editor, or renderer before adding authoring restrictions.
