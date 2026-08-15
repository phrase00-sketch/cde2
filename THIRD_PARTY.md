# Third-party components

CDE2 loads the following browser libraries from public CDNs:

- React 18.3.1 and ReactDOM 18.3.1 — MIT
- JSZip 3.10.1 — MIT or GPLv3
- html2canvas 1.4.1 — MIT
- modern-screenshot 4.4.39 — MIT
- mp4-muxer 4.3.3 — MIT (upstream is deprecated; migration is tracked for a future release)
- Google Fonts — individual font licenses apply

These components are not vendored in this repository. Their own licenses and terms apply when the browser retrieves them.

Imported decks and media remain the user's responsibility. CDE2 does not grant rights to package-specific runtimes, fonts, images, audio, video, or other content loaded into the editor.

The public build contains empty compatibility hooks for optional package runtimes. It intentionally does not redistribute runtime code whose provenance or redistribution terms could not be established during the release audit.
