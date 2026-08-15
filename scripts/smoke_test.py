from __future__ import annotations

import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "index.html"


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

    print(f"PASS: {HTML.name} ({len(text):,} characters, {len(script_srcs)} script references)")


if __name__ == "__main__":
    main()
