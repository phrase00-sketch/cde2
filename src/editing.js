function diagScript(){
  return `<script>
(function(){
 function send(l,m){ try{ parent.postMessage({__dcPreview:1,level:l,msg:String(m)},"*"); }catch(e){} }
 function banner(m){ try{ var d=document.getElementById("__dcerr"); if(!d){ d=document.createElement("div"); d.id="__dcerr"; d.style.cssText="position:fixed;left:0;right:0;bottom:0;max-height:45%;overflow:auto;background:#3a0d0d;color:#ffd9d9;font:12px/1.45 ui-monospace,monospace;padding:8px 10px;z-index:99999;white-space:pre-wrap"; (document.body||document.documentElement).appendChild(d);} d.textContent="\u26a0 プレビューエラー: "+m; }catch(e){} }
 window.addEventListener("error",function(e){ var m=(e.message||"error")+(e.filename?(" @ "+String(e.filename).slice(0,40)+":"+e.lineno):""); send("error",m); banner(m); });
 window.addEventListener("unhandledrejection",function(e){ var r=e.reason; var m="promise: "+((r&&r.message)||r); send("error",m); banner(m); });
 ["error","warn","info"].forEach(function(k){ var o=console[k]; console[k]=function(){ var m=Array.prototype.map.call(arguments,function(a){return (a&&a.message)||String(a);}).join(" "); send(k,m); if(k==="error"&&/dc-runtime|Babel|React|x-import|Error/i.test(m)) banner(m); return o.apply(console,arguments); }; });
})();
<\/script>`;
}

