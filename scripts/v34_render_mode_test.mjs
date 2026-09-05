import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync(new URL("../index.html", import.meta.url), "utf8");
const start = html.indexOf("function detectRenderMode(){");
const end = html.indexOf("function stampRenderMode", start);
assert.ok(start >= 0 && end > start, "Could not extract render-mode detector");
const detector = html.slice(start, end);

function detect(dcSource, files) {
  const context = {
    M: {
      dcSource,
      supportPath: "support.js",
      imgSlotPath: "image-slot.js",
      files: new Map(Object.entries(files).map(([path, source]) => [
        path,
        { bytes: new TextEncoder().encode(source) },
      ])),
    },
    dec: new TextDecoder(),
    result: null,
  };
  vm.runInNewContext(`${detector}\nresult = detectRenderMode();`, context);
  return context.result;
}

const moduleOnly = detect("<x-dc></x-dc>", {
  "support.js": "canvas.getContext('webgl')", // packaged runtime must be ignored
  "src/stage.mjs": "const gl = canvas.getContext('webgl2');",
});
assert.equal(moduleOnly.vt, true);
assert.ok(moduleOnly.reasons.includes("getcontext"));

const tsxOnly = detect("<x-dc></x-dc>", {
  "src/composition.tsx": "export const Stage = () => <canvas />;",
});
assert.equal(tsxOnly.vt, true);
assert.ok(tsxOnly.reasons.includes("<canvas"));

const cssOnly = detect("<x-dc><style>@keyframes fade{to{opacity:1}}</style></x-dc>", {
  "src/scene.jsx": "export const Scene = () => <div className='title'>Title</div>;",
});
assert.equal(cssOnly.vt, false);

assert.match(html, /Creator Deck Editor 2 \(v35\)/);
console.log("PASS: v34 scans packaged JS/MJS/JSX/TSX sources for renderer mode");
