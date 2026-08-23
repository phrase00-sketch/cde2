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
        "Creator Deck Editor 2 (v29)",
        'class="toolbar-audio"',
        'class="toolbar-meta"',
        'id="previewHint"',
        'id="audSeek"',
        "function replaceAssetWithFile",
        "function _bindAssetReplaceDrop",
        "function _isAttMedia",
        "画像/動画を追加（複数可）",
        'id="cmDlgAtt"',
        "カードへ同じ拡張子のファイルをドロップしても差し替えできます",
        'id="file"',
        'id="expZip"',
        'id="expHtml"',
        'id="frame"',
        'id="bgmFile"',
        "function isNativeDc",
        "function isPlainDeck",
        "function extractDeckFontHead",
        "grid-auto-rows:max-content",
        "vid.controls=true",
        "function _slotPositions",
        "function _assetMediaPositions",
        "function _assetSceneUses",
        "function _assetDisplayEntries",
        "function _appendAssetSceneUses",
        "画像・動画は本編のシーン順です",
        "同じ素材を複数シーンで使っている場合も、シーンごとに別カード",
        "const fontHead=extractDeckFontHead(html)",
        "function buildAiPrompt(options)",
        "buildAiPrompt({includeSource:true})",
        'buildAiPrompt({includeSource:false,handoffMode:handoffMode})',
        "CDE2で編集済みの現在の本体（基準版）",
        "コメントで指定していないユーザー編集を元に戻したり",
        "M.imgTouched = M.imgTouched || {}",
        "function applyDcClearedSlots",
        "明示的に変更した画像／動画スロット",
        "function sha256Hex(bytes)",
        "async function captureBaseFiles()",
        "async function buildAiProjectSnapshot(handoffMode)",
        "async function exportDeltaBundle()",
        "async function exportFullSplitBundles()",
        'id="expZipDelta"',
        'id="expZipFull"',
        "厳密な差分パッケージです",
        "stopOnBaseMismatch:true",
        "cde2-handoff-manifest.json",
        "cde2-parts-manifest.json",
        "18*1024*1024",
    ]
    missing = [item for item in required if item not in text]
    if missing:
        raise SystemExit(f"Missing expected CDE2 markers: {missing}")

    audio_row = re.search(
        r'<div class="toolbar-audio">(.*?)</div>',
        text,
        re.S,
    )
    meta_row = re.search(
        r'<div class="toolbar-meta">(.*?)</div>\s*</div>',
        text,
        re.S,
    )
    if not audio_row or not meta_row:
        raise SystemExit("Preview toolbar must be split into audio and meta rows")
    if 'id="audSeek"' not in audio_row.group(1) or 'id="audPlay"' not in audio_row.group(1):
        raise SystemExit("Narration seek controls must stay on the audio row")
    if 'id="bgmFile"' not in meta_row.group(1) or 'id="bgmVol"' not in meta_row.group(1):
        raise SystemExit("BGM controls must stay on the meta row")
    if 'width:300px' in audio_row.group(1):
        raise SystemExit("Narration seek slider must not use a fixed 300px width")
    if ".asset,.attach,.idrop,#cmDialog,#sceneComment,#imgList,#assets" not in text:
        raise SystemExit("Project file-drop must ignore asset and attachment drop targets")
    if "inp.multiple=true" not in text:
        raise SystemExit("Comment attachment file input must allow multiple files")

    obsolete_handoff_rules = [
        "**割り当てのないスロットは、要素ごと非表示にして何も描画しないでください。**",
        "→ 未割り当て。**何も表示しない**",
        "修正した各シーン関数のコードのみを jsx コードブロックで返し",
    ]
    stale_rules = [item for item in obsolete_handoff_rules if item in text]
    if stale_rules:
        raise SystemExit(f"Obsolete AI handoff rules remain: {stale_rules}")

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
