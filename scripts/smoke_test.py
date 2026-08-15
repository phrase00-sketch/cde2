from __future__ import annotations

import re
import json
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "index.html"
SAMPLE_HTML = ROOT / "examples" / "sample-deck.html"
SAMPLE_ZIP = ROOT / "examples" / "sample-deck.zip"


def main() -> None:
    text = HTML.read_text(encoding="utf-8")

    required = [
        "Creator Deck Editor 2",
        'id="file"',
        'id="expZip"',
        'id="expHtml"',
        'id="frame"',
        'id="bgmFile"',
        "function isNativeDc",
        "function isPlainDeck",
    ]
    missing = [item for item in required if item not in text]
    if missing:
        raise SystemExit(f"Missing expected CDE2 markers: {missing}")

    forbidden = [
        r"[A-Za-z]:\\Users\\",
        r"OneDrive - ",
        r"api[_-]?key\s*[:=]\s*[\"'][^\"']+",
        r"bearer\s+[A-Za-z0-9._-]{16,}",
    ]
    hits = [pattern for pattern in forbidden if re.search(pattern, text, re.I)]
    if hits:
        raise SystemExit(f"Potential private or secret material found: {hits}")

    for seed_id in ("__cde_seed_support", "__cde_seed_imgslot"):
        match = re.search(
            rf'<script type="text/plain" id="{seed_id}">(.*?)</script>',
            text,
            re.S,
        )
        if not match or match.group(1).strip():
            raise SystemExit(f"Public runtime seed must stay empty: {seed_id}")

    script_srcs = re.findall(r'<script[^>]+src="([^"]+)"', text)
    unpinned = [
        src
        for src in script_srcs
        if src.startswith(("https://", "http://"))
        and not re.search(r"(?:@|/v?)\d+\.\d+(?:\.\d+)?", src)
    ]
    if unpinned:
        raise SystemExit(f"Unpinned external scripts found: {unpinned}")

    sample = SAMPLE_HTML.read_text(encoding="utf-8")
    sample_required = [
        "const BOUNDS = [0, 3, 6, 9]",
        "const duration = 12",
        'data-img-slot="creator-workspace"',
        'data-img-slot="storyboard-desk"',
    ]
    sample_missing = [item for item in sample_required if item not in sample]
    sample_scene_count = sample.count('class="scene ')
    if sample_missing or sample_scene_count != 4:
        raise SystemExit(
            f"Sample deck structure is incomplete: missing={sample_missing}, "
            f"scenes={sample_scene_count}"
        )

    expected_entries = {
        "examples/sample-deck.html",
        "examples/.image-slots.state.json",
        "examples/assets/creator-workstation.webp",
        "examples/assets/storyboard-desk.webp",
        "examples/assets/README.md",
    }
    with zipfile.ZipFile(SAMPLE_ZIP) as package:
        entries = set(package.namelist())
        missing_entries = sorted(expected_entries - entries)
        if missing_entries:
            raise SystemExit(f"Sample ZIP is missing entries: {missing_entries}")
        packaged_html = package.read("examples/sample-deck.html").decode("utf-8")
        if packaged_html != sample:
            raise SystemExit("Sample ZIP contains a stale sample-deck.html")
        state = json.loads(
            package.read("examples/.image-slots.state.json").decode("utf-8")
        )
        if set(state) != {"creator-workspace", "storyboard-desk"}:
            raise SystemExit(f"Unexpected sample slot state: {sorted(state)}")
        for asset in expected_entries:
            if asset.endswith(".webp") and package.getinfo(asset).file_size < 10_000:
                raise SystemExit(f"Sample image looks empty: {asset}")

    print(
        f"PASS: {HTML.name} ({len(text):,} characters, "
        f"{len(script_srcs)} script references); sample deck (4 scenes, 2 images)"
    )


if __name__ == "__main__":
    main()
