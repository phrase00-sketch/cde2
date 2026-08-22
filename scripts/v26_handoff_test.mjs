import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

function extract(startMarker, nextMarker) {
  const start = html.indexOf(startMarker);
  const end = html.indexOf(`\n${nextMarker}`, start);
  assert.ok(start >= 0 && end > start, `Could not extract ${startMarker}`);
  return html.slice(start, end);
}

const slotDefs = [
  { id: "existing-photo", label: "Existing photo", fit: "cover" },
  { id: "untouched-photo", label: "Untouched photo", fit: "contain" },
];
const promptModel = {
  dcMode: true,
  dcPath: "project/deck.dc.html",
  comments: [],
  imgTouched: {},
  imgAssign: {},
  assetVin: {},
  files: new Map(),
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
  () => '<image-slot id="existing-photo"></image-slot><image-slot id="untouched-photo"></image-slot>',
  () => slotDefs,
  () => false,
  () => 0,
  () => "0.0",
  () => "scene",
  () => "",
);

const untouchedPrompt = buildAiPrompt({ includeSource: false });
assert.match(untouchedPrompt, /このZIP全体が唯一の基準版です/);
assert.match(untouchedPrompt, /下記に記載のない画像／動画スロットは未操作です/);
assert.doesNotMatch(untouchedPrompt, /未割り当て。\*\*何も表示しない\*\*/);
assert.doesNotMatch(untouchedPrompt, /明示的に変更した画像／動画スロット/);

promptModel.imgTouched = { "existing-photo": "assigned" };
promptModel.imgAssign = {
  "existing-photo": {
    kind: "image",
    expName: "existing-photo__replacement.png",
  },
};
const assignedPrompt = buildAiPrompt({ includeSource: false });
assert.match(assignedPrompt, /明示的に変更した画像／動画スロット/);
assert.match(assignedPrompt, /スロット `existing-photo`/);
assert.doesNotMatch(assignedPrompt, /スロット `untouched-photo`/);

promptModel.imgTouched = { "existing-photo": "cleared" };
promptModel.imgAssign = {};
const clearedPrompt = buildAiPrompt({ includeSource: false });
assert.match(clearedPrompt, /ユーザーが明示的にクリア/);
assert.doesNotMatch(clearedPrompt, /スロット `untouched-photo`/);

const clearModel = { imgTouched: { "existing-photo": "cleared" } };
const applyDcClearedSlots = new Function(
  "M",
  `${extract("function applyDcClearedSlots(html){", "function applyDcImgSlots")}; return applyDcClearedSlots;`,
)(clearModel);
const clearedDeck = applyDcClearedSlots(
  '<image-slot id="existing-photo" src="old.png" style="width:100%"></image-slot>' +
    '<div data-img-slot="untouched-photo" style="display:block"></div>',
);
assert.match(clearedDeck, /id="existing-photo"[^>]*display:none[^>]*data-cde-cleared="1"/);
assert.match(clearedDeck, /data-img-slot="untouched-photo" style="display:block"/);

let lastZip = null;
let downloadedName = "";
class FakeZip {
  constructor() {
    this.entries = new Map();
    lastZip = this;
  }

  file(name, value) {
    this.entries.set(name, value);
    return this;
  }

  folder(name) {
    return { file: (child, value) => this.file(`${name}/${child}`, value) };
  }

  async generateAsync() {
    return { fake: true };
  }
}

const bundleModel = {
  dcMode: true,
  dcPath: "project/deck.dc.html",
  dcSource: "OLD_DECK",
  jsxPath: null,
  files: new Map([
    ["project/deck.dc.html", { bytes: new Uint8Array([1]), mime: "text/html" }],
    ["project/assets/replaced.mp4", { bytes: new Uint8Array([9, 8, 7]), mime: "video/mp4" }],
  ]),
  comments: [],
  imgTouched: {},
  imgAssign: {},
  assetVin: {},
};
const exportBundle = new Function(
  "JSZip",
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
  "buildAiPrompt",
  "download",
  "log",
  "enc",
  `${extract("async function exportBundle(){", "async function exportZip")}; return exportBundle;`,
)(
  FakeZip,
  bundleModel,
  (value) => value.split("/").pop(),
  () => {},
  () => "EDITED_DECK",
  async () => ({ files: [], state: {} }),
  (value) => `${value}|STAGE`,
  (value) => `${value}|VINS`,
  (value) => `${value}|SLOTS`,
  (value) => `${value}|REFS`,
  () => {},
  () => false,
  () => 0,
  (options) => (options.includeSource === false ? "AUTHORITATIVE_INSTRUCTION" : "BAD_OPTIONS"),
  (_blob, name) => {
    downloadedName = name;
  },
  () => {},
  new TextEncoder(),
);

await exportBundle();
assert.ok(lastZip.entries.has("project/assets/replaced.mp4"));
assert.deepEqual(
  [...lastZip.entries.get("project/assets/replaced.mp4")],
  [9, 8, 7],
);
assert.equal(
  lastZip.entries.get("project/deck.dc.html"),
  "EDITED_DECK|SLOTS|VINS|STAGE|REFS",
);
assert.equal(lastZip.entries.get("deck_編集指示.md"), "AUTHORITATIVE_INSTRUCTION");
assert.equal(downloadedName, "deck_指示一式.zip");

console.log("PASS: v26 AI handoff preserves untouched slots and packages edited project assets");
