// Project lifecycle, history, local recovery, and export review.
function createProjectModel(){
  return {source:null,files:new Map(),blobUrl:new Map(),moduleBlobUrl:new Map(),scenes:[],scene:null,
    supportPath:null,jsxPath:null,dcMode:false,plainDeck:false,dcSource:null,dcPath:null,imgSlotPath:null,
    dcAudio:null,dcBgm:null,bgmVol:0.25,bgmFade:true,audioOwned:{},audioSelectionExplicit:false,
    imgAssign:{},imgTouched:{},assetVin:{},comments:[],previewFitMode:"contain",
    baseSourceName:null,baseFingerprint:null,baseFiles:{},projectId:crypto.randomUUID(),_audT:0,_audPaused:true};
}
const WORKSPACE={loading:false,exporting:false,history:[],cursor:-1,timer:null,saveTimer:null,revision:0,savedRevision:0,preflightId:0,db:null,writing:Promise.resolve(),ready:false};
function releaseProject(model){
  for(const map of [model.blobUrl,model.moduleBlobUrl]) if(map) for(const url of map.values()) URL.revokeObjectURL(url);
  for(const a of Object.values(model.imgAssign||{})) if(a.url) URL.revokeObjectURL(a.url);
  for(const c of model.comments||[]) for(const a of c.atts||[]) if(a.url) URL.revokeObjectURL(a.url);
}
function snapshotProject(){
  const s={...M,files:new Map(M.files),scenes:structuredClone(M.scenes),baseFiles:structuredClone(M.baseFiles),
    imgTouched:{...M.imgTouched},assetVin:structuredClone(M.assetVin),audioOwned:{...M.audioOwned},
    dcAudio:M.dcAudio?{...M.dcAudio}:null,dcBgm:M.dcBgm?{...M.dcBgm}:null,
    imgAssign:{},comments:[],code:currentJsxText(),videoId:$("#vidId").value};
  delete s.blobUrl; delete s.moduleBlobUrl; delete s._pngBusy; delete s._seekAfterRebuild;
  for(const [id,a] of Object.entries(M.imgAssign||{})){ s.imgAssign[id]={...a}; delete s.imgAssign[id].url; delete s.imgAssign[id]._zipUrl; delete s.imgAssign[id]._zipPath; }
  s.comments=(M.comments||[]).map(c=>({...c,rectN:c.rectN?{...c.rectN}:null,pts:c.pts?structuredClone(c.pts):null,
    atts:(c.atts||[]).map(a=>{const copy={...a};delete copy.url;return copy;})}));
  return s;
}
const _historyIds=new WeakMap();let _historySeq=0;
function historyId(v){if(!v||typeof v!=="object")return v;if(!_historyIds.has(v))_historyIds.set(v,++_historySeq);return _historyIds.get(v);}
function snapshotSignature(s){
  return JSON.stringify({code:s.code,files:[...s.files].map(([p,f])=>[p,historyId(f.bytes)]),audio:s.dcAudio,bgm:s.dcBgm,
    vol:s.bgmVol,fade:s.bgmFade,explicit:s.audioSelectionExplicit,vin:Object.entries(s.assetVin).map(([p,a])=>[p,a.vin]),touched:s.imgTouched,
    slots:Object.entries(s.imgAssign).map(([id,a])=>[id,a.name,a.fit,a.vin,a.assetPath,historyId(a.file)]),
    comments:s.comments.map(c=>({...c,atts:c.atts.map(a=>({...a,file:historyId(a.file)}))})),videoId:s.videoId});
}
function projectChanged(){
  if(!WORKSPACE.ready||WORKSPACE.loading||WORKSPACE.exporting||M.scene==null)return;
  clearTimeout(WORKSPACE.timer); WORKSPACE.timer=setTimeout(checkpointProject,250);
}
function checkpointProject(){
  clearTimeout(WORKSPACE.timer);WORKSPACE.timer=null;
  if(WORKSPACE.loading||M.scene==null)return;
  commitJsx();const s=snapshotProject(),sig=snapshotSignature(s),h=WORKSPACE.history;
  if(h[WORKSPACE.cursor]?.signature===sig)return;
  h.splice(WORKSPACE.cursor+1);h.push({state:s,signature:sig});if(h.length>40)h.shift();
  WORKSPACE.cursor=h.length-1;WORKSPACE.revision++;updateHistoryButtons();
  setWorkspaceStatus("変更を保存中…");
  clearTimeout(WORKSPACE.saveTimer);WORKSPACE.saveTimer=setTimeout(()=>saveDraft().catch(reportDraftError),1200);
}
function setWorkspaceStatus(text,error){const el=$("#projectSaveState");if(el){el.textContent=text;el.classList.toggle("err",!!error);}}
function reportDraftError(e){setWorkspaceStatus("自動保存できません。作品ZIPを保存してください。",true);log("自動保存: "+(e.message||e),true);}
function updateHistoryButtons(){if(!$("#projectUndo"))return;$("#projectUndo").disabled=WORKSPACE.cursor<=0;$("#projectRedo").disabled=WORKSPACE.cursor>=WORKSPACE.history.length-1;}
function resetProjectUi(){
  _textState=null;cmMode=null;_audSeeking=false;_cmSeq=Math.max(0,...M.comments.map(c=>+c.id||0));
  _attSeq=Math.max(0,...M.comments.flatMap(c=>(c.atts||[]).map(a=>parseInt(a.expName,10)||0)));
  $("#audName").textContent=M.dcAudio?"🎵 "+M.dcAudio.name:"";
  $("#bgmVol").value=String(Math.round(M.bgmVol*100));$("#bgmFade").checked=!!M.bgmFade;
  $("#audRate").value="1";$("#audSeek").value=String(M._audT||0);$("#audSeek").max="0";$("#audTime").textContent="0:00 / 0:00";
  $("#previewFitMode").value=M.previewFitMode||"contain";$("#vidId").value="";
  if(window._bgmUi)window._bgmUi();if(window.__cdeResetComments)window.__cdeResetComments();
  for(const id of ["cmDialog","exportModal","preflightModal"])if($("#"+id))$("#"+id).style.display="none";
  renderComments();applyCmMode();
}
function activateSnapshot(s){
  const previous=M;M={...s,files:new Map(s.files),scenes:structuredClone(s.scenes),baseFiles:structuredClone(s.baseFiles),
    imgAssign:{},imgTouched:{...s.imgTouched},assetVin:structuredClone(s.assetVin),audioOwned:{...s.audioOwned},
    blobUrl:new Map(),moduleBlobUrl:new Map(),scene:null,_audPaused:true,_pngBusy:false};
  for(const [id,a] of Object.entries(s.imgAssign||{}))M.imgAssign[id]={...a,url:a.file?URL.createObjectURL(a.file):(a.dataUrl||"")};
  M.comments=s.comments.map(c=>({...c,rectN:c.rectN?{...c.rectN}:null,pts:c.pts?structuredClone(c.pts):null,
    atts:(c.atts||[]).map(a=>({...a,url:URL.createObjectURL(a.file)}))}));
  // Navigate once: replacing srcdoc twice can leave the first module graph loading revoked URLs.
  if(M.dcMode)M.dcSource=s.code;
  else if(M.jsxPath)M.files.set(M.jsxPath,{bytes:enc.encode(s.code),mime:"text/jsx"});
  resetProjectUi();$("#vidId").value=s.videoId||"";M._audT=s._audT||0;M._seekAfterRebuild={t:M._audT};
  finishLoad(M.baseSourceName||"復元した作品",s.scene||0);
  renderTextEditor();releaseProject(previous);
}
function travelHistory(delta){
  if(WORKSPACE.loading||WORKSPACE.exporting)return;checkpointProject();const next=WORKSPACE.cursor+delta;
  if(next<0||next>=WORKSPACE.history.length)return;clearTimeout(rebuildTimer);
  WORKSPACE.loading=true;try{activateSnapshot(WORKSPACE.history[next].state);WORKSPACE.cursor=next;}finally{WORKSPACE.loading=false;}
  WORKSPACE.revision++;updateHistoryButtons();setWorkspaceStatus("変更を保存中…");clearTimeout(WORKSPACE.saveTimer);WORKSPACE.saveTimer=setTimeout(()=>saveDraft().catch(reportDraftError),700);
}
function initializeProjectHistory(){
  clearTimeout(WORKSPACE.timer);clearTimeout(WORKSPACE.saveTimer);WORKSPACE.timer=null;
  const s=snapshotProject();WORKSPACE.history=[{state:s,signature:snapshotSignature(s)}];WORKSPACE.cursor=0;
  WORKSPACE.revision=0;WORKSPACE.savedRevision=0;WORKSPACE.backupRevision=null;updateHistoryButtons();setWorkspaceStatus("作品を読み込みました");
}
async function openDraftDb(){
  if(WORKSPACE.db)return WORKSPACE.db;
  WORKSPACE.db=await new Promise((resolve,reject)=>{const req=indexedDB.open("cde2-projects-v1",1);
    req.onupgradeneeded=()=>req.result.createObjectStore("drafts",{keyPath:"id"});
    req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);req.onblocked=()=>reject(new Error("保存領域を別のタブが使用中です"));});
  WORKSPACE.db.onversionchange=()=>{WORKSPACE.db.close();WORKSPACE.db=null;};return WORKSPACE.db;
}
async function draftTransaction(mode,fn){const db=await openDraftDb();return new Promise((resolve,reject)=>{const tx=db.transaction("drafts",mode);let result;const req=fn(tx.objectStore("drafts"));if(req)req.onsuccess=()=>{result=req.result;};tx.oncomplete=()=>resolve(result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error("保存を中断しました"));});}
function saveDraft(){
  clearTimeout(WORKSPACE.saveTimer);if(M.scene==null)return Promise.resolve();
  if(!WORKSPACE.loading)checkpointProject();clearTimeout(WORKSPACE.saveTimer);
  const state=snapshotProject(),revision=WORKSPACE.revision,id=M.projectId;
  const run=async()=>{await draftTransaction("readwrite",store=>store.put({id,name:state.baseSourceName||"作品",updatedAt:Date.now(),schema:1,state}));
    if(M.projectId===id&&WORKSPACE.revision===revision){WORKSPACE.savedRevision=revision;setWorkspaceStatus("自動保存済み "+new Date().toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"}));}};
  const pending=WORKSPACE.writing.catch(()=>{}).then(run);WORKSPACE.writing=pending;return pending;
}
async function showDrafts(){
  try{if(M.scene!=null)await saveDraft();const rows=await draftTransaction("readonly",store=>store.getAll());
    const modal=$("#draftModal"),list=$("#draftList");list.replaceChildren();
    for(const row of rows.sort((a,b)=>b.updatedAt-a.updatedAt)){const item=document.createElement("div"),b=document.createElement("button"),del=document.createElement("button");
      b.textContent=row.name+" — "+new Date(row.updatedAt).toLocaleString();b.onclick=async()=>{if(M.scene!=null)await saveDraft();WORKSPACE.loading=true;try{activateSnapshot(row.state);}finally{WORKSPACE.loading=false;}initializeProjectHistory();modal.style.display="none";setWorkspaceStatus("保存した作品を復元しました");};
      del.textContent="削除";del.onclick=async()=>{await draftTransaction("readwrite",store=>store.delete(row.id));item.remove();};item.append(b,del);list.append(item);}
    if(!rows.length)list.textContent="保存した作品はまだありません。";
    const estimate=await navigator.storage?.estimate?.().catch(()=>null);$("#draftNote").textContent="このブラウザに保存しています。別のブラウザや端末へ渡す場合は作品ZIPを保存してください。"+(estimate?.quota?" 使用量 "+Math.round(estimate.usage/1048576)+" MB / "+Math.round(estimate.quota/1048576)+" MB":"");
    modal.style.display="flex";
  }catch(e){reportDraftError(e);}
}
async function mediaDuration(dataUrl){
  if(!dataUrl)return null;return new Promise(resolve=>{const a=new Audio();let finished=false;const done=v=>{if(finished)return;finished=true;clearTimeout(timer);a.removeAttribute("src");a.load();resolve(v);};const timer=setTimeout(()=>done(null),4000);a.onloadedmetadata=()=>done(Number.isFinite(a.duration)?a.duration:null);a.onerror=()=>done(null);a.preload="metadata";a.src=dataUrl;});
}
function projectMissingRefs(){
  const missing=new Set(),external=new Set();
  // Preserve quoted URLs while ignoring documentation examples inside comments.
  const uncomment=src=>src.replace(/"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|`(?:\\[\s\S]|[^`\\])*`|\/\*[\s\S]*?\*\/|\/\/[^\r\n]*/g,t=>t.startsWith("/*")||t.startsWith("//")?" ":t);
  const inspect=(text,base)=>{text=text.replace(/<!--[\s\S]*?-->/g,"");text=/\.(?:m?js|jsx|tsx|css)$/i.test(base)?uncomment(text):text.replace(/(<script\b[^>]*>)([\s\S]*?)(<\/script>)/ig,(_,a,b,c)=>a+uncomment(b)+c);const refs=[];for(const rx of [/\b(?:src|href|poster)\s*=\s*["']([^"']+)["']/ig,/url\(\s*["']?([^\s"')]+)["']?\s*\)/ig,/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*|new\s+URL\(\s*)["']([^"']+)["']/g]){let m;while((m=rx.exec(text)))refs.push(m[1]);}
    for(const ref of refs){if(/^(?:https?:)?\/\//.test(ref)){external.add(ref);continue;}if(/^(?:data:|blob:|#|mailto:|javascript:)/i.test(ref)||/[{}$]/.test(ref)||!ref.includes("."))continue;
      if(!_cdeFindFile(base,ref))missing.add(base+" → "+ref);}};
  inspect(currentJsxText(),M.dcPath||M.jsxPath||"");
  for(const [p,f] of M.files)if(/\.(?:css|m?js|jsx|tsx)$/i.test(p)&&!/(?:support|image-slot)\.js$/i.test(p))inspect(dec.decode(f.bytes),p);
  return {missing:[...missing],external:[...external]};
}
async function inspectProject(){
  const model=M,voice=M.dcAudio,bgm=M.dcBgm;
  const [voiceDuration,bgmDuration]=await Promise.all([mediaDuration(voice?.dataUrl),mediaDuration(bgm?.dataUrl)]);
  if(M!==model)throw new Error("作品が切り替わりました。もう一度確認してください。");
  const timing=dcParseBounds(),refs=projectMissingRefs();let renderState=null;
  try{renderState=$("#frame").contentWindow.__RENDERER2_STATUS__||null;}catch(_){}
  const warnings=refs.missing.map(p=>"不足している素材: "+p);
  if(voice&&voiceDuration===null)warnings.push("ナレーションの長さを確認できません。");
  if(voiceDuration!==null&&Math.abs(timing.dur-voiceDuration)>0.15)warnings.push("映像とナレーションの長さが "+Math.abs(timing.dur-voiceDuration).toFixed(2)+" 秒違います。");
  if(bgm&&bgmDuration===null)warnings.push("BGMを読み込めません。");
  if(renderState&&renderState.state!=="ready")warnings.push("3Dは準備中、または描画エラーです。準備完了後に確認し直してください。");
  return {deck:M.dcPath||M.jsxPath,duration:timing.dur,voice:voice?.name||null,voicePath:voice?.path||null,voiceDuration,bgm:bgm?.name||null,bgmDuration,
    bgmVolume:M.bgmVol,bgmFade:M.bgmFade,renderState,warnings,...refs};
}
async function requestExport(label,action){
  try{checkpointProject();const ticket=++WORKSPACE.preflightId,project=M,modal=$("#preflightModal"),body=$("#preflightBody"),go=$("#preflightGo");modal.style.display="flex";body.textContent="内容を確認しています…";go.disabled=true;
    const report=await inspectProject();if(M!==project||ticket!==WORKSPACE.preflightId)return;body.replaceChildren();$("#preflightTitle").textContent=label+"の前に確認";
    const summary=document.createElement("p");summary.textContent="映像 "+report.duration.toFixed(2)+"秒 ／ ナレーション: "+(report.voice||"なし")+(report.voiceDuration!==null?"（"+report.voiceDuration.toFixed(2)+"秒）":"")+" ／ BGM: "+(report.bgm||"なし")+(report.bgm?"（音量 "+Math.round(M.bgmVol*100)+"%、終端フェード"+(M.bgmFade?"あり":"なし")+"）":"");body.append(summary);
    const candidates=[...M.files.keys()].filter(p=>/\.(?:wav|mp3|m4a|ogg|aac|flac)$/i.test(p)&&!/(?:_mix\.|render-mix\.)/i.test(p));
    const select=document.createElement("select");select.id="projectVoiceSelect";select.setAttribute("aria-label","使用するナレーション");
    select.add(new Option("現在のナレーションを使用", "current"));select.add(new Option("ナレーションなし", "none"));for(const p of candidates)select.add(new Option(p,p));
    select.onchange=()=>{if(select.value==="current")return;if(select.value==="none")M.dcAudio=null;else {const f=M.files.get(select.value);M.dcAudio={name:baseName(select.value),path:select.value,mime:f.mime,dataUrl:"data:"+f.mime+";base64,"+u8ToB64(f.bytes)};}M.audioSelectionExplicit=true;$("#audName").textContent=M.dcAudio?"🎵 "+M.dcAudio.name:"";projectChanged();buildPreview();requestExport(label,action);};body.append(select);
    for(const warning of report.warnings){const p=document.createElement("p");p.className="err";p.textContent=warning;body.append(p);}
    if(!report.warnings.length){const ok=document.createElement("p");ok.textContent="不足素材と尺の不一致は見つかりませんでした。";body.append(ok);}
    const details=document.createElement("details"),title=document.createElement("summary"),pre=document.createElement("pre");title.textContent="確認した内容の詳細";pre.textContent=JSON.stringify(report,null,2);details.append(title,pre);body.append(details);
    go.disabled=!!(report.renderState&&report.renderState.state!=="ready");$("#preflightRefresh").onclick=()=>requestExport(label,action);
    go.onclick=async()=>{if(M!==project)return;modal.style.display="none";WORKSPACE.exporting=true;document.body.inert=true;try{await action();await saveDraft().catch(reportDraftError);}catch(e){log(label+"に失敗: "+(e.message||e),true);}finally{document.body.inert=false;WORKSPACE.exporting=false;}};
  }catch(e){log("出力前の確認: "+(e.message||e),true);}
}
async function exportProjectZip(){
  checkpointProject();const project=M,revision=WORKSPACE.revision;
  const snap=await buildProjectSnapshot("project"),zip=new JSZip();for(const [p,f] of snap.files)if(p!==snap.instructionPath)zip.file(p,f.bytes);
  download(await zip.generateAsync({type:"blob",compression:"DEFLATE"}),snap.base+"_作品.zip");log("作品ZIPを保存しました。コメントと音声の編集状態も含まれます。");
  if(M===project&&WORKSPACE.revision===revision)WORKSPACE.backupRevision=revision;
}
function installWorkspace(){
  const style=document.createElement("style");style.textContent=".project-bar{display:flex;align-items:center;gap:6px;padding:5px 12px;background:var(--panel);border-bottom:1px solid var(--line);flex-wrap:wrap}.project-bar span{margin-left:auto;color:var(--mut);font-size:11px}.project-modal{display:none;position:fixed;inset:0;background:#000b;z-index:10000;align-items:center;justify-content:center}.project-box{width:min(820px,94vw);max-height:85vh;overflow:auto;padding:22px;background:var(--panel);border:1px solid var(--line);border-radius:12px}.project-box p{margin:12px 0}.project-box select{max-width:100%}.project-box pre{white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px}.project-box .row{display:flex;gap:8px;margin-top:16px}.project-box h2{font-size:17px}.project-box .err,.project-bar .err{color:var(--err)}#draftList>div{display:flex;gap:8px;margin:10px 0}";document.head.append(style);
  const bar=document.createElement("div");bar.className="project-bar";bar.innerHTML='<button id="projectUndo" disabled>↶ 元に戻す</button><button id="projectRedo" disabled>↷ やり直す</button><button id="projectSave">作品ZIPを保存</button><button id="projectDrafts">保存した作品を復元</button><span id="projectSaveState">自動保存はこのブラウザ内に保存します</span>';document.querySelector("header").after(bar);
  const drafts=document.createElement("div");drafts.id="draftModal";drafts.className="project-modal";drafts.innerHTML='<div class="project-box"><h2>保存した作品を復元</h2><p id="draftNote"></p><div id="draftList"></div><div class="row"><button id="draftClose">閉じる</button></div></div>';document.body.append(drafts);
  const preflight=document.createElement("div");preflight.id="preflightModal";preflight.className="project-modal";preflight.innerHTML='<div class="project-box"><h2 id="preflightTitle">書き出し前の確認</h2><div id="preflightBody"></div><div class="row"><button id="preflightGo" class="primary">書き出す</button><button id="preflightRefresh">確認し直す</button><button id="preflightClose">戻る</button></div></div>';document.body.append(preflight);
  $("#projectUndo").onclick=()=>travelHistory(-1);$("#projectRedo").onclick=()=>travelHistory(1);$("#projectDrafts").onclick=showDrafts;$("#draftClose").onclick=()=>drafts.style.display="none";$("#preflightClose").onclick=()=>preflight.style.display="none";
  $("#projectSave").onclick=()=>{if(M.scene!=null)requestExport("作品ZIP",exportProjectZip);};
  const exports=[["expZip","RENDERER2用ZIP",exportZip],["expHtml","単体HTML",exportHtml],["expRemotion","旧RENDERER用ZIP",exportRemotionZip],["expZipDelta","AI用差分ZIP",exportDeltaBundle],["expZipFull","AI用完全版ZIP",exportFullSplitBundles]];
  for(const [id,label,fn] of exports)$("#"+id).onclick=()=>requestExport(label,fn);
  for(const event of ["input","change","click","drop"])document.addEventListener(event,e=>{if(e.target.closest?.("#draftModal,#preflightModal,.project-bar"))return;projectChanged();});
  document.addEventListener("keydown",e=>{if((e.ctrlKey||e.metaKey)&&!e.altKey&&/^[zy]$/i.test(e.key)&&M.scene!=null){e.preventDefault();travelHistory(e.key.toLowerCase()==="y"||e.shiftKey?1:-1);}});
  window.addEventListener("beforeunload",e=>{checkpointProject();if(WORKSPACE.revision!==WORKSPACE.savedRevision){e.preventDefault();e.returnValue="";}});
  document.addEventListener("visibilitychange",()=>{if(document.hidden&&M.scene!=null&&!WORKSPACE.loading)saveDraft().catch(reportDraftError);});
  WORKSPACE.ready=true;draftTransaction("readonly",store=>store.getAll()).then(rows=>{if(M.scene==null&&rows.length)setWorkspaceStatus("復元できる作品が "+rows.length+" 件あります。『保存した作品を復元』から開けます。");}).catch(reportDraftError);
}
