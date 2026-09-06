function _aiBaseName(){ return (M.dcMode ? ((M.dcPath&&M.dcPath!=="(bundle)")?baseName(M.dcPath).replace(/(?:\.dc)?\.html$/i,""):"") : baseName(M.jsxPath||"").replace(/\.[^.]+$/,"") )||"cde2"; }
function _aiJsonBytes(v){ return enc.encode(JSON.stringify(v,null,2)); }
function _aiSidecarPath(rx,fallback){ for(const p of M.files.keys()){ if(rx.test(p)) return p; } return fallback; }
async function buildAiProjectSnapshot(handoffMode){return buildProjectSnapshot(handoffMode);}
async function buildProjectSnapshot(handoffMode){
  commitJsx();
  const base=_aiBaseName(),files=new Map();
  let deckIncluded="",deckText="",deckDir="",slotPack={files:[],state:{}};
  try{
    if(M.dcMode){
      M.dcSource=currentJsxText()||M.dcSource||"";
      deckIncluded=((M.dcPath&&M.dcPath!=="(bundle)")?M.dcPath:(base+".dc.html"))||(base+".dc.html");
      deckDir=deckIncluded.indexOf("/")>=0?deckIncluded.replace(/\/[^\/]*$/,"/"):"";
      slotPack=await _prepareZipSlotAssets(deckDir);
      deckText=stampCanonicalStage(applyAssetVideoVins(applyDcImgSlots(M.dcSource,true)));
      deckText=rewriteAssetVideoRefsZip(deckText,deckDir);
    }else{ deckIncluded=M.jsxPath||(base+".jsx"); deckText=currentJsxText()||""; }
    for(const [p,f] of M.files){
      if(p===deckIncluded||p===M.dcPath||p===M.jsxPath) continue;
      if(/(^|\/)\.(?:image-slots|asset-video-vin)\.state\.json$/i.test(p)) continue;
      files.set(p,{bytes:f.bytes,mime:f.mime||mimeOf(p)});
    }
    slotPack.files.forEach(function(f){files.set(f.path,{bytes:f.bytes,mime:mimeOf(f.path)});});
    const slotStatePath=_aiSidecarPath(/(^|\/)\.image-slots\.state\.json$/i,".image-slots.state.json");
    if(Object.keys(slotPack.state||{}).length) files.set(slotStatePath,{bytes:_aiJsonBytes(slotPack.state),mime:"application/json"});
    const av={}; for(const p in (M.assetVin||{})){ if(_isVideoAsset(p)) av[p]={vin:_vinRound(M.assetVin[p]&&M.assetVin[p].vin)}; }
    const avStatePath=_aiSidecarPath(/(^|\/)\.asset-video-vin\.state\.json$/i,".asset-video-vin.state.json");
    if(Object.keys(av).length) files.set(avStatePath,{bytes:_aiJsonBytes(av),mime:"application/json"});
    files.set(deckIncluded,{bytes:enc.encode(deckText),mime:M.dcMode?"text/html":"text/jsx"});
    await addProjectState(files,deckIncluded);
    const instructionPath=base+"_編集指示.md";
    files.set(instructionPath,{bytes:enc.encode(buildAiPrompt({includeSource:false,handoffMode:handoffMode})),mime:"text/markdown"});
    const slotChanges=discoverImgSlots().filter(function(s){return !!(M.imgTouched&&M.imgTouched[s.id]);}).map(function(s){
      const a=M.imgAssign&&M.imgAssign[s.id],action=M.imgTouched[s.id];
      return {id:s.id,label:s.label,action:action,kind:a&&a.kind||null,path:a&&(a._zipPath||a.assetPath)||null,vin:a&&a.kind==="video"?_vinRound(a.vin):null};
    });
    return {base:base,files:files,deckIncluded:deckIncluded,deckText:deckText,deckDir:deckDir,instructionPath:instructionPath,slotChanges:slotChanges,videoInpoints:av};
  }finally{ _clearZipSlotAssets(); }
}
async function _addAiAttachments(files){
  let count=0;
  for(const c of M.comments){ if(!c.atts) continue; for(const a of c.atts){ try{ const b=new Uint8Array(await a.file.arrayBuffer()); files.set("添付/"+a.expName,{bytes:b,mime:a.file.type||mimeOf(a.expName)}); count++; }catch(_){} } }
  return count;
}
async function _describeAiFiles(files){
  const rows=await Promise.all(Array.from(files.entries()).map(async function(kv){return {path:kv[0],sha256:await sha256Hex(kv[1].bytes),size:kv[1].bytes.length};}));
  rows.sort(function(a,b){return a.path.localeCompare(b.path);}); return rows;
}
function _aiBaseManifest(mode,snap,deckDesc){
  return {schema:"cde2.ai-handoff/v1",cde2Version:CDE2_VERSION,createdAt:new Date().toISOString(),mode:mode,base:{sourceFileName:M.baseSourceName||null,sha256:M.baseFingerprint||null,files:M.baseFiles||{}},authoritativeEditedDeck:deckDesc,slotChanges:snap.slotChanges,videoInpoints:snap.videoInpoints,rules:["The edited deck bundled in this handoff is authoritative.","Never delete unspecified files or slots.","Preserve unrelated user edits.","Return one complete project ZIP after applying the requested comments."]};
}
async function exportDeltaBundle(){
  try{
    if(typeof JSZip==="undefined") throw new Error("ZIPライブラリが見つかりません");
    if(M.source!=="zip") throw new Error("AI用差分ZIPは、元のZIPをCDE2へ読み込んだ場合に使えます。HTMLを開いた場合は完全版ZIPを使ってください");
    if(!M.baseFingerprint||!Object.keys(M.baseFiles||{}).length) throw new Error("元ZIPの指紋を確認できません。元ZIPを読み込み直してください");
    log("AI用差分ZIPを作成中です…");
    const snap=await buildAiProjectSnapshot("delta"),attCount=await _addAiAttachments(snap.files);
    const desc=await _describeAiFiles(snap.files),byPath={}; desc.forEach(function(d){byPath[d.path]=d;});
    const deckDesc=byPath[snap.deckIncluded],changed=[],unchanged=[];
    desc.forEach(function(d){ const old=M.baseFiles[d.path]||null,status=!old?"added":((old.sha256!==d.sha256||old.size!==d.size)?"changed":"unchanged"),row={path:d.path,status:status,old:old,new:{sha256:d.sha256,size:d.size}}; if(status==="unchanged")unchanged.push({path:d.path,sha256:d.sha256,size:d.size});else changed.push(row); });
    const oldDeck=M.baseFiles[snap.deckIncluded]||null;
    const manifest=_aiBaseManifest("delta",snap,{path:snap.deckIncluded,sha256:deckDesc.sha256,size:deckDesc.size,status:!oldDeck?"added":(oldDeck.sha256===deckDesc.sha256&&oldDeck.size===deckDesc.size?"unchanged":"changed")});
    manifest.changedFiles=changed; manifest.unchangedRequiredFiles=unchanged; manifest.deletedFiles=[];
    manifest.apply={requiredBaseSha256:M.baseFingerprint,overlayPaths:changed.map(function(x){return x.path;}).concat(changed.some(function(x){return x.path===snap.deckIncluded;})?[]:[snap.deckIncluded]),stopOnBaseMismatch:true};
    const zip=new JSZip(); let payloadCount=0;
    desc.forEach(function(d){ const old=M.baseFiles[d.path]; if(d.path===snap.deckIncluded||!old||old.sha256!==d.sha256||old.size!==d.size){zip.file(d.path,snap.files.get(d.path).bytes);payloadCount++;} });
    zip.file("cde2-handoff-manifest.json",_aiJsonBytes(manifest));
    const blob=await zip.generateAsync({type:"blob",compression:"DEFLATE"});
    if(blob.size>19000000) throw new Error("差分ZIPが19MBを超えました（"+(blob.size/1000000).toFixed(1)+"MB）。受け渡しサイズの上限を超えるため「完全版ZIP（18MB分割）」を使ってください");
    download(blob,snap.base+"_AI差分.zip");
    log("✅ AI用差分ZIPを書き出しました（"+(blob.size/1000000).toFixed(1)+"MB／差分"+payloadCount+"ファイル／添付"+attCount+"件）。元ZIP「"+M.baseSourceName+"」とこの差分ZIPの2つをAIへ渡してください。");
  }catch(e){ log("AI用差分ZIPの書き出しに失敗: "+((e&&e.message)||e),true); }
}
async function exportFullSplitBundles(){
  const LIMIT=18*1024*1024,RESERVE=128*1024,USABLE=LIMIT-RESERVE;
  try{
    if(typeof JSZip==="undefined") throw new Error("ZIPライブラリが見つかりません");
    log("完全版を18MB以下のZIPへ分割中です…");
    const snap=await buildAiProjectSnapshot("full-split"),attCount=await _addAiAttachments(snap.files);
    let desc=await _describeAiFiles(snap.files),byPath={}; desc.forEach(function(d){byPath[d.path]=d;});
    const deckDesc=byPath[snap.deckIncluded],handoff=_aiBaseManifest("full-split",snap,{path:snap.deckIncluded,sha256:deckDesc.sha256,size:deckDesc.size,status:"authoritative"});
    handoff.projectFiles=desc; snap.files.set("cde2-handoff-manifest.json",{bytes:_aiJsonBytes(handoff),mime:"application/json"});
    const entries=Array.from(snap.files.entries()).map(function(kv){return {path:kv[0],bytes:kv[1].bytes,size:kv[1].bytes.length};}),tooLarge=entries.filter(function(e){return e.size>USABLE;});
    if(tooLarge.length) throw new Error("1ファイルで安全上限を超えるため分割できません: "+tooLarge.map(function(e){return e.path+" ("+(e.size/1000000).toFixed(1)+"MB)";}).join(", "));
    const firstPaths={}; firstPaths[snap.deckIncluded]=1; firstPaths[snap.instructionPath]=1; firstPaths["cde2-handoff-manifest.json"]=1;
    const first=entries.filter(function(e){return firstPaths[e.path];}),rest=entries.filter(function(e){return !firstPaths[e.path];}),bins=[{files:first.slice(),size:first.reduce(function(n,e){return n+e.size;},0)}];
    if(bins[0].size>USABLE) throw new Error("編集済み本体と指示だけで分割上限を超えます");
    function place(e){for(const b of bins){if(b.size+e.size<=USABLE){b.files.push(e);b.size+=e.size;return;}}bins.push({files:[e],size:e.size});}
    rest.filter(function(e){return !/\.(?:mp4|webm|mov|mkv|avi|wav|mp3|m4a|aac|ogg|flac)$/i.test(e.path);}).sort(function(a,b){return b.size-a.size;}).forEach(place);
    rest.filter(function(e){return /\.(?:mp4|webm|mov|mkv|avi|wav|mp3|m4a|aac|ogg|flac)$/i.test(e.path);}).sort(function(a,b){return b.size-a.size;}).forEach(place);
    const total=bins.length,pad=String(total).length,partNames=bins.map(function(_,i){return snap.base+"_完全版_"+String(i+1).padStart(pad,"0")+"of"+String(total).padStart(pad,"0")+".zip";});
    const partsManifest={schema:"cde2.full-split/v1",cde2Version:CDE2_VERSION,mode:"full-split",partCount:total,maxRawBytesPerZip:LIMIT,baseSourceName:M.baseSourceName||null,baseSha256:M.baseFingerprint||null,authoritativeDeck:snap.deckIncluded,instructions:["Attach every ZIP part.","Extract all parts and merge their contents while preserving paths.","Verify every listed file before editing.","Return one complete project ZIP."],parts:bins.map(function(b,i){return {index:i+1,fileName:partNames[i],rawFileBytes:b.size,files:b.files.map(function(e){return e.path;})};})};
    const pmBytes=_aiJsonBytes(partsManifest),outputs=[];
    for(let i=0;i<bins.length;i++){
      if(bins[i].size+pmBytes.length>LIMIT) throw new Error("分割manifestを含めると18MBを超えるパートがあります");
      const zip=new JSZip(); bins[i].files.forEach(function(e){zip.file(e.path,e.bytes);}); zip.file("cde2-parts-manifest.json",pmBytes);
      const blob=await zip.generateAsync({type:"blob",compression:"DEFLATE"}); if(blob.size>20000000) throw new Error(partNames[i]+" が20MBを超えました"); outputs.push({blob:blob,name:partNames[i]});
    }
    for(let i=0;i<outputs.length;i++){download(outputs[i].blob,outputs[i].name);if(i+1<outputs.length)await new Promise(function(resolve){setTimeout(resolve,250);});}
    log("✅ 完全版を"+outputs.length+"個の通常ZIPへ分割しました（各18MB以下／添付"+attCount+"件）。全パートをAIへ渡してください。複数ダウンロードの許可を求められた場合は許可してください。");
  }catch(e){ log("完全版分割ZIPの書き出しに失敗: "+((e&&e.message)||e),true); }
}
async function exportBundle(){ return exportDeltaBundle(); }
async function exportFullBundleLegacyV26(){
  try{
    if(typeof JSZip==="undefined"){ log("ZIPライブラリが見つかりません。", true); return; }
    const base=_aiBaseName();
    const zip=new JSZip();
    // AIへの指示・本体・素材を、同じ「出力直前の最新編集状態」から自己完結ZIPとして作る。
    commitJsx();
    let deckIncluded="", deckText="", projectCount=0, slotPack={files:[],state:{}}, deckDir="";
    try{
      if(M.dcMode){
        M.dcSource=currentJsxText()||M.dcSource||"";
        deckIncluded=((M.dcPath&&M.dcPath!=="(bundle)")?M.dcPath:(base+".dc.html"))||(base+".dc.html");
        deckDir=deckIncluded.indexOf("/")>=0?deckIncluded.replace(/\/[^\/]*$/,"/"):"";
        slotPack=await _prepareZipSlotAssets(deckDir);
        deckText=stampCanonicalStage(applyAssetVideoVins(applyDcImgSlots(M.dcSource,true)));
        deckText=rewriteAssetVideoRefsZip(deckText,deckDir);
      }else{
        deckIncluded=M.jsxPath||(base+".jsx");
        deckText=currentJsxText()||"";
      }
      for(const [p,f] of M.files){
        if(p===deckIncluded||p===M.dcPath||p===M.jsxPath) continue;
        if(/(^|\/)\.(?:image-slots|asset-video-vin)\.state\.json$/i.test(p)) continue;
        zip.file(p,f.bytes); projectCount++;
      }
      slotPack.files.forEach(function(f){zip.file(f.path,f.bytes);projectCount++;});
      if(Object.keys(slotPack.state||{}).length) zip.file(".image-slots.state.json",JSON.stringify(slotPack.state));
      const av={}; for(const p in (M.assetVin||{})){ if(_isVideoAsset(p)) av[p]={vin:_vinRound(M.assetVin[p]&&M.assetVin[p].vin)}; }
      if(Object.keys(av).length) zip.file(".asset-video-vin.state.json",JSON.stringify(av));
      zip.file(deckIncluded,deckText); projectCount++;
    }finally{ _clearZipSlotAssets(); }
    zip.file(base+"_編集指示.md", buildAiPrompt({includeSource:false}));
    let count=0; const folder=zip.folder("添付");
    for(const c of M.comments){ if(!c.atts) continue; for(const a of c.atts){ try{ const buf=await a.file.arrayBuffer(); folder.file(a.expName, buf); count++; }catch(_){} } }
    const imgFolder=zip.folder("画像"); let imgCount=0;
    for(const id in (M.imgTouched||{})){ if(M.imgTouched[id]!=="assigned") continue; const a=M.imgAssign[id]; if(!a) continue; try{ const buf=await a.file.arrayBuffer(); imgFolder.file(a.expName, buf); imgCount++; }catch(_){} }
    count+=imgCount;
    const blob=await zip.generateAsync({type:"blob",compression:"DEFLATE"});
    download(blob, base+"_指示一式.zip");
    log("編集済みプロジェクト"+projectCount+"ファイル＋指示＋添付"+count+"件をZIPで書き出しました。過去のZIPは添付せず、このZIPだけをAIに渡してください。");
  }catch(e){ log("ZIP書き出しに失敗: "+((e&&e.message)||e), true); }
}
async function exportZip(){
  if(M.dcMode) return exportDcZip();
  commitJsx();
  const zip=new JSZip();
  for(const [p,f] of M.files){ zip.file(p, f.bytes); }
  const blob=await zip.generateAsync({type:"blob",compression:"DEFLATE"});
  download(blob, baseExportName()+".zip");
  log("ZIP を書き出しました。");
}

