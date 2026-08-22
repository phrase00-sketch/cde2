import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const enc = new TextEncoder();
const dec = new TextDecoder();

function extract(startMarker, nextMarker) {
  const start = html.indexOf(startMarker);
  const end = html.indexOf(`\n${nextMarker}`, start);
  assert.ok(start >= 0 && end > start, `Could not extract ${startMarker}`);
  return html.slice(start, end);
}

const sha = (bytes) =>
  crypto.createHash("sha256").update(Buffer.from(bytes)).digest("hex");
const bytes = (text) => enc.encode(text);

// Prompt regression: only explicitly touched slots are instructions, and delta
// handoffs refuse a mismatched/missing base ZIP.
const slotDefs = [
  { id: "changed-slot", label: "Changed slot", fit: "cover" },
  { id: "untouched-slot", label: "Untouched slot", fit: "contain" },
];
const promptModel = {
  dcMode: true,
  dcPath: "project/deck.dc.html",
  baseSourceName: "source.zip",
  baseFingerprint: "a".repeat(64),
  comments: [],
  imgTouched: { "changed-slot": "cleared" },
  imgAssign: {},
  assetVin: {},
};
const buildAiPrompt = new Function(
  "commitJsx",
  "M",
  "currentJsxText",
  "discoverImgSlots",
  "_isVideoAsset",
  "_vinRound",
  "_vinAttr",
  "cmTypeLabel",
  "sceneCode",
  `${extract("function buildAiPrompt(options){", "function openExport")}; return buildAiPrompt;`,
)(
  () => {},
  promptModel,
  () => '<image-slot id="changed-slot"></image-slot>',
  () => slotDefs,
  () => false,
  () => 0,
  () => "0.0",
  () => "scene",
  () => "",
);
const deltaPrompt = buildAiPrompt({ includeSource: false, handoffMode: "delta" });
assert.match(deltaPrompt, /厳密な差分パッケージ/);
assert.match(deltaPrompt, new RegExp("a{64}"));
assert.match(deltaPrompt, /ユーザーが明示的にクリア/);
assert.doesNotMatch(deltaPrompt, /スロット `untouched-slot`/);
assert.match(deltaPrompt, /一致する元ZIPが無い、または指紋が違う場合は作業を止め/);

// A clear must be materialized in the authoritative edited deck while an
// untouched slot remains intact.
const applyDcClearedSlots = new Function(
  "M",
  `${extract("function applyDcClearedSlots(html){", "function applyDcImgSlots")}; return applyDcClearedSlots;`,
)({ imgTouched: { "changed-slot": "cleared" } });
const clearedDeck = applyDcClearedSlots(
  '<image-slot id="changed-slot" src="old.png"></image-slot>' +
    '<div data-img-slot="untouched-slot" style="display:block"></div>',
);
assert.match(clearedDeck, /id="changed-slot"[^>]*display:none[^>]*data-cde-cleared="1"/);
assert.match(clearedDeck, /data-img-slot="untouched-slot" style="display:block"/);

const createdZips = [];
const downloads = [];
class FakeZip {
  constructor() {
    this.entries = new Map();
    createdZips.push(this);
  }

  file(name, value) {
    this.entries.set(name, value);
    return this;
  }

  folder(name) {
    return { file: (child, value) => this.file(`${name}/${child}`, value) };
  }

  async generateAsync() {
    const size = [...this.entries.values()].reduce((n, value) => {
      if (typeof value === "string") return n + Buffer.byteLength(value);
      return n + (value?.byteLength ?? value?.length ?? 0);
    }, 256);
    return { size, zip: this };
  }
}

const originalDeck = bytes("ORIGINAL_DECK");
const editedDeck = "EDITED_DECK";
const unchangedVideo = new Uint8Array([1, 2, 3, 4]);
const replacedVideo = new Uint8Array([9, 8, 7, 6]);
const oldReplacedVideo = new Uint8Array([4, 3, 2, 1]);
const model = {
  source: "zip",
  dcMode: true,
  dcPath: "project/deck.dc.html",
  dcSource: "OLD_DECK",
  jsxPath: null,
  baseSourceName: "source.zip",
  baseFingerprint: "b".repeat(64),
  files: new Map([
    ["project/deck.dc.html", { bytes: originalDeck, mime: "text/html" }],
    ["project/assets/unchanged.mp4", { bytes: unchangedVideo, mime: "video/mp4" }],
    ["project/assets/replaced.mp4", { bytes: replacedVideo, mime: "video/mp4" }],
  ]),
  baseFiles: {
    "project/deck.dc.html": { sha256: sha(originalDeck), size: originalDeck.length },
    "project/assets/unchanged.mp4": {
      sha256: sha(unchangedVideo),
      size: unchangedVideo.length,
    },
    "project/assets/replaced.mp4": {
      sha256: sha(oldReplacedVideo),
      size: oldReplacedVideo.length,
    },
  },
  comments: [],
  imgTouched: { "changed-slot": "cleared" },
  imgAssign: {},
  assetVin: {},
};

