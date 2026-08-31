import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const start = html.indexOf("function _cdeModuleNorm");
const end = html.indexOf("function buildPlayerBridge", start);
assert.ok(start >= 0 && end > start, "Could not extract v33 x-import helpers");

const enc = new TextEncoder();
const dec = new TextDecoder();
const M = {
  dcPath: "pkg/deck.dc.html",
  files: new Map(),
  moduleBlobUrl: new Map(),
};
for (const name of [
  "pkg/animations-v3.jsx",
  "pkg/titanic-hook.jsx",
  "pkg/sub/widget.tsx",
  "pkg/classic.js",
]) {
  M.files.set(name, { bytes: enc.encode(`// ${name}`), mime: "text/javascript" });
}

const u8ToB64 = (bytes) => Buffer.from(bytes).toString("base64");
const assetDataUrl = (name) => {
  const file = M.files.get(name);
  return file ? `data:${file.mime};base64,${u8ToB64(file.bytes)}` : null;
};
const blobFor = (name) => `blob:cde2/${name}`;
const revokeModuleUrls = () => {};
const fakeUrl = { createObjectURL() { throw new Error("unexpected module Blob URL"); }, revokeObjectURL() {} };

const api = new Function(
  "M", "dec", "enc", "u8ToB64", "assetDataUrl", "blobFor", "URL", "Blob", "revokeModuleUrls",
  `${html.slice(start, end)}; return {_cdeRewriteLocalXImports};`,
)(M, dec, enc, u8ToB64, assetDataUrl, blobFor, fakeUrl, Blob, revokeModuleUrls);

const deck = `
<x-dc>
  <x-import component-from-global-scope="TitanicHook"
    from="./animations-v3.jsx ./titanic-hook?rev=2 ./sub/widget.tsx?cache=1#hero https://cdn.example/external.jsx blob:already-loaded#component.jsx ./classic.js">
  </x-import>
</x-dc>`;

const preview = api._cdeRewriteLocalXImports(deck, false);
assert.match(preview, /blob:cde2\/pkg\/animations-v3\.jsx#pkg%2Fanimations-v3\.jsx/);
assert.match(preview, /blob:cde2\/pkg\/titanic-hook\.jsx#pkg%2Ftitanic-hook\.jsx/);
assert.match(preview, /blob:cde2\/pkg\/sub\/widget\.tsx#pkg%2Fsub%2Fwidget\.tsx/);
assert.match(preview, /https:\/\/cdn\.example\/external\.jsx/);
assert.match(preview, /blob:already-loaded#component\.jsx/);
assert.match(preview, /\.\/classic\.js/);
assert.doesNotMatch(preview, /\.\/animations-v3\.jsx|\.\/titanic-hook\?rev=2|\.\/sub\/widget\.tsx/);

const exported = api._cdeRewriteLocalXImports(deck, true);
const dataUrls = exported.match(/data:text\/javascript;base64,[^\s"]+/g) || [];
assert.equal(dataUrls.length, 3, "every local JSX/TSX source must become its own data URL");
assert.ok(dataUrls.some((url) => url.endsWith("#pkg%2Fanimations-v3.jsx")));
assert.ok(dataUrls.some((url) => url.endsWith("#pkg%2Ftitanic-hook.jsx")));
assert.ok(dataUrls.some((url) => url.endsWith("#pkg%2Fsub%2Fwidget.tsx")));

const graphCall = html.indexOf("const moduleGraph=_cdePrepareModuleGraph(html,forExport)");
const jsxCall = html.indexOf("html=_cdeRewriteLocalXImports(html,forExport)", graphCall);
const assetCall = html.indexOf("rewriteAssetRefs", jsxCall);
assert.ok(graphCall >= 0 && jsxCall > graphCall && assetCall > jsxCall, "JSX rewriting must run after module-graph preparation and before general asset rewriting");
assert.match(html, /data-om-seek-to-time-frame/);
assert.match(html, /detail:\{time:t,playing:run,sync:!run&&ready\}/);
assert.match(html, /A\.addEventListener\(ev,syncFromAudio\)/);
assert.match(html, /_audPost\("seek", _t\)/);
assert.doesNotMatch(html, /_audPost\("seekFrac", _fr\)/, "the second-based CDE2 slider must seek with an absolute time");
assert.doesNotMatch(html, /\[CDE2 om-seek\]/, "diagnostic seek logging must not ship");
assert.match(html, /Creator Deck Editor 2 \(v34\)/);

console.log("PASS: v33 rewrites multiple local JSX/TSX sources and keeps CompositionStage seek sync event-driven");
