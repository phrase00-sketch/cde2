async function loadFile(file){
  if(WORKSPACE.loading||WORKSPACE.exporting)throw new Error("処理中です。完了してから開いてください。");
  const name=file.name.toLowerCase();if(!/\.(?:zip|html?)$/.test(name))throw new Error("対応拡張子は .zip / .html です");
  checkpointProject();const previous=M,oldCode=currentJsxText();WORKSPACE.loading=true;document.body.inert=true;
  clearTimeout(rebuildTimer);clearTimeout(WORKSPACE.timer);clearTimeout(WORKSPACE.saveTimer);
  const candidate=createProjectModel();candidate.baseSourceName=file.name;
  try{
    if(previous.scene!=null)try{await saveDraft();}catch(e){reportDraftError(e);if(WORKSPACE.revision!==WORKSPACE.savedRevision&&WORKSPACE.revision!==WORKSPACE.backupRevision)throw new Error("自動保存できないため切り替えを中止しました。作品ZIPを保存してから開いてください。");}
    const buf=new Uint8Array(await file.arrayBuffer());candidate.baseFingerprint=await sha256Hex(buf);
    // Keep the previous model and its URLs alive until the new package is valid.
    M=candidate;
    if(name.endsWith(".zip")){M.source="zip";await loadZip(buf);}
    else {const html=dec.decode(buf);if(isPlainDeck(html)){M.source="html";enterPlainDeck(html,file.name);}
      else if(isNativeDc(html)){M.source="html";enterDcMode(html,file.name);}
      else {M.source="bundle";await loadBundle(html);}}
    if(!M.scenes.length)throw new Error("編集できるデッキが見つかりませんでした");
    if(!M.dcMode&&M.scenes.some(sc=>!M.files.has(sc.jsxPath)))throw new Error("シーンのソースが不足しています");
    if(!Object.keys(M.baseFiles).length)await captureBaseFiles();
    if(!M.dcMode)restoreProjectMetadata();
    resetProjectUi();finishLoad(file.name);releaseProject(previous);initializeProjectHistory();
  }catch(e){releaseProject(candidate);M=previous;$("#code").value=oldCode;throw e;}
  finally{WORKSPACE.loading=false;document.body.inert=false;$("#file").value="";}
  if(M.dcMode&&!M.plainDeck)ensureDcRuntime(); // Cache only a successfully accepted package.
  saveDraft().catch(reportDraftError);
}

async function loadZip(bytes){
  if(!window.JSZip) throw new Error("JSZip が読み込めません（ネット接続を確認）");
  const zip=await JSZip.loadAsync(bytes);
  const entries=[];
  zip.forEach((p,e)=>{ if(!e.dir) entries.push(e); });
  for(const e of entries){
    const b=new Uint8Array(await e.async("uint8array"));
    M.files.set(e.name,{bytes:b, mime:mimeOf(e.name)});
  }
  // v27: CDE2がランタイム等を補う前の、元ZIPそのものの内容を基準として固定する。
  await captureBaseFiles();
  // Prefer the explicit entry of a CDE2 project over unrelated HTML files.
  for(const p of M.files.keys())if(/(^|\/)support\.js$/i.test(p)){M.supportPath=p;break;}
  const stateEntry=M.files.get(".cde2-project.json");
  const entry=stateEntry?JSON.parse(dec.decode(stateEntry.bytes)).deck:null;
  if(entry){const f=M.files.get(entry);if(!f)throw new Error("保存済みのデッキがありません: "+entry);
    const t=dec.decode(f.bytes);if(isNativeDc(t)){enterDcMode(t,entry);return;}if(isPlainDeck(t)){enterPlainDeck(t,entry);return;}}
  // support.js
  for(const p of M.files.keys()){ if(/(^|\/)support\.js$/i.test(p)){ M.supportPath=p; break; } }
  // v08: ネイティブ Claude Design 形式（インライン <x-dc> + <image-slot> 部品）を検出したら専用モードへ
  for(const p of M.files.keys()){ if(/\.dc\.html$/i.test(p)){ const t=dec.decode(M.files.get(p).bytes); if(isNativeDc(t)){ enterDcMode(t, p); return; } } }
  // 旧Claude Design：自己完結型のCSS/HTMLデッキ（support.js不要・<x-dc>なし）を検出したら専用モードへ
  for(const p of M.files.keys()){ if(/\.(dc\.)?html?$/i.test(p)){ const t=dec.decode(M.files.get(p).bytes); if(isPlainDeck(t)){ enterPlainDeck(t, p); return; } } }
  // scenes from *.dc.html
  for(const p of M.files.keys()){
    if(/\.dc\.html$/i.test(p)){
      const html=dec.decode(M.files.get(p).bytes);
      const sc=parseDcHtml(html, p); if(sc) M.scenes.push(sc);
    }
  }
  // fallback: if no dc.html, treat each jsx as a scene
  if(!M.scenes.length){
    for(const p of M.files.keys()){
      if(/\.jsx$/i.test(p)){ M.scenes.push({label:baseName(p), docHtml:null, compGlobal:guessGlobal(p), jsxPath:p}); }
    }
  }
}

