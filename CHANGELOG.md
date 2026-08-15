# Changelog

## 20.4 - 2026-08-15

- Improved paused-frame PNG capture for filters, vertical text, and complex layout.
- Preserved the live preview state while capturing the current frame.
- Kept the project as a single-file browser distribution.
- Prepared the first public release with secret checks, pinned CI actions, dependency disclosure, and removal of runtime code whose redistribution provenance was uncertain.

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
