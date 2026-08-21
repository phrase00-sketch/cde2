# Changelog

## 23.0 - 2026-08-22

- AI copy/Markdown handoffs now include the complete current source after the user's CDE2 edits, making that edited state the baseline for further AI changes.
- AI instructions explicitly preserve unrelated user edits and prefer the current edited source when an older comment target no longer matches.
- ZIP handoffs now snapshot the instruction file and edited deck from the same latest in-memory state without duplicating the full source inside the Markdown prompt.

## 22.0 - 2026-08-21

- Native `.dc.html` previews now preserve Google Fonts declared inside `<helmet>` when `support.js` replaces the source `<x-dc>` tree.
- Embedded `@font-face` declarations are hoisted into the preview document head before the deck runtime starts.

## 21.0 - 2026-08-18

- Scene lists now count only main-story `<sc-if>` blocks (`<!-- SCENE n: … -->` or `sN`).
- Caption lines (`c1`…) and overlay flags such as `archive` no longer appear as unnamed `シーンN` entries.
- Playback follow selects the timeline scene from `BOUNDS`, so on-screen subtitle text no longer steals the current scene.
- Subtitle copy is still editable; when `SUBS` is present it is grouped under the visual scene that shows it.

## 20.4 - 2026-08-15

- Improved paused-frame PNG capture for filters, vertical text, and complex layout.
- Preserved the live preview state while capturing the current frame.
- Kept the project as a single-file browser distribution.
- Prepared the first public release with secret checks, pinned CI actions, dependency disclosure, and removal of runtime code whose redistribution provenance was uncertain.
- Added a public deck-authoring guide and copy-ready AI prompt, generalized from the private production specification and verified against the v20-4 importer.
- Rebuilt the public sample as a four-scene vertical deck with editable Japanese copy, replaceable media slots, and original generated imagery.

## 19.x - 2026-08-06

- Added video in-point controls that persist through preview and export.
- Stabilized BGM replacement/removal without rebuilding the preview iframe.
- Added RENDERER2-native package export.

## 18.x - 2026-08-05

- Restored previously assigned image/video assets from compatible packages.
- Preserved sidecar metadata during round-trip editing.

## 17.x and earlier

- Added scene-aware comments and structured AI handoff export.
- Added narration/BGM controls and MP4/PNG export.
- Added live text extraction, asset replacement, and multi-format deck import.

The tool existed as a private, daily-use production utility before this public release. Earlier private builds are intentionally not included because some contained workflow-specific examples rather than reusable public fixtures.

## CDE1 lineage

Before CDE2, the project existed as CDE1 / Scene Editor. That line progressed through v19 while adding live preview, image and video replacement, audio synchronization, segment handling, and MP4-oriented export. The final historical build is included under `history/`; CDE2 is the only supported line.