const handoff = new Function(
  "M",
  "baseName",
  "commitJsx",
  "currentJsxText",
  "_prepareZipSlotAssets",
  "stampCanonicalStage",
  "applyAssetVideoVins",
  "applyDcImgSlots",
  "rewriteAssetVideoRefsZip",
  "_clearZipSlotAssets",
  "_isVideoAsset",
  "_vinRound",
  "enc",
  "mimeOf",
  "buildAiPrompt",
  "discoverImgSlots",
  "sha256Hex",
  "JSZip",
  "download",
  "log",
  `${extract("function _aiBaseName(){", "async function exportFullBundleLegacyV26")}; return { buildAiProjectSnapshot, exportDeltaBundle, exportFullSplitBundles };`,
)(
  model,
  (value) => value.split("/").pop(),
  () => {},
  () => editedDeck,
  async () => ({ files: [], state: {} }),
  (value) => `${value}|STAGE`,
  (value) => `${value}|VINS`,
  (value) => `${value}|SLOTS`,
  (value) => `${value}|REFS`,
  () => {},
  (value) => /\.(mp4|webm)$/i.test(value),
  (value) => Number(value?.vin || value || 0),
  enc,
  () => "application/octet-stream",
  (options) => `HANDOFF:${options.handoffMode}`,
  () => slotDefs,
  async (value) => sha(value),
  FakeZip,
  (blob, name) => downloads.push({ blob, name }),
  () => {},
);

await handoff.exportDeltaBundle();
assert.equal(downloads.length, 1);
assert.equal(downloads[0].name, "deck_AI差分.zip");
const deltaZip = downloads[0].blob.zip;
assert.ok(deltaZip.entries.has("project/deck.dc.html"));
assert.ok(deltaZip.entries.has("project/assets/replaced.mp4"));
assert.ok(deltaZip.entries.has("deck_編集指示.md"));
assert.ok(deltaZip.entries.has("cde2-handoff-manifest.json"));
assert.ok(!deltaZip.entries.has("project/assets/unchanged.mp4"));
assert.equal(
  dec.decode(deltaZip.entries.get("project/deck.dc.html")),
  "EDITED_DECK|SLOTS|VINS|STAGE|REFS",
);
const deltaManifest = JSON.parse(
  dec.decode(deltaZip.entries.get("cde2-handoff-manifest.json")),
);
assert.equal(deltaManifest.mode, "delta");
assert.equal(deltaManifest.base.sourceFileName, "source.zip");
assert.equal(deltaManifest.base.sha256, "b".repeat(64));
assert.equal(deltaManifest.base.files["project/assets/unchanged.mp4"].sha256, sha(unchangedVideo));
assert.ok(
  deltaManifest.changedFiles.some((item) => item.path === "project/assets/replaced.mp4"),
);
assert.ok(
  deltaManifest.unchangedRequiredFiles.some(
    (item) => item.path === "project/assets/unchanged.mp4",
  ),
);
assert.deepEqual(deltaManifest.deletedFiles, []);
assert.equal(deltaManifest.slotChanges[0].action, "cleared");

// Full fallback uses ordinary independent ZIPs. Three 8 MiB media files force
// multiple parts; every part repeats the same parts manifest and stays <= 18 MiB raw.
downloads.length = 0;
model.files.set("project/assets/large-a.mp4", {
  bytes: new Uint8Array(8 * 1024 * 1024),
  mime: "video/mp4",
});
model.files.set("project/assets/large-b.mp4", {
  bytes: new Uint8Array(8 * 1024 * 1024),
  mime: "video/mp4",
});
model.files.set("project/assets/large-c.mp4", {
  bytes: new Uint8Array(8 * 1024 * 1024),
  mime: "video/mp4",
});
await handoff.exportFullSplitBundles();
assert.ok(downloads.length >= 2);
const partsManifests = downloads.map(({ blob, name }) => {
  assert.ok(name.includes("_完全版_"));
  assert.ok(blob.size <= 18 * 1024 * 1024);
  assert.ok(blob.zip.entries.has("cde2-parts-manifest.json"));
  return dec.decode(blob.zip.entries.get("cde2-parts-manifest.json"));
});
assert.ok(partsManifests.every((value) => value === partsManifests[0]));
const partsManifest = JSON.parse(partsManifests[0]);
assert.equal(partsManifest.partCount, downloads.length);
assert.equal(partsManifest.authoritativeDeck, "project/deck.dc.html");
const union = new Set(downloads.flatMap(({ blob }) => [...blob.zip.entries.keys()]));
for (const required of [
  "project/deck.dc.html",
  "project/assets/large-a.mp4",
  "project/assets/large-b.mp4",
  "project/assets/large-c.mp4",
  "cde2-handoff-manifest.json",
]) {
  assert.ok(union.has(required), `Missing full-split path: ${required}`);
}

console.log(
  "PASS: v27 strict delta omits unchanged media and full fallback uses <=18MiB independent ZIPs",
);