// ============================================================
// Export: 単体HTML（自己展開バンドル；Claude 互換の unpack スクリプトを同梱）
// ============================================================
async function exportHtml(){
  if(M.dcMode) return exportDcHtml();
  commitJsx();
  const s=M.scenes[M.scene];
  if(!M.supportPath) throw new Error("support.js がないため単体HTMLを生成できません。ZIPで書き出してください。");
  // トークンを割り当てて manifest を作る（画像・音声・support.js・jsx）
  const manifest={}; let n=0; const tok=()=>"__DCRES_"+(n++).toString(36).padStart(6,"0")+"__";
  const tokenOf=new Map();
  function add(path){ if(tokenOf.has(path)) return tokenOf.get(path); const f=M.files.get(path); const t=tok(); manifest[t]={data:u8ToB64(f.bytes), mime:f.mime, compressed:false}; tokenOf.set(path,t); return t; }
  // jsx (asset参照をトークン化)
  let jsxSrc=currentJsxText();
  const assetPaths=[...M.files.keys()].filter(p=>isImage(p)||/\.(wav|mp3|m4a|mp4|webm)$/i.test(p)).sort((a,b)=>b.length-a.length);
  for(const p of assetPaths){ const t=add(p); for(const ref of new Set([p,"./"+p])){ jsxSrc=jsxSrc.split('"'+ref+'"').join('"'+t+'"').split("'"+ref+"'").join("'"+t+"'"); } }
  const jsxTok=tok(); manifest[jsxTok]={data:u8ToB64(enc.encode(jsxSrc)), mime:"text/jsx", compressed:false};
  const supTok=add(M.supportPath);
  const helmet=extractHelmet(s.docHtml)||defaultHelmet();
  const containerStyle=(extractContainerStyle(s.docHtml)||"position:absolute;inset:0;background:#060b16;").replace(/"/g,"&quot;");
  const template=
`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
${helmet}
<style>html,body{margin:0;padding:0;height:100%;background:#060b16;overflow:hidden}#dc-root,x-dc{height:100%}</style>
<script src="${supTok}"><\/script>
</head><body>
<x-dc><div data-screen-label="00:00" style="${containerStyle}">
<x-import component-from-global-scope="${s.compGlobal}" from="${jsxTok}" hint-size="100%,100%"><\/x-import>
</div></x-dc>
</body></html>`;
  const html=buildBundleHtml(manifest, template, s.label, jsxTok);
  download(new Blob([html],{type:"text/html"}), baseExportName()+"_単体版.html");
  log("単体HTMLを書き出しました（自己展開バンドル）。");
}

// Claude 互換の自己展開 HTMLを生成
function buildBundleHtml(manifest, template, title, jsxTok){
  const loader = `
document.addEventListener('DOMContentLoaded', async function(){
  try{
    var __JT=${JSON.stringify(jsxTok)};
    const m=JSON.parse(document.querySelector('script[type="__bundler/manifest"]').textContent);
    let t=JSON.parse(document.querySelector('script[type="__bundler/template"]').textContent);
    const uuids=Object.keys(m); const blobs={};
    await Promise.all(uuids.map(async u=>{ const e=m[u]; const bin=atob(e.data); const by=new Uint8Array(bin.length); for(let i=0;i<bin.length;i++) by[i]=bin.charCodeAt(i); blobs[u]=URL.createObjectURL(new Blob([by],{type:e.mime})); }));
    for(const u of uuids) t=t.split(u).join(blobs[u]+(u===__JT?'#dc.jsx':''));
    const doc=new DOMParser().parseFromString(t,'text/html');
    document.documentElement.replaceWith(doc.documentElement);
    const dead=Array.from(document.scripts);
    for(const old of dead){ const s=document.createElement('script'); for(const a of old.attributes) s.setAttribute(a.name,a.value); s.textContent=old.textContent;
      if((s.type==='text/babel'||s.type==='text/jsx')&&s.src){ const r=await fetch(s.src); s.textContent=await r.text(); s.removeAttribute('src'); }
      const p=s.src?new Promise(r=>{s.onload=s.onerror=r;}):null; old.replaceWith(s); if(p) await p; }
    if(window.Babel&&Babel.transformScriptTags) Babel.transformScriptTags();
  }catch(err){ document.body.innerHTML='<pre style="color:#ff8a80;padding:16px">unpack error: '+(err&&err.message)+'</pre>'; }
});`;
  const safeManifest=JSON.stringify(manifest).split("</").join("<\\/");
  const safeTemplate=JSON.stringify(template).split("</").join("<\\/");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${(title||"Bundled Page").replace(/</g,"&lt;")}</title>
<style>body{background:#0b1730;margin:0}#__l{position:fixed;bottom:14px;right:14px;font:12px sans-serif;color:#9ab;}</style>
</head><body>
<div id="__l">Unpacking…</div>
<script>${loader}<\/script>
<script type="__bundler/manifest">${safeManifest}<\/script>
<script type="__bundler/template">${safeTemplate}<\/script>
</body></html>`;
}

// ============================================================
// v08: ネイティブ Claude Design (.dc.html / dc-runtime) 対応
//  - シーン本体はインライン <x-dc>。<image-slot> 部品はネイティブのまま。
//  - プレビューは React(UMD)+support.js+image-slot.js を注入して忠実描画。
// ============================================================
