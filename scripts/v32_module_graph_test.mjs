import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const start = html.indexOf("function _cdeModuleNorm");
const end = html.indexOf("function buildPlayerBridge", start);
assert.ok(start >= 0 && end > start, "Could not extract v32 module graph helpers");

const enc = new TextEncoder();
const dec = new TextDecoder();
const M = {
  dcPath: "pkg/deck.dc.html",
  files: new Map(),
  moduleBlobUrl: new Map(),
};
function put(name, text, mime = "text/javascript") {
  M.files.set(name, { bytes: enc.encode(text), mime });
}
put("pkg/entry.js", `
(function(){
  async function boot(){
    const mod = await import("./lib/a.js?cache=1");
    await fetch("./data.json");
    return mod.a;
  }
  window.bootGraph = boot;
})();
`);
put("pkg/component.mjs", `
import { a } from "./lib/a.js";
export default function Component(){ return a; }
`);
put("pkg/lib/a.js", `
import { b } from "./b.js";
export const a = b + 1;
`);
put("pkg/lib/b.js", `
import { a } from "./a.js";
export const b = typeof a === "number" ? a : 1;
`);
put("pkg/data.json", `{"ok":true}`, "application/json");

const u8ToB64 = (bytes) => Buffer.from(bytes).toString("base64");
const assetDataUrl = (name) => {
  const file = M.files.get(name);
  return file ? `data:${file.mime};base64,${u8ToB64(file.bytes)}` : null;
};
const blobFor = () => { throw new Error("forExport test must not request Blob URLs"); };
const fakeUrl = { createObjectURL() { throw new Error("unexpected preview URL"); }, revokeObjectURL() {} };
const revokeModuleUrls = () => {};

const api = new Function(
  "M", "dec", "enc", "u8ToB64", "assetDataUrl", "blobFor", "URL", "Blob", "revokeModuleUrls",
  `${html.slice(start, end)}; return {_cdePrepareModuleGraph};`,
)(M, dec, enc, u8ToB64, assetDataUrl, blobFor, fakeUrl, Blob, revokeModuleUrls);

const deck = `
<x-dc>
  <x-import component-from-global-scope="graph-stage" from="./entry.js?v=14"></x-import>
  <script src="./component.mjs?build=2" type="module"></script>
  <script type="module">import { b } from "./lib/b.js"; window.inlineB = b;</script>
</x-dc>`;
const graph = api._cdePrepareModuleGraph(deck, true);

assert.equal(graph.count, 4, "entry, component, and the two cyclic dependencies must be emitted once");
assert.deepEqual(graph.paths, [
  "pkg/component.mjs",
  "pkg/entry.js",
  "pkg/lib/a.js",
  "pkg/lib/b.js",
]);
assert.doesNotMatch(graph.html, /entry\.js\?v=14|component\.mjs\?build=2/);
assert.match(graph.html, /from="data:text\/javascript;base64,/);
assert.match(graph.html, /<script src="data:text\/javascript;base64,[^"]+" type="module">/);
assert.match(graph.html, /<script type="module">import \{ b \} from "@cde\/m3"/);

const mapMatch = /<script type="importmap">([\s\S]+)<\/script>/.exec(graph.importMap);
assert.ok(mapMatch, "import map must be injected before module execution");
const importMap = JSON.parse(mapMatch[1]);
assert.deepEqual(Object.keys(importMap.imports), ["@cde/m0", "@cde/m1", "@cde/m2", "@cde/m3"]);

const decodeDataModule = (url) => Buffer.from(url.split(",", 2)[1].split("#", 1)[0], "base64").toString("utf8");
const modules = Object.values(importMap.imports).map(decodeDataModule);
assert.ok(modules.some((code) => code.includes('import("@cde/m2")')), "query-suffixed dynamic import must resolve to a bare graph id");
assert.ok(modules.some((code) => code.includes('from "@cde/m3"')), "first side of the cycle must be rewritten");
assert.ok(modules.some((code) => code.includes('from "@cde/m2"')), "second side of the cycle must be rewritten");
assert.ok(modules.some((code) => code.includes("data:application/json;base64,")), "relative non-module assets must become self-contained data URLs");

const launcherMatch = /<script src="(data:text\/javascript;base64,[^"]+)" type="module">/.exec(graph.html);
assert.ok(launcherMatch, "module script must point at a transformed data module");

console.log("PASS: v32 resolves query strings, nested modules, cycles, module scripts, and relative assets");
