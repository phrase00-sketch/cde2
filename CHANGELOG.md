# Changelog

## 27.0 - 2026-08-22

- The default AI handoff is now a strict delta ZIP containing the authoritative edited deck, changed or added media, explicit slot changes, sidecars, attachments, instructions, and a machine-readable manifest.
- Delta manifests record the exact source ZIP SHA-256 plus per-file hashes, and instruct the receiving AI to stop if the base package does not match.
- Unchanged video, image, and audio files are omitted from delta handoffs, reducing the typical upload size without treating missing payload files as deletions.
- A complete fallback can be exported as independent ordinary ZIP files capped at 18 MiB raw payload each; every part repeats a parts manifest and preserves original project paths.

## 26.0 - 2026-08-22

- AI handoff ZIPs now contain the complete current project, including CDE2 text edits, replaced media bytes, video in-points, and materialized slot changes at their original paths.
- Only slots explicitly assigned or cleared during the current CDE2 session are listed as AI instructions; untouched existing media is preserved by default.
- ZIP instructions identify the bundled project as the sole authoritative baseline, reject older chat/project state, and request a complete round-trip ZIP with a preservation check.

## 25.0 - 2026-08-22

- Image and video assets are now grouped in main-story scene order instead of filename order.
- A reused asset gets a separate card for each scene where it appears, so repeated video and image usage stays visible.
- Repeated cards for the same video keep their in-point controls synchronized.
- Unused media and audio remain available after the scene-ordered groups.

## 24.0 - 2026-08-22

- Video asset cards now include visible, playable previews with native controls.
- Each packaged video lists the main-story scenes and time ranges where it is used; selecting a scene badge seeks the preview to that scene.
- Asset-grid rows now size to their complete card content, preventing video previews or metadata from being clipped.
- Scene usage follows the existing main-scene parser and also includes linked video-slot references.

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