// asset 相対パスを data URL に置換（プレビュー用コピーのみ、保存は原文）。
// プレビューは完全自己完結（親origin blob に依存しない）にして file:// でも確実に表示する。
function assetDataUrl(path){ const f=M.files.get(path); if(!f) return null; return "data:"+f.mime+";base64,"+u8ToB64(f.bytes); }
function _assetBaseDir(){
  var bp = M.dcMode ? (M.dcPath||"") : (M.jsxPath||"");
  if(!bp || bp==="(bundle)") return "";
  return bp.indexOf("/")>=0 ? bp.replace(/\/[^\/]*$/,"/") : "";
}
function _assetRefs(p){
  // 参照候補：フルパス／basename に加え、デッキ(.dc.html/jsx)のあるフォルダからの相対パスも対象にする。
  // .dc.html は <img src="assets/..."> のように「デッキと同じ階層からの相対パス」で画像を参照するため、
  // ZIP 内のサブフォルダ接頭辞（例 foo_export/）を取り除いた相対形でも一致させる。
  const set=new Set([p, "./"+p, baseName(p), "./"+baseName(p)]);
  const base=_assetBaseDir();
  if(base && p.indexOf(base)===0){ const rel=p.slice(base.length); if(rel){ set.add(rel); set.add("./"+rel); } }
  return set;
}
function _replaceQuotedRef(src,ref,url){
  var e=String(ref||"").replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
  [["\"","\""],["'","'"],["`","`"]].forEach(function(q){var qq=q[0],z=qq.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");src=src.replace(new RegExp(z+e+"(?:[?#][^"+z+"]*)?"+z,"g"),qq+url+qq);});
  return src;
}
function rewriteAssetRefs(src){
  // 長いパスを先に置換（部分一致を避ける）
  const paths=[...M.files.keys()].filter(p=>p!==M.supportPath && p!==M.imgSlotPath && !/\.(jsx|dc\.html|html)$/i.test(p)).sort((a,b)=>b.length-a.length);
  for(const p of paths){
    const url=blobFor(p); if(!url) continue; // 画像はキャッシュ済blob URL（毎回sync base64だと数MB画像でフリーズする）
    for(const ref of _assetRefs(p)){
      if(!ref) continue;
      src = _replaceQuotedRef(src,ref,url);
    }
    src=src.split('data-cde-asset-path="'+url+'"').join('data-cde-asset-path="'+p+'"').split("data-cde-asset-path='"+url+"'").join("data-cde-asset-path='"+p+"'");
  }
  return src;
}

function buildPreview(){
  if(M.dcMode) return buildPreviewDc();
  try{
    if(M.scene==null) return;
    const s=M.scenes[M.scene];
    if(!M.plainDeck && !M.supportPath){ log("support.js が見つかりません。Claude Design の完全な書き出し（support.js を含むZIP）を一度開くと、以後は内蔵ランタイムでプレビューできます。", true); return; }
    const supportText=dec.decode(M.files.get(M.supportPath).bytes);
    const jsx=rewriteAssetRefs(currentJsxText());
    // data URL + "#dc.jsx": support.js は URL 末尾が .jsx/.tsx の時だけ Babel 変換する（kind 判定対策）。
    const jsxUrl="data:text/jsx;base64,"+u8ToB64(enc.encode(jsx))+"#dc.jsx";
    const helmet = extractHelmet(s.docHtml) || defaultHelmet();
    const containerStyle = extractContainerStyle(s.docHtml) || "position:absolute;inset:0;background:#060b16;";
    const docHtml =
`<!DOCTYPE html><html><head><meta charset="utf-8">
${diagScript()}
${helmet}
<style>html,body{margin:0;padding:0;height:100%;background:#060b16;overflow:hidden}#dc-root,x-dc{height:100%}</style>
<script>${supportText}<\/script>
</head><body>
<x-dc><div data-screen-label="00:00" style="${containerStyle.replace(/"/g,'&quot;')}">
<x-import component-from-global-scope="${s.compGlobal}" from="${jsxUrl}" hint-size="100%,100%"><\/x-import>
</div></x-dc>
</body></html>`;
    const frame=$("#frame");
    frame.srcdoc=docHtml;
    log("プレビューを再描画しました（本番と同じ support.js / Stage）。エラーがあればこの欄と画面下部に表示します。");
  }catch(e){ log("プレビュー生成エラー: "+e.message, true); }
}
function extractHelmet(docHtml){
  if(!docHtml) return null;
  const d=new DOMParser().parseFromString(docHtml,"text/html");
  const h=d.querySelector("helmet");
  if(h && /stylesheet|@font-face|fonts\.googleapis/i.test(h.innerHTML||"")) return h.innerHTML;
  const links=[...d.querySelectorAll('link[rel="stylesheet"],link[rel="preconnect"]')].map(x=>x.outerHTML).join("\n");
  return links || extractDeckFontHead(docHtml) || (h?h.innerHTML:null);
}
function extractDeckFontHead(src){
  src=String(src||"");
  var hrefs=[], seen={}, tag, hm, href, m, out=[], styles=[], sm;
  var re=/<link\b[^>]*>/ig;
  while((m=re.exec(src))){
    tag=m[0];
    if(!/\brel\s*=\s*["'][^"']*(?:stylesheet|preconnect)[^"']*["']/i.test(tag)) continue;
    hm=/\bhref\s*=\s*["']([^"']+)["']/i.exec(tag);
    if(!hm) continue;
    href=hm[1].replace(/&amp;/g,"&");
    if(!/fonts\.googleapis\.com|fonts\.gstatic\.com/i.test(href)) continue;
    if(seen[href]) continue;
    seen[href]=1;
    hrefs.push({rel:/\bpreconnect\b/i.test(tag)?"preconnect":"stylesheet", href:href, cross:/\bcrossorigin\b/i.test(tag)});
  }
  hrefs.forEach(function(x){
    out.push('<link rel="'+x.rel+'" href="'+x.href.replace(/&/g,"&amp;").replace(/"/g,"&quot;")+'"'+(x.cross?" crossorigin":"")+">");
  });
  var sre=/<style\b[^>]*>([\s\S]*?)<\/style>/ig;
  while((sm=sre.exec(src))){
    if(/@font-face/i.test(sm[1])) styles.push("<style>"+sm[1]+"</style>");
  }
  return out.concat(styles).join("\n");
}
function extractContainerStyle(docHtml){
  if(!docHtml) return null;
  const d=new DOMParser().parseFromString(docHtml,"text/html");
  const div=d.querySelector("x-dc > div, x-dc div[style]"); return div?div.getAttribute("style"):null;
}
function defaultHelmet(){
  return '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@400;500;700;900&family=Oswald:wght@500;600;700&display=swap" rel="stylesheet">';
}

// ============================================================
// Assets panel
// ============================================================
function renderAssets(){
  const wrap=$("#assets"); wrap.innerHTML="";
  const paths=[...M.files.keys()].filter(p=>isImage(p)||/\.(wav|mp3|m4a|mp4|webm|mov|m4v)$/i.test(p)).sort();
  if(!paths.length){ wrap.innerHTML='<div class="hint">置換可能な画像／音声はありません。</div>'; return; }
  const entries=_assetDisplayEntries(paths); let lastGroup=null;
  for(const entry of entries){
    const p=entry.path, use=entry.use, group=entry.group;
    if(group.key!==lastGroup){
      lastGroup=group.key;
      const h=document.createElement("div"); h.className="assetgroup";
      const t=document.createElement("span"); t.textContent=group.label; h.appendChild(t);
      const c=document.createElement("span"); c.className="assetgroupcount"; c.textContent=group.count+"件"; h.appendChild(c);
      wrap.appendChild(h);
    }
    const isVid=_isVideoAsset(p);
    const card=document.createElement("div"); card.className="asset"+(isVid?" video":"");
    card.dataset.assetPath=p;
    const thumb=document.createElement("div"); thumb.className="thumb";
    let vid=null;
    if(isImage(p)){ const img=document.createElement("img"); img.src=blobFor(p); thumb.appendChild(img); }
    else if(isVid){ vid=document.createElement("video"); vid.src=blobFor(p); vid.muted=true; vid.controls=true; vid.preload="metadata"; vid.playsInline=true; vid.setAttribute("playsinline",""); vid.setAttribute("aria-label",baseName(p)+" の動画プレビュー"); thumb.title="ここで動画を再生して内容を確認できます"; thumb.appendChild(vid); }
    else { thumb.innerHTML='<span class="hint">'+extOf(p).toUpperCase()+'</span>'; }
    const nm=document.createElement("div"); nm.className="nm"; nm.innerHTML="<b>"+baseName(p)+"</b><br>"+p;
    const lab=document.createElement("label"); lab.className="btn"; lab.textContent="差し替え";
    const inp=document.createElement("input"); inp.type="file"; inp.hidden=true; inp.accept="."+extOf(p);
    inp.onchange=()=>{ const file=inp.files[0]; inp.value=""; if(file) replaceAssetWithFile(p,file).catch(err=>log("差し替えエラー: "+((err&&err.message)||err),true)); };
    lab.appendChild(inp); card.appendChild(thumb); card.appendChild(nm);
    _bindAssetReplaceDrop(card,p);
    if(isImage(p)||isVid) _appendAssetSceneUses(card,p,use?[use]:[]);
    if(isVid) _appendAssetVinEditor(card,p,vid);
    card.appendChild(lab); wrap.appendChild(card);
  }
}

// ============================================================
// 画像／動画スロット（data-img-slot）：選択 or ドラッグ&ドロップで素材を差し込み、AI出力にも反映
// AI指示では明示的に変更／クリアしたスロットだけを扱い、未操作の既存スロットと区別する。
// ============================================================
M.imgAssign = M.imgAssign || {};
M.imgTouched = M.imgTouched || {}; // v26: assigned / cleared。復元済み・未操作の既存スロットとは分離する。
function _escI(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function revokeImgSlots(){ for(const id in (M.imgAssign||{})){ try{ URL.revokeObjectURL(M.imgAssign[id].url); }catch(_){} } M.imgAssign={}; M.imgTouched={}; }
function _vinRound(v){ v=parseFloat(v); return isFinite(v)?Math.round(Math.max(0,v)*10)/10:0; }
function _vinMax(a){ var d=a&&parseFloat(a.duration); return (isFinite(d)&&d>0.05)?Math.max(0,Math.floor((d-0.05)*10)/10):0; }
function _vinNorm(a,v){ var n=_vinRound(v); var d=a&&parseFloat(a.duration); if(isFinite(d)&&d>0) n=Math.min(n,_vinMax(a)); return _vinRound(n); }
function _vinAttr(a){ return _vinRound(a&&a.vin).toFixed(1); }
function _isVideoAsset(p){ var f=M.files&&M.files.get(p); return !!((f&&/^video\//i.test(f.mime||""))||/\.(?:mp4|webm|mov|m4v)$/i.test(String(p||""))); }
function _assetKind(p){ return isImage(p)?"image":(_isVideoAsset(p)?"video":(/\.(?:wav|mp3|m4a)$/i.test(String(p||""))?"audio":"other")); }
async function replaceAssetWithFile(p, file){
  if(!p||!file) return false;
  const wantExt=extOf(p), gotExt=extOf(file.name), wantKind=_assetKind(p), gotKind=_assetKind(file.name);
  if(!gotExt||gotExt!==wantExt||gotKind!==wantKind){ log("差し替えできません。元の素材と同じ種類・拡張子（."+wantExt+"）のファイルを選んでください。",true); return false; }
  const isVid=_isVideoAsset(p);
  const owner=M;const b=new Uint8Array(await file.arrayBuffer());
  if(M!==owner||WORKSPACE.loading)return false;
  M.files.set(p,{bytes:b, mime:mimeOf(p)==="application/octet-stream"?(file.type||mimeOf(p)):mimeOf(p)});
  if(M.blobUrl.has(p)){ URL.revokeObjectURL(M.blobUrl.get(p)); M.blobUrl.delete(p); }
  if(isVid) _assetVideoReplaced(p,file,b);
  renderAssets(); if(isVid) renderImgSlots(); buildPreview();
  log("アセットを差し替えました: "+p+(isVid?"（開始位置は0.0秒へ戻しました）":""));
  projectChanged();return true;
}
function _bindAssetReplaceDrop(card, p){
  if(!card) return;
  function hasFiles(e){ return !!(e.dataTransfer&&e.dataTransfer.types&&Array.prototype.indexOf.call(e.dataTransfer.types,"Files")>=0); }
  ["dragenter","dragover"].forEach(ev=>card.addEventListener(ev, e=>{ if(!hasFiles(e)) return; e.preventDefault(); e.stopPropagation(); card.classList.add("drop"); }));
  card.addEventListener("dragleave", e=>{ if(!card.contains(e.relatedTarget)) card.classList.remove("drop"); });
  card.addEventListener("drop", e=>{
    e.preventDefault(); e.stopPropagation(); card.classList.remove("drop");
    const f=e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files[0];
    if(f) replaceAssetWithFile(p,f).catch(err=>log("差し替えエラー: "+((err&&err.message)||err),true));
  });
}
function _assetVinState(p){ M.assetVin=M.assetVin||{}; var a=M.assetVin[p]||(M.assetVin[p]={vin:0,duration:null}); a.vin=_vinNorm(a,a.vin); return a; }
function _assetLinkedSlots(p){ var out=[]; for(const id in (M.imgAssign||{})){ var a=M.imgAssign[id]; if(a&&a.kind==="video"&&a.assetPath&&String(a.assetPath).toLowerCase()===String(p).toLowerCase()) out.push({id:id,a:a}); } return out; }
function _assetPathFromVideoHtml(block){
  block=String(block||""); var op=(/<video\b[^>]*>/i.exec(block)||[])[0]||block, mm=/\bdata-cde-asset-path\s*=\s*["']([^"']+)["']/i.exec(op);
  if(mm){ var mk=mm[1]; if(M.files.has(mk)) return mk; for(const p of M.files.keys()){ if(String(p).toLowerCase()===String(mk).toLowerCase()) return p; } }
  var refs=[], sm=/\bsrc\s*=\s*["']([^"']+)["']/i.exec(op); if(sm) refs.push(sm[1]);
  var rs=/<source\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/ig, x; while((x=rs.exec(block))) refs.push(x[1]);
  for(var i=0;i<refs.length;i++){ var za=_slotZipAsset(refs[i]); if(za&&_isVideoAsset(za.path)) return za.path; }
  return null;
}
function _assetVideoPositions(src,p){
  var pos=[], seen={}, m, re=/<video\b[^>]*>[\s\S]*?<\/video>/ig;
  while((m=re.exec(src))){ if(_assetPathFromVideoHtml(m[0])===p){ seen[m.index]=1; pos.push(m.index); } }
  re=/<video\b[^>]*>/ig; while((m=re.exec(src))){ if(!seen[m.index]&&_assetPathFromVideoHtml(m[0])===p){ seen[m.index]=1; pos.push(m.index); } }
  return pos;
}
function _assetImagePathFromHtml(tag){
  tag=String(tag||""); var sm=/\bsrc\s*=\s*["']([^"']+)["']/i.exec(tag); if(!sm)return null;
  var za=_slotZipAsset(sm[1]); return (za&&isImage(za.path))?za.path:null;
}
function _assetMediaPositions(src,p){
  if(_isVideoAsset(p)) return _assetVideoPositions(src,p);
  if(!isImage(p)) return [];
  var pos=[], m, re=/<img\b[^>]*>/ig;
  while((m=re.exec(String(src||"")))) if(_assetImagePathFromHtml(m[0])===p) pos.push(m.index);
  return pos;
}
function _fmtAssetClock(v){
  v=Math.max(0,+v||0); var m=Math.floor(v/60), s=v-m*60;
  return m+":"+(s<10?"0":"")+s.toFixed(1);
}
function _slotPositions(src,id){
  src=String(src||""); var pos=[], esc=String(id||"").replace(/[.*+?^${}()|[\]\\]/g,"\\$&"), re, m;
  re=new RegExp("<(?:x-import|image-slot)\\b[^>]*\\bid\\s*=\\s*[\"']"+esc+"[\"'][^>]*>","ig");
  while((m=re.exec(src))) pos.push(m.index);
  re=new RegExp("data-img-slot\\s*=\\s*[\"']?"+esc+"(?:[\"'\\s}>])","ig");
  while((m=re.exec(src))) pos.push(m.index);
  re=new RegExp("<[a-zA-Z][a-zA-Z0-9-]*\\b[^>]*\\bdata-slot\\s*=\\s*[\"']"+esc+"[\"'][^>]*>\\s*<video\\b[^>]*\\bdata-cde-slot-video\\b","ig");
  while((m=re.exec(src))) pos.push(m.index);
  return pos;
}
function _assetUseLabel(label){
  return String(label||"")
    .replace(/\s*\([0-9.]+\s*[–—-]\s*[0-9.]+\)\s*$/,"")
    .replace(/^(シーン\d+：)\s*S_[A-Za-z0-9_]+\s*[–—-]\s*/,"$1");
}
function _assetSceneUses(p){
  if(!M.dcMode) return [];
  try{
    var src=currentJsxText()||"", blocks=dcCollectSceneBlocks(src), pos=_assetMediaPositions(src,p), pb=dcParseBounds(), bounds=(pb&&pb.bounds)||[], out=[], by={}, seenPos={};
    if(_isVideoAsset(p)) _assetLinkedSlots(p).forEach(function(x){ pos=pos.concat(_slotPositions(src,x.id)); });
    pos=pos.filter(function(at){ var k=String(at); if(seenPos[k])return false; seenPos[k]=1; return true; });
    pos.forEach(function(at){
      var idx=dcSceneIndexForPos(src,at); if(idx<0||idx>=blocks.length) return;
      var st=(idx<bounds.length)?bounds[idx]:null, en=(idx+1<bounds.length)?bounds[idx+1]:(pb&&pb.dur), key=String(idx);
      if(!by[key]){ by[key]={index:idx,label:blocks[idx].label||("シーン"+(idx+1)),start:st,end:en,count:0,pos:at}; out.push(by[key]); }
      by[key].count++;
    });
    return out.sort(function(a,b){return (a.index-b.index)||(a.pos-b.pos);});
  }catch(_){ return []; }
}
function _assetDisplayEntries(paths){
  var used=[], unused=[], other=[];
  (paths||[]).forEach(function(p){
    var media=isImage(p)||_isVideoAsset(p), uses=media?_assetSceneUses(p):[];
    if(uses.length) uses.forEach(function(use){used.push({path:p,use:use});});
    else if(media) unused.push({path:p,use:null});
    else other.push({path:p,use:null});
  });
  used.sort(function(a,b){return (a.use.index-b.use.index)||(a.use.pos-b.use.pos)||a.path.localeCompare(b.path,"ja");});
  unused.sort(function(a,b){return a.path.localeCompare(b.path,"ja");});
  other.sort(function(a,b){return a.path.localeCompare(b.path,"ja");});
  var sceneCounts={}; used.forEach(function(x){sceneCounts[x.use.index]=(sceneCounts[x.use.index]||0)+1;});
  used.forEach(function(x){
    var tm=(isFinite(x.use.start)&&isFinite(x.use.end))?("  "+_fmtAssetClock(x.use.start)+"–"+_fmtAssetClock(x.use.end)):"";
    x.group={key:"scene:"+x.use.index,label:_assetUseLabel(x.use.label)+tm,count:sceneCounts[x.use.index]};
  });
  unused.forEach(function(x){x.group={key:"unused",label:"未使用の画像・動画",count:unused.length};});
  other.forEach(function(x){x.group={key:"other",label:"音声・その他",count:other.length};});
  return used.concat(unused,other);
}
function _seekAssetScene(use){
  if(!use||!isFinite(use.start)) return;
  var end=isFinite(use.end)?use.end:(use.start+1), t=Math.max(use.start,Math.min(use.start+0.2,end-0.05));
  M._audT=t; M._audPaused=true; _audPost("seek",t);
  var sk=$("#audSeek"), tt=$("#audTime"); if(sk) sk.value=String(t); if(tt) tt.textContent=_fmtT(t)+(sk&&+sk.max>0?(" / "+_fmtT(+sk.max)):"");
  try{$("#frameWrap").scrollIntoView({block:"nearest"});}catch(_){}
}
function _appendAssetSceneUses(card,p,onlyUses){
  var uses=onlyUses||_assetSceneUses(p), box=document.createElement("div"); box.className="assetuses";
  var head=document.createElement("div"); head.className="assetuseshead"; head.textContent=uses.length?"このカードの使用シーン":"使用シーン"; box.appendChild(head);
  if(!uses.length){ var none=document.createElement("div"); none.className="assetuseunused"; none.textContent="デッキ本編内で直接参照されていません"; box.appendChild(none); }
  else { var chips=document.createElement("div"); chips.className="assetusechips"; uses.forEach(function(use){
    var b=document.createElement("button"); b.type="button"; b.className="assetuse";
    var tm=(isFinite(use.start)&&isFinite(use.end))?("  "+_fmtAssetClock(use.start)+"–"+_fmtAssetClock(use.end)):"";
    b.textContent=_assetUseLabel(use.label)+tm+(use.count>1?("  同一シーン内×"+use.count):""); b.title="この使用シーンへ移動（"+use.label+"）"; b.onclick=function(){_seekAssetScene(use);}; chips.appendChild(b);
  }); box.appendChild(chips); }
  card.appendChild(box);
}
function _assetSceneDurations(p){
  if(!M.dcMode) return {durations:[],unknown:true,count:0};
  try{
    var src=currentJsxText()||"", pos=_assetVideoPositions(src,p), ranges=dcSceneRanges(src), mb=src.match(/BOUNDS\s*=\s*\[([^\]]*)\]/), bounds=[], out=[], used={}, unknown=false;
    if(mb) bounds=mb[1].split(",").map(function(x){return parseFloat(String(x).trim());}).filter(function(x){return isFinite(x);});
    var md=src.match(/this\.duration\s*=\s*([0-9.]+)/)||src.match(/\bduration\s*[:=]\s*([0-9.]+)/), dur=md?parseFloat(md[1]):null;
    if(!pos.length) return {durations:[],unknown:false,count:0};
    if(!ranges.length||!bounds.length) return {durations:[],unknown:true,count:pos.length};
    pos.forEach(function(at){ for(var i=0;i<ranges.length;i++){ var r=ranges[i]; if(at<r.start||at>=r.end) continue; if(used[i]) break; used[i]=1; var st=bounds[i], en=(i<bounds.length-1)?bounds[i+1]:dur, d=en-st; if(isFinite(d)&&d>0) out.push(d); else unknown=true; break; } });
    return {durations:out,unknown:unknown||Object.keys(used).length<pos.length,count:pos.length};
  }catch(_){ return {durations:[],unknown:true,count:0}; }
}
function _assetVinInfo(p,a){
  a=a||_assetVinState(p); var d=parseFloat(a.duration), vin=_vinNorm(a,a.vin), use=_assetSceneDurations(p);
  _assetLinkedSlots(p).forEach(function(x){ var su=_slotSceneDurations(x.id); if(su.durations&&su.durations.length) use.durations=use.durations.concat(su.durations); if(su.unknown)use.unknown=true; use.count+=(su.durations&&su.durations.length)||0; });
  var sceneMax=use.durations.length?Math.max.apply(null,use.durations):null;
  if(!isFinite(d)||d<=0) return {duration:null,vin:vin,remain:null,sceneMax:sceneMax,warn:false,unknown:!!use.unknown,useCount:use.count||0};
  var remain=Math.max(0,d-vin), warn=(!use.unknown&&sceneMax!=null&&remain+0.05<sceneMax);
  return {duration:d,vin:vin,remain:remain,sceneMax:sceneMax,warn:warn,unknown:!!use.unknown,useCount:use.count||0};
}
function _assetVideoWarnings(){ var out=[]; for(const p in (M.assetVin||{})){ if(!_isVideoAsset(p)) continue; var inf=_assetVinInfo(p,M.assetVin[p]); if(inf.warn) out.push({path:p,info:inf}); } return out; }
function _logAssetVideoWarnings(prefix){ var ws=_assetVideoWarnings(); ws.forEach(function(w){ log("⚠ "+(prefix||"書き出し")+"：動画アセット「"+baseName(w.path)+"」は開始 "+w.info.vin.toFixed(1)+"秒、残り "+w.info.remain.toFixed(1)+"秒に対して使用シーン最大尺 "+w.info.sceneMax.toFixed(1)+"秒のため、末尾フレームで停止する可能性があります。",true); }); return ws; }
function _applyAssetVinToPreview(p){
  var a=_assetVinState(p), vin=_vinAttr(a), vn=+vin||0, t=(typeof M._audT==="number"?M._audT:0), rel=M.dcMode?Math.max(0,t-_previewSceneStart(t)):0;
  try{ var doc=$("#frame").contentDocument, vs=doc?[...doc.querySelectorAll('video[data-cde-asset-path]')]:[]; vs.filter(function(v){return !v.getAttribute("data-cde-slot-video")&&v.getAttribute("data-cde-asset-path")===p;}).forEach(function(v){ v.setAttribute("data-vin",vin); var go=function(){ try{ var d=(v.duration&&isFinite(v.duration))?v.duration:0, hi=d>0?Math.max(vn,d-0.05):(vn+rel), target=Math.max(vn,Math.min(vn+rel,hi)); if(Math.abs((v.currentTime||0)-target)>0.001)v.currentTime=target; }catch(_){} }; if(v.readyState>=1)go(); else v.addEventListener("loadedmetadata",go,{once:true}); try{requestAnimationFrame(go);}catch(_){} }); }catch(_){}
  if(M.dcMode){ _audPost("assetVin",{path:p,vin:vn}); _audPost("seek",t); }
}
function _setAssetVin(p,v,propagate){
  var a=_assetVinState(p); a.vin=_vinNorm(a,v);
  if(propagate){ _assetLinkedSlots(p).forEach(function(x){ if(a.duration!=null)x.a.duration=a.duration; x.a.vin=_vinNorm(x.a,a.vin); _applyVinToPreview(x.id); }); }
  _applyAssetVinToPreview(p); _syncAssetVinEditors(p); return a.vin;
}
function _syncAssetVinEditors(p){
  try{ document.querySelectorAll("#assets .ivin").forEach(function(box){ if(box._assetPath===p&&typeof box._syncAssetVin==="function")box._syncAssetVin(); }); }catch(_){}
}
function _assetVideoReplaced(p,file,bytes){
  M.assetVin[p]={vin:0,duration:null}; var f=M.files.get(p), mime=(f&&f.mime)||(file&&file.type)||mimeOf(p);
  _assetLinkedSlots(p).forEach(function(x){ try{URL.revokeObjectURL(x.a.url);}catch(_){} var blob=new Blob([bytes],{type:mime}); x.a.file=blob; x.a.bytes=bytes; x.a.url=URL.createObjectURL(blob); x.a.dataUrl=null; x.a.name=baseName(p); x.a.vin=0; x.a.duration=null; });
}
function _appendAssetVinEditor(card,p,thumb){
  var a=_assetVinState(p), box=document.createElement("div"); box.className="ivin";
  var head=document.createElement("div"); head.className="ivinhead"; var lab=document.createElement("label"); lab.textContent="動画の開始位置";
  var num=document.createElement("input"); num.type="number"; num.className="ivinnum"; num.min="0"; num.step="0.1"; num.inputMode="decimal";
  var unit=document.createElement("span"); unit.className="ivinunit"; unit.textContent="秒"; var meta=document.createElement("span"); meta.className="ivinmeta";
  head.appendChild(lab); head.appendChild(num); head.appendChild(unit); head.appendChild(meta);
  var range=document.createElement("input"); range.type="range"; range.className="ivinrange"; range.min="0"; range.step="0.1"; range.value="0"; range.disabled=true;
  var warn=document.createElement("div"); warn.className="ivinwarn"; box.appendChild(head); box.appendChild(range); box.appendChild(warn); card.appendChild(box);
  function sync(){
    a.vin=_vinNorm(a,a.vin); var inf=_assetVinInfo(p,a), val=inf.vin.toFixed(1), links=_assetLinkedSlots(p).length; num.value=val; range.value=val;
    if(inf.duration!=null){ var mx=_vinMax(a); num.max=mx.toFixed(1); range.max=mx.toFixed(1); range.disabled=false; meta.textContent="素材 "+inf.duration.toFixed(1)+"秒／残り "+inf.remain.toFixed(1)+"秒"+(inf.sceneMax!=null?("／使用シーン最大 "+inf.sceneMax.toFixed(1)+"秒"):(inf.useCount?"／シーン尺を確認できません":"／直接参照なし"))+(links?("／動画スロット "+links+"件"):""); }
    else { num.removeAttribute("max"); range.disabled=true; meta.textContent="素材尺を取得中…"+(links?("／動画スロット "+links+"件"):""); }
    if(inf.warn){ warn.classList.add("show"); warn.textContent="⚠ 開始位置以降の残り尺がシーン尺より短いため、末尾フレームで停止する可能性があります。書き出しは続行できます。"; } else { warn.classList.remove("show"); warn.textContent=""; }
    try{ if(thumb&&thumb.readyState>=1){ thumb.pause(); thumb.currentTime=Math.min(inf.vin,Math.max(0,(thumb.duration||0)-0.05)); } }catch(_){}
  }
  box._assetPath=p; box._syncAssetVin=sync;
  function change(v){ _setAssetVin(p,v,true); sync(); }
  num.addEventListener("input",function(){if(num.value!=="")change(num.value);}); num.addEventListener("change",function(){change(num.value);}); range.addEventListener("input",function(){change(range.value);});
  function metadata(){ var d=thumb&&parseFloat(thumb.duration); if(isFinite(d)&&d>0){ a.duration=d; a.vin=_vinNorm(a,a.vin); _assetLinkedSlots(p).forEach(function(x){x.a.duration=d;x.a.vin=_vinNorm(x.a,x.a.vin);}); } _syncAssetVinEditors(p); _applyAssetVinToPreview(p); }
  if(thumb){ thumb.addEventListener("loadedmetadata",metadata); if(thumb.readyState>=1)metadata(); } sync();
}
function _restoreAssetVideoVins(srcText){
  M.assetVin=M.assetVin||{}; srcText=String(srcText||""); var re=/<video\b[^>]*>/ig,m;
  while((m=re.exec(srcText))){ var tag=m[0], mk=/\bdata-cde-asset-path\s*=\s*["']([^"']+)["']/i.exec(tag), sm=/\bsrc\s*=\s*["']([^"']+)["']/i.exec(tag), vm=/\bdata-vin\s*=\s*["']([^"']+)["']/i.exec(tag), p=null;
    if(mk){ p=mk[1]; if(!M.files.has(p)&&sm&&/^data:video\//i.test(sm[1])){ try{ var du=sm[1], c=du.indexOf(","), mime=du.slice(5,c).split(";")[0]||mimeOf(p), bin=/;base64/i.test(du.slice(0,c))?atob(du.slice(c+1)):decodeURIComponent(du.slice(c+1)), u8=new Uint8Array(bin.length); for(var i=0;i<bin.length;i++)u8[i]=bin.charCodeAt(i); M.files.set(p,{bytes:u8,mime:mime}); }catch(_){} } }
    if(!p&&sm){ var za=_slotZipAsset(sm[1]); if(za&&_isVideoAsset(za.path))p=za.path; }
    if(p&&M.files.has(p)&&_isVideoAsset(p)){ var a=_assetVinState(p); if(vm)a.vin=_vinNorm(a,vm[1]); }
  }
  for(const p of M.files.keys()){ if(_isVideoAsset(p))_assetVinState(p); }
  try{ var k=_findSidecar(".asset-video-vin.state.json"); if(k){var st=JSON.parse(dec.decode(M.files.get(k).bytes));for(const p in st){if(M.files.has(p)&&_isVideoAsset(p)){var sv=st[p],a=_assetVinState(p);a.vin=_vinNorm(a,(sv&&typeof sv==="object")?sv.vin:sv);}}} }catch(_){}
}
function _slotSceneDurations(id){
  if(!M.dcMode) return {durations:[],unknown:true};
  try{
    var src=currentJsxText()||"", ranges=dcSceneRanges(src), out=[], pos=[], seen={}, unknown=false, matched=0;
    var mb=src.match(/BOUNDS\s*=\s*\[([^\]]*)\]/), bounds=[];
    if(mb) bounds=mb[1].split(",").map(function(x){return parseFloat(String(x).trim());}).filter(function(x){return isFinite(x);});
    var md=src.match(/this\.duration\s*=\s*([0-9.]+)/)||src.match(/\bduration\s*[:=]\s*([0-9.]+)/), dur=md?parseFloat(md[1]):null;
    if(!ranges.length||!bounds.length) return {durations:[],unknown:true};
    pos=_slotPositions(src,id);
    pos.forEach(function(p){
      for(var i=0;i<ranges.length;i++){
        var r=ranges[i]; if(p<r.start||p>=r.end) continue;
        matched++; if(seen[i]) break; seen[i]=1;
        var st=bounds[i]; if(!isFinite(st)){ unknown=true; break; }
        var en=(i<bounds.length-1)?bounds[i+1]:dur;
        var d=en-st; if(isFinite(d)&&d>0) out.push(d); else unknown=true;
        break;
      }
    });
    return {durations:out,unknown:unknown||!pos.length||matched<pos.length};
  }catch(_){ return {durations:[],unknown:true}; }
}
function _vinInfo(id,a){
  var d=parseFloat(a&&a.duration), vin=_vinRound(a&&a.vin), use=_slotSceneDurations(id), ds=use.durations||[];
  var sceneMax=(!use.unknown&&ds.length)?Math.max.apply(Math,ds):null;
  if(!(isFinite(d)&&d>0)) return {duration:null,vin:vin,remain:null,sceneMax:sceneMax,warn:false,unknown:true};
  var remain=Math.max(0,d-vin), warn=(!use.unknown&&sceneMax!=null&&remain+0.05<sceneMax);
  return {duration:d,vin:vin,remain:remain,sceneMax:sceneMax,warn:warn,unknown:!!use.unknown};
}
function _videoSlotWarnings(){
  var defs={}; discoverImgSlots().forEach(function(s){defs[s.id]=s;}); var out=[];
  for(const id in (M.imgAssign||{})){ var a=M.imgAssign[id]; if(!a||a.kind!=="video") continue; var inf=_vinInfo(id,a); if(inf.warn) out.push({id:id,label:(defs[id]&&defs[id].label)||id,info:inf}); }
  return out;
}
function _logVideoSlotWarnings(prefix){
  var ws=_videoSlotWarnings(); ws.forEach(function(w){ log("⚠ "+(prefix||"書き出し")+"：動画スロット「"+w.label+"」は開始 "+w.info.vin.toFixed(1)+"秒、残り "+w.info.remain.toFixed(1)+"秒に対して使用シーン最大尺 "+w.info.sceneMax.toFixed(1)+"秒のため、末尾フレームで停止する可能性があります。", true); });
  return ws;
}
function _previewVideosForSlot(id){
  try{ var doc=$("#frame").contentDocument; if(!doc) return []; return [...doc.querySelectorAll('video[data-cde-slot-video]')].filter(function(v){ if(v.getAttribute("data-cde-slot-id")===id||v.getAttribute("data-cde-slot-owner")===id) return true; var p=v.parentElement; while(p){ if((p.getAttribute&&(p.getAttribute("data-slot")===id||p.getAttribute("data-img-slot")===id||p.getAttribute("id")===id))) return true; p=p.parentElement; } return false; }); }catch(_){ return []; }
}
function _previewSceneStart(t){
  var st=0; try{ var b=dcParseBounds().bounds||[0]; for(var i=0;i<b.length;i++){ if(t>=b[i]) st=b[i]; else break; } }catch(_){} return st;
}
function _applyVinToPreview(id){
  var a=(M.imgAssign||{})[id]; if(!a||a.kind!=="video") return;
  var vin=_vinAttr(a), vn=+vin||0, t=(typeof M._audT==="number"?M._audT:0), rel=M.dcMode?Math.max(0,t-_previewSceneStart(t)):0;
  _previewVideosForSlot(id).forEach(function(v){
    try{
      v.setAttribute("data-cde-slot-id",id); v.setAttribute("data-vin",vin);
      var go=function(){ try{ var vd=(v.duration&&isFinite(v.duration))?v.duration:0, hi=vd>0?Math.max(vn,vd-0.05):(vn+rel), target=Math.max(vn,Math.min(vn+rel,hi)); if(Math.abs((v.currentTime||0)-target)>0.001) v.currentTime=target; }catch(_){} };
      if(v.readyState>=1) go(); else v.addEventListener("loadedmetadata",go,{once:true});
      try{ requestAnimationFrame(go); }catch(_){}
    }catch(_){}
  });
  if(M.dcMode){ _audPost("slotVin",{id:id,vin:vn}); _audPost("seek",t); }
}
function _setVin(id,value){ var a=(M.imgAssign||{})[id]; if(!a||a.kind!=="video") return 0; a.vin=_vinNorm(a,value); _applyVinToPreview(id); return a.vin; }
function discoverImgSlots(){
  if(M.dcMode) return discoverDcSlots();
  const src=currentJsxText()||""; const out=[]; const seen={};
  const re=/data-img-slot\s*=\s*[\s{"']*([\w\-]+)/g; let m;
  while((m=re.exec(src))){
    const id=m[1]; if(!id||seen[id]) continue; seen[id]=1;
    let ts=src.lastIndexOf("<", m.index); if(ts<0) ts=m.index;
    let te=src.indexOf(">", m.index); if(te<0) te=Math.min(src.length, m.index+400);
    const tag=src.slice(ts, te);
    const lm=/data-slot-label\s*=\s*[\s{"']*([^"'}]+)/.exec(tag); const lab=(lm&&lm[1].trim())||id;
    const fm=/data-fit\s*=\s*[\s{"']*([\w\-]+)/.exec(tag); const fit=(fm&&fm[1])||"cover";
    out.push({id:id, label:lab, fit:fit, pos:ts});
  }
  return out;
}
function _slotEls(id){ const doc=$("#frame").contentDocument; if(!doc) return []; if(M.dcMode) return [...doc.querySelectorAll("image-slot,x-import,[data-img-slot],[data-slot]")].filter(el=>(el.getAttribute&&(el.getAttribute("id")===id||el.getAttribute("data-img-slot")===id||el.getAttribute("data-slot")===id))||el.id===id); return [...doc.querySelectorAll("[data-img-slot]")].filter(el=>el.getAttribute("data-img-slot")===id); }
function applyImgSlots(){
  if(M.dcMode) return; // dc モードは src を srcdoc に焼き込むため DOM 後処理は不要（再描画ループ防止）
  const doc=$("#frame").contentDocument; if(!doc||!doc.body) return;
  const defs={}; discoverImgSlots().forEach(s=>defs[s.id]=s);
  doc.querySelectorAll("[data-img-slot]").forEach(el=>{
    const id=el.getAttribute("data-img-slot"); const a=M.imgAssign[id]; const fit=(defs[id]&&defs[id].fit)||el.getAttribute("data-fit")||"cover";
    const nx=el.nextElementSibling;
    const vch=(el.querySelector? el.querySelector('video[data-cde-slot-video]') : null)||((el.tagName==="IMG"&&nx&&nx.tagName==="VIDEO"&&nx.getAttribute("data-cde-slot-video")&&nx.getAttribute("data-cde-slot-owner")===id)?nx:null);
    if(a){
      if(a.kind==="video"){
        let v=vch;
        if(el.tagName==="IMG"){
          el.removeAttribute("src"); el.style.display="none";
          if(!v){ v=doc.createElement("video"); v.setAttribute("data-cde-slot-video","1"); v.setAttribute("data-cde-slot-owner",id); v.className=el.className; v.style.cssText=el.style.cssText; el.insertAdjacentElement("afterend",v); }
          v.style.display="";
        } else {
          el.style.backgroundImage="none"; el.style.display=""; if(!/(absolute|relative|fixed|sticky)/.test(el.style.position||"")) el.style.position="relative";
          if(!v){ v=doc.createElement("video"); v.setAttribute("data-cde-slot-video","1"); v.style.cssText="position:absolute;left:0;top:0;width:100%;height:100%;"; el.appendChild(v); }
        }
        v.muted=true; v.autoplay=true; v.loop=false; v.playsInline=true; v.preload="auto"; v.setAttribute("playsinline",""); v.style.objectFit=fit; v.setAttribute("data-cde-slot-id",id); v.setAttribute("data-vin",_vinAttr(a));
        v.onended=function(){ try{ v.currentTime=_vinRound(a.vin); var pp2=v.play(); if(pp2&&pp2.catch)pp2.catch(function(){}); }catch(_){} };
        if(v.getAttribute("src")!==a.url){ v.src=a.url; var start=function(){ try{ v.currentTime=Math.min(_vinRound(a.vin),Math.max(0,(v.duration||0)-0.05)); var pp=v.play(); if(pp&&pp.catch)pp.catch(function(){}); }catch(_){} }; if(v.readyState>=1)start(); else v.addEventListener("loadedmetadata",start,{once:true}); }
      }
      else if(el.tagName==="IMG"){ if(vch){ try{ vch.remove(); }catch(_){} } el.src=a.url; el.style.objectFit=fit; el.style.display=""; el.style.visibility="visible"; }
      else { if(vch){ try{ vch.remove(); }catch(_){} } el.style.backgroundImage="url("+a.url+")"; el.style.backgroundSize=(fit==="contain"?"contain":"cover"); el.style.backgroundPosition="center"; el.style.backgroundRepeat="no-repeat"; el.style.display=""; }
    } else {
      if(vch){ try{ vch.remove(); }catch(_){} } if(el.tagName==="IMG"){ el.removeAttribute("src"); } else { el.style.backgroundImage="none"; }
      el.style.display="none";
    }
  });
}
function assignImgSlot(id, file){
  if(!file||!/^(image|video)\//.test(file.type||"")){ log("画像または動画ファイルを指定してください。", true); return; }
  const kind=/^video\//.test(file.type||"")?"video":"image";
  const def=discoverImgSlots().find(s=>s.id===id)||{fit:"cover"};
  const old=M.imgAssign[id]; if(old){ try{URL.revokeObjectURL(old.url);}catch(_){} }
  const url=URL.createObjectURL(file);
  M.imgAssign[id]={name:file.name||"image", kind:kind, file:file, url:url, dataUrl:null, fit:def.fit||"cover", expName:_safeFn(id)+"__"+_safeFn(file.name||"image")};
  M.imgTouched[id]="assigned";
  if(kind==="video"){ M.imgAssign[id].vin=0; M.imgAssign[id].duration=null; }
  // データURLも用意：srcdocプレビュー（file://でもblobが読めない場合がある）と書き出しの両方で確実に表示させる
  try{ const owner=M,assigned=M.imgAssign[id],_fr=new FileReader(); _fr.onload=()=>{ const a2=M.imgAssign[id]; if(M===owner&&a2===assigned){ a2.dataUrl=_fr.result; if(M.dcMode) buildPreview(); } }; _fr.readAsDataURL(file); }catch(_){}
  projectChanged();(M.dcMode?buildPreview():applyImgSlots()); renderImgSlots(); log((kind==="video"?"動画":"画像")+"スロット「"+id+"」に "+(file.name||"素材")+" を差し込みました。"+(kind==="video"?"（開始位置0.0秒。画像／動画タブで調整できます）":""));
}
function clearImgSlot(id){ const a=M.imgAssign[id]; if(a){ try{URL.revokeObjectURL(a.url);}catch(_){} delete M.imgAssign[id]; } M.imgTouched[id]="cleared"; (M.dcMode?buildPreview():applyImgSlots()); renderImgSlots(); }
function flashImgSlot(id){ _slotEls(id).forEach(el=>{ const od=el.style.display, oo=el.style.outline; el.style.display="block"; el.style.minWidth="10px"; el.style.minHeight="10px"; el.style.outline="3px solid #f2c14e"; el.style.outlineOffset="-2px"; setTimeout(()=>{ el.style.outline=oo; el.style.outlineOffset=""; el.style.minWidth=""; el.style.minHeight=""; el.style.display=od; },1600); }); }
function _appendVinEditor(row,s,a,thumb){
  const box=document.createElement("div"); box.className="ivin";
  const head=document.createElement("div"); head.className="ivinhead";
  const lab=document.createElement("label"); lab.textContent="動画の開始位置";
  const num=document.createElement("input"); num.type="number"; num.className="ivinnum"; num.min="0"; num.step="0.1"; num.inputMode="decimal";
  const unit=document.createElement("span"); unit.className="ivinunit"; unit.textContent="秒";
  const meta=document.createElement("span"); meta.className="ivinmeta";
  head.appendChild(lab); head.appendChild(num); head.appendChild(unit); head.appendChild(meta);
  const range=document.createElement("input"); range.type="range"; range.className="ivinrange"; range.min="0"; range.step="0.1"; range.value="0"; range.disabled=true;
  const warn=document.createElement("div"); warn.className="ivinwarn";
  box.appendChild(head); box.appendChild(range); box.appendChild(warn); row.appendChild(box);
  function sync(){
    a.vin=_vinNorm(a,a.vin); const inf=_vinInfo(s.id,a), val=inf.vin.toFixed(1); num.value=val; range.value=val;
    if(inf.duration!=null){ const mx=_vinMax(a); num.max=mx.toFixed(1); range.max=mx.toFixed(1); range.disabled=false; meta.textContent="素材 "+inf.duration.toFixed(1)+"秒／残り "+inf.remain.toFixed(1)+"秒"+(inf.sceneMax!=null?("／使用シーン最大 "+inf.sceneMax.toFixed(1)+"秒"):"／シーン尺を確認できません"); }
    else { num.removeAttribute("max"); range.disabled=true; meta.textContent="素材尺を取得中…"+(inf.sceneMax!=null?("／使用シーン最大 "+inf.sceneMax.toFixed(1)+"秒"):"／シーン尺を確認できません"); }
    if(inf.warn){ warn.classList.add("show"); warn.textContent="⚠ 開始位置以降の残り尺がシーン尺より短いため、末尾フレームで停止する可能性があります。書き出しは続行できます。"; }
    else { warn.classList.remove("show"); warn.textContent=""; }
    try{ if(thumb&&thumb.readyState>=1){ thumb.pause(); thumb.currentTime=Math.min(inf.vin,Math.max(0,(thumb.duration||0)-0.05)); } }catch(_){}
  }
  function change(v){ a.vin=_vinNorm(a,v); sync(); _applyVinToPreview(s.id); }
  num.addEventListener("input",function(){ if(num.value!=="") change(num.value); });
  num.addEventListener("change",function(){ change(num.value); });
  range.addEventListener("input",function(){ change(range.value); });
  function metadata(){ var d=thumb&&parseFloat(thumb.duration); if(isFinite(d)&&d>0){ a.duration=d; a.vin=_vinNorm(a,a.vin); } sync(); _applyVinToPreview(s.id); }
  if(thumb){ thumb.preload="auto"; thumb.muted=true; thumb.autoplay=false; thumb.loop=false; thumb.addEventListener("loadedmetadata",metadata); if(thumb.readyState>=1) metadata(); }
  sync();
}
function renderImgSlots(){
  const wrap=$("#imgList"); if(!wrap) return; wrap.innerHTML="";
  const slots=discoverImgSlots();
  if(!slots.length){ wrap.innerHTML='<div class="hint" style="padding:12px">画像／動画スロットが見つかりません。<br>ネイティブの <code class="k">&lt;image-slot id="..."&gt;</code> または <code class="k">data-img-slot</code> 要素があると、ここから差し込めます。</div>'; return; }
  const src=currentJsxText();
  const scn=detectScenes(src); const labOf=(p)=> scn.length? sceneLabelFor(scn, p!=null?p:0, src): null;
  const ordered=_orderSlotsByScene(slots, src);
  const counts={}; ordered.forEach(o=>{ const k=(labOf(o.slot.pos)==null?"__NOSCENE__":labOf(o.slot.pos)); counts[k]=(counts[k]||0)+1; });
  let curK;
  ordered.forEach(o=>{
    const s=o.slot;
    const lab=labOf(s.pos); const k=(lab==null?"__NOSCENE__":lab);
    if(k!==curK){ curK=k; const h=document.createElement("div"); h.className="tgroup"; h.textContent=(lab||"その他")+"  "+counts[k]+"件"; wrap.appendChild(h); }
    const a=M.imgAssign[s.id];
    const row=document.createElement("div"); row.className="islot"+(a?" filled":"");
    const head=document.createElement("div"); head.className="ishead";
    const tt=document.createElement("div"); tt.className="istitle"; tt.innerHTML='<b>'+_escI(s.label)+'</b> <span class="icode">'+_escI(s.id)+'</span> <span class="ifit">'+_escI(s.fit)+'</span>'; head.appendChild(tt);
    const flash=document.createElement("button"); flash.type="button"; flash.className="ilink"; flash.textContent="プレビューで光らせる"; flash.onclick=()=>flashImgSlot(s.id); head.appendChild(flash);
    row.appendChild(head);
    const drop=document.createElement("label"); drop.className="idrop";
    const inp=document.createElement("input"); inp.type="file"; inp.accept="image/*,video/*"; inp.hidden=true; inp.onchange=()=>{ const f=inp.files[0]; if(f) assignImgSlot(s.id,f); };
    let th=null;
    if(a){ if(a.kind==="video"){ th=document.createElement("video"); th.muted=true; th.autoplay=false; th.loop=false; th.preload="auto"; th.playsInline=true; th.setAttribute("playsinline",""); th.src=a.url; } else { th=document.createElement("img"); th.src=a.url; } th.className="ithumb"; drop.appendChild(th); const nm=document.createElement("div"); nm.className="inm"; nm.textContent=(a.kind==="video"?"🎬 ":"")+a.name; drop.appendChild(nm); }
    else { const ph=document.createElement("div"); ph.className="iph"; ph.innerHTML="クリックで画像／動画を選択<br>またはここにドラッグ＆ドロップ"; drop.appendChild(ph); }
    drop.appendChild(inp);
    drop.addEventListener("dragover", e=>{ e.preventDefault(); e.stopPropagation(); drop.classList.add("drop"); });
    drop.addEventListener("dragleave", ()=>drop.classList.remove("drop"));
    drop.addEventListener("drop", e=>{ e.preventDefault(); e.stopPropagation(); drop.classList.remove("drop"); const f=e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files[0]; if(f) assignImgSlot(s.id,f); });
    row.appendChild(drop);
    if(a&&a.kind==="video") _appendVinEditor(row,s,a,th);
    if(a){ const clr=document.createElement("button"); clr.type="button"; clr.className="iclear"; clr.textContent="クリア（表示しない）"; clr.onclick=(e)=>{ e.preventDefault(); clearImgSlot(s.id); }; row.appendChild(clr); }
    wrap.appendChild(row);
  });
}

// ============================================================
// Save edited JSX back into model
// ============================================================
function commitJsx(){const text=currentJsxText();if(M.dcMode){M.dcSource=text;return;}if(M.jsxPath&&dec.decode(M.files.get(M.jsxPath)?.bytes||new Uint8Array())!==text)M.files.set(M.jsxPath,{bytes:enc.encode(text),mime:"text/jsx"});}

// ============================================================
// テキスト（テロップ）編集：JSX 内の「日本語を含む文字列リテラル」だけをフォーム化
// （色コード・easing名・CSS等の英数字文字列は除外されるので、誤編集しにくい）
// ============================================================
let _textState=null; // {parts:[], slots:[{quote,value}]}
const JP_RE=/[\u3040-\u30ff\u3400-\u9fff\uff00-\uffef\u3000-\u303f]/;
function unescapeJs(s){return s.replace(/\\(?:u\{([0-9a-f]+)\}|u([0-9a-f]{4})|x([0-9a-f]{2})|([\s\S]))/gi,(all,wide,unicode,hex,c)=>{if(wide||unicode||hex){const n=parseInt(wide||unicode||hex,16);return n<=0x10ffff?String.fromCodePoint(n):all;}return ({n:"\n",r:"\r",t:"\t",b:"\b",f:"\f",v:"\v","0":"\0"})[c]??c;});}
function escapeForQuote(s,q){ const B=String.fromCharCode(92); let out=""; for(let i=0;i<s.length;i++){ const ch=s[i]; if(ch===B) out+=B+B; else if(ch===q) out+=B+ch; else if(ch==="\r") out+=B+"r"; else if(q!=="`" && ch==="\n") out+=B+"n"; else if(q==="`" && ch==="$" && s[i+1]==="{") out+=B+ch; else out+=ch; } return out; }
// JSX テキストノード（タグ間の生テキスト）を書き戻す際のエスケープ
function decodeTextEntities(s){const el=document.createElement("textarea");el.innerHTML=s;return el.value;}
function escapeJsxText(s){ return s.split("&").join("&amp;").split("<").join("&lt;").split(">").join("&gt;").split("{").join("&#123;").split("}").join("&#125;"); }
function extractTextState(){
  const src=currentJsxText(); const B=String.fromCharCode(92);
  const Q=String.fromCharCode(34,39,96); // " ' `
  const stoppers=Q+"<{}";
  const parts=[], slots=[]; let last=0, i=0;
  while(i<src.length){
    const c=src[i];
    // 1) 文字列リテラル（プロパティ値など）
    if(Q.indexOf(c)>=0){
      let j=i+1, esc=false, broke=false;
      // タグ境界(< >)や改行で中断する引用符は JS 文字列ではなく HTML 属性/CSS のもの。
      // 文字列扱いすると引用符のペアがずれ、巨大なstrスロットがHTML・改行をまたいで実改行が \n に化ける不具合になる。
      while(j<src.length){ const d=src[j]; if(esc){ esc=false; } else if(d===B){ esc=true; } else if(d===c){ break; } else if(d==="<"||d===">"||d==="\n"||d==="\r"){ broke=true; break; } j++; }
      if(broke || j>=src.length || src[j]!==c){ i++; continue; }
      const inner=src.slice(i+1,j); const isTpl=(c==="`");
      if(JP_RE.test(inner) && !(isTpl && inner.indexOf("${")>=0)){
        parts.push(src.slice(last,i)); slots.push({kind:"str", quote:c, value:unescapeJs(inner), originalValue:unescapeJs(inner), raw:src.slice(i,j+1), pos:i}); last=j+1;
      }
      i=j+1; continue;
    }
    // 2) JSX テキストノード：> と < の間の生テキスト（例: >愛称<）
    if(c===">"){
      let j=i+1; while(j<src.length && stoppers.indexOf(src[j])<0) j++;
      if(j<src.length && src[j]==="<"){
        const raw=src.slice(i+1,j);
        if(JP_RE.test(raw)){
          let a=0; while(a<raw.length && raw[a]<=" ") a++;
          let b=raw.length; while(b>a && raw[b-1]<=" ") b--;
          parts.push(src.slice(last,i+1)); // '>' まで含める
          slots.push({kind:"jsx", lead:raw.slice(0,a), value:decodeTextEntities(raw.slice(a,b)), originalValue:decodeTextEntities(raw.slice(a,b)), raw:raw, trail:raw.slice(b), pos:i}); last=j;
        }
      }
      i=j; continue;
    }
    i++;
  }
  parts.push(src.slice(last)); return {parts,slots}; // v17: ここで _textState を書き換えない（読み取り専用の呼び出しが編集フォームを無効化していた）
}
function rebuildFromText(state, slot){
  const S=state||_textState; if(!S) return; const {parts,slots}=S; let out=parts[0];
  for(let i=0;i<slots.length;i++){ const s=slots[i]; out+=(s.value===s.originalValue?s.raw:(s.kind==="jsx" ? s.lead+escapeJsxText(s.value)+s.trail : s.quote+escapeForQuote(s.value,s.quote)+s.quote))+parts[i+1]; }
  $("#code").value=out; commitJsx(); if(slot) seekToSlotScene(slot); scheduleRebuild();
}
// v17: 直したテキストが載っているシーンへプレビューを移動して止める。
// これが無いと再描画のたびに0秒へ戻り、4秒以降のシーンの文字は「直したのに変わらない」ように見える。
function seekToSlotScene(slot){
  try{
    if(!M.dcMode || !slot || slot.pos==null) return;
    const src=currentJsxText();
    const pb=dcParseBounds();
    const idx=dcSceneIndexForPos(src, slot.pos);
    if(idx<0 || !pb.bounds || idx>=pb.bounds.length) return;
    let a=pb.bounds[idx], b=(idx+1<pb.bounds.length? pb.bounds[idx+1] : pb.dur);
    const capT=dcCaptionTimeForPos(src, slot.pos);
    if(capT!=null && isFinite(capT)) a=Math.max(a, Math.min(capT, (isFinite(b)?b:capT+1)-0.05));
    const t=Math.max(a, Math.min(a+0.9, (isFinite(b)?b:a+1)-0.05));
    M._seekAfterRebuild={t:t};
  }catch(_){}
}
function renderTextEditor(){
  const wrap=$("#textList"); if(!wrap) return; wrap.innerHTML=""; const st=(_textState=extractTextState());
  if(!st.slots.length){ wrap.innerHTML='<div class="hint" style="padding:12px">編集できる日本語テキストが見つかりませんでした。JSXタブで直接編集できます。</div>'; return; }
  const src=currentJsxText();
  const _scn=detectScenes(src);
  const _labOf=(p)=> _scn.length? sceneLabelFor(_scn, p!=null?p:0, src) : null;
  const ordered=_orderSlotsByScene(st.slots, src);
  const _counts={}; ordered.forEach(o=>{ const l=_labOf(o.slot.pos); const k=(l==null?"\u0000":l); _counts[k]=(_counts[k]||0)+1; });
  let _curK;
  ordered.forEach((o,n)=>{
    const slot=o.slot;
    const _lab=_labOf(slot.pos); const _k=(_lab==null?"\u0000":_lab);
    if(_k!==_curK){ _curK=_k; const h=document.createElement("div"); h.className="tgroup"; h.textContent=(_lab||"その他")+"  "+_counts[_k]+"件"; wrap.appendChild(h); }
    const row=document.createElement("div"); row.className="trow";
    const idx=document.createElement("div"); idx.className="tidx"; idx.textContent=String(n+1);
    const ta=document.createElement("textarea"); ta.className="tinput"; ta.value=slot.value; ta.rows=Math.min(5, slot.value.split("\n").length);
    ta.addEventListener("input",()=>{ slot.value=ta.value; rebuildFromText(st, slot); }); // v17: このフォームが束ねている state と、直した行を明示的に渡す
    row.appendChild(idx); row.appendChild(ta); wrap.appendChild(row);
  });
}

// ============================================================
// マークアップ＆コメント（AIに渡す指示を書き出す）
// ============================================================
let cmMode=null; M.comments=M.comments||[]; let _cmSeq=0;
let _attSeq=0;
function _safeFn(s){ return String(s||"file").replace(/[\\\/:*?"<>|\s]+/g,"_").slice(0,50); }
function _isAttMedia(f){ if(!f) return false; if(/^(image|video)\//i.test(f.type||"")) return true; const n=f.name||""; return isImage(n)||/\.(?:mp4|webm|mov|m4v|mkv|avi)$/i.test(n); }
function addAtt(c, files){ if(!c) return; if(!c.atts) c.atts=[]; const list=files&&files.length!=null?Array.from(files):[]; for(const f of list){ if(!_isAttMedia(f)) continue; const url=URL.createObjectURL(f); const kind=/^video\//i.test(f.type||"")||/\.(?:mp4|webm|mov|m4v|mkv|avi)$/i.test(f.name||"")?"video":"image"; c.atts.push({name:f.name||"file", mime:f.type||mimeOf(f.name||""), kind:kind, url, file:f, expName:(++_attSeq)+"_"+_safeFn(f.name||"file")}); } }
function attUIInto(mount, getC, ensureC, onChange){
  if(!mount) return; mount.innerHTML="";
  const box=document.createElement("div"); box.className="attach";
  const btn=document.createElement("button"); btn.type="button"; btn.className="abtn"; btn.textContent="📎 画像/動画を追加（複数可）";
  const inp=document.createElement("input"); inp.type="file"; inp.accept="image/*,video/*"; inp.multiple=true; inp.style.display="none";
  btn.onclick=()=>inp.click();
  inp.onchange=()=>{ if(inp.files&&inp.files.length){ addAtt(ensureC&&ensureC(), inp.files); onChange&&onChange(); } inp.value=""; };
  box.appendChild(btn); box.appendChild(inp);
  const cur=getC&&getC(); const atts=(cur&&cur.atts)||[];
  if(atts.length){ const grid=document.createElement("div"); grid.className="agrid";
    atts.forEach((a,ai)=>{ const cell=document.createElement("div"); cell.className="acell"; let th; if(a.kind==="video"){ th=document.createElement("video"); th.src=a.url; th.muted=true; th.setAttribute("playsinline",""); } else { th=document.createElement("img"); th.src=a.url; } const x=document.createElement("button"); x.type="button"; x.className="ax"; x.textContent="\u00d7"; x.title="\u524a\u9664"; x.onclick=()=>{ try{URL.revokeObjectURL(a.url);}catch(_){} const c2=getC&&getC(); if(c2&&c2.atts) c2.atts.splice(ai,1); onChange&&onChange(); }; const nm=document.createElement("div"); nm.className="anm"; nm.textContent=a.name; cell.appendChild(th); cell.appendChild(x); cell.appendChild(nm); grid.appendChild(cell); });
    box.appendChild(grid);
  }
  box.addEventListener("dragover", e=>{ e.preventDefault(); e.stopPropagation(); box.classList.add("drop"); });
  box.addEventListener("dragleave", ()=>box.classList.remove("drop"));
  box.addEventListener("drop", e=>{ e.preventDefault(); e.stopPropagation(); box.classList.remove("drop"); const fs=e.dataTransfer&&e.dataTransfer.files; if(fs&&fs.length){ addAtt(ensureC&&ensureC(), fs); onChange&&onChange(); } });
  mount.appendChild(box);
}
function cmTypeLabel(m){ return m==="select"?"テキスト選択": m==="rect"?"矩形範囲": m==="free"?"フリーハンド": m==="pin"?"ピン": m==="scene"?"シーン全体": m==="deck"?"全体指示":"注釈"; }
// v21: 本編シーンの <sc-if> だけを数える。字幕(cN)・アーカイブ等級などのオーバーレイは除外する。
function _dcParseNumArr(src,name){
  var m=String(src||"").match(new RegExp("\\b"+name+"\\s*=\\s*\\[([^\\]]*)\\]"));
  if(!m) return [];
  return m[1].split(",").map(function(x){return parseFloat(String(x).trim());}).filter(function(x){return isFinite(x);});
}
function _dcScIfValue(tag){
  var m=/\bvalue\s*=\s*(["'])([\s\S]*?)\1/i.exec(tag||"");
  if(!m) return "";
  var v=String(m[2]||"").trim();
  var inn=/^\{\{\s*([^}]+?)\s*\}\}$/.exec(v);
  return (inn?inn[1]:v).trim();
}
function _dcIsAuxScIfValue(v){
  v=String(v||"");
  if(/^c\d+$/i.test(v)) return true;
  return /^(archive|archivegrade|grade|overlay|filter|fx|grain|vignette|sub|subs|subtitle|subtitles|caption|captions|cap)$/i.test(v);
}
function _dcParseScIfBlocks(src){
  src=src||"";
  var blocks=[], stack=[], re=/<\/?sc-if\b[^>]*>/ig, m;
  while((m=re.exec(src))){
    var tag=m[0], isClose=/^<\//.test(tag), selfClose=/\/>\s*$/.test(tag);
    if(isClose){
      if(stack.length){
        var st=stack.pop();
        blocks.push({start:st.start,end:m.index+tag.length,value:st.value,depth:st.depth,tag:st.tag});
      }
    }else{
      var rec={start:m.index,value:_dcScIfValue(tag),depth:stack.length,tag:tag};
      if(selfClose) blocks.push({start:m.index,end:m.index+tag.length,value:rec.value,depth:rec.depth,tag:tag});
      else stack.push(rec);
    }
  }
  blocks.sort(function(a,b){return a.start-b.start;});
  return blocks;
}
function _dcParseSceneComments(src){
  src=src||"";
  var out=[], re=/<!--([\s\S]*?)-->/g, m;
  while((m=re.exec(src))){
    var body=m[1];
    if(!/(?:SCENE|Scene|\u30b7\u30fc\u30f3)/.test(body)) continue;
    var sm=/(?:^|[^A-Za-z_])(?:SCENE|Scene)\s*(\d*)\s*[:\uff1a]\s*([^\n\r]*)|\u30b7\u30fc\u30f3\s*(\d*)\s*[:\uff1a]\s*([^\n\r]*)/.exec(body);
    if(!sm) continue;
    var fromEn=(sm[1]!=null||sm[2]!=null);
    var num=fromEn?sm[1]:sm[3];
    var lab=String(fromEn?sm[2]:sm[4]||"").replace(/[=\-\s]+$/,"").replace(/^[=\-\s]+/,"").trim();
    if(lab.length>50) lab=lab.slice(0,50);
    out.push({pos:m.index,end:m.index+m[0].length,num:(num!==""&&num!=null&&isFinite(+num))?+num:null,label:lab});
  }
  return out;
}
function _dcLabelScene(i,lab,num){
  var n=(num!=null?num:i+1);
  return lab?("\u30b7\u30fc\u30f3"+n+"\uff1a"+lab):("\u30b7\u30fc\u30f3"+n);
}
function _dcPickSceneBlocks(src, all){
  all=all||_dcParseScIfBlocks(src);
  if(!all.length) return [];
  var comments=_dcParseSceneComments(src);
  var picked=[], seen={};
  if(comments.length){
    for(var ci=0;ci<comments.length;ci++){
      var c=comments[ci], blk=null;
      for(var ai=0;ai<all.length;ai++){
        if(all[ai].start<c.end) continue;
        if(!/^\s*$/.test(src.slice(c.end, all[ai].start))) continue;
        blk=all[ai];
        break;
      }
      if(blk && !seen[blk.start]){
        seen[blk.start]=1;
        picked.push({label:_dcLabelScene(picked.length,c.label,c.num),pos:c.pos,start:blk.start,end:blk.end,value:blk.value});
      }
    }
    if(picked.length>=1) return picked;
  }
  var bounds=_dcParseNumArr(src,"BOUNDS");
  var sBlocks=all.filter(function(b){return /^s\d+$/i.test(b.value);})
    .sort(function(a,b){return parseInt(a.value.slice(1),10)-parseInt(b.value.slice(1),10);});
  if(sBlocks.length>=2 && (!bounds.length || sBlocks.length===bounds.length)){
    return sBlocks.map(function(b,i){return {label:_dcLabelScene(i,"",null),pos:b.start,start:b.start,end:b.end,value:b.value};});
  }
  var top=all.filter(function(b){return b.depth===0 && !_dcIsAuxScIfValue(b.value);});
  if(top.length>=1){
    return top.map(function(b,i){return {label:_dcLabelScene(i,"",null),pos:b.start,start:b.start,end:b.end,value:b.value};});
  }
  return all.filter(function(b){return !_dcIsAuxScIfValue(b.value);})
    .map(function(b,i){return {label:_dcLabelScene(i,"",null),pos:b.start,start:b.start,end:b.end,value:b.value};});
}
var _dcSceneMemo={k:null,blocks:null,all:null,caps:null};
// Keep original source offsets: DOM serialization would move text/slot edit ranges.
function _dcParseHtmlScenes(src){
  var re=/<!--[\s\S]*?-->|<(script|style|textarea|title)\b(?:"[^"]*"|'[^']*'|[^'">])*?>[\s\S]*?<\/\1\s*>|<\/?([a-z][\w:-]*)\b(?:"[^"]*"|'[^']*'|[^'">])*?>/ig;
  var stack=[], out=[], pending=null, m;
  function attr(tag,name){var a=new RegExp('\\s'+name+'\\s*=\\s*(?:"([^"]*)"|\'([^\']*)\'|([^\\s>]+))','i').exec(tag);return a?(a[1]||a[2]||a[3]||''):'';}
  while((m=re.exec(src))){
    var tag=m[0];
    if(tag.slice(0,4)==='<!--'){
      var c=/^<!--\s*(?:SCENE|シーン)\s+(\d+)(?:\s*[:：]\s*([\s\S]*?))?\s*-->$/i.exec(tag);
      pending=c?{end:re.lastIndex,pos:m.index,num:+c[1],label:(c[2]||'').trim()}:null;
      continue;
    }
    if(m[1]){pending=null;continue;}
    var name=(m[2]||'').toLowerCase();
    if(/^<\//.test(tag)){
      for(var j=stack.length-1;j>=0;j--)if(stack[j].name===name){
        var b=stack[j];stack.length=j;
        if(b.scene){b.scene.end=re.lastIndex;out.push(b.scene);}break;
      }
      pending=null;continue;
    }
    var id=attr(tag,'id'),label=attr(tag,'data-screen-label');
    var comment=pending&&/^\s*$/.test(src.slice(pending.end,m.index))?pending:null;
    var marked=/^(div|section|main|article)$/.test(name)&&(label||/^S_/i.test(id)||comment);
    var scene=null;
    if(marked&&!stack.some(function(b){return b.scene;}))scene={start:m.index,end:re.lastIndex,pos:comment?comment.pos:m.index,value:id,label:label||_dcLabelScene(out.length,comment?comment.label:id,comment?comment.num:null),html:true};
    if(!/\/>$/.test(tag)&&! /^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/.test(name))stack.push({name:name,scene:scene});
    else if(scene)out.push(scene);
    pending=null;
  }
  return out.sort(function(a,b){return a.start-b.start;});
}
function dcCollectSceneBlocks(src){
  src=src||"";
  if(_dcSceneMemo.k===src && _dcSceneMemo.blocks) return _dcSceneMemo.blocks;
  var all=_dcParseScIfBlocks(src);
  var blocks=_dcPickSceneBlocks(src, all);
  if(!blocks.length) blocks=_dcParseHtmlScenes(src);
  var caps=all.filter(function(b){return /^c\d+$/i.test(b.value);})
    .sort(function(a,b){return parseInt(String(a.value).slice(1),10)-parseInt(String(b.value).slice(1),10);});
  _dcSceneMemo={k:src,blocks:blocks,all:all,caps:caps};
  return blocks;
}
function _dcCaptionBlocks(src){
  src=src||"";
  if(_dcSceneMemo.k!==src) dcCollectSceneBlocks(src);
  return _dcSceneMemo.caps||[];
}
function dcSceneIndexForPos(src,pos){
  src=src||""; if(pos==null) return -1;
  var blocks=dcCollectSceneBlocks(src);
  var i, prev=-1;
  for(i=0;i<blocks.length;i++){
    if(pos>=blocks[i].start && pos<blocks[i].end) return i;
    if(blocks[i].start<=pos) prev=i;
  }
  var all=_dcSceneMemo.all||[];
  for(i=0;i<all.length;i++){
    if(pos>=all[i].start && pos<all[i].end){
      if(_dcIsAuxScIfValue(all[i].value) && !/^c\d+$/i.test(all[i].value)) return -1;
      break;
    }
  }
  var caps=_dcCaptionBlocks(src);
  var ci=-1;
  for(i=0;i<caps.length;i++){
    if(pos>=caps[i].start && pos<caps[i].end){ ci=i; break; }
  }
  if(ci<0) return blocks.length&&blocks[0].html?-1:prev;
  var subs=_dcParseNumArr(src,"SUBS"), bounds=_dcParseNumArr(src,"BOUNDS");
  if(subs.length && bounds.length && ci<subs.length){
    var t=subs[ci], si=0;
    for(i=0;i<bounds.length;i++){ if(t>=bounds[i]) si=i; else break; }
    if(si<blocks.length) return si;
  }
  return -2;
}
function dcCaptionTimeForPos(src,pos){
  src=src||""; if(pos==null) return null;
  var caps=_dcCaptionBlocks(src), subs=_dcParseNumArr(src,"SUBS"), i;
  for(i=0;i<caps.length;i++){
    if(pos>=caps[i].start && pos<caps[i].end){
      return (i<subs.length && isFinite(subs[i])) ? subs[i] : null;
    }
  }
  return null;
}
function _orderSlotsByScene(slots,src){
  return (slots||[]).map(function(s,i){return {slot:s,i:i,idx:dcSceneIndexForPos(src,s.pos)};})
    .sort(function(a,b){
      function key(x){ return x.idx===-2?10000:(x.idx<0?9999:x.idx); }
      var ka=key(a), kb=key(b);
      return ka!==kb?ka-kb:((a.slot.pos-b.slot.pos)||(a.i-b.i));
    });
}
function detectScenes(src){
  src=src||"";
  const sortp=a=>a.sort((x,y)=>x.pos-y.pos);
  // v21: ネイティブ Claude Design は本編 <sc-if>（<!-- SCENE n : ラベル --> または sN）だけをシーンにする。
  // 字幕 cN や archive などのオーバーレイ <sc-if> は一覧・再生追従の対象外。
  if(M.dcMode){
    const blocks=dcCollectSceneBlocks(src);
    if(blocks.length) return sortp(blocks.map(function(b){return {label:b.label,pos:b.pos,start:b.start,end:b.end,value:b.value};}));
    return [];
  }
  const collect=(re)=>{ const a=[],seen={}; let m; while((m=re.exec(src))){ const name=(m[1]||m[2]||"").trim(); if(!name||seen[m.index])continue; seen[m.index]=1; a.push({label:name,pos:m.index}); } return a; };
  let s=collect(/(?:function\s+(S_[A-Za-z0-9_]+)\s*\(|(?:const|let|var)\s+(S_[A-Za-z0-9_]+)\s*=)/g);
  if(s.length>=2) return sortp(s);
  s=[]; let re=/(?:\/\/|\/\*)\s*((?:SCENE|Scene|\u30b7\u30fc\u30f3)[^\n\r*]*)/g,m;
  while((m=re.exec(src))){ let lab=m[1].trim().replace(/[\u2014\u2013-]+\s*$/,"").trim(); if(lab.length>60)lab=lab.slice(0,60); s.push({label:lab,pos:m.index}); }
  if(s.length>=1) return sortp(s);
  s=collect(/(?:function\s+([A-Z][A-Za-z0-9_]*)\s*\(|(?:const|let|var)\s+([A-Z][A-Za-z0-9_]*)\s*=\s*(?:\([^)]*\)|[A-Za-z0-9_]*)\s*=>)/g);
  return sortp(s);
}
function sceneLabelFor(scenes,pos,src){
  src=src||((typeof currentJsxText==="function")?currentJsxText():"");
  if(M.dcMode){
    var idx=dcSceneIndexForPos(src,pos);
    if(idx===-2) return "\u5b57\u5e55";
    if(idx>=0 && scenes && scenes[idx]) return scenes[idx].label;
    return null;
  }
  if(!scenes||!scenes.length) return null;
  let lab=scenes[0].label;
  for(const s of scenes){ if(s.pos<=pos) lab=s.label; else break; }
  return lab;
}
// v21: 本編シーンの範囲だけを返す。字幕・オーバーレイの <sc-if> は含めない。
function dcSceneRanges(src){
  return dcCollectSceneBlocks(src).map(function(b){return {start:b.start,end:b.end};});
}
function _visEl(win,el){ let e=el,d=0; while(e&&e.nodeType===1&&d<40){ let cs; try{cs=win.getComputedStyle(e);}catch(_){return true;} if(cs){ if(cs.display==="none"||cs.visibility==="hidden"||cs.visibility==="collapse") return false; if(parseFloat(cs.opacity||"1")<0.06) return false; } e=e.parentElement; d++; } return true; }
function visibleText(doc){ const win=doc.defaultView||window; let out=""; let n; try{ const fr=$("#frame"); const fb=fr.getBoundingClientRect(); const dc=!!M.dcMode; const vw=(win.innerWidth||(doc.documentElement&&doc.documentElement.clientWidth)||fr.clientWidth||0); const vh=(win.innerHeight||(doc.documentElement&&doc.documentElement.clientHeight)||fr.clientHeight||0); const w=doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT, null); while((n=w.nextNode())){ const t=n.nodeValue; if(!t||!t.trim()) continue; const el=n.parentElement; if(!el) continue; if(!_visEl(win,el)) continue; const r=el.getBoundingClientRect(); if(r.width<=0||r.height<=0) continue; if(dc){ if(r.bottom<=0||r.top>=vh||r.right<=0||r.left>=vw) continue; } else { if(r.bottom<=fb.top||r.top>=fb.bottom||r.right<=fb.left||r.left>=fb.right) continue; } out+=t+"\n"; } }catch(e){} return out; }
function detectVisibleScene(){
  try{
    const src=currentJsxText();
    const scenes=detectScenes(src); if(!scenes.length) return null;
    // v21: 再生追従は「今見えている字幕」ではなく、タイムライン上の本編シーンを選ぶ。
    if(M.dcMode){
      const pb=dcParseBounds();
      if(pb.bounds && pb.bounds.length===scenes.length && typeof M._audT==="number" && isFinite(M._audT)){
        let idx=0; for(let i=0;i<pb.bounds.length;i++){ if(M._audT>=pb.bounds[i]) idx=i; else break; }
        if(scenes[idx]) return scenes[idx].label;
      }
    }
    const doc=$("#frame").contentDocument; if(!doc||!doc.body) return null;
    const txt=visibleText(doc); if(!txt) return null;
    const st=extractTextState(); const tally={};
    const _txtZ=(txt||"").replace(/\s+/g,"");
    for(const s of st.slots){
      if(!s.value||s.value.length<2) continue;
      let hit; if(M.dcMode){ const vZ=s.value.replace(/\s+/g,""); hit=(vZ.length>=2 && _txtZ.indexOf(vZ)>=0); } else { hit=(txt.indexOf(s.value)>=0); }
      if(!hit) continue;
      let lab=null;
      if(M.dcMode){
        const idx=dcSceneIndexForPos(src, s.pos);
        if(idx<0) continue;
        lab=scenes[idx]?scenes[idx].label:null;
      } else {
        lab=sceneLabelFor(scenes, s.pos!=null?s.pos:0, src);
      }
      if(lab) tally[lab]=(tally[lab]||0)+1;
    }
    let best=null,bestN=0; for(const k in tally){ if(tally[k]>bestN){ bestN=tally[k]; best=k; } }
    return best;
  }catch(e){} return null;
}
function sceneForComment(c){
  const scenes=detectScenes(currentJsxText());
  if(c.text){ const st=extractTextState(); const hit=st.slots.find(s=>s.value && (s.value===c.text || c.text.indexOf(s.value)>=0 || (s.value.length>=3 && s.value.indexOf(c.text)>=0))); if(hit && hit.pos!=null){ const lab=sceneLabelFor(scenes,hit.pos); if(lab) return lab; } }
  const vis=detectVisibleScene(); if(vis) return vis;
  return "（シーン未特定）";
}
function sceneCode(label){
  const src=currentJsxText();
  const scenes=detectScenes(src);
  const idx=scenes.findIndex(s=>s.label===label);
  if(idx<0) return null;
  if(M.dcMode && scenes[idx] && scenes[idx].start!=null && scenes[idx].end!=null){
    return src.slice(scenes[idx].start, scenes[idx].end).trim();
  }
  const start=scenes[idx].pos;
  const end= idx+1<scenes.length? scenes[idx+1].pos : src.length;
  return src.slice(start,end).trim();
}
function fitCanvas(){ const cv=$("#cmCanvas"), f=$("#frame"); if(!cv||!f) return; cv.width=f.clientWidth; cv.height=f.clientHeight; }
function previewStageRect(){
  const f=$("#frame"), W=(f&&f.clientWidth)||1, H=(f&&f.clientHeight)||1;
  try{ const doc=f.contentDocument, st=doc&&doc.querySelector('[data-cde-stage="1"]'); if(st){ const r=st.getBoundingClientRect(); if(r.width>0&&r.height>0) return {left:r.left,top:r.top,width:r.width,height:r.height}; } }catch(_){}
  return {left:0,top:0,width:W,height:H};
}
function _clamp01(v){ return Math.max(0,Math.min(1,isFinite(v)?v:0)); }
function _stageNormRect(x,y,w,h){ const r=previewStageRect(), x0=_clamp01((x-r.left)/r.width),y0=_clamp01((y-r.top)/r.height),x1=_clamp01((x+w-r.left)/r.width),y1=_clamp01((y+h-r.top)/r.height); return {x:x0,y:y0,w:Math.max(0,x1-x0),h:Math.max(0,y1-y0)}; }
function _stagePoint(nx,ny){ const r=previewStageRect(); return {x:r.left+nx*r.width,y:r.top+ny*r.height}; }
function applyCmMode(){
  const tools=$("#cmTools"); if(tools) tools.querySelectorAll("button[data-cm]").forEach(b=>b.classList.toggle("active", b.dataset.cm===cmMode));
  const layer=$("#cmLayer"); if(!layer) return; const draw=!!cmMode && cmMode!=="select";
  layer.style.pointerEvents = draw?"auto":"none"; layer.classList.toggle("drawing", draw);
  const hv=$("#cmHover"); if(hv) hv.style.display="none"; if(draw) fitCanvas();
}
function setCmMode(m){ cmMode=(cmMode===m?null:m); applyCmMode(); }
function switchTab(pane){ document.querySelectorAll(".tabs button").forEach(x=>x.classList.toggle("active", x.dataset.pane===pane)); document.querySelectorAll(".pane").forEach(x=>x.classList.toggle("active", x.id===pane)); if(pane==="textPane") renderTextEditor(); if(pane==="commentPane") renderComments(); }
function isControlEl(el){
  try{ const fr=$("#frame"); const win=fr&&fr.contentWindow; if(!win||!el) return false;
    const fb=fr.getBoundingClientRect();
    let e=el,d=0;
    while(e&&e.nodeType===1&&d<6){ const tn=e.tagName; if(tn==="BUTTON"||tn==="INPUT"||tn==="SELECT"||tn==="TEXTAREA"||tn==="A"||tn==="SVG"||tn==="PATH") return true; let cs; try{cs=win.getComputedStyle(e);}catch(_){cs=null;} if(cs&&cs.cursor==="pointer") return true; e=e.parentElement; d++; }
    const r=el.getBoundingClientRect(); if(r.top>=fb.bottom-56 && r.bottom<=fb.bottom+2) return true;
    return false;
  }catch(_){ return false; }
}
function attachPreviewHooks(){
  const fr=$("#frame"); const doc=fr&&fr.contentDocument; if(!doc) return;
  doc.addEventListener("mousemove", e=>{ const hv=$("#cmHover"); if(cmMode!=="select"){ if(hv)hv.style.display="none"; return; } const el=e.target; if(!el||!el.getBoundingClientRect) return; if(isControlEl(el)){ if(hv)hv.style.display="none"; return; } const r=el.getBoundingClientRect(); if(!hv)return; hv.style.display="block"; hv.style.left=r.left+"px"; hv.style.top=r.top+"px"; hv.style.width=r.width+"px"; hv.style.height=r.height+"px"; }, true);
  doc.addEventListener("click", e=>{ if(cmMode!=="select") return; const el=e.target; if(isControlEl(el)) return; e.preventDefault(); e.stopPropagation(); const r=el.getBoundingClientRect(); const rectN=_stageNormRect(r.left,r.top,r.width,r.height); let text=(el.innerText||el.textContent||"").trim().replace(/\s+/g," ").slice(0,140); openCommentDialog({mode:"select", text, rectN, pts:null}); }, true);
  try{ (doc.defaultView||fr.contentWindow).addEventListener("scroll",redrawMarks,{passive:true}); }catch(_){}
  redrawMarks();
}
function openCommentDialog(seed){
  const dlg=$("#cmDialog"), ta=$("#cmDlgText"); if(!dlg) return;
  const f=$("#frame"); const W=f.clientWidth,H=f.clientHeight, cp=_stagePoint(seed.rectN.x+seed.rectN.w/2,seed.rectN.y+seed.rectN.h/2);
  let cx=cp.x, cy=cp.y;
  cx=Math.max(8,Math.min(W-294,cx)); cy=Math.max(8,Math.min(H-220,cy));
  dlg.style.left=cx+"px"; dlg.style.top=cy+"px"; dlg.style.display="block";
  $("#cmDlgSel").textContent = seed.text? ("選択テキスト: 「"+seed.text+"」") : (cmTypeLabel(seed.mode)+"でマーク");
  ta.value=""; if(!seed.atts) seed.atts=[];
  function refreshDlgAtt(){ const m=$("#cmDlgAtt"); if(m) attUIInto(m, ()=>seed, ()=>seed, refreshDlgAtt); }
  refreshDlgAtt();
  setTimeout(()=>ta.focus(),0);
  $("#cmDlgSave").onclick=()=>{ const comment=ta.value.trim(); dlg.style.display="none"; if(!comment&&!(seed.atts&&seed.atts.length)) return; const c={id:++_cmSeq, mode:seed.mode, text:seed.text||"", comment, rectN:seed.rectN, pts:seed.pts||null, atts:(seed.atts||[]).slice()}; c.scene=sceneForComment(c); M.comments.push(c); cmMode=null; applyCmMode(); renderComments(); redrawMarks(); switchTab("commentPane"); };
  $("#cmDlgCancel").onclick=()=>{ dlg.style.display="none"; };
}
function redrawMarks(){
  const marks=$("#cmMarks"); if(!marks) return; marks.innerHTML=""; const r=previewStageRect();
  M.comments.forEach((c,i)=>{
    if(c.mode==="scene"||c.mode==="deck") return;
    if(c.mode!=="pin" && c.rectN.w>0){ const b=document.createElement("div"); b.className="cmrect"; b.style.left=(r.left+c.rectN.x*r.width)+"px"; b.style.top=(r.top+c.rectN.y*r.height)+"px"; b.style.width=(c.rectN.w*r.width)+"px"; b.style.height=(c.rectN.h*r.height)+"px"; marks.appendChild(b); }
    const p=document.createElement("div"); p.className="cmpin"; p.textContent=String(i+1); p.title=c.comment; p.style.left=(r.left+(c.rectN.x+c.rectN.w/2)*r.width)+"px"; p.style.top=(r.top+(c.rectN.y+c.rectN.h/2)*r.height)+"px"; p.onclick=()=>{ switchTab("commentPane"); const el=document.getElementById("cmc"+c.id); if(el){ el.scrollIntoView({block:"center"}); el.classList.add("flash"); setTimeout(()=>el.classList.remove("flash"),900); } }; marks.appendChild(p);
  });
}
function renderComments(){
  const wrap=$("#cmList"); if(!wrap) return; wrap.innerHTML="";
  if(!M.comments.length){ wrap.innerHTML='<div class="hint" style="padding:12px">右のプレビューで <b>注釈モード</b>（ツールバーの 選択／矩形／フリー／ピン）を選び、範囲を指定して指示を書いてください。<br>「選択」はプレビュー上の文字をクリックすると、その文と該当シーンを自動で特定します。</div>'; return; }
  const groups={}; M.comments.forEach(c=>{ (groups[c.scene]=groups[c.scene]||[]).push(c); });
  Object.keys(groups).forEach(lab=>{ const h=document.createElement("div"); h.className="tgroup"; h.textContent=lab; wrap.appendChild(h);
    groups[lab].forEach(c=>{ const card=document.createElement("div"); card.className="cmcard"; card.id="cmc"+c.id;
      const meta=document.createElement("div"); meta.className="meta"; const idx=document.createElement("span"); idx.className="badge"; idx.textContent="#"+(M.comments.indexOf(c)+1); const bdg=document.createElement("span"); bdg.style.fontSize="11px"; bdg.style.color="var(--mut)"; bdg.textContent=cmTypeLabel(c.mode); const del=document.createElement("button"); del.className="del"; del.textContent="削除"; del.onclick=()=>{ M.comments=M.comments.filter(x=>x!==c); renderComments(); redrawMarks(); }; meta.appendChild(idx); meta.appendChild(bdg); meta.appendChild(del); card.appendChild(meta);
      if(c.text){ const s=document.createElement("div"); s.className="seltxt"; s.textContent="「"+c.text+"」"; card.appendChild(s); }
      const ta=document.createElement("textarea"); ta.value=c.comment; ta.addEventListener("input",()=>{ c.comment=ta.value; }); card.appendChild(ta); attUIInto(card, ()=>c, ()=>c, ()=>renderComments());
      wrap.appendChild(card);
    });
  });
}
function buildAiPrompt(options){
  // テキスト欄／JSX欄での直前の編集も、AIへ渡す基準版へ必ず確定する。
  commitJsx();
  const opt=options||{}, includeSource=opt.includeSource!==false;
  const NL=String.fromCharCode(10); const file=M.dcMode ? (((M.dcPath&&M.dcPath!=="(bundle)")?M.dcPath:"")||"animation.dc.html") : (M.jsxPath||"component.jsx"); const deck=M.comments.filter(c=>c.mode==="deck"); const rest=M.comments.filter(c=>c.mode!=="deck"); const groups={}; rest.forEach(c=>{ (groups[c.scene]=groups[c.scene]||[]).push(c); }); const hasAtt=M.comments.some(c=>c.atts&&c.atts.length); const _att=(c)=>{ if(c.atts&&c.atts.length) L.push("- 添付ファイル: "+c.atts.map(a=>a.expName).join(", ")); };
  const L=[]; L.push("# 動画コンポーネントの編集依頼"); L.push(""); L.push("あなたは "+(M.dcMode?"HTML形式":"React / JSX形式")+"の動画コンポーネントを編集します。下記コメントの指示どおりに対象ファイルを最小限だけ修正し、コメント外の演出・レイアウト・素材・テキストを維持してください。"); L.push(""); L.push("対象ファイル: "+file); L.push("※ CDE2でユーザーが直接編集した現在の内容を基準版（現状の正）として扱ってください。以下のコメントは、その基準版に対する追加修正です。"); L.push("※ コメントに記録された対象テキストと現在の基準版が異なる場合は、現在の基準版を優先して該当箇所を判断してください。コメントで指定していないユーザー編集を元に戻したり、元ファイルの内容で上書きしたりしないでください。"); L.push("※ 下記に記載のない画像／動画スロットは未操作です。基準版に既にある写真・動画・表示状態をそのまま維持し、未記載や「画像/」フォルダに同名素材がないことを削除指示と解釈しないでください。");
  if(includeSource){ L.push("※ 下の「CDE2で編集済みの現在の本体」が編集対象です。コピー／Markdownで渡す場合は、このコードだけを基準に直接編集してください。"); }
  else if(opt.handoffMode==="delta"){
    L.push("※ このZIPは単体では完成プロジェクトではなく、厳密な差分パッケージです。");
    L.push("※ 必ず元ZIP「"+(M.baseSourceName||"(不明)")+"」のSHA-256が `"+(M.baseFingerprint||"(記録なし)")+"` と完全一致することを確認してください。一致する元ZIPが無い、または指紋が違う場合は作業を止め、正しい元ZIPをユーザーへ依頼してください。");
    L.push("※ 元ZIPを展開し、この差分ZIP内の同名パスだけを上書きしてください。同梱された編集済み本体「"+file+"」が現状の正です。manifestの deletedFiles 以外は削除せず、差分にない素材・スロット・ユーザー編集を維持してください。");
    L.push("※ 完了前に、コメント対象外のユーザー編集と既存素材が巻き戻っていないことを差分確認し、元ZIPの全ファイルを含む完成ZIPを返してください。");
  }else if(opt.handoffMode==="full-split"){
    L.push("※ 完全版は複数の通常ZIPに分かれています。全パートを展開し、ZIP内の元パスを保ったまま1つのプロジェクトへ統合してください。");
    L.push("※ 同梱された編集済み本体「"+file+"」が現状の正です。コメントで指定していない素材・スロット・ユーザー編集を変更または削除しないでください。");
    L.push("※ 完了前に全パートの cde2-parts-manifest.json を照合し、全ファイルが揃っていることを確認して、1つの完成ZIPを返してください。");
  }else { L.push("※ このZIP全体が唯一の基準版です。過去のZIP、以前のチャット添付、手元の旧プロジェクトは使用せず、同梱された「"+file+"」を直接編集してください。"); L.push("※ ZIPにはCDE2で編集済みの本体と現在の全プロジェクト素材を同じ構成で同梱しています。テキスト編集、画像／動画差し替え、動画開始位置、スロット変更は既に基準版へ反映済みです。"); L.push("※ 完了前に、コメント対象外のユーザー編集と既存素材が基準版から巻き戻っていないことを差分確認してください。"); }
  if(hasAtt) L.push("※ 一部のコメントには参考用の画像/動画が添付されています（ZIPの「添付/」フォルダ、またはチャットに添付したファイルを参照）。");
  if(includeSource){ const src=currentJsxText()||""; L.push(""); L.push("## CDE2で編集済みの現在の本体（基準版）"); L.push(""); L.push("```"+(M.dcMode?"html":"jsx")); L.push(src); L.push("```"); }
  const _slots=discoverImgSlots();
  const _slotEdits=_slots.filter(function(s){return !!(M.imgTouched&&M.imgTouched[s.id]);});
  if(_slotEdits.length){ L.push(""); L.push("## 🖼 明示的に変更した画像／動画スロット"); L.push("ここにはユーザーが今回CDE2で変更またはクリアしたスロットだけを列挙します。下記にないスロットは基準版のまま維持してください。動画はCDE規格Hに従い `muted playsinline preload=\"auto\"` とし、`autoplay` / `loop` / URLの `#t=` / デッキ側JSによる `currentTime` 駆動は禁止です。"); _slotEdits.forEach(s=>{ const action=M.imgTouched[s.id], a=M.imgAssign[s.id], ap=a&&(a._zipPath||a.assetPath||a.expName); if(action==="cleared") L.push("- スロット `"+s.id+"`（"+s.label+"）→ ユーザーが明示的にクリア。要素ごと非表示にして何も描画しない"); else if(a&&a.kind==="video") L.push("- スロット `"+s.id+"`（"+s.label+"）→ `"+ap+"` を `<video data-vin=\""+_vinAttr(a)+"\">` で表示（object-fit: "+(s.fit||"cover")+"）"); else if(a) L.push("- スロット `"+s.id+"`（"+s.label+"）→ `"+ap+"` を表示（object-fit: "+(s.fit||"cover")+"）"); }); }
  const _avs=Object.keys(M.assetVin||{}).filter(function(p){return _isVideoAsset(p)&&_vinRound(M.assetVin[p]&&M.assetVin[p].vin)>0;});
  if(_avs.length){ L.push(""); L.push("## 🎞 動画アセットの開始位置"); L.push("下記の既存動画アセットを参照する `<video>` はCDE規格Hに従い、指定の `data-vin` と `muted playsinline preload=\"auto\"` を設定してください。`autoplay` / `loop` / URLの `#t=` / デッキ側JSによる `currentTime` 駆動は禁止です。"); _avs.forEach(function(p){L.push("- `"+p+"` → `<video data-vin=\""+_vinAttr(M.assetVin[p])+"\">`");}); }
  let n=0;
  if(deck.length){ L.push(""); L.push("## 🎬 全スライド共通の指示（すべてのシーンに適用）"); deck.forEach(c=>{ n++; L.push(""); L.push("### 全体指示"+n); if(c.comment) L.push("- 指示: "+c.comment); _att(c); }); }
  Object.keys(groups).forEach(lab=>{ L.push(""); L.push("## "+lab);
    groups[lab].forEach(c=>{ n++; L.push(""); L.push("### コメント"+n+"（"+cmTypeLabel(c.mode)+"）"); if(c.text) L.push("- 対象テキスト: 「"+c.text+"」"); if(c.mode!=="select" && c.mode!=="scene") L.push("- 位置(0〜1): x="+c.rectN.x.toFixed(2)+", y="+c.rectN.y.toFixed(2)+(c.rectN.w>0?(", w="+c.rectN.w.toFixed(2)+", h="+c.rectN.h.toFixed(2)):"")); L.push("- 指示: "+c.comment); _att(c); });
    const code=sceneCode(lab); L.push(""); if(code){ L.push("該当シーンのコード:"); L.push("```jsx"); L.push(code); L.push("```"); } else { L.push("（このコメントはシーンを自動特定できませんでした。JSX全体から該当箇所を判断してください。）"); }
  });
  L.push(""); L.push("---"); if(includeSource) L.push("返答の形式: 修正後の対象ファイル全体を "+(M.dcMode?"html":"jsx")+" コードブロックで返し、変更点を簡潔に補足してください。"); else L.push("返答の形式: 元のフォルダ構成と全素材を保持した1つの完成ZIPを返し、変更点と維持したユーザー編集を簡潔に補足してください。");
  return L.join(NL);
}
function openExport(){ const nImg=Object.keys(M.imgTouched||{}).length, nAv=Object.keys(M.assetVin||{}).filter(function(p){return _isVideoAsset(p)&&_vinRound(M.assetVin[p]&&M.assetVin[p].vin)>0;}).length; commitJsx(); $("#exportText").value=buildAiPrompt({includeSource:true}); const na=M.comments.reduce((a,c)=>a+((c.atts&&c.atts.length)||0),0)+nImg+nAv; const note=$("#expNote"); if(note) note.innerHTML="✅ 通常は元ZIP＋「AI用差分ZIP」だけを渡してください。元ZIPを使えない場合は「完全版ZIP（18MB分割）」を全パート渡します。CDE2上の直接編集も編集済み本体へ反映します。"+(na?(" 📎 指示・スロット・開始位置・添付: "+na+"件"):""); $("#exportModal").style.display="flex"; }
function cmInit(){
  const tb=document.querySelector(".toolbar"); if(tb && !$("#cmTools")){ const tools=document.createElement("span"); tools.id="cmTools"; tools.innerHTML='<span class="lbl">💬注釈:</span><button data-cm="select" title="プレビュー上の文字/要素を選んでコメント">選択</button>'; const meta=tb.querySelector(".toolbar-meta")||tb; const hint=meta.querySelector("#previewHint"); if(hint) meta.insertBefore(tools, hint); else meta.appendChild(tools); tools.querySelectorAll("button[data-cm]").forEach(b=>b.onclick=()=>setCmMode(b.dataset.cm)); }
  const fw=$("#frameWrap"); if(fw && !$("#cmLayer")){ const layer=document.createElement("div"); layer.id="cmLayer"; layer.innerHTML='<canvas id="cmCanvas"></canvas><div id="cmHover"></div><div id="cmMarks"></div>'; fw.appendChild(layer);
    const dlg=document.createElement("div"); dlg.id="cmDialog"; dlg.innerHTML='<div class="sel" id="cmDlgSel"></div><textarea id="cmDlgText" placeholder="例: このテロップを「〜」に変更。少し大きく。"></textarea><div id="cmDlgAtt"></div><div class="row"><button id="cmDlgCancel">取消</button><button id="cmDlgSave" class="primary">追加</button></div>'; fw.appendChild(dlg);
    const cv=$("#cmCanvas"), ctx=cv.getContext("2d"); let dr=false,sx=0,sy=0,pts=[];
    function finishDraw(x0,y0,x1,y1,pp){ let x=Math.min(x0,x1),y=Math.min(y0,y1),w=Math.abs(x1-x0),h=Math.abs(y1-y0); if(cmMode==="pin"){w=0;h=0;} const rectN=_stageNormRect(x,y,w,h), sr=previewStageRect(); let ptsN=null; if(pp) ptsN=pp.map(p=>[+_clamp01((p[0]-sr.left)/sr.width).toFixed(3),+_clamp01((p[1]-sr.top)/sr.height).toFixed(3)]); openCommentDialog({mode:cmMode, text:"", rectN, pts:ptsN}); }
    cv.addEventListener("pointerdown", e=>{ if(!cmMode||cmMode==="select") return; fitCanvas(); const r=cv.getBoundingClientRect(); sx=e.clientX-r.left; sy=e.clientY-r.top; if(cmMode==="pin"){ finishDraw(sx,sy,sx,sy,null); return; } dr=true; pts=[[sx,sy]]; try{cv.setPointerCapture(e.pointerId);}catch(_){} });
    cv.addEventListener("pointermove", e=>{ if(!dr) return; const r=cv.getBoundingClientRect(); const x=e.clientX-r.left,y=e.clientY-r.top; ctx.clearRect(0,0,cv.width,cv.height); ctx.strokeStyle="#5b8cff"; ctx.lineWidth=2; if(cmMode==="rect"){ ctx.strokeRect(Math.min(sx,x),Math.min(sy,y),Math.abs(x-sx),Math.abs(y-sy)); } else if(cmMode==="free"){ pts.push([x,y]); ctx.beginPath(); ctx.moveTo(pts[0][0],pts[0][1]); for(const p of pts) ctx.lineTo(p[0],p[1]); ctx.stroke(); } });
    cv.addEventListener("pointerup", e=>{ if(!dr) return; dr=false; const r=cv.getBoundingClientRect(); const x=e.clientX-r.left,y=e.clientY-r.top; ctx.clearRect(0,0,cv.width,cv.height); if(cmMode==="rect") finishDraw(sx,sy,x,y,null); else if(cmMode==="free"){ const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]); finishDraw(Math.min.apply(null,xs),Math.min.apply(null,ys),Math.max.apply(null,xs),Math.max.apply(null,ys),pts.slice()); } });
    cv.addEventListener("pointercancel", ()=>{dr=false;});
  }
  if(!$("#exportModal")){ const m=document.createElement("div"); m.id="exportModal"; m.innerHTML='<div class="box"><h3>🤖 AIへ渡す編集指示</h3><div id="expNote" class="hint" style="margin:0 0 8px"></div><textarea id="exportText" spellcheck="false"></textarea><div class="row"><button id="expCopy">テキストをコピー</button><button id="expDl">.md保存</button><button id="expZipDelta" class="primary">📦 AI用差分ZIP</button><button id="expZipFull">📦 完全版ZIP（18MB分割）</button><button id="expClose">閉じる</button></div></div>'; document.body.appendChild(m);
    m.addEventListener("click", e=>{ if(e.target===m) m.style.display="none"; });
    $("#expClose").onclick=()=>m.style.display="none";
    $("#expCopy").onclick=()=>{ const t=$("#exportText"); t.select(); try{ navigator.clipboard.writeText(t.value); log("編集指示をコピーしました。AIに貼り付けてください。"); }catch(e){ try{document.execCommand("copy");}catch(_){} } };
    $("#expDl").onclick=()=>{ const blob=new Blob([$("#exportText").value],{type:"text/markdown"}); const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=_aiBaseName()+"_\u7de8\u96c6\u6307\u793a.md"; a.click(); setTimeout(()=>URL.revokeObjectURL(a.href),2000); }; $("#expZipDelta").onclick=()=>exportDeltaBundle(); $("#expZipFull").onclick=()=>exportFullSplitBundles();
  }
  // ---- \u30b7\u30fc\u30f3\u5168\u4f53\u30b3\u30e1\u30f3\u30c8\uff08scene-editor \u306e\u7cbe\u795e\u3092\u79fb\u690d\uff09----
  if(!document.getElementById("scCss")){ const sc=document.createElement("style"); sc.id="scCss"; sc.textContent='#sceneComment{border-top:1px solid var(--line);background:var(--panel);padding:8px 10px}#sceneComment .sc-head{display:flex;align-items:center;gap:8px;margin-bottom:6px;flex-wrap:wrap}#sceneComment .sc-title{font-size:12px;color:var(--acc);font-weight:600}#sceneComment select{background:var(--panel2);color:var(--fg);border:1px solid var(--line);border-radius:6px;padding:3px 6px;font:12px inherit;max-width:220px}#sceneComment .sc-follow{font-size:11px;color:var(--mut);display:flex;align-items:center;gap:3px;cursor:pointer}#sceneComment .sc-spacer{flex:1}#sceneComment #scClear{font-size:11px;color:var(--mut);background:none;border:1px solid var(--line);border-radius:6px;padding:2px 8px;cursor:pointer}#sceneComment textarea{width:100%;height:74px;background:#0f1a12;color:var(--fg);border:1px solid #2f5a3a;border-radius:8px;padding:8px;font:13px/1.55 inherit;resize:vertical;box-sizing:border-box}#sceneComment .sc-foot{font-size:11px;color:var(--mut);margin-top:5px}#scAtt{margin-top:6px}.attach{border:1px dashed var(--line);border-radius:8px;padding:6px}.attach.drop{border-color:var(--acc);background:rgba(242,193,78,.06)}.attach .abtn{font-size:11px;color:var(--fg);background:var(--panel2);border:1px solid var(--line);border-radius:6px;padding:3px 8px;cursor:pointer}.attach .agrid{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}.attach .acell{position:relative;width:104px}.attach .acell img,.attach .acell video{width:104px;height:60px;object-fit:cover;border-radius:6px;border:1px solid var(--line);display:block;background:#000}.attach .acell .ax{position:absolute;top:2px;right:2px;background:#000a;border:none;border-radius:5px;color:#fff;cursor:pointer;font-size:11px;line-height:1;padding:1px 5px}.attach .acell .anm{font-size:9px;color:var(--mut);margin-top:2px;word-break:break-all;max-height:24px;overflow:hidden}'; document.head.appendChild(sc); }
  let _scSig=null, _scList=[]; const GLBL="__ALL__", GLBL_LABEL="🎬 全スライド共通";
  window.__cdeResetComments=()=>{_scSig=null;scFill();scSync();};
  function scGet(lab){ if(lab===GLBL) return M.comments.find(x=>x.mode==="deck"); return M.comments.find(x=>x.mode==="scene"&&x.scene===lab); }
  function scEnsure(lab){ let c=scGet(lab); if(c) return c; if(lab===GLBL) c={id:++_cmSeq, mode:"deck", text:"", comment:"", rectN:{x:0,y:0,w:0,h:0}, pts:null, scene:GLBL_LABEL, atts:[]}; else c={id:++_cmSeq, mode:"scene", text:"", comment:"", rectN:{x:0,y:0,w:0,h:0}, pts:null, scene:lab, atts:[]}; M.comments.push(c); return c; }
  function scPruneEmpties(){ const before=M.comments.length; M.comments=M.comments.filter(c=> (c.mode!=="scene"&&c.mode!=="deck") || (c.comment&&c.comment.trim()) || (c.atts&&c.atts.length) ); if(M.comments.length!==before){ renderComments(); redrawMarks(); } }
  function scRenderAtt(){ const mt=$("#scAtt"); const sel=$("#scSel"); if(!mt||!sel) return; const lab=sel.value; attUIInto(mt, ()=>scGet(lab), ()=>scEnsure(lab), ()=>{ renderComments(); redrawMarks(); scRenderAtt(); }); }
  function scScenes(){ try{ return detectScenes(currentJsxText())||[]; }catch(e){ return []; } }
  function scFill(){ const sel=$("#scSel"); if(!sel) return; const list=scScenes(); const sig=list.map(s=>s.label).join("|"); if(sig===_scSig){ _scList=list; return; } _scSig=sig; _scList=list; const cur=sel.value; sel.innerHTML=""; { const og=document.createElement("option"); og.value=GLBL; og.textContent="🎬 全スライド共通（全体指示）"; sel.appendChild(og); } if(!list.length){ const o=document.createElement("option"); o.value=""; o.textContent="\uff08\u30b7\u30fc\u30f3\u304c\u898b\u3064\u304b\u308a\u307e\u305b\u3093\uff09"; sel.appendChild(o); return; } list.forEach(s=>{ const o=document.createElement("option"); o.value=s.label; o.textContent=s.label; sel.appendChild(o); }); if(cur===GLBL||list.some(s=>s.label===cur)) sel.value=cur; else { const vis=detectVisibleScene(); if(vis&&list.some(s=>s.label===vis)) sel.value=vis; } scSync(); }
  function scSync(){ const sel=$("#scSel"), ta=$("#scText"); if(!sel||!ta) return; scPruneEmpties(); const lab=sel.value; if(!lab){ ta.value=""; return; } const c=scGet(lab); ta.value=c?c.comment:""; scRenderAtt(); const tt=$("#scTitle"); if(tt) tt.textContent=(lab===GLBL?"🎬 全スライドへの全体指示":"💬 このシーン全体への指示"); }
  function scWrite(){ const sel=$("#scSel"), ta=$("#scText"); if(!sel||!ta) return; const lab=sel.value; if(!lab) return; const val=ta.value.trim(); let c=scGet(lab); if(!val){ if(c&&(!c.atts||!c.atts.length)){ M.comments=M.comments.filter(x=>x!==c); renderComments(); redrawMarks(); } else if(c){ c.comment=""; } return; } if(!c){ c=scEnsure(lab); c.comment=val; renderComments(); } else { c.comment=val; const card=document.getElementById("cmc"+c.id); if(card){ const t=card.querySelector("textarea"); if(t&&t!==document.activeElement) t.value=val; } } }
  function scFollowTick(){ const fl=$("#scFollow"), ta=$("#scText"), sel=$("#scSel"); if(!fl||!fl.checked||!sel) return; if(sel.value===GLBL) return; if(document.activeElement===ta) return; const vis=detectVisibleScene(); if(vis && sel.value!==vis && _scList.some(s=>s.label===vis)){ sel.value=vis; scSync(); } }
  if($("#right") && !$("#sceneComment")){ const dock=document.createElement("div"); dock.id="sceneComment"; dock.innerHTML='<div class="sc-head"><span class="sc-title" id="scTitle">\ud83d\udcac \u3053\u306e\u30b7\u30fc\u30f3\u5168\u4f53\u3078\u306e\u6307\u793a</span><select id="scSel" title="\u30b3\u30e1\u30f3\u30c8\u5bfe\u8c61\u306e\u30b7\u30fc\u30f3"></select><label class="sc-follow"><input type="checkbox" id="scFollow" checked>\u518d\u751f\u306b\u8ffd\u5f93</label><span class="sc-spacer"></span><button id="scClear" title="\u3053\u306e\u30b7\u30fc\u30f3\u306e\u30b3\u30e1\u30f3\u30c8\u3092\u6d88\u3059">\u30af\u30ea\u30a2</button></div><textarea id="scText" placeholder="\u4f8b: \u3053\u306e\u30b7\u30fc\u30f3\u5168\u4f53\u3092\u3001\u3082\u3063\u3068\u9759\u304b\u306a\u5165\u308a\u306b\u3002\u30bf\u30a4\u30c8\u30eb\u306f1.5\u500d\u3002\u80cc\u666f\u306f\u6697\u3081\u306e\u7d3a\u3067\u7d71\u4e00\u3002"></textarea><div id="scAtt"></div><div class="sc-foot">\u5927\u96d1\u628aOK\u3002\u30b7\u30fc\u30f3\u5168\u4f53\u3078\u306e\u8981\u671b\u3092\u305d\u306e\u307e\u307e\u66f8\u3051\u307e\u3059\u3002\u5185\u5bb9\u306f\u5de6\u306e\u300c\u30b3\u30e1\u30f3\u30c8\u300d\u30bf\u30d6\u306b\u96c6\u7d04\u3055\u308c\u3001\u300c\ud83e\udd16 AI\u3078\u51fa\u529b\u300d\u3067\u307e\u3068\u3081\u3066\u66f8\u304d\u51fa\u305b\u307e\u3059\u3002</div>'; $("#right").appendChild(dock); $("#scSel").onchange=()=>scSync(); $("#scText").addEventListener("input",()=>scWrite()); $("#scText").addEventListener("change",()=>scWrite()); $("#scClear").onclick=()=>{ const ta=$("#scText"); ta.value=""; scWrite(); }; setInterval(()=>{ if(!WORKSPACE.loading){scFill();scFollowTick();} }, 1200); scFill(); }
  const exp=$("#cmExport"); if(exp) exp.onclick=openExport;
  const fr=$("#frame"); if(fr) fr.addEventListener("load", ()=>{ attachPreviewHooks(); scFill(); scSync(); applyImgSlots(); if($("#imgPane")&&$("#imgPane").classList.contains("active")) renderImgSlots(); });
  window.addEventListener("resize", ()=>{ fitCanvas(); redrawMarks(); });
  applyCmMode();
}

// ============================================================
// Export: ZIP
// ============================================================
