import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const start = html.indexOf("function download(blob, name){");
const end = html.indexOf("// ===== MP4", start);
assert.ok(start >= 0 && end > start, "Could not extract download()");

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(value) { this.values.add(value); }
  remove(value) { this.values.delete(value); }
  contains(value) { return this.values.has(value); }
}

class FakeElement {
  constructor(tag) {
    this.tagName = tag.toUpperCase();
    this.children = [];
    this.classList = new FakeClassList();
    this.style = {};
    this.clicked = false;
    this.parent = null;
  }
  appendChild(child) { child.parent = this; this.children.push(child); return child; }
  append(...children) { children.forEach((child) => this.appendChild(child)); }
  click() { this.clicked = true; }
  remove() {
    if (!this.parent) return;
    this.parent.children = this.parent.children.filter((child) => child !== this);
    this.parent = null;
  }
}

const tray = new FakeElement("div");
const body = new FakeElement("body");
const created = [];
const revoked = [];
const timers = [];
const written = [];
let pickerName = null;
const document = {
  body,
  createElement(tag) { const element = new FakeElement(tag); created.push(element); return element; },
};
const fakeUrl = {
  createObjectURL() { return "blob:cde2-v31"; },
  revokeObjectURL(value) { revoked.push(value); },
};
const fakeSetTimeout = (callback, delay) => { timers.push({ callback, delay }); return timers.length; };
const fakeClearTimeout = () => {};
const fakeWindow = {
  location: { protocol: "file:" },
  async showSaveFilePicker({ suggestedName }) {
    pickerName = suggestedName;
    return {
      async createWritable() {
        return {
          async write(blob) { written.push(blob); },
          async close() {},
        };
      },
    };
  },
};
const download = new Function(
  "$",
  "URL",
  "document",
  "setTimeout",
  "clearTimeout",
  "window",
  "location",
  "log",
  `${html.slice(start, end)}; return download;`,
)(
  (selector) => selector === "#downloadTray" ? tray : null,
  fakeUrl,
  document,
  fakeSetTimeout,
  fakeClearTimeout,
  fakeWindow,
  fakeWindow.location,
  () => {},
);

const generatedBlob = { size: 10_327_680 };
download(generatedBlob, "renderer2.zip");
assert.equal(created[0].clicked, true, "automatic download attempt must remain");
assert.equal(tray.children.length, 1, "save-again row must remain visible");
assert.equal(tray.classList.contains("show"), true);
const [row] = tray.children;
const [link, size, close] = row.children;
assert.equal(link.href, "blob:cde2-v31");
assert.equal(link.download, "renderer2.zip");
assert.match(link.textContent, /renderer2\.zip.*保存/);
assert.equal(size.textContent, "10.3 MB");
assert.ok(timers.some(({ delay }) => delay === 30 * 60 * 1000));
assert.deepEqual(revoked, [], "blob URL must not be revoked before manual retry");

let prevented = false;
await link.onclick({ preventDefault() { prevented = true; } });
assert.equal(prevented, true, "file:// retry must use the native Save As picker");
assert.equal(pickerName, "renderer2.zip");
assert.deepEqual(written, [generatedBlob]);

close.onclick();
assert.equal(tray.children.length, 0);
assert.equal(tray.classList.contains("show"), false);
assert.deepEqual(revoked, ["blob:cde2-v31"]);

console.log("PASS: v31 keeps a manual save link after the automatic download attempt");
