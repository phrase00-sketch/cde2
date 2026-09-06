async function exportDcZip(){
  const snap=await buildProjectSnapshot("renderer"),files=snap.files;
  files.delete(snap.instructionPath);
  const det=detectRenderMode(),mode=det.vt?"vt":"css",entry=snap.deckIncluded.replace(/(?:\.dc)?\.html?$/i,".dc.html");
  files.delete(snap.deckIncluded);files.set(entry,{bytes:enc.encode(stampRenderMode(snap.deckText,mode)),mime:"text/html"});
  const state=JSON.parse(dec.decode(files.get(".cde2-project.json").bytes));state.deck=entry;projectJsonFile(files,".cde2-project.json",state);
  const timing=dcParseBounds();let audio=state.audio?.path||null,mixed=false;
  if(M.dcBgm?.dataUrl){const mix=await mixVoiceAndBgm();if(!mix)throw new Error("BGMをミックスできませんでした");
    audio=projectOwnedPath(files,".cde2/render-mix.wav",null);files.set(audio,{bytes:mix.bytes,mime:"audio/wav"});mixed=true;
    projectJsonFile(files,".dc-audio.json",{name:"render-mix.wav",path:audio,mime:"audio/wav",mixed:true});}
  if(!audio&&M.audioSelectionExplicit){audio=projectOwnedPath(files,".cde2/render-silence.wav",null);const silence=new AudioBuffer({numberOfChannels:1,length:Math.max(1,Math.ceil(timing.dur*48000)),sampleRate:48000});files.set(audio,{bytes:_bufToWav(silence),mime:"audio/wav"});}
  // RENDERER2 checks the deck directory before its ancestors. Put an explicit
  // relative pointer next to the deck so old packaged narration cannot win.
  const deckDir=entry.includes("/")?entry.slice(0,entry.lastIndexOf("/")+1):"";
  if(audio)projectJsonFile(files,deckDir+".dc-audio.json",{name:baseName(audio),path:_zipRelative(deckDir,audio),mime:files.get(audio).mime,mixed});
  projectJsonFile(files,"manifest.json",{generator:"CDE2",cde2Version:CDE2_VERSION,manifestVersion:1,renderMode:mode,renderModeReasons:det.reasons,
    deck:entry,bounds:timing.bounds,duration:timing.dur,sceneCount:timing.bounds.length||1,fps:30,audio,audioMixed:mixed,
    bgm:state.bgm?.path||null,bgmVolume:state.bgmVolume,bgmFade:state.bgmFade,support:M.supportPath||null,imageSlotJs:M.imgSlotPath||null});
  const zip=new JSZip();for(const [p,f] of files)zip.file(p,f.bytes);
  download(await zip.generateAsync({type:"blob",compression:"DEFLATE"}),baseExportName()+".zip");
  log("RENDERER2用ZIPを保存しました（"+(mode==="vt"?"VT":"CSS")+"／"+(mixed?"ナレーションとBGMをミックス":audio?"音声あり":"音声なし")+"）。編集用の元音声とコメントも保存しています。");
}

