import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

const start = html.indexOf("const DC_LIVE_PNG_BRIDGE");
const end = html.indexOf("const DC_PNG_HARNESS", start);
assert.ok(start >= 0 && end > start, "Could not extract DC_LIVE_PNG_BRIDGE");
const bridge = html.slice(start, end);
const runStart = bridge.indexOf("async function run(");
assert.ok(runStart >= 0, "run() missing from live PNG bridge");
const run = bridge.slice(runStart);

const freezeAnim = bridge.indexOf("animFreeze=freezeAnimationStates(stage)");
const freezeVid = bridge.indexOf("await freezeVideo(videos[");
assert.ok(freezeAnim >= 0 && freezeVid >= 0, "PNG freeze steps missing");
assert.ok(
  freezeAnim < freezeVid,
  "Animation freeze must happen before videos are hidden, otherwise restore snapshots visibility:hidden",
);

const finallyStart = run.indexOf("finally{");
const restoreAnim = run.indexOf("animFreeze.restore()", finallyStart);
const unfreeze = run.indexOf("unfreezeVideo(", finallyStart);
assert.ok(restoreAnim >= 0 && unfreeze >= 0, "PNG restore steps missing");
assert.ok(
  restoreAnim < unfreeze,
  "Video unhide must run after animation-style restore so the preview cannot stay hidden",
);

assert.match(bridge, /function sampleHasPaint\(/);
assert.match(bridge, /function grabVideoPixels\(/);
assert.match(bridge, /function grabViaWebGL\(/);
assert.match(bridge, /function blitFrozenIfBlack\(/);
assert.match(bridge, /function canvasToImg\(/);
assert.match(bridge, /gl\.readPixels/);
assert.match(bridge, /createImageBitmap/);
assert.match(bridge, /VideoFrame/);
assert.match(bridge, /captureStream/);
assert.match(bridge, /window\.__cdeFit/);
assert.match(run, /freezeVideo\(videos\[i\],stage\)/);
assert.doesNotMatch(
  bridge,
  /im\.style\.filter='none'/,
  "Live PNG capture must keep CSS filters on the freeze overlay",
);

function restorePreview(order) {
  const video = { visibility: "hidden" };
  const snapshot = "visibility: hidden";
  function applySnapshot() {
    if (/visibility:\s*hidden/.test(snapshot)) video.visibility = "hidden";
  }
  if (order === "old") {
    video.visibility = "";
    applySnapshot();
  } else {
    applySnapshot();
    video.visibility = "";
  }
  return video.visibility;
}

assert.equal(restorePreview("old"), "hidden");
assert.equal(restorePreview("new"), "");
assert.match(html, /window\.__cdeFit=fit;/);
assert.match(html, /Creator Deck Editor 2 \(v30\)/);

console.log("PASS: v30 live PNG restore order hides videos only during capture");
