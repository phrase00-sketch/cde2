# Project state and recovery

CDE2 v36 stores editable project state with the deck. The AI delta ZIP, full ZIP, project ZIP, and renderer ZIP share `buildProjectSnapshot()`. Renderer output adds a mixed track while retaining the original narration and BGM for further editing.

## Daily use

- Use **作品ZIPを保存** to keep a portable copy with comments and attachments.
- Use **元に戻す** and **やり直す**, or Ctrl/Cmd+Z and Ctrl/Cmd+Shift+Z, to undo project edits. History includes text, media assignments and replacements, comments, and inserted tracks. The most recent 40 checkpoints are kept in memory; playback movement does not create a checkpoint.
- Edits are saved automatically in this browser after a short delay. **保存した作品を復元** lists these local copies. The list also shows browser storage usage when the browser provides it. Copies remain until explicitly deleted or browser data is cleared.
- Browser recovery is local to the browser profile and origin. Save a project ZIP for another browser or computer. The status row reports storage failures rather than claiming a successful save.
- If storage fails with unsaved edits, opening another project stops until a project ZIP has been prepared. Save that ZIP using the download link before switching. A storage error after a successful export is reported as an autosave error.
- ZIP and HTML export buttons open a review showing track names, lengths, missing local references, and reported 3D readiness. Local narration candidates can be selected there. A deck still reporting that its 3D runtime is booting or failed must be checked again before using this screen to export.

## Archive format

`.cde2-project.json` uses `schema: "cde2.project/v1"`. It records the actual CDE2 version, authoritative deck path, original narration and BGM paths, BGM volume and fade, and comments with attachment paths. A null track is an explicit cleared selection. Old packaged audio must not be selected in its place.

Generated original tracks and comment attachments use collision-checked paths under `.cde2/`. Existing files are retained. Metadata from older CDE2 ZIPs (`.dc-voice.json`, `.dc-audio.json`, `.dc-bgm.json`) remains readable when no v36 project record exists. The same restore code handles ordinary HTML and native decks.

AI delta ZIPs still require the exact source ZIP fingerprint. Apply the delta over that source, preserving paths and unspecified files. Project metadata makes cleared track choices explicit, so overlaying a delta does not require deleting old source media. The full handoff still uses independent ZIP parts capped at 18 MiB; a single file exceeding the per-part limit must be supplied separately or reduced first.

Renderer ZIPs keep the deck directory. They add a `.dc-audio.json` next to the deck with a relative pointer to the selected or mixed render track. This prevents the renderer's local-directory audio fallback from selecting an old narration before it reaches the root manifest. An explicitly cleared narration with no BGM produces a silent render track, while project metadata continues to record no selected narration.

## Implementation

`src/` is the source of truth. Modules separate imports, editing, preview construction, archive output, audio, and project lifecycle. `scripts/build.mjs` concatenates them into the distributed `index.html`. End users still open one HTML file and do not need Node.js or a build step.

Run:

```sh
npm ci
npm run build
npm test
npm run test:browser
```

The browser suite uses synthetic fixtures and a local server. It covers failed imports, switching projects, untouched text, AI/full/project/renderer round trips, native legacy metadata, nested image references, undo/redo, recovery after reopening, export review, and `file://` recovery. It also checks module previews after recovery, image-slot styles, storage failure, and the review screen's export button. Set `CDE2_TEST_HTML` to test a separately generated distribution. `CDE2_TEST_FILTER` selects a test by part of its name.

Missing-reference checks inspect literal local paths and ignore source comments. Computed paths and external service availability still require a working preview. Standalone HTML export retains its existing rendering behavior; portable comments and original track restoration use the project ZIP format.

An optional private distribution can be generated from an existing authorized local runtime seed:

```sh
node scripts/build.mjs --personal-from /path/to/private-editor.html --output /path/to/new-private-editor.html
```

The build refuses to inject these seeds into the public `index.html`. No private runtime is part of this repository.

Import retains the previous model and Blob URLs until parsing and state restoration succeed. While loading, editing and export are disabled. Failure restores the previous model. Asynchronous media readers check their owning project before applying results.

Autosave uses IndexedDB, and writes are serialized. Undo snapshots share immutable media bytes and Blobs; restoring a snapshot creates fresh preview URLs. The lossless text writer preserves unchanged source tokens and escapes only edited values.