// Parse a Claude Design .dc.html entry -> scene descriptor
function parseDcHtml(html, selfPath){
  const doc=new DOMParser().parseFromString(html,"text/html");
  const imp=doc.querySelector("x-import, dc-import");
  if(!imp) return null;
  const from=imp.getAttribute("from")||imp.getAttribute("src")||imp.getAttribute("import")||"";
  const comp=imp.getAttribute("component-from-global-scope")||imp.getAttribute("component")||imp.getAttribute("name")||guessGlobal(from);
  const jsxPath=resolvePath(selfPath, from);
  return {label:baseName(selfPath).replace(/\.dc\.html$/i,""), docHtml:html, compGlobal:comp, jsxPath};
}
function guessGlobal(p){ return baseName(p).replace(/\.(jsx|js)$/i,"").replace(/[^A-Za-z0-9_$]/g,""); }
function resolvePath(base, rel){
  rel=rel.replace(/^\.\//,"");
  if(M.files.has(rel)) return rel;
  // try relative to base dir
  const dir=base.includes("/")?base.replace(/\/[^\/]*$/,"/"):"";
  if(M.files.has(dir+rel)) return dir+rel;
  // try by basename
  const bn=baseName(rel);
  for(const p of M.files.keys()){ if(baseName(p)===bn) return p; }
  return rel;
}

// ---- Single-HTML bundle ----
async function loadBundle(html){
  const doc=new DOMParser().parseFromString(html,"text/html");
  const mEl=doc.querySelector('script[type="__bundler/manifest"]');
  const tEl=doc.querySelector('script[type="__bundler/template"]');
  const xEl=doc.querySelector('script[type="__bundler/ext_resources"]');
  if(!mEl||!tEl) throw new Error("この HTML は Claude Design のバンドル形式ではありません（manifest/template が見つかりません）");
  const manifest=JSON.parse(mEl.textContent);
  // v08: ext_resources は 配列 [{uuid,id}] または {page:[...]} オブジェクトのどちらもあり得るので両対応
  let ext=[]; if(xEl){ try{ ext=JSON.parse(xEl.textContent); }catch(_){ ext=[]; } }
  const idByUuid={}; const _addExt=(e)=>{ if(e&&e.uuid) idByUuid[e.uuid]=e.id; }; // uuid -> original path/id
  if(Array.isArray(ext)) ext.forEach(_addExt);
  else if(ext&&typeof ext==="object") for(const k of Object.keys(ext)){ const v=ext[k]; if(Array.isArray(v)) v.forEach(_addExt); else _addExt(v); }
  // decode every resource (gunzip if needed)
  const decoded={}; // uuid -> Uint8Array
  for(const uuid of Object.keys(manifest)){
    const ent=manifest[uuid];
    let u8=b64ToU8(ent.data);
    if(ent.compressed) u8=await gunzip(u8);
    decoded[uuid]={bytes:u8, mime:ent.mime||"application/octet-stream"};
  }
  // register as files, keyed by original id (path) when known
  for(const uuid of Object.keys(decoded)){
    const d=decoded[uuid];
    let path=idByUuid[uuid] || (uuid+guessExt(d.mime));
    path=path.replace(/^\.?\//,"");
    M.files.set(path,{bytes:d.bytes, mime:d.mime});
  }
  // support.js + jsx detection by content signature
  for(const [p,f] of M.files){
    const head = looksText(f.mime)? dec.decode(f.bytes.subarray(0,400)) : "";
    if(!M.supportPath && /dc-runtime|GENERATED from dc-runtime/.test(head)) M.supportPath=p;
  }
  // template -> scene doc(s)
  const template=JSON.parse(tEl.textContent);
  // v08: template は 文字列 or {pages,entry} 形式。どちらからもネイティブ dc を取り出して判定
  {
    let _dcHtml = (typeof template==="string") ? template : (template && template.pages ? (template.pages[template.entry] || template.pages[Object.keys(template.pages)[0]]) : null);
    if(_dcHtml && isNativeDc(_dcHtml)){
      // アセット参照の UUID を元パスへ復元（support.js / image-slot.js / uploads を解決するため）
      for(const uuid in idByUuid){ const path=String(idByUuid[uuid]||"").replace(/^\.?\//,""); if(!path) continue; _dcHtml=_dcHtml.split(uuid).join(path); }
      // ext_resources が空（オブジェクト/空配列）のバンドルでは manifest の uuid を生成パス（uuid+ext）へ復元して M.files と一致させる
      for(const uuid of Object.keys(manifest)){ if(idByUuid[uuid]) continue; const path=(uuid+guessExt((manifest[uuid]&&manifest[uuid].mime)||"")).replace(/^\.?\//,""); _dcHtml=_dcHtml.split(uuid).join(path); }
      enterDcMode(_dcHtml, "(bundle)"); return;
    }
  }
  const tdoc=new DOMParser().parseFromString(template,"text/html");
  const imp=tdoc.querySelector("x-import, dc-import");
  let jsxPath=null, comp=null;
  if(imp){
    const from=(imp.getAttribute("from")||imp.getAttribute("src")||"").replace(/^\.?\//,"");
    comp=imp.getAttribute("component-from-global-scope")||imp.getAttribute("component")||"";
    // 'from' may be a uuid; map via idByUuid reverse or direct file
    jsxPath = idByUuid[from] ? idByUuid[from].replace(/^\.?\//,"") : (M.files.has(from)?from:null);
  }
  if(!jsxPath){ // detect a jsx-looking file
    for(const [p,f] of M.files){ if(looksText(f.mime)){ const h=dec.decode(f.bytes.subarray(0,300)); if(/@ds-adherence-ignore|<Stage|function .*\(|=>/.test(h) && p!==M.supportPath && !/__bundler/.test(p)){ if(/\.jsx$|video/i.test(p)||/Stage|Sprite/.test(dec.decode(f.bytes.subarray(0,2000)))){ jsxPath=p; break; } } } }
  }
  if(jsxPath){
    if(!comp) comp=guessGlobal(jsxPath);
    M.scenes.push({label:baseName(jsxPath), docHtml:template, compGlobal:comp, jsxPath});
  } else {
    throw new Error("バンドルから JSX 本体を特定できませんでした。ZIP 版でお試しください。");
  }
}
function guessExt(mime){ for(const k in MIME){ if(MIME[k]===mime) return "."+k; } return ".bin"; }
function looksText(mime){ return /text|javascript|json|jsx|xml|svg/.test(mime); }
async function gunzip(u8){
  if(typeof DecompressionStream==="undefined") throw new Error("このブラウザは gzip 展開に未対応です");
  const ds=new DecompressionStream("gzip");
  const w=ds.writable.getWriter(); w.write(u8); w.close();
  const r=ds.readable.getReader(); const chunks=[]; let n=0;
  for(;;){ const {done,value}=await r.read(); if(done) break; chunks.push(value); n+=value.length; }
  const out=new Uint8Array(n); let o=0; for(const c of chunks){ out.set(c,o); o+=c.length; } return out;
}

// ============================================================
// After load
// ============================================================
function finishLoad(fname,sceneIndex=0){
  if(!M.scenes.length) throw new Error("編集可能なシーン（x-dc / jsx）が見つかりませんでした");
  $("#srcPill").textContent = (M.source==="zip"?"ZIP: ":"HTML: ")+fname;
  const sel=$("#sceneSel");
  sel.innerHTML=""; M.scenes.forEach((s,i)=>{ const o=document.createElement("option"); o.value=i; o.textContent=s.label; sel.appendChild(o); });
  sel.style.display = M.scenes.length>1?"":"none";
  selectScene(sceneIndex);
  $("#drop").classList.add("hide");
  ["reload","expZip","expHtml"].forEach(id=>$("#"+id).disabled=false);
  updatePngCaptureButton();
  { const _pm=$("#previewFitMode"); if(_pm){ _pm.disabled=!M.dcMode; _pm.value=M.previewFitMode||"contain"; } }
  { const _m=$("#expRemotion"); if(_m) _m.disabled=!M.dcMode || M.plainDeck; const _vi=$("#vidId"); if(_vi){ _vi.disabled=!M.dcMode; if(M.dcMode && !_vi.value){ _vi.value=_proposeVidId(); } } }
  renderAssets();
  log(`読み込み完了：${M.files.size} ファイル、${M.scenes.length} シーン。support.js=${M.supportPath||"(なし)"}`);
}
function selectScene(i){
  if(M.scene!=null&&!M.dcMode)commitJsx();M.scene=i; const s=M.scenes[i];
  if(M.dcMode){ $("#code").value=M.dcSource; $("#compName").textContent="Claude Design（ネイティブ .dc.html）"; buildPreview(); if($("#textPane").classList.contains("active")) renderTextEditor(); return; }
  M.jsxPath=s.jsxPath;
  $("#compName").textContent=s.compGlobal+"  ←  "+baseName(s.jsxPath);
  const f=M.files.get(s.jsxPath);
  $("#code").value = f? dec.decode(f.bytes) : "// JSX が見つかりません: "+s.jsxPath;
  buildPreview();
  if($("#textPane").classList.contains("active")) renderTextEditor();
}

// ============================================================
// Preview (iframe) — 本番と同じ support.js で描画
// ============================================================
let rebuildTimer=null;
function scheduleRebuild(){ projectChanged();clearTimeout(rebuildTimer); rebuildTimer=setTimeout(buildPreview, 650); }

function currentJsxText(){ return $("#code").value; }

// プレビュー iframe 内のエラー/コンソールを親へ転送し、画面にも表示する診断スクリプト