async function exportDcHtml(){
  M.dcSource=currentJsxText();
  await ensureDcDataUrls();
  _logVideoSlotWarnings("単体HTML書き出し");
  _logAssetVideoWarnings("単体HTML書き出し");
  const doc=buildDcDoc(true);
  download(new Blob([doc],{type:"text/html"}), baseExportName()+"_単体版.html");
  log("単体HTMLを書き出しました（React／ランタイム／アセットを内蔵）。");
}
function baseExportName(){ const s=M.scenes[M.scene]; return (s? s.label : "claude-design").replace(/[\\/:*?"<>|]/g,"_")+"_edited"; }
function download(blob, name){
  const url=URL.createObjectURL(blob), auto=document.createElement("a");
  auto.href=url; auto.download=name; auto.style.display="none"; document.body.appendChild(auto);
  try{ auto.click(); }catch(e){}
  setTimeout(()=>auto.remove(),0);
  const tray=$("#downloadTray"), row=document.createElement("div"), link=document.createElement("a"), size=document.createElement("span"), close=document.createElement("button");
  row.className="downloadrow"; link.href=url; link.download=name; link.textContent="⬇ "+name+" を保存"; link.title="自動保存されなかった場合はここを押してください";
  link.onclick=async e=>{ if(location.protocol!=="file:"||typeof window.showSaveFilePicker!=="function")return; e.preventDefault(); try{ const handle=await window.showSaveFilePicker({suggestedName:name}); const writable=await handle.createWritable(); await writable.write(blob); await writable.close(); log("✅ "+name+" を保存しました。"); }catch(err){ if(!err||err.name!=="AbortError")log("保存ダイアログを開けませんでした: "+((err&&err.message)||err),true); } };
  size.className="dlsize"; size.textContent=((blob&&blob.size)||0)<1000000?Math.max(1,Math.round(((blob&&blob.size)||0)/1000))+" KB":(((blob&&blob.size)||0)/1000000).toFixed(1)+" MB";
  close.className="dlclose"; close.type="button"; close.textContent="×"; close.title="保存リンクを閉じる";
  let disposed=false, timer=null; const dispose=()=>{ if(disposed)return; disposed=true; if(timer)clearTimeout(timer); try{URL.revokeObjectURL(url);}catch(_){} row.remove(); if(tray&&!tray.children.length)tray.classList.remove("show"); };
  close.onclick=dispose; row.append(link,size,close); tray.appendChild(row); tray.classList.add("show");
  timer=setTimeout(dispose,30*60*1000);
}

// ===== MP4（動画）書き出し：編集内容・画像・音声を反映（オフライン・フレーム単位レンダリング）=====
function dcParseBounds(){
  const src=(M.dcMode?currentJsxText():"")||M.dcSource||"";
  let bounds=[0], dur=0;
  const mb=src.match(/BOUNDS\s*=\s*\[([^\]]*)\]/);
  if(mb){ const arr=mb[1].split(",").map(x=>parseFloat(String(x).trim())).filter(x=>!isNaN(x)); if(arr.length) bounds=arr; }
  const md=src.match(/this\.duration\s*=\s*([0-9.]+)/)||src.match(/\bduration\s*[:=]\s*([0-9.]+)/);
  if(md) dur=parseFloat(md[1]);
  if(!dur||isNaN(dur)) dur=(bounds[bounds.length-1]||0)+8;
  return { bounds, dur };
}
// ===== RENDERER用ZIP書き出し（高画質：scene.json ＋ 挿入音声）=====
function _slugId(s){ return String(s||"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,40); }
function _proposeVidId(){ var s=M.scenes&&M.scenes[M.scene]; return _slugId((s&&s.label)||"")||"scene"; }
// v19: 実際の最外殻ステージを正本とし、$previewは実ステージを検出できない場合だけ使う。
function _dcStageDims(st){
  var mw=String(st||"").match(/(?:^|;)\s*width\s*:\s*(\d+(?:\.\d+)?)px\b/i), mh=String(st||"").match(/(?:^|;)\s*height\s*:\s*(\d+(?:\.\d+)?)px\b/i);
  if(!mw||!mh) return null; var w=Math.round(+mw[1]),h=Math.round(+mh[1]); return (w>=320&&h>=320)?{w:w,h:h}:null;
}
function _dcFirstStageTag(src){
  src=String(src||""); var re=/<div\b[^>]*\bstyle\s*=\s*(["'])([\s\S]*?)\1[^>]*>/gi,m,d;
  while((m=re.exec(src))){ d=_dcStageDims(m[2]); if(d) return {w:d.w,h:d.h,index:m.index,tag:m[0]}; }
  return null;
}
function stampCanonicalStage(html){
  html=String(html||""); var s=_dcFirstStageTag(html); if(!s)return html; var tag=s.tag;
  if(/\bdata-cde-stage\s*=/i.test(tag)) tag=tag.replace(/\bdata-cde-stage\s*=\s*(["'])[^"']*\1/i,'data-cde-stage="1"');
  else tag=tag.replace(/^<div\b/i,'<div data-cde-stage="1"');
  return html.slice(0,s.index)+tag+html.slice(s.index+s.tag.length);
}
function dcStageSize(src){
  src=String(src||""); var actual=_dcFirstStageTag(src); if(actual) return {w:actual.w,h:actual.h};
  try{ var mp=src.match(/<script\b[^>]*\bdata-props\s*=\s*(["'])([\s\S]*?)\1/i); if(mp){ var txt=mp[2].replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&'),pj=JSON.parse(txt),pv=pj&&pj["$preview"]; if(pv&&isFinite(+pv.width)&&isFinite(+pv.height)&&+pv.width>=320&&+pv.height>=320)return {w:Math.round(+pv.width),h:Math.round(+pv.height)}; } }catch(e){}
  var re=/<[a-z][^>]*\bstyle\s*=\s*(["'])([\s\S]*?)\1[^>]*>/gi,m,d,best=null,area=0; while((m=re.exec(src))){d=_dcStageDims(m[2]);if(d&&d.w*d.h>area){best=d;area=d.w*d.h;}}
  return best||{w:1920,h:1080};
}
function dcCurStageSize(){ return dcStageSize((M.dcMode?currentJsxText():"")||M.dcSource||""); }
function dcDecompose(src){
  var mStyle = src.match(/<style>([\s\S]*?)<\/style>/);
  var css = mStyle ? mStyle[1].trim() : "";
  var mFont = src.match(/<link[^>]+href="(https:\/\/fonts\.googleapis\.com\/css2[^"]+)"/);
  var font = mFont ? mFont[1] : "";
  var mStage = src.match(/<div\b[^>]*\bstyle\s*=\s*(["'])[^"']*\bwidth\s*:\s*\d+(?:\.\d+)?px\s*;[^"']*\bheight\s*:\s*\d+(?:\.\d+)?px[^"']*\1[^>]*>/i);
  var backdrop = "";
  if(mStage){
    var stageEnd = mStage.index + mStage[0].length;
    var firstSc = src.indexOf("<sc-if", stageEnd);
    if(firstSc >= 0) backdrop = src.slice(stageEnd, firstSc).trim();
  }
  var scenes = [];
  var scRe = /<sc-if\b[^>]*>([\s\S]*?)<\/sc-if>/g;
  var m;
  while((m = scRe.exec(src))){ scenes.push(m[1]); }
  scenes = scenes.map(function(sc){
    return sc.replace(/<x-import\b[\s\S]*?<\/x-import>/g, function(tag){
      var ph = (tag.match(/placeholder="([^"]*)"/)||[])[1] || "";
      var sid = (tag.match(/id="([^"]*)"/)||[])[1] || "";
      var _a = (M.imgAssign||{})[sid];
      var _u = _a && (_a.dataUrl||_a.url);
      var _fit = (_a && _a.fit) || (tag.match(/fit="([^"]*)"/)||[])[1] || "cover";
      if(_u){
        // \u5272\u308a\u5f53\u3066\u6e08\u307f\u753b\u50cf\u3092 scene \u306b\u76f4\u63a5\u713c\u304d\u8fbc\u3080\uff08RENDERER\u306f\u3053\u306eHTML\u3092\u305d\u306e\u307e\u307e\u63cf\u753b\u3059\u308b\uff09
        return '<div data-slot="' + sid + '" style="width:100%;height:100%;overflow:hidden;">'
          + '<img src="' + _u + '" style="width:100%;height:100%;object-fit:' + _fit + ';display:block;" />'
          + '</div>';
      }
      return '<div data-slot="' + sid + '" style="display:flex;width:100%;height:100%;'
        + 'align-items:center;justify-content:center;'
        + 'background:linear-gradient(135deg,#12274d,#0a1733);'
        + "color:rgba(243,236,214,.40);font:600 24px 'Zen Kaku Gothic Antique',sans-serif;"
        + 'text-align:center;padding:28px;letter-spacing:.04em;line-height:1.5;">'
        + '\u25a3 ' + ph + '</div>';
    }).trim();
  });
  return { css: css, font: font, backdrop: backdrop, scenes: scenes };
}
var RENDER_FRAME_CODE = [
  "module.exports.renderFrame = function(scene, frame, fps){",
  "  var dc = scene.dc || {};",
  "  var f = fps || 60;",
  "  var t = frame / f;",
  "  var b = dc.bounds || [0];",
  "  var idx = 0;",
  "  for (var i = 0; i < b.length; i++) { if (t >= b[i]) idx = i; else break; }",
  "  var scenes = dc.scenes || [];",
  "  var html = scenes[idx] || '';",
  "  var css = dc.css || '';",
  "  var font = dc.font ? (\"@import url('\" + dc.font + \"');\") : '';",
  "  return '<style>' + font + css + '</style>' +",
  "    '<div style=\"position:absolute;inset:0;width:' + (dc.width||1920) + 'px;height:' + (dc.height||1080) + 'px;overflow:hidden;background:#0a1733\">' +",
  "    (dc.backdrop || '') + html + '</div>';",
  "};"
].join("\n");
function buildSceneJson(opts){
  // plain <img src="assets/..."> の画像を data URL に焼き込んでから分解する（RENDERER の scene.json は画像同梱フォルダを持たないため自己完結が必要）。
  var dec = dcDecompose(rewriteAssetRefsData(opts.src));
  var _stage = dcStageSize(opts.src);
  var pb = dcParseBounds();
  var BOUNDS = pb.bounds, DURATION = pb.dur;
  var slotRe = /data-slot="([^"]+)"[^>]*>([^<]*)</g;
  var labelMap = {}, order = [];
  for(var si=0; si<dec.scenes.length; si++){ var h=dec.scenes[si]; var mm; slotRe.lastIndex=0; while((mm = slotRe.exec(h))){ var sid=mm[1]; if(!(sid in labelMap)){ labelMap[sid]=(mm[2]||"").replace(/^\u25a3\s*/,"").trim(); order.push(sid);} } }
  var _slotDefs = (typeof discoverDcSlots==="function") ? discoverDcSlots() : [];
  var _labById = {}; _slotDefs.forEach(function(s){ _labById[s.id]=s.label; });
  var image_slots = order.map(function(sid){ var a=(M.imgAssign||{})[sid]; return { slot_id: sid, label: _labById[sid]||labelMap[sid]||"", assigned:!!(a&&(a.dataUrl||a.url)), source:(a&&a.name)||"", data:"", file:(a&&a.expName)||"" }; });
  var slides = BOUNDS.map(function(s,i){ return { id:"slide_"+String(i+1).padStart(3,"0"), kind:"dc_scene", start_hint:s, end_hint:(i<BOUNDS.length-1?BOUNDS[i+1]:DURATION), subtitle_preview:"", chunks:[], ai_notes:"", subtitles:[] }; });
  return {
    schema_version:"1.0", part_id:opts.id, part_title:(opts.title||opts.id), series_title:"", revision:"v01",
    fps:(opts.fps||60), width:_stage.w, height:_stage.h, duration_sec:DURATION,
    audio_file:(opts.audioFile||""), signature_accent:"#edb53c", signature_keyword:"",
    subtitles_enabled:false, ai_notes:"", image_slots:image_slots, slides:slides,
    renderFrameCode:RENDER_FRAME_CODE, animCode:"",
    dc:{ css:dec.css, backdrop:dec.backdrop, scenes:dec.scenes, bounds:BOUNDS, font:dec.font, width:_stage.w, height:_stage.h }
  };
}
async function exportRemotionZip(){
  if(!M.dcMode){ log("Claude Design（.dc.html）を開いてから書き出してください。", true); return; }
  if(typeof JSZip==="undefined"){ log("ZIPライブラリが見つかりません（ネット接続を確認）。", true); return; }
  if(Object.keys(M.imgAssign||{}).some(function(id){return M.imgAssign[id]&&M.imgAssign[id].kind==="video";})||Object.keys(M.assetVin||{}).some(function(p){return _isVideoAsset(p)&&_vinRound(M.assetVin[p]&&M.assetVin[p].vin)>0;})) log("⚠ (旧)RENDERER用ZIPは動画スロット／動画アセットの data-vin を正式サポートしません。正しい動画同期には「RENDERER2用ZIP書き出し」を使用してください。", true);
  var idInput = $("#vidId");
  var id = _slugId((idInput && idInput.value) || "");
  if(!id){ id = _proposeVidId(); if(idInput) idInput.value = id; }
  var src = M.dcSource || currentJsxText() || "";
  await ensureDcDataUrls(); // 割り当て画像のデータURLを用意してから scene.json に焼き込む
  var audioFile = "", audioBytes = null;
  if(M.dcBgm && M.dcBgm.dataUrl){
    try{ var _mx2=await mixVoiceAndBgm(); if(_mx2){ audioBytes=_mx2.bytes; audioFile=id+".wav"; _bgmMixLog(_mx2); } }
    catch(_e2){ log("BGMのミックスに失敗したため、BGM無しで書き出します: "+((_e2&&_e2.message)||_e2), true); }
  }
  if(!audioBytes && M.dcAudio && M.dcAudio.dataUrl){
    var _m3=_duMime(M.dcAudio.dataUrl);
    audioBytes=_duBytes(M.dcAudio.dataUrl);
    var extm = /\.([a-z0-9]+)$/i.exec((M.dcAudio.name)||"");
    var ext = (extm && extm[1]) || _mimeExt(_m3) || "wav";
    audioFile = id + "." + String(ext).toLowerCase();
  }
  var title = (M.scenes && M.scenes[M.scene] && M.scenes[M.scene].label) || id;
  var scene = buildSceneJson({ src: src, id: id, fps: 60, title: title, audioFile: audioFile });
  if(!scene.dc.scenes.length){ log("シーン（<sc-if>）が見つかりませんでした。ネイティブ .dc.html を開いているか確認してください。", true); return; }
  var zip = new JSZip();
  zip.file("scenes/" + id + "/scene.json", JSON.stringify(scene, null, 2));
  if(audioBytes) zip.file("audio/" + audioFile, audioBytes);
  var blob = await zip.generateAsync({ type: "blob" });
  var _stem = (M.dcPath && M.dcPath!=="(bundle)") ? baseName(M.dcPath).replace(/\.dc\.html$/i,"") : "";
  if(!_stem){ try{ _stem = (typeof baseExportName==="function" ? (baseExportName()||"") : ""); }catch(_){ _stem=""; } }
  download(blob, (_stem || id) + "Remotion.zip");
  log("\ud83d\udce6 RENDERER用ZIP を書き出しました（id=" + id + "、シーン" + scene.dc.scenes.length + "・" + Math.round(scene.duration_sec) + "秒" + (audioBytes ? ("・音声 " + audioFile) : "・無音") + "）。launcher.bat にドロップして使ってください。");
}

function dcRasterReasons(src){
  src=String(src||""); var out=[];
  if(/writing(?:-mode|Mode)\s*[:=]\s*["']?(?:vertical|sideways)/i.test(src))out.push("縦書き");
  if(/(?:^|[;{"'\s])filter\s*[:=]\s*(?!["']?none\b)/im.test(src))out.push("CSS filter");
  if(/object(?:-fit|Fit)\s*[:=]\s*["']?(?:cover|contain|scale-down)/i.test(src))out.push("object-fit");
  return out;
}

const DC_MP4_HARNESS = `
(function(){
  function S(){ return document.querySelector('input[type=range]'); }
  function findStage(W,H){ var hit=document.querySelector('[data-cde-stage="1"]');if(hit)return hit;var ds=document.querySelectorAll('div[style]');for(var i=0;i<ds.length;i++){try{var cs=getComputedStyle(ds[i]),w=parseFloat(cs.width),h=parseFloat(cs.height);if(Math.abs(w-W)<0.6&&Math.abs(h-H)<0.6)return ds[i];}catch(e){}}return document.body; }
  function sStart(t,b){ var i=0; for(var k=0;k<b.length;k++){ if(t>=b[k]) i=k; } return b[i]; }
  function raf2(){ return new Promise(function(r){ requestAnimationFrame(function(){ requestAnimationFrame(r); }); }); }
  function msResolve(){ return window.modernScreenshot || window.ModernScreenshot || null; }
  function cssFeatures(stage){var rs=[],all=[stage],q=stage&&stage.querySelectorAll?stage.querySelectorAll('*'):[];for(var i=0;i<q.length;i++)all.push(q[i]);for(var j=0;j<all.length;j++){var el=all[j],cs;try{cs=getComputedStyle(el);}catch(e){continue;}var wm=(cs.writingMode||cs.webkitWritingMode||'').toLowerCase(),flt=(cs.filter||'none').toLowerCase(),fit=(cs.objectFit||'fill').toLowerCase();if(wm&&wm!=='horizontal-tb'&&rs.indexOf('縦書き')<0)rs.push('縦書き');if(flt&&flt!=='none'&&rs.indexOf('CSS filter')<0)rs.push('CSS filter');if((el.tagName==='IMG'||el.tagName==='VIDEO')&&fit&&fit!=='fill'&&rs.indexOf('object-fit')<0)rs.push('object-fit');if(rs.length===3)break;}return rs;}
  function chooseRaster(stage,forced){var reasons=cssFeatures(stage),ms=msResolve();forced=forced||[];for(var i=0;i<forced.length;i++)if(reasons.indexOf(forced[i])<0)reasons.push(forced[i]);if(reasons.length){if(!(ms&&ms.domToCanvas))throw new Error(reasons.join('・')+'を正確に描画するmodern-screenshotを読み込めませんでした。誤った書き出しを防ぐため停止しました。');return {mode:'modern',reasons:reasons};}if(window.html2canvas)return {mode:'html2canvas',reasons:[]};if(ms&&ms.domToCanvas)return {mode:'modern',reasons:[]};throw new Error('画像描画ライブラリを読み込めませんでした。');}
  function flattenSlots(){ try{ var slots=document.querySelectorAll('image-slot'); for(var i=0;i<slots.length;i++){ var host=slots[i]; var src=''; try{ if(host.shadowRoot){ var im=host.shadowRoot.querySelector('img'); if(im) src=im.getAttribute('src')||im.src||''; } }catch(e){} if(!src) src=host.getAttribute('src')||''; if(!src) continue; var fit=(host.getAttribute('fit')||'cover').toLowerCase(); host.style.backgroundImage='url("'+src+'")'; host.style.backgroundSize=(fit==='contain'?'contain':'cover'); host.style.backgroundPosition='center center'; host.style.backgroundRepeat='no-repeat'; } }catch(e){ __dcErrs.push('flatten: '+((e&&e.message)||e)); } }
  function vT0(v,b){ var a=parseFloat(v.getAttribute('data-t0')); if(isFinite(a)) return a; var e=v.parentNode; while(e&&e.tagName){ if(/^sc-if$/i.test(e.tagName)){ var scs=document.querySelectorAll('sc-if'); for(var i=0;i<scs.length;i++){ if(scs[i]===e) return (b[i]!=null?b[i]:0); } break; } e=e.parentNode; } return 0; }
  function seekVid(v,vt){ return new Promise(function(res){ try{ v.muted=true; v.pause(); if(Math.abs((v.currentTime||0)-vt)<0.02){ res(); return; } var done=false; function f(){ if(done) return; done=true; try{ v.removeEventListener('seeked',f); }catch(e){} res(); } v.addEventListener('seeked',f); v.currentTime=vt; setTimeout(f,800); }catch(e){ res(); } }); }
  function imgReady(im){return new Promise(function(res){if(im.complete&&im.naturalWidth){res();return;}var done=false;function fin(){if(!done){done=true;res();}}im.addEventListener('load',fin,{once:true});im.addEventListener('error',fin,{once:true});setTimeout(fin,3000);});}
  async function prepVideos(){ try{window.__cdeVidSyncOff=1;}catch(e){} var vs=document.getElementsByTagName('video'); for(var i=0;i<vs.length;i++){ var v=vs[i]; try{ v.muted=true; v.autoplay=false; v.preload='auto'; try{ v.pause(); }catch(e){} }catch(e){} } if(vs.length){ await waitFor(function(){ for(var i=0;i<vs.length;i++){ if(vs[i].readyState<2) return false; } return true; }, 20000); } return vs.length; }
  async function bakeVideos(t,b){ var vs=document.getElementsByTagName('video'); for(var i=0;i<vs.length;i++){ var v=vs[i]; try{ if(!v.__dcBake){ var im=document.createElement('img'); im.setAttribute('style',v.getAttribute('style')||''); if(v.className) im.className=v.className; try{ var cs=getComputedStyle(v); im.style.objectFit=cs.objectFit||'cover'; im.style.width=cs.width; im.style.height=cs.height; }catch(e){} v.__dcBake=im; if(v.parentNode) v.parentNode.insertBefore(im,v.nextSibling); v.style.display='none'; } var t0=vT0(v,b), vin=parseFloat(v.getAttribute('data-vin')||'0')||0; var vd=(v.duration&&isFinite(v.duration))?v.duration:0; var raw=(t-t0)+vin; var hi=(vd>0)?Math.max(vin,vd-0.033):vin; var vt=Math.max(vin,Math.min(raw,hi)); await seekVid(v,vt); var c=v.__dcCan||(v.__dcCan=document.createElement('canvas')); var w=v.videoWidth||16,h=v.videoHeight||9; if(c.width!==w)c.width=w; if(c.height!==h)c.height=h; var cx=c.getContext('2d'); cx.drawImage(v,0,0,w,h); v.__dcBake.src=c.toDataURL('image/jpeg',0.9); await imgReady(v.__dcBake); }catch(e){} } }
  function post(o,tr){ try{ parent.postMessage(Object.assign({__dcMp4:1},o),'*',tr||[]); }catch(e){} }
  var __dcErrs=[];
  window.addEventListener('error', function(ev){ try{ var t=ev&&ev.target; if(t&&t.tagName==='SCRIPT'){ __dcErrs.push('script load fail: '+(t.src||'inline')); } else if(ev&&ev.message){ __dcErrs.push(String(ev.message)); } }catch(e){} }, true);
  function loadScript(urls){ return new Promise(function(resolve,reject){ var i=0; function tryNext(){ if(i>=urls.length){ reject(new Error('all failed')); return; } var u=urls[i++]; var s=document.createElement('script'); s.onload=function(){ resolve(u); }; s.onerror=function(){ __dcErrs.push('load fail: '+u); tryNext(); }; s.src=u; document.head.appendChild(s); } tryNext(); }); }
  function waitFor(fn,ms){ return new Promise(function(resolve){ var t0=Date.now(); var iv=setInterval(function(){ var ok=false; try{ ok=!!fn(); }catch(e){} if(ok||Date.now()-t0>ms){ clearInterval(iv); resolve(ok); } }, 100); }); }
  async function decodeAudio(u){ var r=await fetch(u); var ab=await r.arrayBuffer(); var AC=window.AudioContext||window.webkitAudioContext; var ctx=new AC(); return await ctx.decodeAudioData(ab); }
  async function run(cfg){
    try{
      if(!window.html2canvas && !(msResolve()&&msResolve().domToCanvas)){ post({err:'画像描画ライブラリを読み込めませんでした（ネット接続をご確認ください）。'}); return; }
      if(typeof VideoEncoder==='undefined'){ post({err:'このブラウザは WebCodecs 未対応です。最新の Chrome / Edge をご利用ください。'}); return; }
      if(!window.Mp4Muxer||!window.Mp4Muxer.Muxer){ post({err:'mp4-muxer を読み込めませんでした（ネット接続をご確認ください）。'}); return; }
      var W=cfg.width||1920,H=cfg.height||1080,fps=cfg.fps||30,dur=cfg.duration||10,total=Math.max(1,Math.ceil(dur*fps)),bounds=cfg.bounds||[0];
      var audio=null;
      if(cfg.audioDataUrl){ try{ audio=await decodeAudio(cfg.audioDataUrl); }catch(e){ post({warn:'音声のデコードに失敗したため、映像のみで書き出します。'}); audio=null; } }
      var muxOpt={ target:new window.Mp4Muxer.ArrayBufferTarget(), video:{codec:'avc',width:W,height:H,frameRate:fps}, fastStart:'in-memory' };
      if(audio){ muxOpt.audio={codec:'aac',sampleRate:audio.sampleRate,numberOfChannels:audio.numberOfChannels}; }
      var muxer=new window.Mp4Muxer.Muxer(muxOpt);
      var vcands=['avc1.640028','avc1.4d0028','avc1.42E028','avc1.420028'];
      var vcodec=null;
      for(var ci=0;ci<vcands.length;ci++){ try{ var sup=await VideoEncoder.isConfigSupported({codec:vcands[ci],width:W,height:H,bitrate:cfg.bitrate||9000000,framerate:fps}); if(sup&&sup.supported){ vcodec=vcands[ci]; break; } }catch(e){} }
      if(!vcodec){ post({err:'H.264 エンコーダの初期化に失敗しました。'}); return; }
      var venc=new VideoEncoder({ output:function(c,m){ muxer.addVideoChunk(c,m); }, error:function(e){ post({err:'映像エンコードエラー: '+e.message}); } });
      venc.configure({ codec:vcodec, width:W, height:H, bitrate:cfg.bitrate||9000000, framerate:fps });
      var scr=S();
      if(!scr){ post({err:'プレイヤーの初期化を確認できませんでした。'}); return; }
      flattenSlots();
      var __vidN=await prepVideos(); if(__vidN) post({warn:'動画 '+__vidN+' 本をフレーム単位で焼き込みます。'});
      var stage=findStage(W,H),raster=chooseRaster(stage,cfg.rasterReasons),useFont=true;
      post({warn:'描画エンジン: '+(raster.mode==='modern'?'modern-screenshot':'html2canvas')+(raster.reasons.length?('（'+raster.reasons.join('・')+'を保持）'):'')});
      function buildOpt(){ var o={ width:W, height:H, scale:1, backgroundColor:'#0a1733' }; if(!useFont){ o.font=false; o.skipFonts=true; } return o; }
      function withTimeout(p, ms){ return Promise.race([ p, new Promise(function(_,rej){ setTimeout(function(){ rej(new Error('timeout')); }, ms); }) ]); }
      async function capture(){ if(!stage||!stage.isConnected)stage=findStage(W,H);if(raster.mode==='modern'){var MSx=msResolve();if(!(MSx&&MSx.domToCanvas))throw new Error('modern-screenshot unavailable');return await MSx.domToCanvas(stage,buildOpt());}return await window.html2canvas(stage,{width:W,height:H,windowWidth:W,windowHeight:H,scale:1,backgroundColor:'#0a1733',useCORS:true,logging:false,imageTimeout:20000,removeContainer:true}); }
      post({warn:'フォント・画像を準備中です（初回のみ少し時間がかかります）…'});
      try{ await withTimeout(capture(), 120000); }
      catch(e){ if(raster.mode==='modern')throw new Error('modern-screenshotの初回描画に失敗しました: '+((e&&e.message)||e));post({warn:'初回描画のウォームアップで警告: '+((e&&e.message)||e)}); }
      post({warn:'準備完了。全'+total+'フレームを描画します（完了まで数分～十数分かかります）。'});
      for(var i=0;i<total;i++){
        var t=Math.min(i/fps,dur);
        var __smx=parseFloat(scr.max||'0')||0; var __sval=(dur>0&&__smx>0)?(t/dur*__smx):t; scr.value=String(__sval); scr.dispatchEvent(new Event('input',{bubbles:true}));
        await raf2();
        var el=Math.max(0,(t-sStart(t,bounds))*1000);
        var anims=document.getAnimations?document.getAnimations():[];
        for(var ai=0;ai<anims.length;ai++){ try{ anims[ai].pause(); anims[ai].currentTime=el; }catch(e){} }
        if(__vidN){ await bakeVideos(t,bounds); }
        await raf2();
        var canvas;
        try{ canvas=await withTimeout(capture(), 60000); }
        catch(e){ if(raster.mode==='html2canvas'&&useFont){ useFont=false; post({warn:'描画に時間がかかったためフォント簡略化モードに切替えて続行します。'}); canvas=await withTimeout(capture(), 60000); } else { throw new Error('フレーム'+(i+1)+'の描画に失敗しました: '+((e&&e.message)||e)); } }
        var vf=new VideoFrame(canvas,{ timestamp:Math.round(i*1000000/fps), duration:Math.round(1000000/fps) });
        venc.encode(vf,{ keyFrame:(i%fps===0) });
        vf.close();
        while(venc.encodeQueueSize>8){ await new Promise(function(r){ setTimeout(r,8); }); }
        if(i<12||i%4===0||i===total-1) post({prog:{i:i+1,total:total}});
      }
      await venc.flush();
      if(audio){
        try{
          var ch=audio.numberOfChannels, rate=audio.sampleRate, len=audio.length;
          var aenc=new AudioEncoder({ output:function(c,m){ muxer.addAudioChunk(c,m); }, error:function(e){ post({warn:'音声エンコードエラー: '+e.message}); } });
          aenc.configure({ codec:'mp4a.40.2', sampleRate:rate, numberOfChannels:ch, bitrate:160000 });
          var planar=[]; for(var c2=0;c2<ch;c2++) planar.push(audio.getChannelData(c2));
          var fz=1024;
          for(var off=0;off<len;off+=fz){
            var n=Math.min(fz,len-off);
            var data=new Float32Array(n*ch);
            for(var c3=0;c3<ch;c3++){ data.set(planar[c3].subarray(off,off+n), c3*n); }
            var adata=new AudioData({ format:'f32-planar', sampleRate:rate, numberOfFrames:n, numberOfChannels:ch, timestamp:Math.round(off*1000000/rate), data:data });
            aenc.encode(adata); adata.close();
          }
          await aenc.flush();
        }catch(e){ post({warn:'音声処理に失敗したため映像のみで書き出します: '+e.message}); }
      }
      muxer.finalize();
      var buf=muxer.target.buffer;
      post({done:1, buffer:buf}, [buf]);
    }catch(e){ post({err:'書き出し中にエラー: '+((e&&e.message)||e)}); }
  }
  window.addEventListener('message', function(e){ var d=e.data||{}; if(d.__dcMp4Cmd!==1) return; if(d.cmd==='start'){ run(d.cfg||{}); } });
  async function init(){
    try{
      if(!window.html2canvas){ try{ await loadScript(['https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js','https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js']); }catch(e){} }
      if(!msResolve()){ try{ await loadScript(['https://cdn.jsdelivr.net/npm/modern-screenshot@4.4.39/dist/index.js','https://unpkg.com/modern-screenshot@4.4.39/dist/index.js']); }catch(e){} }
      if(!(window.Mp4Muxer&&window.Mp4Muxer.Muxer)){ try{ await loadScript(['https://cdn.jsdelivr.net/npm/mp4-muxer@4.3.3/build/mp4-muxer.js','https://unpkg.com/mp4-muxer@4.3.3/build/mp4-muxer.js','https://cdn.jsdelivr.net/npm/mp4-muxer@4/build/mp4-muxer.js']); }catch(e){} }
      await waitFor(function(){ return (window.html2canvas||msResolve())&&window.Mp4Muxer&&window.Mp4Muxer.Muxer; }, 10000);
      await waitFor(S, 15000);
      var hasScr=!!S(), hasMS=!!(window.html2canvas||msResolve()), hasMux=!!(window.Mp4Muxer&&window.Mp4Muxer.Muxer);
      if(hasScr&&hasMS&&hasMux){ var fr=(document.fonts&&document.fonts.ready)?document.fonts.ready:Promise.resolve(); fr.then(function(){ setTimeout(function(){ post({ready:1}); }, 400); }); }
      else { var miss=[]; if(!hasScr) miss.push('プレイヤー(スクラバー)'); if(!hasMS) miss.push('画像描画ライブラリ(html2canvas/modern-screenshot)'); if(!hasMux) miss.push('MP4ライブラリ(mp4-muxer)'); post({err:'準備に失敗しました。不足: '+miss.join('・')+(__dcErrs.length?(' / 読込エラー: '+__dcErrs.slice(0,3).join(' | ')):' / 読込エラーなし（ネット接続またはセキュリティ制限の可能性）')}); }
    }catch(e){ post({err:'初期化エラー: '+((e&&e.message)||e)}); }
  }
  init();
})();
`;
function buildDcExportRenderDoc(){
  let doc=buildDcDoc(true);
  const libs='<script src="https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"><\/script><script src="https://cdn.jsdelivr.net/npm/modern-screenshot@4.4.39/dist/index.js"><\/script><script src="https://cdn.jsdelivr.net/npm/mp4-muxer@4.3.3/build/mp4-muxer.js"><\/script>';
  const inj=libs+'<script>'+DC_MP4_HARNESS+'<\/script>';
  if(/<\/body>/i.test(doc)) doc=doc.replace(/<\/body>/i, inj+"</body>"); else doc+=inj;
  return doc;
}
async function exportDcMp4(){
  if(!M.dcMode){ log("MP4書き出しはネイティブ .dc.html（Claude Design）でのみ使えます。", true); return; }
  if(typeof VideoEncoder==="undefined"){ log("このブラウザは WebCodecs 未対応のため MP4 書き出しできません。最新の Chrome / Edge をお使いください。", true); return; }
  commitJsx();
  await ensureDcDataUrls();
  _logVideoSlotWarnings("MP4書き出し");
  _logAssetVideoWarnings("MP4書き出し");
  const { bounds, dur }=dcParseBounds();
  const fps=30;
  const _stg=dcCurStageSize();
  log("\ud83c\udfac MP4書き出しを開始します（"+_stg.w+"×"+_stg.h+" / "+fps+"fps、約"+Math.ceil(dur)+"秒）。レンダリング中はそのままお待ちください…数分かかります。");
  const btn=$("#expMp4"); if(btn){ btn.disabled=true; btn.textContent="\ud83c\udfac 書き出し中…"; }
  let audioDataUrl=(M.dcAudio&&M.dcAudio.dataUrl)||null;
  if(M.dcBgm && M.dcBgm.dataUrl){
    try{ log("\ud83c\udfb6 BGMをミックス中…"); const _mx4=await mixVoiceAndBgm(); if(_mx4){ audioDataUrl="data:audio/wav;base64,"+u8ToB64(_mx4.bytes); _bgmMixLog(_mx4); } }
    catch(_e4){ log("BGMのミックスに失敗したため、BGM無しで書き出します: "+((_e4&&_e4.message)||_e4), true); }
  }
  const doc=buildDcExportRenderDoc();
  const ifr=document.createElement("iframe");
  ifr.setAttribute("aria-hidden","true");
  ifr.style.cssText="position:fixed;left:-99999px;top:0;width:"+_stg.w+"px;height:"+(_stg.h+64)+"px;border:0;opacity:0;pointer-events:none";
  document.body.appendChild(ifr);
  await new Promise((resolve)=>{
    let finished=false;
    function cleanup(){ try{ window.removeEventListener("message", onMsg); }catch(_){} try{ ifr.remove(); }catch(_){} if(btn){ btn.disabled=false; btn.textContent="\ud83c\udfac MP4書き出し"; } }
    function onMsg(e){
      const d=e.data; if(!d||d.__dcMp4!==1) return;
      if(d.ready){ try{ ifr.contentWindow.postMessage({__dcMp4Cmd:1,cmd:"start",cfg:{fps,duration:dur,bounds,audioDataUrl,bitrate:9000000,width:_stg.w,height:_stg.h,rasterReasons:dcRasterReasons(currentJsxText())}},"*"); }catch(err){ log("MP4開始エラー: "+err.message,true); } return; }
      if(d.warn){ log("MP4: "+d.warn, true); return; }
      if(d.prog){ const p=d.prog; if(p.i===1||p.i%30===0||p.i===p.total){ const pct=Math.round(p.i/p.total*100); log("MP4 レンダリング中… "+p.i+" / "+p.total+" フレーム ("+pct+"%)"); } return; }
      if(d.err){ if(!finished){ finished=true; log("MP4書き出しエラー: "+d.err, true); cleanup(); resolve(); } return; }
      if(d.done){ if(!finished){ finished=true; try{ const blob=new Blob([d.buffer],{type:"video/mp4"}); download(blob, (baseExportName()||"design")+".mp4"); log("\u2705 MP4 を書き出しました（編集内容・画像"+(audioDataUrl?"・音声":"")+"を反映）。"); }catch(err){ log("MP4保存エラー: "+err.message, true); } cleanup(); resolve(); } return; }
    }
    window.addEventListener("message", onMsg);
    ifr.srcdoc=doc;
    setTimeout(()=>{ if(!finished){ finished=true; log("MP4書き出しがタイムアウトしました。", true); cleanup(); resolve(); } }, 30*60*1000);
  });
}

// ===== PNG（静止画）書き出し：サムネイル用（現在の再生位置を 1280×720 / 1920×1080 のPNGで保存）=====
// v20-2: いま画面にあるプレビューを直接撮る。別iframeでデッキを再実行しない。
// 動画は現在フレームをcanvasへコピーしてからDOM撮影する。CSS filterはcanvasへ焼かず、置き換え要素側に残す。
// v30: アニメ固定を動画隠しより先に行い、復元は動画の再表示を最後にする。WebGL readPixels でフレームを取り、2Dへ写すときにY反転する。全画面のぼかし背景はPNGへ後塗りしない。非表示動画はスキップし、再生・フォント待ちと全体に上限を付ける。
const DC_LIVE_PNG_BRIDGE = `
(function(){
  if(window.__cdeLivePngInstalled) return;
  window.__cdeLivePngInstalled=1;
  var busy=false, htmlLoadPromise=null, modernLoadPromise=null;
  function post(o,tr){ try{ parent.postMessage(Object.assign({__cdeLivePng:1},o),'*',tr||[]); }catch(e){} }
  function raf2(){ return new Promise(function(r){ requestAnimationFrame(function(){ requestAnimationFrame(r); }); }); }
  function findStage(W,H){
    var hit=document.querySelector('[data-cde-stage="1"]'); if(hit) return hit;
    var es=document.querySelectorAll('div[style],section[style],main[style]');
    for(var i=0;i<es.length;i++){ try{ var cs=getComputedStyle(es[i]),w=parseFloat(cs.width),h=parseFloat(cs.height); if(Math.abs(w-W)<0.6&&Math.abs(h-H)<0.6)return es[i]; }catch(e){} }
    return null;
  }
  function msResolve(){ return window.modernScreenshot || window.ModernScreenshot || null; }
  function cssFeatures(stage){
    var rs=[],all=[stage],q=stage&&stage.querySelectorAll?stage.querySelectorAll('*'):[];
    for(var i=0;i<q.length;i++)all.push(q[i]);
    for(var j=0;j<all.length;j++){
      var el=all[j],cs;try{cs=getComputedStyle(el);}catch(e){continue;}
      var wm=(cs.writingMode||cs.webkitWritingMode||'').toLowerCase(),flt=(cs.filter||'none').toLowerCase(),fit=(cs.objectFit||'fill').toLowerCase();
      if(wm&&wm!=='horizontal-tb'&&rs.indexOf('縦書き')<0)rs.push('縦書き');
      if(flt&&flt!=='none'&&rs.indexOf('CSS filter')<0)rs.push('CSS filter');
      if((el.tagName==='IMG'||el.tagName==='VIDEO'||el.tagName==='CANVAS')&&fit&&fit!=='fill'&&rs.indexOf('object-fit')<0)rs.push('object-fit');
      if(rs.length===3)break;
    }
    return rs;
  }
  function loadScript(urls,test,label){
    return new Promise(function(resolve,reject){
      if(test()) { resolve(); return; }
      var i=0;
      function next(){
        if(i>=urls.length){ reject(new Error(label+'を読み込めませんでした。ネット接続をご確認ください。')); return; }
        var s=document.createElement('script');s.src=urls[i++];
        s.onload=function(){ test()?resolve():next(); };s.onerror=next;document.head.appendChild(s);
      }
      next();
    });
  }
  function loadHtml2Canvas(){
    if(window.html2canvas)return Promise.resolve();
    if(!htmlLoadPromise)htmlLoadPromise=loadScript(['https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js','https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js'],function(){return !!window.html2canvas;},'html2canvas');
    return htmlLoadPromise;
  }
  function loadModernScreenshot(){
    if(msResolve()&&msResolve().domToCanvas)return Promise.resolve();
    if(!modernLoadPromise)modernLoadPromise=loadScript(['https://cdn.jsdelivr.net/npm/modern-screenshot@4.4.39/dist/index.js','https://unpkg.com/modern-screenshot@4.4.39/dist/index.js'],function(){var ms=msResolve();return !!(ms&&ms.domToCanvas);},'modern-screenshot');
    return modernLoadPromise;
  }
  async function chooseRaster(stage){
    var reasons=cssFeatures(stage);
    if(reasons.length){
      await loadModernScreenshot();
      return {mode:'modern',reasons:reasons};
    }
    try{ await loadHtml2Canvas();return {mode:'html2canvas',reasons:[]}; }
    catch(e){ await loadModernScreenshot();return {mode:'modern',reasons:[]}; }
  }
  function cssPropName(s){ return String(s||'').replace(/[A-Z]/g,function(c){return '-'+c.toLowerCase();}); }
  function freezeAnimationStates(stage){
    var recs=[],seq=0,common=['transform','opacity','filter','clip-path','background-color','color','box-shadow','text-shadow','width','height','left','top','right','bottom'];
    function recFor(el){
      if(!el||el.nodeType!==1||(el!==stage&&!stage.contains(el))||!isShown(el))return null;
      for(var i=0;i<recs.length;i++)if(recs[i].el===el)return recs[i];
      var old=el.getAttribute('data-cde-png-anim-id'),id='cde-a'+(++seq);el.setAttribute('data-cde-png-anim-id',id);
      var r={el:el,id:id,old:old,style:el.getAttribute('style'),names:{},values:{}};recs.push(r);return r;
    }
    try{
      var anims=stage.getAnimations?stage.getAnimations({subtree:true}):[];
      for(var i=0;i<anims.length;i++){
        var a=anims[i],r=recFor(a.effect&&a.effect.target);if(!r)continue;
        try{var frames=a.effect.getKeyframes?a.effect.getKeyframes():[];for(var j=0;j<frames.length;j++){var ks=Object.keys(frames[j]);for(var k=0;k<ks.length;k++){var n=ks[k];if(n==='offset'||n==='easing'||n==='composite'||n==='computedOffset')continue;r.names[cssPropName(n)]=1;}}}catch(e){}
      }
    }catch(e){}
    try{
      var all=[stage],q=stage.querySelectorAll('*');for(var ai=0;ai<q.length;ai++)all.push(q[ai]);
      for(var x=0;x<all.length;x++){if(!isShown(all[x]))continue;var csx=getComputedStyle(all[x]);if(csx.animationName&&csx.animationName!=='none')recFor(all[x]);}
    }catch(e){}
    for(var ri=0;ri<recs.length;ri++){
      var rr=recs[ri],cs=getComputedStyle(rr.el);for(var ci=0;ci<common.length;ci++)rr.names[common[ci]]=1;
      var ns=Object.keys(rr.names);for(var ni=0;ni<ns.length;ni++){var p=ns[ni],v=cs.getPropertyValue(p);if(v!==''&&v!=null)rr.values[p]=v;}
    }
    for(var li=0;li<recs.length;li++){
      var lr=recs[li],ps=Object.keys(lr.values);
      for(var pj=0;pj<ps.length;pj++)lr.el.style.setProperty(ps[pj],lr.values[ps[pj]],'important');
      lr.el.style.setProperty('animation','none','important');lr.el.style.setProperty('transition','none','important');
    }
    return {restore:function(){for(var i=0;i<recs.length;i++){try{if(recs[i].style==null)recs[i].el.removeAttribute('style');else recs[i].el.setAttribute('style',recs[i].style);if(recs[i].old==null)recs[i].el.removeAttribute('data-cde-png-anim-id');else recs[i].el.setAttribute('data-cde-png-anim-id',recs[i].old);}catch(e){}}}};
  }
  function sampleHasPaint(c){
    try{
      var x=c.getContext('2d'),w=c.width,h=c.height; if(!(w>1&&h>1)) return false;
      var pts=[[0.18,0.18],[0.82,0.18],[0.5,0.5],[0.18,0.82],[0.82,0.82]],i;
      for(i=0;i<pts.length;i++){
        var px=Math.min(w-1,Math.floor(w*pts[i][0])), py=Math.min(h-1,Math.floor(h*pts[i][1]));
        var d=x.getImageData(px,py,1,1).data;
        if(d[0]>12||d[1]>12||d[2]>12) return true;
      }
    }catch(e){ return false; }
    return false;
  }
  function drawVideoTo(c,src){
    var x=c.getContext('2d',{willReadFrequently:true})||c.getContext('2d');
    x.setTransform(1,0,0,1,0,0); x.filter='none'; x.globalAlpha=1; x.clearRect(0,0,c.width,c.height);
    x.drawImage(src,0,0,c.width,c.height);
  }
  function grabViaWebGL(v,out2d){
    var w=v.videoWidth||out2d.width,h=v.videoHeight||out2d.height; if(!(w>1&&h>1)) return false;
    var glc=document.createElement('canvas'); glc.width=w; glc.height=h;
    var gl=glc.getContext('webgl',{preserveDrawingBuffer:true,alpha:false,premultipliedAlpha:false})||glc.getContext('experimental-webgl',{preserveDrawingBuffer:true,alpha:false});
    if(!gl) return false;
    function mk(type,src){ var s=gl.createShader(type); gl.shaderSource(s,src); gl.compileShader(s); return s; }
    var vs=mk(gl.VERTEX_SHADER,'attribute vec2 p;varying vec2 u;void main(){u=vec2(p.x*.5+.5,p.y*.5+.5);gl_Position=vec4(p,0,1);}');
    var fs=mk(gl.FRAGMENT_SHADER,'precision mediump float;varying vec2 u;uniform sampler2D t;void main(){gl_FragColor=texture2D(t,u);}');
    var pr=gl.createProgram(); gl.attachShader(pr,vs); gl.attachShader(pr,fs); gl.linkProgram(pr);
    if(!gl.getProgramParameter(pr,gl.LINK_STATUS)) return false;
    gl.useProgram(pr);
    var b=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,b); gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
    var loc=gl.getAttribLocation(pr,'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
    var tex=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,tex);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
    try{ gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,1); gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,v); }
    catch(e){ return false; }
    gl.viewport(0,0,w,h); gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
    var raw=new Uint8Array(w*h*4);
    try{ gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,raw); }catch(e){ return false; }
    if(out2d.width!==w) out2d.width=w; if(out2d.height!==h) out2d.height=h;
    var ctx=out2d.getContext('2d'), img=ctx.createImageData(w,h), row=w*4, y;
    for(y=0;y<h;y++) img.data.set(raw.subarray((h-1-y)*row,(h-y)*row), y*row);
    ctx.putImageData(img,0,0);
    return sampleHasPaint(out2d);
  }
  function withTimeout(p,ms){ return Promise.race([p, new Promise(function(res){ setTimeout(res, ms||800); })]); }
  function playBrief(v,ms){
    return withTimeout(Promise.resolve(v.play()).then(function(){}, function(){}), ms||400);
  }
  function isShown(el){
    var e=el,d=0; while(e&&e.nodeType===1&&d<48){ var cs; try{cs=getComputedStyle(e);}catch(ex){return true;} if(!cs) return true; if(cs.display==='none'||cs.visibility==='hidden'||cs.visibility==='collapse') return false; e=e.parentElement; d++; } return true;
  }
  function waitEvent(el,name,ms){
    return new Promise(function(res){ var d=false; function fin(){ if(d)return; d=true; try{el.removeEventListener(name,fin);}catch(e){} res(); } el.addEventListener(name,fin); setTimeout(fin,ms||800); });
  }
  async function grabFromClone(v,c){
    var src=v.currentSrc||v.getAttribute('src')||''; if(!src) return false;
    var v2=document.createElement('video');
    v2.muted=true; v2.playsInline=true; v2.preload='auto'; v2.setAttribute('playsinline','');
    v2.style.cssText='position:fixed;left:0;top:0;width:8px;height:8px;opacity:.04;pointer-events:none;z-index:2147483646';
    document.body.appendChild(v2);
    try{
      v2.src=src;
      await waitEvent(v2,'loadeddata',1200);
      if(v2.readyState<2) return false;
      try{ v2.currentTime=v.currentTime||0; await waitEvent(v2,'seeked',600); }catch(e){}
      await playBrief(v2,300);
      await raf2();
      drawVideoTo(c,v2);
      if(sampleHasPaint(c)) return true;
      if(grabViaWebGL(v2,c)) return true;
    }finally{
      try{ v2.pause(); v2.removeAttribute('src'); v2.load(); v2.remove(); }catch(e){}
    }
    return sampleHasPaint(c);
  }
  async function grabWhilePlaying(v,c){
    var t=v.currentTime, paused=v.paused, muted=v.muted;
    v.muted=true;
    try{
      if(paused){ await playBrief(v,400); await raf2(); }
      if(v.requestVideoFrameCallback){
        await new Promise(function(res){ var d=false; function fin(){ if(d)return; d=true; res(); } try{ v.requestVideoFrameCallback(function(){ try{ drawVideoTo(c,v); }catch(e){} fin(); }); }catch(e){ fin(); } setTimeout(fin,400); });
      }else{ drawVideoTo(c,v); }
      if(sampleHasPaint(c)) return true;
      if(grabViaWebGL(v,c)) return true;
    }finally{
      v.muted=muted;
      if(paused){ try{ v.pause(); }catch(e){} }
      try{ if(Math.abs((v.currentTime||0)-t)>0.04) v.currentTime=t; }catch(e){}
    }
    return sampleHasPaint(c);
  }
  async function grabVideoPixels(v,c){
    if(grabViaWebGL(v,c)) return true;
    try{ if(typeof VideoFrame==='function'){ var vf=new VideoFrame(v); try{ drawVideoTo(c,vf); } finally { try{vf.close();}catch(e){} } if(sampleHasPaint(c)) return true; } }catch(e){}
    try{ if(typeof createImageBitmap==='function'){ var bmp=await withTimeout(createImageBitmap(v),800); if(bmp){ try{ drawVideoTo(c,bmp); } finally { try{bmp.close();}catch(e){} } if(sampleHasPaint(c)) return true; } } }catch(e){}
    try{ drawVideoTo(c,v); if(sampleHasPaint(c)) return true; }catch(e){}
    if(await grabWhilePlaying(v,c)) return true;
    if(await grabFromClone(v,c)) return true;
    try{
      if(v.captureStream && typeof ImageCapture==='function'){
        var playing= !v.paused; if(v.paused){ await playBrief(v,400); await raf2(); }
        var stream=v.captureStream(),track=stream&&stream.getVideoTracks&&stream.getVideoTracks()[0];
        if(track){
          var bmp2=await withTimeout(new ImageCapture(track).grabFrame(),800);
          if(bmp2){ drawVideoTo(c,bmp2); try{bmp2.close();}catch(e){} }
          try{track.stop();}catch(e){}
        }
        if(!playing){ try{ v.pause(); }catch(e){} }
        if(sampleHasPaint(c)) return true;
      }
    }catch(e){}
    return sampleHasPaint(c);
  }
  function stageBox(stage,el){
    var sr=stage.getBoundingClientRect(), r=el.getBoundingClientRect();
    return {x:r.left-sr.left,y:r.top-sr.top,w:r.width,h:r.height};
  }
  function imgReady(im){ return new Promise(function(resolve){ if(im.complete&&im.naturalWidth){resolve();return;} var done=false;function fin(){if(!done){done=true;resolve();}}im.addEventListener('load',fin,{once:true});im.addEventListener('error',fin,{once:true});setTimeout(fin,5000); }); }
  function canvasToImg(c){
    return new Promise(function(resolve){
      try{
        c.toBlob(function(b){
          if(!b){ resolve(null); return; }
          var im=document.createElement('img'), url=URL.createObjectURL(b),done=false,timer=null;
          function finish(v){if(done)return;done=true;if(timer)clearTimeout(timer);resolve(v);}
          im.onload=function(){ finish({el:im,url:url}); };
          im.onerror=function(){ try{URL.revokeObjectURL(url);}catch(e){} finish(null); };
          timer=setTimeout(function(){try{URL.revokeObjectURL(url);}catch(e){}finish(null);},2000);
          im.src=url;
        },'image/png');
      }catch(e){ resolve(null); }
    });
  }
  function copyVideoLook(src,dst,cs){
    if(src.className) dst.className=src.className;
    var raw=src.getAttribute('style'); if(raw) dst.setAttribute('style',raw);
    dst.setAttribute('data-cde-live-video-frame','1');
    dst.style.animation='none'; dst.style.transition='none';
    dst.style.transform=cs.transform; dst.style.opacity=cs.opacity;
    dst.style.filter=(cs.filter&&cs.filter!=='none')?cs.filter:'none';
    dst.style.objectFit=cs.objectFit; dst.style.objectPosition=cs.objectPosition;
    dst.style.width=cs.width; dst.style.height=cs.height;
    dst.style.zIndex='0';
  }
  function isFullBleedBox(box,sw,sh){ return !!(box&&sw>0&&sh>0&&box.w>sw*0.85&&box.h>sh*0.85); }
  function heavyBlurPx(filter){ var m=/blur\\(\\s*([0-9.]+)\\s*px/i.exec(String(filter||'')); return m?parseFloat(m[1])||0:0; }
  async function freezeVideo(v,stage){
    var cs=getComputedStyle(v), box=stageBox(stage,v);
    if(!isShown(v)||cs.display==='none'||cs.visibility==='hidden'||!v.videoWidth||!v.videoHeight||box.w<2||box.h<2) return null;
    var c=document.createElement('canvas'); c.width=v.videoWidth; c.height=v.videoHeight;
    var painted=false;
    try{ painted=await grabVideoPixels(v,c); }catch(e){}
    if(!painted) return null;
    var converted=await canvasToImg(c), overlay=converted&&converted.el?converted.el:c;
    copyVideoLook(v,overlay,cs);
    var oldVis=v.style.getPropertyValue('visibility');
    var oldPri=v.style.getPropertyPriority('visibility');
    var sr=stage.getBoundingClientRect();
    if(v.parentNode) v.parentNode.insertBefore(overlay, isFullBleedBox(box,sr.width,sr.height)?v:v.nextSibling);
    v.style.setProperty('visibility','hidden','important');
    return {video:v,image:overlay,url:converted&&converted.url,pixels:c,box:box,fit:cs.objectFit,filter:cs.filter,opacity:parseFloat(cs.opacity)||1,vis:oldVis,pri:oldPri};
  }
  function unfreezeVideo(rec){
    try{ if(rec.image&&rec.image.parentNode) rec.image.remove(); }catch(e){}
    try{ if(rec.url) URL.revokeObjectURL(rec.url); }catch(e){}
    try{
      if(rec.pri) rec.video.style.setProperty('visibility',rec.vis,rec.pri);
      else rec.video.style.removeProperty('visibility');
    }catch(e){}
  }
  function drawFitted(ctx,src,dx,dy,dw,dh,fit){
    var sw=src.width, sh=src.height; if(!(sw>0&&sh>0&&dw>0&&dh>0)) return;
    fit=String(fit||'fill').toLowerCase();
    if(fit!=='cover'&&fit!=='contain'&&fit!=='scale-down'){ ctx.drawImage(src,dx,dy,dw,dh); return; }
    var scale=(fit==='contain')?Math.min(dw/sw,dh/sh):Math.max(dw/sw,dh/sh);
    var tw=sw*scale, th=sh*scale, ox=dx+(dw-tw)/2, oy=dy+(dh-th)/2;
    ctx.drawImage(src,ox,oy,tw,th);
  }
  function regionIsMostlyBlack(canvas,box,stageW,stageH){
    try{
      var x=canvas.getContext('2d'), cw=canvas.width, ch=canvas.height;
      var rx=Math.round(box.x*cw/stageW), ry=Math.round(box.y*ch/stageH);
      var rw=Math.max(1,Math.round(box.w*cw/stageW)), rh=Math.max(1,Math.round(box.h*ch/stageH));
      rx=Math.max(0,Math.min(cw-1,rx)); ry=Math.max(0,Math.min(ch-1,ry));
      rw=Math.min(rw,cw-rx); rh=Math.min(rh,ch-ry);
      if(rw<8||rh<8) return false;
      var hits=0,total=0,gx,gy;
      for(gy=0;gy<5;gy++) for(gx=0;gx<5;gx++){
        var px=rx+Math.floor(rw*(gx+0.5)/5), py=ry+Math.floor(rh*(gy+0.5)/5);
        var d=x.getImageData(px,py,1,1).data; total++;
        if(d[0]<18&&d[1]<18&&d[2]<18) hits++;
      }
      return total>0&&(hits/total)>=0.72;
    }catch(e){ return false; }
  }
  function blitFrozenIfBlack(out,stage,frozen){
    if(!frozen.length) return 0;
    var sr=stage.getBoundingClientRect(), n=0, i, ox=out.getContext('2d');
    ox.imageSmoothingEnabled=true; ox.imageSmoothingQuality='high';
    for(i=0;i<frozen.length;i++){
      var rec=frozen[i]; if(!rec.pixels||!sampleHasPaint(rec.pixels)||!rec.box) continue;
      if(isFullBleedBox(rec.box,sr.width,sr.height)) continue;
      if(heavyBlurPx(rec.filter)>8) continue;
      if(!regionIsMostlyBlack(out,rec.box,sr.width,sr.height)) continue;
      var sx=out.width/sr.width, sy=out.height/sr.height;
      var dx=rec.box.x*sx, dy=rec.box.y*sy, dw=rec.box.w*sx, dh=rec.box.h*sy;
      ox.save();
      ox.globalAlpha=rec.opacity;
      if(rec.filter&&rec.filter!=='none'&&heavyBlurPx(rec.filter)<=8) ox.filter=rec.filter;
      ox.beginPath(); ox.rect(dx,dy,dw,dh); ox.clip();
      drawFitted(ox,rec.pixels,dx,dy,dw,dh,rec.fit);
      ox.restore();
      n++;
    }
    return n;
  }
  async function run(cfg){
    if(busy){ post({err:'PNG保存はすでに実行中です。'}); return; }
    busy=true; window.__cdeLivePngCapturing=1;
    var frozen=[],animFreeze=null,wrap=null,wrapStyle=null,de=document.documentElement,body=document.body,deStyle=de&&de.getAttribute('style'),bodyStyle=body&&body.getAttribute('style'),cancelled=false,watchdog=null;
    try{
      await Promise.race([
        (async function(){
          var W=cfg.width||1920,H=cfg.height||1080,stage=findStage(W,H);
          if(!stage) throw new Error('プレビューのステージを見つけられませんでした。再描画してからもう一度お試しください。');
          post({phase:'フォントを準備中'});
          if(document.fonts&&document.fonts.ready) await withTimeout(document.fonts.ready,1500);
          if(cancelled) return;
          wrap=document.getElementById('__cdePreviewScale');
          if(wrap){ wrapStyle=wrap.getAttribute('style'); wrap.style.transform='none'; wrap.style.left='0px'; wrap.style.top='0px'; wrap.style.width=W+'px'; wrap.style.height=H+'px'; }
          if(de){ de.style.overflow='visible'; de.style.width=W+'px'; de.style.height=H+'px'; }
          if(body){ body.style.overflow='visible'; body.style.width=W+'px'; body.style.height=H+'px'; }
          await raf2();
          if(cancelled) return;
          animFreeze=freezeAnimationStates(stage);
          await raf2();
          if(cancelled) return;
          var videos=stage.querySelectorAll('video');
          post({phase:'表示中の動画 '+videos.length+' 本を静止中'});
          for(var i=0;i<videos.length;i++){ if(cancelled) return; var f=await freezeVideo(videos[i],stage); if(f) frozen.push(f); }
          await raf2();
          if(cancelled) return;
          var raster=await chooseRaster(stage),canvas;
          if(cancelled) return;
          post({phase:'表示中のシーンを画像化中'});
          if(raster.mode==='modern'){
            var ms=msResolve();canvas=await ms.domToCanvas(stage,{width:W,height:H,scale:1,backgroundColor:'#0a1733'});
          }else{
            canvas=await window.html2canvas(stage,{width:W,height:H,windowWidth:W,windowHeight:H,scale:1,backgroundColor:'#0a1733',useCORS:true,allowTaint:false,logging:false,imageTimeout:8000,removeContainer:true,scrollX:0,scrollY:0});
          }
          if(cancelled) return;
          if(!canvas) throw new Error('画像化結果を取得できませんでした。');
          var ow=cfg.outW||W,oh=cfg.outH||H,out=canvas;
          if(canvas.width!==ow||canvas.height!==oh){ out=document.createElement('canvas');out.width=ow;out.height=oh;var ox=out.getContext('2d');ox.imageSmoothingEnabled=true;ox.imageSmoothingQuality='high';ox.drawImage(canvas,0,0,ow,oh); }
          var blitted=blitFrozenIfBlack(out,stage,frozen);
          post({phase:'PNGファイルへ変換中'});
          var blob=await new Promise(function(resolve,reject){ out.toBlob(function(b){b?resolve(b):reject(new Error('PNG変換に失敗しました'));},'image/png'); });
          if(cancelled) return;
          var buf=await blob.arrayBuffer(); post({done:1,buffer:buf,w:ow,h:oh,videos:frozen.length,blitted:blitted,raster:raster.mode,reasons:raster.reasons},[buf]);
        })(),
        new Promise(function(_,rej){ watchdog=setTimeout(function(){ cancelled=true; rej(new Error('PNG書き出しがタイムアウトしました。')); }, 40000); })
      ]);
    }catch(e){ post({err:'PNG書き出し中にエラー: '+((e&&e.message)||e)}); }
    finally{
      try{ if(watchdog) clearTimeout(watchdog); }catch(e){}
      if(animFreeze){ try{animFreeze.restore();}catch(e){} }
      for(var j=0;j<frozen.length;j++){ try{unfreezeVideo(frozen[j]);}catch(e){} }
      if(wrap){ try{ if(wrapStyle==null)wrap.removeAttribute('style');else wrap.setAttribute('style',wrapStyle); }catch(e){} }
      if(de){ try{ if(deStyle==null)de.removeAttribute('style');else de.setAttribute('style',deStyle); }catch(e){} }
      if(body){ try{ if(bodyStyle==null)body.removeAttribute('style');else body.setAttribute('style',bodyStyle); }catch(e){} }
      window.__cdeLivePngCapturing=0; busy=false;
      try{ if(typeof window.__cdeFit==='function') window.__cdeFit(); }catch(e){}
    }
  }
  window.addEventListener('message',function(e){var d=e.data||{};if(d.__cdeLivePngCmd!==1||d.cmd!=='capture')return;run(d.cfg||{});});
})();
`;
const DC_PNG_HARNESS = `
(function(){
  function S(){ return document.querySelector('input[type=range]'); }
  // ---- v11: CSS filter 焼き込み（html2canvas が CSS filter 非対応のため、撮影前に <img> のピクセルへ適用する）----
  function fltSupported(){ try{ var c=document.createElement('canvas').getContext('2d'); c.filter='brightness(0.5)'; return String(c.filter).indexOf('brightness')>=0; }catch(e){ return false; } }
  function fltPad(f){
    var s=String(f), pad=0, k=0;
    function lens(args){ var t=args.split(' ').filter(Boolean), out=[]; for(var q=0;q<t.length;q++){ if(/^-?[0-9.]+(px)?$/.test(t[q])){ out.push(Math.abs(parseFloat(t[q]))||0); } } return out; }
    while(true){
      var bi=s.indexOf('blur(', k), di=s.indexOf('drop-shadow(', k), i=-1, kind='';
      if(bi>=0 && (di<0 || bi<di)){ i=bi; kind='b'; } else if(di>=0){ i=di; kind='d'; } else break;
      var st=s.indexOf('(', i), en=-1, depth=0;
      for(var p=st; p<s.length; p++){ var ch=s.charAt(p); if(ch==='('){ depth++; } else if(ch===')'){ depth--; if(depth===0){ en=p; break; } } }
      if(en<=st) break;
      var nums=lens(s.slice(st+1, en)); k=en+1;
      if(kind==='b'){ pad=Math.max(pad, (nums[0]||0)*3); }
      else{ pad=Math.max(pad, Math.max(nums[0]||0, nums[1]||0)+(nums[2]||0)*3); }
    }
    return Math.ceil(pad);
  }
  function imgReady(im){ return new Promise(function(res){ if(im.complete && im.naturalWidth){ res(); return; } var done=false; function fin(){ if(!done){ done=true; res(); } } im.addEventListener('load', fin, true); im.addEventListener('error', fin, true); setTimeout(fin, 5000); }); }
  function swapSrc(im, url){ return new Promise(function(res){ var done=false; function fin(){ if(!done){ done=true; res(); } } im.addEventListener('load', fin, true); im.addEventListener('error', fin, true); setTimeout(fin, 5000); im.src=url; }); }
  function shiftBox(im, dx, dy){
    if(dx){ var r=im.getBoundingClientRect(), cs=getComputedStyle(im); im.style.marginLeft=((parseFloat(cs.marginLeft)||0)+dx)+'px'; var r2=im.getBoundingClientRect(); if(Math.abs((r2.left-r.left)-dx)>0.5){ var c2=getComputedStyle(im); im.style.marginRight=((parseFloat(c2.marginRight)||0)-dx)+'px'; } }
    if(dy){ var r3=im.getBoundingClientRect(), cs3=getComputedStyle(im); im.style.marginTop=((parseFloat(cs3.marginTop)||0)+dy)+'px'; var r4=im.getBoundingClientRect(); if(Math.abs((r4.top-r3.top)-dy)>0.5){ var c4=getComputedStyle(im); im.style.marginBottom=((parseFloat(c4.marginBottom)||0)-dy)+'px'; } }
  }
  async function bakeOneFilter(im, f){
    await imgReady(im);
    var nw=im.naturalWidth, nh=im.naturalHeight; if(!nw || !nh) return;
    var pad=fltPad(f), c, cx;
    if(pad<=0){
      c=document.createElement('canvas'); c.width=nw; c.height=nh;
      cx=c.getContext('2d'); cx.filter=f; cx.drawImage(im, 0, 0, nw, nh);
      im.style.filter='none';
      await swapSrc(im, c.toDataURL('image/png'));
    } else {
      var r0=im.getBoundingClientRect();
      var w=Math.max(1, Math.round(r0.width)), h=Math.max(1, Math.round(r0.height));
      c=document.createElement('canvas'); c.width=w+pad*2; c.height=h+pad*2;
      cx=c.getContext('2d'); cx.filter=f; cx.drawImage(im, pad, pad, w, h);
      im.style.filter='none';
      await swapSrc(im, c.toDataURL('image/png'));
      im.style.width=(w+pad*2)+'px'; im.style.height=(h+pad*2)+'px'; im.style.maxWidth='none'; im.style.maxHeight='none'; im.style.objectFit='fill';
      var r1=im.getBoundingClientRect();
      shiftBox(im, (r0.left-pad)-r1.left, (r0.top-pad)-r1.top);
    }
    im.setAttribute('data-cde-filter-baked', '1');
  }
  async function bakeCssFilters(){
    try{
      if(!fltSupported()) return;
      var list=document.querySelectorAll('img');
      for(var i=0;i<list.length;i++){
        var im=list[i];
        if(im.getAttribute('data-cde-filter-baked')==='1') continue;
        var f='none';
        try{ f=getComputedStyle(im).filter || 'none'; }catch(e){}
        if(!f || f==='none') continue;
        try{ await bakeOneFilter(im, f); }catch(e){ try{ __dcErrs.push('filter-bake: '+((e&&e.message)||e)); }catch(_){} }
      }
      try{
        var others=document.querySelectorAll('[style*="filter:"]');
        for(var j=0;j<others.length;j++){
          var el=others[j];
          if(el.tagName==='IMG') continue;
          var ff='none'; try{ ff=getComputedStyle(el).filter || 'none'; }catch(e){}
          if(ff && ff!=='none'){ post({warn:'注意: 画像以外の要素にCSS filterがあります。このエフェクトはPNGに反映されない場合があります。'}); break; }
        }
      }catch(e){}
    }catch(e){}
  }
  function findStage(W,H){ var hit=document.querySelector('[data-cde-stage="1"]');if(hit)return hit;var ds=document.querySelectorAll('div[style]');for(var i=0;i<ds.length;i++){try{var cs=getComputedStyle(ds[i]),w=parseFloat(cs.width),h=parseFloat(cs.height);if(Math.abs(w-W)<0.6&&Math.abs(h-H)<0.6)return ds[i];}catch(e){}}return document.body; }
  function sStart(t,b){ var i=0; for(var k=0;k<b.length;k++){ if(t>=b[k]) i=k; } return b[i]; }
  function raf2(){ return new Promise(function(r){ requestAnimationFrame(function(){ requestAnimationFrame(r); }); }); }
  function msResolve(){ return window.modernScreenshot || window.ModernScreenshot || null; }
  function cssFeatures(stage){var rs=[],all=[stage],q=stage&&stage.querySelectorAll?stage.querySelectorAll('*'):[];for(var i=0;i<q.length;i++)all.push(q[i]);for(var j=0;j<all.length;j++){var el=all[j],cs;try{cs=getComputedStyle(el);}catch(e){continue;}var wm=(cs.writingMode||cs.webkitWritingMode||'').toLowerCase(),flt=(cs.filter||'none').toLowerCase(),fit=(cs.objectFit||'fill').toLowerCase();if(wm&&wm!=='horizontal-tb'&&rs.indexOf('縦書き')<0)rs.push('縦書き');if(flt&&flt!=='none'&&rs.indexOf('CSS filter')<0)rs.push('CSS filter');if((el.tagName==='IMG'||el.tagName==='VIDEO')&&fit&&fit!=='fill'&&rs.indexOf('object-fit')<0)rs.push('object-fit');if(rs.length===3)break;}return rs;}
  function chooseRaster(stage,forced){var reasons=cssFeatures(stage),ms=msResolve();forced=forced||[];for(var i=0;i<forced.length;i++)if(reasons.indexOf(forced[i])<0)reasons.push(forced[i]);if(reasons.length){if(!(ms&&ms.domToCanvas))throw new Error(reasons.join('・')+'を正確に描画するmodern-screenshotを読み込めませんでした。誤ったPNGを防ぐため停止しました。');return {mode:'modern',reasons:reasons};}if(window.html2canvas)return {mode:'html2canvas',reasons:[]};if(ms&&ms.domToCanvas)return {mode:'modern',reasons:[]};throw new Error('画像描画ライブラリを読み込めませんでした。');}
  function flattenSlots(){ try{ var slots=document.querySelectorAll('image-slot'); for(var i=0;i<slots.length;i++){ var host=slots[i]; var src=''; try{ if(host.shadowRoot){ var im=host.shadowRoot.querySelector('img'); if(im) src=im.getAttribute('src')||im.src||''; } }catch(e){} if(!src) src=host.getAttribute('src')||''; if(!src) continue; var fit=(host.getAttribute('fit')||'cover').toLowerCase(); host.style.backgroundImage='url("'+src+'")'; host.style.backgroundSize=(fit==='contain'?'contain':'cover'); host.style.backgroundPosition='center center'; host.style.backgroundRepeat='no-repeat'; } }catch(e){ __dcErrs.push('flatten: '+((e&&e.message)||e)); } }
  function vT0(v,b){ var a=parseFloat(v.getAttribute('data-t0')); if(isFinite(a)) return a; var e=v.parentNode; while(e&&e.tagName){ if(/^sc-if$/i.test(e.tagName)){ var scs=document.querySelectorAll('sc-if'); for(var i=0;i<scs.length;i++){ if(scs[i]===e) return (b[i]!=null?b[i]:0); } break; } e=e.parentNode; } return 0; }
  function seekVid(v,vt){ return new Promise(function(res){ try{ v.muted=true; v.pause(); if(Math.abs((v.currentTime||0)-vt)<0.02){ res(); return; } var done=false; function f(){ if(done)return;done=true;try{v.removeEventListener('seeked',f);}catch(e){}res(); } v.addEventListener('seeked',f); v.currentTime=vt; setTimeout(f,800); }catch(e){res();} }); }
  async function prepVideos(){ var vs=document.getElementsByTagName('video'); for(var i=0;i<vs.length;i++){ try{vs[i].muted=true;vs[i].autoplay=false;vs[i].preload='auto';vs[i].pause();}catch(e){} } if(vs.length) await waitFor(function(){for(var j=0;j<vs.length;j++){if(vs[j].readyState<2)return false;}return true;},20000); return vs.length; }
  async function bakeVideos(t,b){ var vs=document.getElementsByTagName('video'); for(var i=0;i<vs.length;i++){ var v=vs[i]; try{ if(!v.__dcBake){ var im=document.createElement('img'); im.setAttribute('style',v.getAttribute('style')||''); if(v.className)im.className=v.className; try{var cs=getComputedStyle(v);im.style.objectFit=cs.objectFit||'cover';im.style.width=cs.width;im.style.height=cs.height;}catch(e){} v.__dcBake=im; if(v.parentNode)v.parentNode.insertBefore(im,v.nextSibling); v.style.display='none'; } var t0=vT0(v,b),vin=Math.max(0,parseFloat(v.getAttribute('data-vin')||'0')||0),vd=(v.duration&&isFinite(v.duration))?v.duration:0,raw=(t-t0)+vin,hi=(vd>0)?Math.max(vin,vd-0.033):vin,vt=Math.max(vin,Math.min(raw,hi)); await seekVid(v,vt); var c=v.__dcCan||(v.__dcCan=document.createElement('canvas'));var w=v.videoWidth||16,h=v.videoHeight||9;if(c.width!==w)c.width=w;if(c.height!==h)c.height=h;var cx=c.getContext('2d');cx.drawImage(v,0,0,w,h);v.__dcBake.src=c.toDataURL('image/jpeg',0.9);await imgReady(v.__dcBake); }catch(e){try{__dcErrs.push('video-bake: '+((e&&e.message)||e));}catch(_){}} } }
  function post(o,tr){ try{ parent.postMessage(Object.assign({__dcPng:1},o),'*',tr||[]); }catch(e){} }
  var __dcErrs=[];
  window.addEventListener('error', function(ev){ try{ var t=ev&&ev.target; if(t&&t.tagName==='SCRIPT'){ __dcErrs.push('script load fail: '+(t.src||'inline')); } else if(ev&&ev.message){ __dcErrs.push(String(ev.message)); } }catch(e){} }, true);
  function loadScript(urls){ return new Promise(function(resolve,reject){ var i=0; function tryNext(){ if(i>=urls.length){ reject(new Error('all failed')); return; } var u=urls[i++]; var s=document.createElement('script'); s.onload=function(){ resolve(u); }; s.onerror=function(){ __dcErrs.push('load fail: '+u); tryNext(); }; s.src=u; document.head.appendChild(s); } tryNext(); }); }
  function waitFor(fn,ms){ return new Promise(function(resolve){ var t0=Date.now(); var iv=setInterval(function(){ var ok=false; try{ ok=!!fn(); }catch(e){} if(ok||Date.now()-t0>ms){ clearInterval(iv); resolve(ok); } }, 100); }); }
  async function run(cfg){
    try{
      if(!window.html2canvas && !(msResolve()&&msResolve().domToCanvas)){ post({err:'画像描画ライブラリを読み込めませんでした（ネット接続をご確認ください）。'}); return; }
      var W=cfg.width||1920,H=cfg.height||1080,t=cfg.time||0,bounds=cfg.bounds||[0];
      if(typeof window.__cdeSetClock==='function') window.__cdeSetClock(t);
      var scr=S();
      if(scr){ scr.value=String(t); scr.dispatchEvent(new Event('input',{bubbles:true})); }
      await raf2();
      var el=Math.max(0,(t-sStart(t,bounds))*1000);
      var anims=document.getAnimations?document.getAnimations():[];
      for(var ai=0;ai<anims.length;ai++){ try{ anims[ai].pause(); anims[ai].currentTime=el; }catch(e){} }
      var vn=await prepVideos(); if(vn){ post({warn:'動画 '+vn+' 本を指定開始位置からシークしてPNGへ焼き込みます。'}); await bakeVideos(t,bounds); }
      flattenSlots();
      await raf2();
      var stage=findStage(W,H),raster=chooseRaster(stage,cfg.rasterReasons);
      post({warn:'描画エンジン: '+(raster.mode==='modern'?'modern-screenshot':'html2canvas')+(raster.reasons.length?('（'+raster.reasons.join('・')+'を保持）'):'')});
      async function capture(){ if(!stage||!stage.isConnected)stage=findStage(W,H);if(raster.mode==='modern'){var MSx=msResolve();if(!(MSx&&MSx.domToCanvas))throw new Error('modern-screenshot unavailable');return await MSx.domToCanvas(stage,{width:W,height:H,scale:1,backgroundColor:'#0a1733'});}return await window.html2canvas(stage,{width:W,height:H,windowWidth:W,windowHeight:H,scale:1,backgroundColor:'#0a1733',useCORS:true,logging:false,imageTimeout:20000,removeContainer:true}); }
      if(raster.mode==='html2canvas') await bakeCssFilters();
      await raf2();
      post({warn:'フォント・画像を準備中です…'});
      var canvas=await capture();
      var ow=cfg.outW||1280, oh=cfg.outH||720;
      var out=canvas;
      if(canvas.width!==ow || canvas.height!==oh){ out=document.createElement('canvas'); out.width=ow; out.height=oh; var cx=out.getContext('2d'); cx.imageSmoothingEnabled=true; cx.imageSmoothingQuality='high'; cx.drawImage(canvas,0,0,ow,oh); }
      var blob=await new Promise(function(res,rej){ try{ out.toBlob(function(b){ if(b) res(b); else rej(new Error('PNG変換に失敗しました')); },'image/png'); }catch(e){ rej(e); } });
      var buf=await blob.arrayBuffer();
      post({done:1, buffer:buf, w:ow, h:oh},[buf]);
    }catch(e){ post({err:'PNG書き出し中にエラー: '+((e&&e.message)||e)}); }
  }
  window.addEventListener('message', function(e){ var d=e.data||{}; if(d.__dcPngCmd!==1) return; if(d.cmd==='start'){ run(d.cfg||{}); } });
  async function init(){
    try{
      if(!window.html2canvas){ try{ await loadScript(['https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js','https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js']); }catch(e){} }
      if(!msResolve()){ try{ await loadScript(['https://cdn.jsdelivr.net/npm/modern-screenshot@4.4.39/dist/index.js','https://unpkg.com/modern-screenshot@4.4.39/dist/index.js']); }catch(e){} }
      await waitFor(function(){ return !!(window.html2canvas||msResolve()); }, 10000);
      await waitFor(S, 8000);
      var hasMS=!!(window.html2canvas||msResolve());
      if(hasMS){ var fr=(document.fonts&&document.fonts.ready)?document.fonts.ready:Promise.resolve(); fr.then(function(){ setTimeout(function(){ post({ready:1}); }, 400); }); }
      else { post({err:'準備に失敗しました。不足: 画像描画ライブラリ(html2canvas/modern-screenshot)'+(__dcErrs.length?(' / 読込エラー: '+__dcErrs.slice(0,3).join(' | ')):' / 読込エラーなし（ネット接続またはセキュリティ制限の可能性）')}); }
    }catch(e){ post({err:'初期化エラー: '+((e&&e.message)||e)}); }
  }
  init();
})();
`;
function buildDcPngRenderDoc(){
  let doc=buildDcDoc(true);
  // v20-1: buildDcDoc(true) は通常の書き出し用なのでプレビュー時計を含まない。
  // PNGだけは準備待ちの間も停止時刻から進めないよう、デッキ実行前に同じ固定時計を注入する。
  const clock='<script>(function(){try{var n=performance.now.bind(performance),b=n(),ms=0;window.__cdeSetClock=function(sec){ms=Math.max(0,(Number(sec)||0)*1000);};Object.defineProperty(performance,"now",{configurable:true,value:function(){return b+ms;}});}catch(e){}})();<\/script>';
  if(/<head[^>]*>/i.test(doc)) doc=doc.replace(/<head[^>]*>/i,function(m){return m+clock;}); else doc=clock+doc;
  const libs='<script src="https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js"><\/script><script src="https://cdn.jsdelivr.net/npm/modern-screenshot@4.4.39/dist/index.js"><\/script>';
  const inj=libs+'<script>'+DC_PNG_HARNESS+'<\/script>';
  if(/<\/body>/i.test(doc)) doc=doc.replace(/<\/body>/i, inj+"</body>"); else doc+=inj;
  return doc;
}
function updatePngCaptureButton(){
  const btn=$("#expPng");
  if(!btn) return;
  const ready=!!M.dcMode && !!M._audPaused && !M._pngBusy;
  btn.disabled=!ready;
  btn.textContent=M._pngBusy ? "🖼 PNG保存中…" : "⏸ 停止画面をPNG保存";
  btn.title=!M.dcMode
    ? "Claude Design のデッキを開くと使えます。"
    : (!M._audPaused
      ? "プレビューを一時停止すると保存できます。"
      : "現在表示中の停止画面を、ステージの原寸PNGとして保存します。");
}
function pausedPngFileName(t,bounds,w,h){
  let scene=1;
  for(let i=0;i<bounds.length;i++) if(t>=bounds[i]) scene=i+1;
  const total=Math.max(0,Math.round(t*100));
  const min=Math.floor(total/6000);
  const sec=Math.floor((total%6000)/100);
  const cs=total%100;
  const stamp=String(min).padStart(2,"0")+"m"+String(sec).padStart(2,"0")+"s"+String(cs).padStart(2,"0");
  return (baseExportName()||"design")+"_scene-"+String(scene).padStart(2,"0")+"_"+stamp+"_"+w+"x"+h+".png";
}
async function exportDcPng(opt){
  if(!M.dcMode){ log("PNG書き出しは Claude Design のデッキ（.dc.html／自己完結HTML）を開いてから使えます。", true); return; }
  if(!M._audPaused){ log("プレビューを一時停止してから「停止画面をPNG保存」を押してください。", true); updatePngCaptureButton(); return; }
  if(M._pngBusy) return;
  M._pngBusy=true; updatePngCaptureButton();
  const _stg=dcCurStageSize();
  const outW=(opt&&opt.w)||_stg.w, outH=(opt&&opt.h)||_stg.h;
  commitJsx();
  await ensureDcDataUrls();
  _logVideoSlotWarnings("PNG書き出し");
  _logAssetVideoWarnings("PNG書き出し");
  const { bounds, dur }=dcParseBounds();
  let t=(typeof M._audT==="number" && M._audT>0)? M._audT : 0;
  if(dur>0 && t>dur) t=dur;
  log("🖼 停止画面のPNG保存を開始します（"+outW+"×"+outH+"／位置 "+t.toFixed(2)+" 秒）…");
  const ifr=$("#frame");
  const live=ifr&&ifr.contentWindow;
  if(!live){ log("PNG書き出しエラー: プレビューを取得できません。再描画してからもう一度お試しください。",true); M._pngBusy=false; updatePngCaptureButton(); return; }
  await new Promise((resolve)=>{
    let finished=false,lastPhase="";
    function cleanup(){ try{ window.removeEventListener("message", onMsg); }catch(_){} M._pngBusy=false; updatePngCaptureButton(); }
    function onMsg(e){
      const d=e.data; if(e.source!==live||!d||d.__cdeLivePng!==1) return;
      if(d.phase){ lastPhase=String(d.phase); return; }
      if(d.err){ if(!finished){ finished=true; log("PNG書き出しエラー: "+d.err, true); cleanup(); resolve(); } return; }
      if(d.done){ if(!finished){ finished=true; try{ const blob=new Blob([d.buffer],{type:"image/png"}); download(blob, pausedPngFileName(t,bounds,d.w,d.h)); const _r=d.raster==="modern"?"modern-screenshot":"html2canvas"; const _why=(d.reasons&&d.reasons.length)?("／保持: "+d.reasons.join("・")):""; const _blit=d.blitted?("／映像枠補正 "+d.blitted):""; log("✅ 停止中の実プレビューをそのままPNG保存しました（シーン "+pausedPngFileName(t,bounds,d.w,d.h).match(/scene-(\d+)/)[1]+"／"+d.w+"×"+d.h+"／位置 "+t.toFixed(2)+" 秒／動画 "+(d.videos||0)+" 本／描画 "+_r+_why+_blit+"）。"); }catch(err){ log("PNG保存エラー: "+err.message, true); } cleanup(); resolve(); } return; }
    }
    window.addEventListener("message", onMsg);
    try{ live.postMessage({__cdeLivePngCmd:1,cmd:"capture",cfg:{time:t,outW,outH,width:_stg.w,height:_stg.h}},"*"); }
    catch(err){ finished=true; log("PNG開始エラー: "+err.message,true); cleanup(); resolve(); return; }
    setTimeout(()=>{ if(!finished){ finished=true; log("PNG書き出しがタイムアウトしました"+(lastPhase?"（停止箇所: "+lastPhase+"）":"")+"。ページを再読み込みしてからもう一度お試しください。", true); cleanup(); resolve(); } }, 45*1000);
  });
}

// ============================================================
// Wire up UI
// ============================================================
document.querySelectorAll(".tabs button").forEach(b=>b.onclick=()=>{
  document.querySelectorAll(".tabs button").forEach(x=>x.classList.remove("active"));
  document.querySelectorAll(".pane").forEach(x=>x.classList.remove("active"));
  b.classList.add("active"); $("#"+b.dataset.pane).classList.add("active");
  if(b.dataset.pane==="textPane") renderTextEditor();
  if(b.dataset.pane==="imgPane") renderImgSlots();
  if(b.dataset.pane==="commentPane") renderComments();
});
$("#code").addEventListener("input", ()=>{ commitJsx(); scheduleRebuild(); });
$("#sceneSel").addEventListener("change", e=>selectScene(+e.target.value));
$("#reload").onclick=()=>{ commitJsx(); buildPreview(); };
$("#expZip").onclick=()=>exportZip().catch(e=>log("ZIP書き出しエラー: "+e.message,true));
$("#expHtml").onclick=()=>exportHtml().catch(e=>log("HTML書き出しエラー: "+e.message,true));
$("#expRemotion").onclick=()=>exportRemotionZip().catch(e=>log("ZIP書き出しエラー: "+e.message,true));
$("#expPng").onclick=()=>{ const _s=dcCurStageSize(); exportDcPng({w:_s.w,h:_s.h}).catch(err=>{ M._pngBusy=false; updatePngCaptureButton(); log("PNG書き出しエラー: "+((err&&err.message)||err),true); }); };
$("#previewFitMode").addEventListener("change",e=>setPreviewFitMode(e.target.value));
$("#file").addEventListener("change", e=>{ const f=e.target.files[0]; if(f) loadFile(f).catch(err=>log("読み込みエラー: "+err.message,true)); });
// drag & drop
const fw=$("#frameWrap");
["dragover","dragenter"].forEach(ev=>document.addEventListener(ev,e=>{e.preventDefault();}));
document.addEventListener("drop", e=>{ e.preventDefault(); const t=e.target; if(t&&t.closest&&t.closest(".asset,.attach,.idrop,#cmDialog,#sceneComment,#imgList,#assets")) return; const f=e.dataTransfer.files[0]; if(f) loadFile(f).catch(err=>log("読み込みエラー: "+err.message,true)); });
