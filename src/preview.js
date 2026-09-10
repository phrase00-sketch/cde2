function isNativeDc(t){ t=t||"";
  if(!/<x-dc[\s>]/i.test(t)) return false;
  // v3.1: 自走型CSSデッキ（<x-dc data-render-mode="css"> ＋ 自前タイムラインscript、data-dc-script / image-slot 部品なし）は
  //       Reactランタイム(support.js)では sc-if が value 属性を持たないため全シーンが非表示（真っ黒）になる。
  //       ネイティブ扱いにせず、自己完結型 CSS/HTML デッキ（plainDeck）として開く。
  var selfDriven = /<x-dc\b[^>]*\bdata-render-mode\s*=\s*["']css["']/i.test(t)
    && !/data-dc-script/i.test(t)
    && !/<image-slot[\s>]/i.test(t)
    && !/component-from-global-scope\s*=\s*["']image-slot/i.test(t)
    && (/\bBOUNDS\s*=\s*\[/.test(t) || /document\.getAnimations/i.test(t));
  if(selfDriven) return false;
  return (/<sc-if/i.test(t) || /data-dc-script/i.test(t) || /component-from-global-scope\s*=\s*["']image-slot/i.test(t) || /<image-slot[\s>]/i.test(t)); }
// 旧Claude Designの「素のHTML/CSSデッキ」判定：React/support.jsを使わず自己描画するタイムライン付きHTML。
function isPlainDeck(t){ t=t||""; if(isNativeDc(t)) return false; if(/__bundler\/(manifest|template)/.test(t)) return false; if(!/<html[\s>]|<body[\s>]/i.test(t)) return false; return /\bBOUNDS\s*=\s*\[/.test(t) || /class\s*=\s*["'][^"']*\bstage\b/.test(t) || /@keyframes\b/.test(t); }
function _slotZipAsset(ref){
  ref=String(ref||"").trim(); if(!ref||/^(?:data:|blob:|https?:|\/\/)/i.test(ref)) return null;
  ref=ref.split("#")[0].split("?")[0].replace(/\\/g,"/").replace(/^\.\//,"");
  try{ ref=decodeURIComponent(ref); }catch(_){}
  function norm(p){ var out=[]; String(p||"").split("/").forEach(function(x){ if(!x||x===".")return; if(x===".."){out.pop();return;} out.push(x); }); return out.join("/"); }
  var base=(M.dcPath&&M.dcPath!=="(bundle)"&&M.dcPath.indexOf("/")>=0)?M.dcPath.replace(/[^\/]*$/,""):"";
  var cand=[norm(base+ref),norm(ref)], hit=null;
  for(var i=0;i<cand.length&&!hit;i++){ if(M.files.has(cand[i])) hit=cand[i]; }
  if(!hit){ var low=cand.map(function(x){return x.toLowerCase();}); for(const p of M.files.keys()){ if(low.indexOf(String(p).toLowerCase())>=0){hit=p;break;} } }
  return hit?{path:hit,file:M.files.get(hit)}:null;
}
function _findSidecar(name){
  name=String(name||""); if(!name) return null;
  if(M.files.has(name)) return name;
  var base=(M.dcPath&&M.dcPath!=="(bundle)"&&M.dcPath.indexOf("/")>=0)?M.dcPath.replace(/[^\/]*$/,""):"";
  if(base&&M.files.has(base+name)) return base+name;
  var re=new RegExp("(^|/)"+name.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")+"$","i"), found=[];
  for(const p of M.files.keys()){ if(re.test(p)) found.push(p); }
  found.sort(function(a,b){ var da=(a.match(/\//g)||[]).length,db=(b.match(/\//g)||[]).length; return da-db||a.length-b.length||a.localeCompare(b); });
  return found[0]||null;
}
function _restoreDcImgAssignments(srcText){
  function _put(id, src, vin){
    if(!id || M.imgAssign[id] || !src) return false;
    var durl=null, blob=null, mime="", name=id, url="", za=null;
    if(/^data:(image|video)\//i.test(src)){
      durl=src; var c=durl.indexOf(","); mime=(durl.slice(5,c).split(";")[0])||"image/png";
      try{ var bin=atob(durl.slice(c+1)); var u8=new Uint8Array(bin.length); for(var i=0;i<bin.length;i++)u8[i]=bin.charCodeAt(i); blob=new Blob([u8],{type:mime}); }catch(e){}
      url=durl;
    }else{
      za=_slotZipAsset(src); if(!za||!za.file) return false;
      mime=za.file.mime||mimeOf(za.path); name=baseName(za.path)||id;
      try{ blob=new Blob([za.file.bytes],{type:mime}); url=URL.createObjectURL(blob); }catch(e){ return false; }
    }
    var kind=(/^video\//i.test(mime)||/\.(?:mp4|webm|mov|m4v)$/i.test((za&&za.path)||src))?"video":"image";
    var ext=((mime.split("/")[1]||(kind==="video"?"mp4":"png")).toLowerCase().replace("jpeg","jpg").replace("svg+xml","svg"));
    if(durl) name=id+"."+ext;
    M.imgAssign[id]={name:name, kind:kind, file:blob, url:url, dataUrl:durl, assetPath:(za&&za.path)||null, fit:"cover", expName:_safeFn(id)+"__"+_safeFn(name||("restored."+ext))};
    if(kind==="video"){ M.imgAssign[id].vin=_vinRound(vin); M.imgAssign[id].duration=null; }
    return true;
  }
  function _link(id,ref){ var a=M.imgAssign[id]; if(!a||a.kind!=="video"||!ref)return; var za=_slotZipAsset(ref); if(za&&_isVideoAsset(za.path))a.assetPath=za.path; else if(M.files.has(ref)&&_isVideoAsset(ref))a.assetPath=ref; }
  var n=0;
  try{ var k=_findSidecar(".image-slots.state.json");
    if(k){ var st=JSON.parse(dec.decode(M.files.get(k).bytes)); for(const id in st){ var sv=st[id]; if(_put(id, sv&&sv.u, sv&&sv.vin)) n++; } } }catch(e){}
  try{ var re=/<(?:x-import|image-slot)\b[^>]*\bid\s*=\s*["']([^"']+)["'][^>]*>/ig, m; while((m=re.exec(srcText))){ var sm=/\bsrc\s*=\s*["']([^"']+)["']/i.exec(m[0]); var vm=/\bdata-vin\s*=\s*["']([^"']+)["']/i.exec(m[0]); if(sm){ if(_put(m[1],sm[1],vm&&vm[1]))n++; _link(m[1],sm[1]); } } }catch(e){}
  try{ var rv=/<[a-zA-Z][a-zA-Z0-9-]*\b[^>]*\bdata-(?:slot|img-slot)\s*=\s*["']([^"']+)["'][^>]*>\s*<video\b([^>]*)>/ig, mv; while((mv=rv.exec(srcText))){ var smv=/\bsrc\s*=\s*["'](data:video\/[^"']+)["']/i.exec(mv[2]); var vmv=/\bdata-vin\s*=\s*["']([^"']+)["']/i.exec(mv[2]); if(smv&&_put(mv[1],smv[1],vmv&&vmv[1]))n++; var amv=/\bdata-cde-asset-path\s*=\s*["']([^"']+)["']/i.exec(mv[2]); if(amv)_link(mv[1],amv[1]); } }catch(e){}
  try{ var rt=/<video\b([^>]*)>/ig, mt; while((mt=rt.exec(srcText))){ var im=/\bdata-cde-slot-id\s*=\s*["']([^"']+)["']/i.exec(mt[1]), am=/\bdata-cde-asset-path\s*=\s*["']([^"']+)["']/i.exec(mt[1]); if(im&&am)_link(im[1],am[1]); } }catch(e){}
  if(n) setTimeout(function(){ try{ log("割り当て済み画像・動画 "+n+" 件を復元しました。"); }catch(e){} }, 0);
  return n;
}
function enterPlainDeck(srcText, path){
  M.dcMode=true; M.plainDeck=true; M.dcSource=srcText; M.dcPath=path; M.supportPath=null; M.imgSlotPath=null;
  let label=""; try{ var _tm=/<title[^>]*>([^<]*)<\/title>/i.exec(srcText); if(_tm) label=(_tm[1]||"").trim(); }catch(_){}
  if(!label) label=((baseName(path)||"CSS deck").replace(/\.(dc\.)?html?$/i,""))||"CSS deck";
  M.scenes=[{label:label, dcMode:true}];
  _restoreDcImgAssignments(srcText);
  _restoreAssetVideoVins(srcText);
  var _dm=srcText.match(/\bduration\s*[:=]\s*([0-9.]+)/); var _dur=_dm?_dm[1]:"?";
  log("旧Claude Designの自己完結型 CSS/HTML デッキを検出（support.js不要・<x-dc>なし／尺 "+_dur+" 秒）。プレビュー・テキスト編集・RENDERER2用ZIP書き出しに対応します。");
  restoreProjectMetadata();
  _autoDetectZipAudio();
}
function enterDcMode(srcText, path){
  M.dcMode=true; M.dcSource=srcText; M.dcPath=path;
  M.imgSlotPath=null;
  for(const p of M.files.keys()){ if(/image-slot\.js$/i.test(p)){ M.imgSlotPath=p; break; } }
  if(!M.imgSlotPath){ for(const [p,f] of M.files){ if(/\.js$/i.test(p) && p!==M.supportPath){ try{ if(/customElements\.define\(\s*["']image-slot["']/.test(dec.decode(f.bytes))){ M.imgSlotPath=p; break; } }catch(_){} } } }
  if(!M.supportPath){ for(const [p,f] of M.files){ if(/\.js$/i.test(p)){ try{ if(/GENERATED from dc-runtime|dc-runtime/.test(dec.decode(f.bytes.subarray(0,400)))){ M.supportPath=p; break; } }catch(_){} } } }
  ensureDcRuntime();
  const label=((baseName(path)||"Claude Design").replace(/\.dc\.html$/i,""))||"Claude Design";
  M.scenes=[{label:label, dcMode:true}];
  // 書き出したデッキZIPを再読込したとき、保存済みの割り当て画像を復元する
  // (1) .image-slots.state.json （2) .dc.html に埋め込まれた src="data:..." の両方から（堅牢化）
  _restoreDcImgAssignments(srcText);
  _restoreAssetVideoVins(srcText);
  restoreProjectMetadata();
  // v7: マニフェストが無い納品ZIP（Claude Design出力など）でも同梱音声を自動検出して挿入
  _autoDetectZipAudio();
  const nScenes=(detectScenes(srcText)||[]).length;
  const nScIf=(srcText.match(/<sc-if\b/ig)||[]).length;
  log("ネイティブ Claude Design 形式を検出（インライン <x-dc>、シーン"+nScenes+(nScIf>nScenes?("（字幕・オーバーレイの <sc-if> "+(nScIf-nScenes)+" は除外）"):"")+"、画像／動画スロット"+discoverDcSlots().length+"個）。"+(M._rtInjected?"［CDE内蔵ランタイムを注入］ ":"")+"support.js="+(M.supportPath||"(なし)")+" / image-slot.js="+(M.imgSlotPath||"(なし)"));
}
function discoverDcSlots(){
  const src=currentJsxText()||""; const out=[]; const seen={};
  const re=/<(x-import|image-slot)\b[^>]*>/ig; let m;
  while((m=re.exec(src))){
    const tag=m[0];
    if(/^<x-import/i.test(tag) && !/image-slot/i.test(tag)) continue;
    const idm=/\bid\s*=\s*["']([^"']+)["']/i.exec(tag); if(!idm) continue; const id=idm[1]; if(seen[id]) continue; seen[id]=1;
    const lm=/\bplaceholder\s*=\s*["']([^"']*)["']/i.exec(tag); const lab=(lm&&lm[1])||id;
    const fm=/\bfit\s*=\s*["']([^"']*)["']/i.exec(tag); const fit=(fm&&fm[1])||"cover";
    out.push({id:id, label:lab, fit:fit, pos:m.index});
  }
  // v3.1: data-img-slot マーカー（自走型CSSデッキ / JSX 共通）も検出する
  const re2=/data-img-slot\s*=\s*["']?([\w\-]+)/g; let m2;
  while((m2=re2.exec(src))){
    const id2=m2[1]; if(!id2||seen[id2]) continue; seen[id2]=1;
    let ts=src.lastIndexOf("<", m2.index); if(ts<0) ts=m2.index;
    let te=src.indexOf(">", m2.index); if(te<0) te=Math.min(src.length, m2.index+400);
    const tag2=src.slice(ts,te);
    const lm2=/data-slot-label\s*=\s*["']([^"']+)/.exec(tag2); const lab2=(lm2&&lm2[1].trim())||id2;
    const fm2=/data-fit\s*=\s*["']([\w\-]+)/.exec(tag2); const fit2=(fm2&&fm2[1])||"cover";
    out.push({id:id2, label:lab2, fit:fit2, pos:ts});
  }
  // v18: CDE2が動画を焼き込んだ単体HTML／ZIPを再読込した場合も、同じ動画スロットとして再編集できるようにする。
  const re3=/<[a-zA-Z][a-zA-Z0-9-]*\b[^>]*\bdata-slot\s*=\s*["']([^"']+)["'][^>]*>\s*<video\b[^>]*\bdata-cde-slot-video\b[^>]*>/ig; let m3;
  while((m3=re3.exec(src))){
    const id3=m3[1]; if(!id3||seen[id3]) continue; seen[id3]=1;
    const fm3=/object-fit\s*:\s*([\w-]+)/i.exec(m3[0]);
    out.push({id:id3,label:id3,fit:(fm3&&fm3[1])||"cover",pos:m3.index});
  }
  return out;
}
function dcAssignUrl(a, forExport){ return (forExport&&a&&a._zipUrl) ? a._zipUrl : (a.dataUrl||a.url); }
window.__cdeSlotDrop=function(id,file){ try{ assignImgSlot(id,file); }catch(e){} };
function _slotDropBridgeJs(){ return "(function(){function tg(e){var el=e.target;while(el&&el.tagName){var tn=(el.tagName||'').toLowerCase();if(tn==='image-slot'||tn==='x-import'||(el.getAttribute&&(el.getAttribute('data-img-slot')||el.getAttribute('data-slot'))))return el;el=el.parentNode;}return null;}function idOf(el){return (el.getAttribute&&(el.getAttribute('data-img-slot')||el.getAttribute('data-slot')||el.getAttribute('id')))||el.id||'';}document.addEventListener('dragover',function(e){if(tg(e)){e.preventDefault();e.stopPropagation();}},true);document.addEventListener('drop',function(e){var el=tg(e);if(!el)return;e.preventDefault();e.stopPropagation();var f=e.dataTransfer&&e.dataTransfer.files&&e.dataTransfer.files[0];if(!f)return;var id=idOf(el);if(!id)return;try{if(parent&&parent.__cdeSlotDrop)parent.__cdeSlotDrop(id,f);}catch(err){}},true);})();"; }
function applyDcClearedSlots(html){
  function hideTag(tag){
    if(/\bdata-cde-cleared\s*=/.test(tag)) return tag;
    var sm=/\bstyle\s*=\s*(["'])([\s\S]*?)\1/i.exec(tag), st="";
    if(sm){ st=sm[2].replace(/(^|;)\s*display\s*:[^;]*/ig,"$1").replace(/;+\s*$/g,""); tag=tag.replace(sm[0],'style="'+st+(st?";":"")+'display:none"'); }
    else tag=tag.replace(/(\/?>)$/,' style="display:none"$1');
    return tag.replace(/(\/?>)$/,' data-cde-cleared="1"$1');
  }
  for(const id in (M.imgTouched||{})){ if(M.imgTouched[id]!=="cleared") continue; const esc=id.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
    const nativeRe=new RegExp("<(?:x-import|image-slot)\\b[^>]*\\bid\\s*=\\s*[\"']"+esc+"[\"'][^>]*>","ig");
    const dataRe=new RegExp("<[a-zA-Z][a-zA-Z0-9-]*\\b[^>]*\\bdata-(?:img-slot|slot)\\s*=\\s*[\"']"+esc+"[\"'][^>]*>","ig");
    html=html.replace(nativeRe,hideTag).replace(dataRe,hideTag);
  }
  return html;
}
function slotStyleAttr(tag){const m=/\bstyle\s*=\s*(["'])([\s\S]*?)\1/i.exec(tag);return m?m[2].replace(/"/g,"&quot;"):null;}
function applyDcImgSlots(html, forExport){
  html=applyDcClearedSlots(html);
  // プレビュー(!forExport)は image-slot コンポーネントを介さず <img> を直接焼き込む。
  // image-slot 内部のサイズ計算（フレーム未レイアウト時に0除算→左上に極小表示）バグを回避し、書き出し映像と見た目を一致させる。
  // 書き出し(forExport=ネイティブ .dc.html)は従来どおり src を付与してネイティブ形式を保つ。
  const bake = !forExport;
  for(const id in (M.imgAssign||{})){ const a=M.imgAssign[id]; if(!a) continue;
    const url=dcAssignUrl(a, forExport); if(!url) continue;
    const kind=(a.kind==="video"||/^data:video\//i.test(url))?"video":"image";
    const fit=(a.fit||"cover");
    const vin=(kind==="video")?_vinAttr(a):"0.0";
    const assetMark=(kind==="video"&&a.assetPath)?(' data-cde-asset-path="'+_attrEsc(a.assetPath)+'"'):"";
    const esc=id.replace(/[.*+?^${}()|[\]\\]/g,"\\$&");
    if(kind==="video"){
      const reExisting=new RegExp("(<[a-zA-Z][a-zA-Z0-9-]*\\b[^>]*\\bdata-slot\\s*=\\s*[\"']"+esc+"[\"'][^>]*>\\s*)(<video\\b[^>]*\\bdata-cde-slot-video\\b[^>]*>)","ig");
      html=html.replace(reExisting,function(mm,pre,tag){
        tag=tag.replace(/\s(?:autoplay|loop)(?:\s*=\s*(?:["'][^"']*["']|[^\s>]+))?/ig,"");
        function attr(n,v){ var r=new RegExp("\\s"+n+"\\s*=\\s*[\"'][^\"']*[\"']","i"); if(r.test(tag)) tag=tag.replace(r,' '+n+'="'+v+'"'); else tag=tag.replace(/>$/,' '+n+'="'+v+'">'); }
        attr("data-cde-slot-id",id); if(a.assetPath)attr("data-cde-asset-path",a.assetPath); attr("data-vin",vin); attr("src",url); attr("preload","auto");
        if(!/\smuted(?:\s|=|>)/i.test(tag)) tag=tag.replace(/>$/," muted>");
        if(!/\splaysinline(?:\s|=|>)/i.test(tag)) tag=tag.replace(/>$/," playsinline>");
        return pre+tag;
      });
    }
    if(bake || kind==="video"){
      const reFull=new RegExp("<(?:x-import|image-slot)\\b[^>]*\\bid\\s*=\\s*[\"']"+esc+"[\"'][\\s\\S]*?<\\/(?:x-import|image-slot)>","ig");
      html=html.replace(reFull, function(mm){ var st=slotStyleAttr(mm)||""; var shp=((/\bshape\s*=\s*["']([^"']*)["']/i.exec(mm)||[])[1]||"").toLowerCase(); var rad=(/\bradius\s*=\s*["']([^"']*)["']/i.exec(mm)||[])[1]; var br=(shp==="circle")?"border-radius:50%;":(shp==="pill")?"border-radius:9999px;":(shp==="rounded")?("border-radius:"+(rad||12)+"px;"):""; if(!st) st="width:100%;height:100%;display:block;"; var inner=(kind==="video")?('<video data-cde-slot-video="1" data-cde-slot-id="'+id+'"'+assetMark+' data-vin="'+vin+'" src="'+url+'" muted playsinline preload="auto" style="width:100%;height:100%;object-fit:'+fit+';display:block;"></video>'):('<img src="'+url+'" style="width:100%;height:100%;object-fit:'+fit+';display:block;" />'); return '<div data-slot="'+id+'" style="'+st+';overflow:hidden;'+br+'">'+inner+'</div>'; });
    }
    const re=new RegExp("(<(?:x-import|image-slot)\\b[^>]*\\bid\\s*=\\s*[\"']"+esc+"[\"'][^>]*?)(\\/?>)","ig");
    if(kind==="video"){ html=html.replace(re, function(mm,pre,close){ var st1=slotStyleAttr(pre)||"width:100%;height:100%;display:block;"; return '<div data-slot="'+id+'" style="'+st1+';overflow:hidden;"><video data-cde-slot-video="1" data-cde-slot-id="'+id+'"'+assetMark+' data-vin="'+vin+'" src="'+url+'" muted playsinline preload="auto" style="width:100%;height:100%;object-fit:'+fit+';display:block;"></video></div>'; }); } else { html=html.replace(re, function(mm,pre,close){ pre=pre.replace(/\ssrc\s*=\s*["'][^"']*["']/i,""); return pre+' src="'+url+'"'+close; }); }
    // v3.1: data-img-slot 要素（自走型CSSデッキ）にも差し込み画像を反映する
    const reD=new RegExp("(<[a-zA-Z][a-zA-Z0-9-]*\\b[^>]*\\bdata-img-slot\\s*=\\s*[\"']"+esc+"[\"'][^>]*?)(\\/?>)","gi");
    html=html.replace(reD, function(mm,pre,close){
      if(/^<img/i.test(pre)){
        if(kind==="video"){
          pre=pre.replace(/^<img/i,"<div").replace(/\ssrc\s*=\s*["'][^"']*["']/i,"").replace(/\bdata-img-slot\s*=\s*["'][^"']*["']/i,'data-slot="'+id+'"');
          if(!/\bdata-slot\s*=/i.test(pre)) pre+=' data-slot="'+id+'"';
          var ist=slotStyleAttr(pre);
          var iadd=(/position\s*:/i.test(ist||"")?"":"position:relative;")+"overflow:hidden;";
          if(ist!=null) pre=pre.replace(/\bstyle\s*=\s*(["'])([\s\S]*?)\1/i,'style="'+ist+';'+iadd+'"'); else pre+=' style="'+iadd+'"';
          return pre+'><video data-cde-slot-video="1" data-cde-slot-id="'+id+'"'+assetMark+' data-vin="'+vin+'" src="'+url+'" muted playsinline preload="auto" style="position:absolute;left:0;top:0;width:100%;height:100%;object-fit:'+fit+';"></video></div>';
        }
        if(/\ssrc\s*=/i.test(pre)) pre=pre.replace(/\ssrc\s*=\s*["'][^"']*["']/i,' src="'+url+'"');
        else pre+=' src="'+url+'"';
        return pre+close;
      }
      var st=slotStyleAttr(pre);
      if(kind==="video"){ if(close!==">") return mm; pre=pre.replace(/\bdata-img-slot\s*=\s*["'][^"']*["']/i,'data-slot="'+id+'"'); var hasPos=/position\s*:/i.test(st||""); var addV=(hasPos?"":"position:relative;")+"overflow:hidden;"; if(st!=null){ pre=pre.replace(/\bstyle\s*=\s*(["'])([\s\S]*?)\1/i,'style="'+st+';'+addV+'"'); } else { pre+=' style="'+addV+'"'; } return pre+close+'<video data-cde-slot-video="1" data-cde-slot-id="'+id+'"'+assetMark+' data-vin="'+vin+'" src="'+url+'" muted playsinline preload="auto" style="position:absolute;left:0;top:0;width:100%;height:100%;object-fit:'+fit+';"></video>'; }
      var add="background-image:url('"+url+"');background-size:"+(fit==="contain"?"contain":"cover")+";background-position:center;background-repeat:no-repeat;";
      if(st!=null){ pre=pre.replace(/\bstyle\s*=\s*(["'])([\s\S]*?)\1/i,'style="'+st+';'+add+'"'); } else { pre+=' style="'+add+'"'; }
      return pre+close;
    });
  }
  return html;
}
function _attrEsc(s){ return String(s==null?"":s).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;"); }
function applyAssetVideoVins(html){
  function patch(block){
    var opm=/<video\b[^>]*>/i.exec(block); if(!opm||/\bdata-cde-slot-video\b/i.test(opm[0])) return block;
    var p=_assetPathFromVideoHtml(block); if(!p||!_isVideoAsset(p)) return block; var a=_assetVinState(p), tag=opm[0], vin=_vinAttr(a);
    tag=tag.replace(/\s(?:autoplay|loop)(?:\s*=\s*(?:["'][^"']*["']|[^\s>]+))?/ig,"");
    function attr(n,v){ var r=new RegExp("\\s"+n+"\\s*=\\s*[\"'][^\"']*[\"']","i"); if(r.test(tag))tag=tag.replace(r,' '+n+'="'+_attrEsc(v)+'"');else tag=tag.replace(/>$/,' '+n+'="'+_attrEsc(v)+'">'); }
    attr("data-cde-asset-path",p); attr("data-vin",vin); attr("preload","auto");
    if(!/\smuted(?:\s|=|>)/i.test(tag))tag=tag.replace(/>$/," muted>");
    if(!/\splaysinline(?:\s|=|>)/i.test(tag))tag=tag.replace(/>$/," playsinline>");
    var out=block.slice(0,opm.index)+tag+block.slice(opm.index+opm[0].length);
    return out.replace(/(<(?:video|source)\b[^>]*\bsrc\s*=\s*["'])([^"']+)(["'])/ig,function(mm,pre,u,q){return pre+u.replace(/#t=[^#]*$/i,"")+q;});
  }
  html=String(html||"").replace(/<video\b[^>]*>[\s\S]*?<\/video>/ig,function(block){return patch(block);});
  html=html.replace(/<video\b[^>]*>/ig,function(tag){return patch(tag);});
  return html;
}
function rewriteAssetVideoRefsZip(html,deckDir){
  function patch(block){ var p=_assetPathFromVideoHtml(block); if(!p||!M.files.has(p))return block; var rel=_attrEsc(_zipHref(_zipRelative(deckDir||"",p))); return block.replace(/(<(?:video|source)\b[^>]*\bsrc\s*=\s*["'])([^"']+)(["'])/ig,function(mm,pre,u,q){return pre+rel+q;}); }
  html=String(html||"").replace(/<video\b[^>]*>[\s\S]*?<\/video>/ig,function(b){return patch(b);});
  return html.replace(/<video\b[^>]*>/ig,function(t){return patch(t);});
}
function rewriteAssetRefsData(src){
  const paths=[...M.files.keys()].filter(p=>p!==M.supportPath && p!==M.imgSlotPath && !/\.(dc\.html|html)$/i.test(p)).sort((a,b)=>b.length-a.length);
  for(const p of paths){ const url=assetDataUrl(p); if(!url) continue; for(const ref of _assetRefs(p)){ if(!ref) continue; src=_replaceQuotedRef(src,ref,url); } src=src.split('data-cde-asset-path="'+url+'"').join('data-cde-asset-path="'+p+'"').split("data-cde-asset-path='"+url+"'").join("data-cde-asset-path='"+p+"'"); }
  return src;
}

// v32: ZIP 内の相対 ES module を srcdoc でも解決する仮想 module graph。
// 各 module の import 先を bare specifier へ置換し、import map で独立した Blob/Data URL に結ぶ。
// URL 同士を直接埋め込まないため、循環参照でも一度ずつ生成できる。
function _cdeModuleNorm(path){
  var out=[]; String(path||"").replace(/\\/g,"/").split("/").forEach(function(x){
    if(!x||x===".")return; if(x===".."){if(out.length)out.pop();return;} out.push(x);
  }); return out.join("/");
}
function _cdeFindFile(importer,spec){
  spec=String(spec||"").trim();
  if(!spec||/^(?:data:|blob:|https?:|file:|\/\/|#)/i.test(spec))return null;
  spec=spec.split("#")[0].split("?")[0];
  try{spec=decodeURIComponent(spec);}catch(_){ }
  var dir=String(importer||"").indexOf("/")>=0?String(importer).replace(/[^\/]*$/,""):"";
  var base=[];
  if(spec[0]==="/")base.push(_cdeModuleNorm(spec.slice(1)));
  else if(/^\.{1,2}\//.test(spec))base.push(_cdeModuleNorm(dir+spec));
  else{base.push(_cdeModuleNorm(dir+spec));base.push(_cdeModuleNorm(spec));}
  var cand=[];
  base.forEach(function(p){ if(!p)return; cand.push(p); if(!/\.[A-Za-z0-9]+$/.test(p))cand.push(p+".js",p+".mjs",p+".jsx",p+".tsx",p+"/index.js",p+"/index.mjs",p+"/index.jsx",p+"/index.tsx"); });
  for(var i=0;i<cand.length;i++)if(M.files.has(cand[i]))return cand[i];
  var folded={}; for(const p of M.files.keys())folded[String(p).toLowerCase()]=p;
  for(var j=0;j<cand.length;j++){var hit=folded[cand[j].toLowerCase()];if(hit)return hit;}
  return null;
}
function _cdeModulePath(importer,spec){ var p=_cdeFindFile(importer,spec); return p&&/\.m?js$/i.test(p)?p:null; }
function _cdeEachModuleSpec(src,fn){
  String(src||"").replace(/\b(?:import|export)\s+[\w$*{},\s]+?\sfrom\s*(["'])([^"']+)\1/g,function(_,q,s){fn(s);return _;});
  String(src||"").replace(/\bimport\s*(["'])([^"']+)\1/g,function(_,q,s){fn(s);return _;});
  String(src||"").replace(/\bimport\s*\(\s*(?:\/\*[\s\S]*?\*\/\s*)?(["'])([^"']+)\1\s*\)/g,function(_,q,s){fn(s);return _;});
}
function _cdeModuleRefs(src,importer){
  var out={}; _cdeEachModuleSpec(src,function(s){var p=_cdeModulePath(importer,s);if(p)out[p]=1;}); return Object.keys(out);
}
function _cdeNeedsModuleContext(src){
  src=String(src||"");
  return /\b(?:import\s+(?!\s*\()|export\s+)/.test(src)||/\bimport\.meta\b/.test(src);
}
function _cdeRewriteModuleImports(src,importer,idByPath){
  function mapped(spec){var p=_cdeModulePath(importer,spec);return p&&idByPath.has(p)?idByPath.get(p):null;}
  src=String(src||"").replace(/(\b(?:import|export)\s+[\w$*{},\s]+?\sfrom\s*)(["'])([^"']+)\2/g,function(mm,pre,q,s){var id=mapped(s);return id?pre+q+id+q:mm;});
  src=src.replace(/(\bimport\s*)(["'])([^"']+)\2/g,function(mm,pre,q,s){var id=mapped(s);return id?pre+q+id+q:mm;});
  src=src.replace(/(\bimport\s*\(\s*(?:\/\*[\s\S]*?\*\/\s*)?)(["'])([^"']+)\2(\s*\))/g,function(mm,pre,q,s,post){var id=mapped(s);return id?pre+q+id+q+post:mm;});
  return src;
}
function _cdeRewriteModuleAssets(src,importer,forExport,idByPath){
  return String(src||"").replace(/(["'`])((?:\.{1,2}\/|\/)[^"'`\r\n]+)\1/g,function(mm,q,s){
    if(s.indexOf("${")>=0)return mm;
    var p=_cdeFindFile(importer,s); if(!p||idByPath.has(p))return mm;
    var u=forExport?assetDataUrl(p):blobFor(p); return u?q+u+q:mm;
  });
}
function _cdeModuleDataUrl(code,label){ return "data:text/javascript;base64,"+u8ToB64(enc.encode(code))+"#"+encodeURIComponent(label||"module.js"); }
function _cdeModuleUrl(code,key,forExport){
  if(forExport)return _cdeModuleDataUrl(code,key);
  var u=URL.createObjectURL(new Blob([code],{type:"text/javascript"})); M.moduleBlobUrl.set(key,u); return u;
}
function _cdePrepareModuleGraph(html,forExport){
  html=String(html||""); if(!forExport)revokeModuleUrls();
  var entries={}, moduleScripts={};
  function source(path){var f=M.files.get(path);return f?dec.decode(f.bytes):"";}
  function mark(path){if(path)entries[path]=1;}
  html.replace(/<x-import\b[^>]*>/ig,function(tag){
    var a=/(\b(?:from|src|import)\s*=\s*)(["'])([^"']+)\2/i.exec(tag); if(!a)return tag;
    var bits=a[3].trim().split(/\s+/),p=_cdeModulePath(M.dcPath,bits[bits.length-1]);
    if(p){var s=source(p);if(_cdeModuleRefs(s,p).length||_cdeNeedsModuleContext(s))mark(p);} return tag;
  });
  html.replace(/<script\b[^>]*>/ig,function(tag){if(!/\btype\s*=\s*["']module["']/i.test(tag))return tag;var a=/\bsrc\s*=\s*(["'])([^"']+)\1/i.exec(tag),p=a&&_cdeModulePath(M.dcPath,a[2]);if(p){mark(p);moduleScripts[p]=1;}return tag;});
  html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/ig,function(block,attrs,code){if(!/\btype\s*=\s*["']module["']/i.test(attrs)||/\bsrc\s*=/i.test(attrs))return block;_cdeModuleRefs(code,M.dcPath).forEach(mark);return block;});
  var queue=Object.keys(entries), seen={};
  while(queue.length){var p=queue.shift();if(seen[p])continue;seen[p]=1;_cdeModuleRefs(source(p),p).forEach(function(dep){if(!seen[dep])queue.push(dep);});}
  var paths=Object.keys(seen).sort(), idByPath=new Map(); paths.forEach(function(p,i){idByPath.set(p,"@cde/m"+i);});
  if(!paths.length)return {html:html,importMap:"",count:0,paths:[]};
  var urls=new Map();
  paths.forEach(function(p){
    var code=_cdeRewriteModuleImports(source(p),p,idByPath);
    code=_cdeRewriteModuleAssets(code,p,forExport,idByPath)+"\n//# sourceURL=cde-zip/"+encodeURI(p);
    urls.set(p,_cdeModuleUrl(code,"module:"+p,forExport));
  });
  var imports={}; paths.forEach(function(p){imports[idByPath.get(p)]=urls.get(p);});
  var importMap='<script type="importmap">'+JSON.stringify({imports:imports}).replace(/</g,"\\u003c")+'<\/script>';
  html=html.replace(/<x-import\b[^>]*>/ig,function(tag){
    var a=/(\b(?:from|src|import)\s*=\s*)(["'])([^"']+)\2/i.exec(tag); if(!a)return tag;
    var bits=a[3].trim().split(/\s+/),p=_cdeModulePath(M.dcPath,bits[bits.length-1]); if(!p||!entries[p])return tag;
    var entryUrl=urls.get(p), s=source(p);
    if(_cdeNeedsModuleContext(s)){
      var nm=(/\bcomponent-from-global-scope\s*=\s*["']([^"']+)["']/i.exec(tag)||/\b(?:component|name)\s*=\s*["']([^"']+)["']/i.exec(tag)||[])[1]||"";
      var launcher='void import('+JSON.stringify(idByPath.get(p))+').then(function(m){var n='+JSON.stringify(nm)+',v=n&&(m[n]||m.default);if(n&&v&&!window[n])window[n]=v;}).catch(function(e){console.error("[CDE2 module graph]",e);});';
      entryUrl=_cdeModuleUrl(launcher,"launcher:"+p+":"+nm,forExport);
    }
    return tag.replace(a[0],a[1]+a[2]+entryUrl+a[2]);
  });
  html=html.replace(/<script\b[^>]*>/ig,function(tag){
    if(!/\btype\s*=\s*["']module["']/i.test(tag))return tag;var a=/\bsrc\s*=\s*(["'])([^"']+)\1/i.exec(tag),p=a&&_cdeModulePath(M.dcPath,a[2]);if(!p||!moduleScripts[p])return tag;return tag.replace(/(\bsrc\s*=\s*)(["'])[^"']+\2/i,function(_,pre,qq){return pre+qq+urls.get(p)+qq;});
  });
  html=html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/ig,function(block,attrs,code){if(!/\btype\s*=\s*["']module["']/i.test(attrs)||/\bsrc\s*=/i.test(attrs))return block;var out=_cdeRewriteModuleImports(code,M.dcPath,idByPath);out=_cdeRewriteModuleAssets(out,M.dcPath,forExport,idByPath);return '<script'+attrs+'>'+out+'<\/script>';});
  return {html:html,importMap:importMap,count:paths.length,paths:paths};
}
// v33: x-import は複数の JSX/TSX を空白区切りで順番に読み込める。
// srcdoc から相対パスを fetch すると 404 になるため、各同梱ソースを個別URLへ変換する。
// 末尾フラグメントに元パスを残し、support.js の拡張子判定と Babel 変換を維持する。
function _cdeRewriteLocalXImports(html,forExport){
  return String(html||"").replace(/<x-import\b[^>]*>/ig,function(tag){
    var a=/(\b(?:from|src|import)\s*=\s*)(["'])([^"']+)\2/i.exec(tag); if(!a)return tag;
    var changed=false, specs=a[3].trim().split(/\s+/).map(function(spec){
      if(!spec||/^(?:data:|blob:|https?:|file:|\/\/|#)/i.test(spec))return spec;
      var p=_cdeFindFile(M.dcPath,spec); if(!p||!/(?:\.jsx|\.tsx)$/i.test(p))return spec;
      var u=forExport?assetDataUrl(p):blobFor(p); if(!u)return spec;
      changed=true; return u+"#"+encodeURIComponent(p);
    });
    return changed?tag.replace(a[0],a[1]+a[2]+specs.join(" ")+a[2]):tag;
  });
}
function buildPlayerBridge(dur, hasAudio, resumeT, bounds, resumePaused){
  var D = (dur && isFinite(dur)) ? dur : 0;
  var B = (bounds && bounds.length) ? bounds : [0];
  var common =
    'var A=document.getElementById("__dcAud");' +
    'var G=document.getElementById("__dcBgm");' +
    'function bgmGet(){if(!G||!G.isConnected)G=document.getElementById("__dcBgm");return G;}' +
    'var BVOL=' + (isFinite(M.bgmVol)?M.bgmVol:0.25) + ',BFADE=' + (M.bgmFade?0.8:0) + ';' +
    'function bgmEnd(){try{var d=curDur();return (d&&isFinite(d)&&d>0)?d:DUR;}catch(e){return DUR;}}' +
    'function bgmVolAt(t){var E=bgmEnd();if(!(E>0)||!BFADE)return BVOL;var r=E-t;if(r>=BFADE)return BVOL;if(r<=0)return 0;return BVOL*(r/BFADE);}' +
    'function bgmSync(t,run){G=bgmGet();if(!G)return;try{var E=bgmEnd(),gd=(G.duration&&isFinite(G.duration))?G.duration:0;G.volume=Math.max(0,Math.min(1,bgmVolAt(t)));if(E>0&&t>=E-0.001){if(!G.paused)G.pause();return;}if(!(gd>0))return;var tg=t%gd;if(run){if(G.playbackRate!==rate){try{G.playbackRate=rate;}catch(e){}}if(Math.abs((G.currentTime||0)-tg)>0.3){try{G.currentTime=tg;}catch(e){}}if(G.paused){var p=G.play();if(p&&p.catch)p.catch(function(){});}}else{if(!G.paused)G.pause();if(Math.abs((G.currentTime||0)-tg)>0.05){try{G.currentTime=tg;}catch(e){}}}}catch(e){}}' +
    'var SLOT_VINS={},ASSET_VINS={};' +
    'window.addEventListener("message",function(e){var d=e.data||{};if(d.__dcAudCmd!==1)return;if(d.cmd==="bgmRefresh"){G=document.getElementById("__dcBgm");bgmSync(T,playing);}else if(d.cmd==="bgmVol"){BVOL=Math.max(0,Math.min(1,+d.value||0));G=bgmGet();if(G){try{G.volume=Math.max(0,Math.min(1,bgmVolAt(T)));}catch(_){}}}else if(d.cmd==="bgmFade"){BFADE=d.value?0.8:0;}else if(d.cmd==="slotVin"){var x=d.value||{},id=String(x.id||""),vin=Math.max(0,+x.vin||0);if(id){SLOT_VINS[id]=vin;var vs=document.getElementsByTagName("video");for(var i=0;i<vs.length;i++){if(vs[i].getAttribute("data-cde-slot-id")===id)vs[i].setAttribute("data-vin",String(vin));}applyTime(T);settle(T);}}else if(d.cmd==="assetVin"){var y=d.value||{},path=String(y.path||""),avin=Math.max(0,+y.vin||0);if(path){ASSET_VINS[path]=avin;var avs=document.getElementsByTagName("video");for(var j=0;j<avs.length;j++){if(!avs[j].getAttribute("data-cde-slot-id")&&avs[j].getAttribute("data-cde-asset-path")===path)avs[j].setAttribute("data-vin",String(avin));}applyTime(T);settle(T);}}});' +
    'var DUR=' + D + ';' +
    'var T=0,playing=false,rate=1,lastTs=0;' +
    'var BND=' + JSON.stringify(B) + ';' +
    'var deckLogic=null,omStage=null,omLastT=NaN,omLastRun=null;' +
    'function anims(){try{return document.getAnimations?document.getAnimations():[];}catch(e){return [];}}' +
    'function sceneStart(t){var n=0;for(var i=0;i<BND.length;i++){if(t>=BND[i])n=i;}return BND[n]||0;}' +
    'function deckSlider(){var r=document.getElementById("dc-root");if(r)return r.querySelector("input[type=range]");if(document.querySelector("x-dc"))return null;return document.querySelector("input[type=range]");}' +
    'function seekOmStage(t,run){var el=omStage&&omStage.isConnected?omStage:document.querySelector("[data-om-exportable-video-with-duration-secs]");if(!el){omStage=null;return false;}if(el!==omStage){omStage=el;omLastT=NaN;omLastRun=null;}run=!!run;var ready=el.hasAttribute("data-om-sync-seek");if(ready&&isFinite(omLastT)&&Math.abs(omLastT-t)<0.0005&&omLastRun===run)return true;try{el.dispatchEvent(new CustomEvent("data-om-seek-to-time-frame",{detail:{time:t,playing:run,sync:!run&&ready}}));}catch(e){}if(ready){omLastT=t;omLastRun=run;}else{omLastT=NaN;omLastRun=null;}return true;}' +
    'function findDeckLogic(){if(deckLogic&&deckLogic.__host&&deckLogic.__host.logic===deckLogic)return deckLogic;deckLogic=null;try{var h=document.querySelector("#dc-root")&&document.querySelector("#dc-root").firstElementChild,k=h&&Object.keys(h).filter(function(x){return x.indexOf("__reactFiber$")===0;})[0],f=k?h[k]:null;while(f&&f.return)f=f.return;var q=f?[f]:[];while(q.length){var x=q.pop(),s=x&&x.stateNode;if(s&&s.logic&&Array.isArray(s.logic.BOUNDS)){deckLogic=s.logic;return deckLogic;}if(x&&x.sibling)q.push(x.sibling);if(x&&x.child)q.push(x.child);}}catch(e){}return null;}' +
    'function setDeckScene(t){var l=findDeckLogic();if(!l)return;try{if(typeof l._t0==="number")l._t0=performance.now()-t*1000;}catch(e){}var b=(Array.isArray(l.BOUNDS)&&l.BOUNDS.length)?l.BOUNDS:BND,n=0;for(var i=0;i<b.length;i++){if(t>=b[i])n=i;}var K=(l.state&&("idx" in l.state))?"idx":((l.state&&("i" in l.state))?"i":null);if(K&&l.state[K]!==n){var o={};o[K]=n;try{if(window.ReactDOM&&typeof window.ReactDOM.flushSync==="function")window.ReactDOM.flushSync(function(){l.setState(o);});else l.setState(o);}catch(e){}}}' +
    'function setSlider(s,v){var vs=String(v);if(s.value!==vs){s.value=vs;try{s.dispatchEvent(new Event("input",{bubbles:true}));}catch(e){}}}' +
    // Explicit hooks own both scene selection and cue-relative animation times.
    // Flush React before synchronizing videos; otherwise the outgoing scene can
    // receive the incoming scene's zero-based animation/media position.
    'function seekExplicitDeck(t){var owner=(window.__DECK__&&typeof window.__DECK__.renderAt==="function")?window.__DECK__:window;if(typeof owner.renderAt!=="function")return false;function pause(){var as=anims();for(var i=0;i<as.length;i++){try{var at=as[i].currentTime;as[i].pause();if(at!==null)as[i].currentTime=at;}catch(e){}}}pause();var seek=function(){owner.renderAt(t);};if(window.ReactDOM&&typeof window.ReactDOM.flushSync==="function")window.ReactDOM.flushSync(seek);else seek();pause();return true;}' +
    // Static CSS compositions carry absolute delays on all mounted scenes.
    // Require matching declared bounds and scene delays; legacy mounted-scene
    // decks continue to use their existing scene-relative clock.
    'var cssStage=null;' +
    'function absoluteCssStage(){if(cssStage&&cssStage.isConnected)return cssStage;cssStage=null;var el=document.querySelector("[data-cde-stage][data-render-mode=css][data-bounds]");if(!el)return null;try{var b=JSON.parse(el.getAttribute("data-bounds")),cs=Array.from(el.children);if(!Array.isArray(b)||b.length<2||cs.length!==b.length)return null;for(var i=0;i<b.length;i++){var st=getComputedStyle(cs[i]),start=parseFloat(st.getPropertyValue("--t0")),delay=parseFloat(st.animationDelay);if(!isFinite(start)||!isFinite(delay)||Math.abs(start-b[i])>0.001||Math.abs(delay-b[i])>0.001||st.animationName==="none")return null;}cssStage=el;}catch(e){}return cssStage;}' +
    'function applyTime(t){if(t<0)t=0;if(DUR>0&&t>=DUR)t=(DUR>0.02?DUR-0.02:0);if(typeof window.__cdeSetClock==="function")window.__cdeSetClock(t);if(!seekOmStage(t,playing)&&!seekExplicitDeck(t)){var s=deckSlider();if(s){var mx=parseFloat(s.max||"0")||0;var v=(DUR>0&&mx>0)?(t/DUR*mx):((mx>0&&t>mx)?mx:t);setSlider(s,v);}else{setDeckScene(t);var ms=Math.max(0,(absoluteCssStage()?t:t-sceneStart(t))*1000),as=anims();for(var i=0;i<as.length;i++){try{as[i].pause();as[i].currentTime=ms;}catch(e){}}}}syncVids(t,playing);bgmSync(t,playing);}' +
    'function vT0(v,t){var a=parseFloat(v.getAttribute("data-t0"));if(isFinite(a))return a;if(cssStage&&cssStage.isConnected&&cssStage.contains(v)){var st=getComputedStyle(v),delay=parseFloat(st.animationDelay);if(st.animationName!=="none"&&isFinite(delay))return delay;var start=parseFloat(st.getPropertyValue("--t0"));if(isFinite(start))return start;}return sceneStart(t);}' +
    'function syncVids(t,run){var vs=document.getElementsByTagName("video");for(var i=0;i<vs.length;i++){var v=vs[i];try{v.muted=true;var sid=v.getAttribute("data-cde-slot-id"),ap=v.getAttribute("data-cde-asset-path");if(sid&&Object.prototype.hasOwnProperty.call(SLOT_VINS,sid))v.setAttribute("data-vin",String(SLOT_VINS[sid]));else if(ap&&Object.prototype.hasOwnProperty.call(ASSET_VINS,ap))v.setAttribute("data-vin",String(ASSET_VINS[ap]));var t0=vT0(v,t),vin=parseFloat(v.getAttribute("data-vin")||"0")||0;var vd=(v.duration&&isFinite(v.duration))?v.duration:0;var raw=(t-t0)+vin,vt=raw;if(v.loop&&vd>0){var span=Math.max(0.001,vd-vin);vt=vin+(((raw-vin)%span)+span)%span;}var hi=(vd>0)?Math.max(vin,vd-0.033):Math.max(vin,vt);var target=Math.max(vin,Math.min(vt,hi));var act=((t-t0)>=-0.05)&&(v.loop||vd<=0||raw<vd);if(!act){if(!v.paused)v.pause();var ct=((t-t0)<0)?vin:hi;if(Math.abs((v.currentTime||0)-ct)>0.08){try{v.currentTime=ct;}catch(e2){}}continue;}if(run){if(Math.abs((v.currentTime||0)-target)>0.3){try{v.currentTime=target;}catch(e3){}}if(v.paused){var p=v.play();if(p&&p.catch)p.catch(function(){});}if(v.playbackRate!==rate){try{v.playbackRate=rate;}catch(e5){}}}else{if(!v.paused)v.pause();if(Math.abs((v.currentTime||0)-target)>0.05){try{v.currentTime=target;}catch(e4){}}}}catch(e){}}}' +
    'function settle(t){requestAnimationFrame(function(){requestAnimationFrame(function(){if(!playing){applyTime(t);post();}});});}';
  var curDur = hasAudio
    ? 'function curDur(){return (A&&A.duration&&isFinite(A.duration))?A.duration:DUR;}'
    : 'function curDur(){return DUR;}';
  var post = 'function post(){try{var s=deckSlider();parent.postMessage({__dcAudState:1,t:T,dur:curDur(),paused:!playing,rate:rate,sv:(s?parseFloat(s.value||"0"):null),sm:(s?parseFloat(s.max||"0"):null)},"*");}catch(e){}}';
  var body;
  if(hasAudio){
    var resume = (resumeT>0)
      ? 'A.addEventListener("loadedmetadata",function(){try{if(A.duration&&'+resumeT+'<=A.duration+0.5)A.currentTime=Math.min('+resumeT+',A.duration);}catch(e){}},{once:true});'
      : '';
    body =
      'function syncFromAudio(){try{rate=A.playbackRate||1;T=A.currentTime||0;playing=!A.paused;applyTime(T);post();}catch(e){}}' +
      'function frame(){syncFromAudio();requestAnimationFrame(frame);}' +
      'requestAnimationFrame(frame);' +
      '["seeked","seeking","timeupdate","play","pause","ratechange","loadedmetadata","ended"].forEach(function(ev){A.addEventListener(ev,syncFromAudio);});' +
      'window.addEventListener("message",function(e){var d=e.data||{};if(d.__dcAudCmd!==1)return;try{' +
        'if(d.cmd==="play")A.play();' +
        'else if(d.cmd==="pause")A.pause();' +
        'else if(d.cmd==="toggle"){if(A.paused)A.play();else A.pause();}' +
        'else if(d.cmd==="rate"){A.playbackRate=d.value;rate=d.value;}' +
        'else if(d.cmd==="seek"){A.currentTime=d.value;T=d.value;applyTime(T);settle(T);post();}' +
        'else if(d.cmd==="seekFrac"){var du=A.duration||DUR||0;var t=(d.value||0)*du;A.currentTime=t;T=t;applyTime(T);settle(T);post();}' +
      '}catch(_){}});' +
      resume +
      'post();';
  } else {
    body =
      'T=' + ((resumeT>0)?resumeT:0) + ';if(DUR>0&&T>=DUR)T=0;' +
      'playing=' + (resumePaused?'false':'true') + ';' +
      'applyTime(T);settle(T);' +
      '[60,150,400,900].forEach(function(ms){setTimeout(function(){if(!playing){applyTime(T);post();}},ms);});' +
      'function tick(ts){if(playing){if(!lastTs)lastTs=ts;T+=(ts-lastTs)/1000*rate;lastTs=ts;if(DUR>0&&T>=DUR){T=DUR;playing=false;}applyTime(T);post();}else{lastTs=0;}requestAnimationFrame(tick);}' +
      'requestAnimationFrame(tick);' +
      'window.addEventListener("message",function(e){var d=e.data||{};if(d.__dcAudCmd!==1)return;try{' +
        'if(d.cmd==="play"){if(DUR>0&&T>=DUR)T=0;playing=true;lastTs=0;}' +
        'else if(d.cmd==="pause"){playing=false;}' +
        'else if(d.cmd==="toggle"){if(playing)playing=false;else{if(DUR>0&&T>=DUR)T=0;playing=true;lastTs=0;}}' +
        'else if(d.cmd==="rate"){rate=d.value||1;}' +
        'else if(d.cmd==="seek"){T=d.value||0;playing=false;applyTime(T);settle(T);post();}' +
        'else if(d.cmd==="seekFrac"){T=(d.value||0)*(DUR||0);playing=false;applyTime(T);settle(T);post();}' +
      '}catch(_){}});' +
      'post();';
  }
  return '(function(){' + common + curDur + post + body + '})();';
}
// v19: デッキ自身のtransformは保持し、CDE管理の外側ラッパーだけを拡縮する。
// contain=全体表示、width=横幅に合わせてiframe内を縦スクロール。
function _fitStageJs(W,H,initialMode){
  W=W||1920; H=H||1080; initialMode=(initialMode==="width"?"width":"contain");
  return `(function(){
var W=${W},H=${H},mode=${JSON.stringify(initialMode)},busy=false;
function markStage(){
  var hit=document.querySelector('[data-cde-stage="1"]');if(hit)return hit;
  var es=document.querySelectorAll('div[style],section[style],main[style]');
  for(var i=0;i<es.length;i++){try{var cs=getComputedStyle(es[i]),w=parseFloat(cs.width),h=parseFloat(cs.height);if(Math.abs(w-W)<0.6&&Math.abs(h-H)<0.6){es[i].setAttribute('data-cde-stage','1');return es[i];}}catch(e){}}
  return null;
}
function host(){var r=document.getElementById('dc-root');if(r)return r;if(document.querySelector('x-dc'))return null;var s=markStage();if(s)return s;var c=document.body&&document.body.children;if(!c)return null;for(var i=0;i<c.length;i++){var e=c[i],tn=(e.tagName||'').toLowerCase();if(!tn||tn==='script'||tn==='style'||tn==='link'||tn==='audio'||tn==='video'||e.id==='__cdePreviewScale')continue;return e;}return null;}
function wrapper(){var w=document.getElementById('__cdePreviewScale');if(w)return w;var el=host();if(!el||!el.parentNode)return null;w=document.createElement('div');w.id='__cdePreviewScale';w.setAttribute('data-cde-preview-wrapper','1');el.parentNode.insertBefore(w,el);w.appendChild(el);w.style.cssText='position:absolute;left:0;top:0;transform-origin:0 0;';markStage();return w;}
function notify(){try{parent.postMessage({__cdePreviewLayout:1,mode:mode},'*');}catch(e){}}
function fit(){if(busy||window.__cdeLivePngCapturing)return;busy=true;try{var de=document.documentElement,b=document.body,vw=de.clientWidth||innerWidth||0,vh=de.clientHeight||innerHeight||0;if(!b||!vw||!vh)return;var w=wrapper();if(!w)return;b.style.margin='0';w.style.transform='none';w.style.left='0px';w.style.top='0px';w.style.width=vw+'px';w.style.height=vh+'px';var st=markStage();if(!st)return;var r=st.getBoundingClientRect();if(!(r.width>1&&r.height>1))return;var s=(mode==='width')?(vw/r.width):Math.min(vw/r.width,vh/r.height);if(!isFinite(s)||s<=0)s=1;s=Math.min(32,s);var fw=r.width*s,fh=r.height*s,left,top;if(mode==='width'){left=-r.left*s;top=-r.top*s;de.style.overflowX='hidden';de.style.overflowY='auto';b.style.overflow='visible';b.style.width='100%';b.style.height=Math.max(vh,fh)+'px';}else{try{scrollTo(0,0);}catch(e){}left=(vw-fw)/2-r.left*s;top=(vh-fh)/2-r.top*s;de.style.overflow='hidden';b.style.overflow='hidden';b.style.width='100%';b.style.height='100%';}w.style.left=left+'px';w.style.top=top+'px';w.style.transform='scale('+s+')';setTimeout(notify,0);}catch(e){}finally{busy=false;}}
window.__cdeFit=fit;
window.addEventListener('message',function(e){var d=e.data||{};if(d.__cdePreviewFit!==1)return;mode=(d.mode==='width'?'width':'contain');fit();});
window.addEventListener('resize',fit);fit();[0,60,150,400,900,1600,3000].forEach(function(ms){setTimeout(fit,ms);});
try{new MutationObserver(function(){setTimeout(fit,0);}).observe(document.body,{childList:true,subtree:true});}catch(e){}
})();`;
}
function setPreviewFitMode(mode){
  M.previewFitMode=(mode==="width"?"width":"contain");
  try{ const w=$("#frame").contentWindow; if(w) w.postMessage({__cdePreviewFit:1,mode:M.previewFitMode},"*"); }catch(_){}
  setTimeout(redrawMarks,40); setTimeout(redrawMarks,240);
}
function buildDcDoc(forExport){
  const supportText = M.supportPath? dec.decode(M.files.get(M.supportPath).bytes): "";
  const imgSlotText = M.imgSlotPath? dec.decode(M.files.get(M.imgSlotPath).bytes): "";
  let html = currentJsxText()||"";
  // ローカルの classic <script src> は下でランタイムをインライン化する。ES module は v32 の graph 解決へ残す。
  html = html.replace(/<script\b[^>]*\bsrc\s*=\s*["'](?!https?:|data:|\/\/)[^"']*["'][^>]*>\s*<\/script>/ig, function(tag){return /\btype\s*=\s*["']module["']/i.test(tag)?tag:"";});
  if(imgSlotText){
    const slotUrl="data:text/javascript;base64,"+u8ToB64(enc.encode(imgSlotText))+"#image-slot.js";
    html = html.replace(/<x-import\b[^>]*>/ig, function(tag){ if(!/image-slot/i.test(tag)) return tag; if(/\bfrom\s*=\s*["'][^"']*["']/i.test(tag)) return tag.replace(/\bfrom\s*=\s*["'][^"']*["']/i, 'from="'+slotUrl+'"'); return tag.replace(/<x-import/i, '<x-import from="'+slotUrl+'"'); });
  }
  html = applyDcImgSlots(html, forExport);
  html = applyAssetVideoVins(html);
  html = stampCanonicalStage(html);
  const moduleGraph=_cdePrepareModuleGraph(html,forExport); html=moduleGraph.html;
  html=_cdeRewriteLocalXImports(html,forExport);
  if(!forExport)M._moduleGraphCount=moduleGraph.count;
  html = forExport ? rewriteAssetRefsData(html) : rewriteAssetRefs(html);
  const cdn='<script src="https://unpkg.com/react@18.3.1/umd/react.production.min.js"><\/script><script src="https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js"><\/script>';
  // プレビューではデッキ本体が起動する前にperformance.nowを制御可能にする。
  // CDE2の再生位置を渡すまで0秒に固定するため、スライダー無しの自走デッキも勝手に進まない。
  const clockPrelude=forExport?'':'<script>(function(){try{var n=performance.now.bind(performance),b=n(),ms=0;window.__cdeSetClock=function(sec){ms=Math.max(0,(Number(sec)||0)*1000);};Object.defineProperty(performance,"now",{configurable:true,value:function(){return b+ms;}});}catch(e){}})();<\/script>';
  const inject=clockPrelude + moduleGraph.importMap + (M.plainDeck?"":cdn) + (imgSlotText? '<script>'+imgSlotText+'<\/script>' : '') + '<script>'+supportText+'<\/script>';
  // support.js は起動時に <x-dc> を置き換えるため、<helmet> 内だけにあるフォント宣言を先に head へ退避する。
  const fontHead=extractDeckFontHead(html);
  const headLead=(fontHead?fontHead+"\n":"")+inject;
  let doc;
  if(/<head[^>]*>/i.test(html)){ doc=html.replace(/<head[^>]*>/i, function(mm){ return mm+"\n"+headLead+"\n"; }); }
  else if(/<x-dc/i.test(html)){ doc='<!DOCTYPE html><html><head><meta charset="utf-8">'+headLead+'<style>html,body{margin:0;height:100%;background:#04060f;overflow:hidden}x-dc{display:block;height:100%}</style></head><body>'+html+'</body></html>'; }
  else { doc='<!DOCTYPE html><html><head><meta charset="utf-8">'+headLead+'</head><body>'+html+'</body></html>'; }
  if(!forExport && M.dcMode){
    var _hasAud = !!(M.dcAudio && M.dcAudio.dataUrl);
    // v17: 再描画で0秒に戻さない。テキスト編集直後はその文字が載っているシーンへ移動して止める。
    var _sk=M._seekAfterRebuild; M._seekAfterRebuild=null;
    var _resumeT=_sk? _sk.t : ((typeof M._audT==="number" && M._audT>0.05)?M._audT:0);
    var _resumeP=_sk? true : !!M._audPaused;
    var _pb=dcParseBounds(); var _dcDur=_pb.dur;
    var _player=buildPlayerBridge(_dcDur, _hasAud, _resumeT, _pb.bounds, _resumeP);
    var _stg17=dcStageSize(currentJsxText()||html);
    var _inject2='<script>'+_player+'<\/script>'+'<script>'+_slotDropBridgeJs()+'<\/script>'+'<script>'+DC_LIVE_PNG_BRIDGE+'<\/script>'+'<script>'+_fitStageJs(_stg17.w,_stg17.h,M.previewFitMode)+'<\/script>';
    if(M.dcBgm && M.dcBgm.dataUrl){ _inject2='<audio id="__dcBgm" src="'+M.dcBgm.dataUrl+'" preload="auto" loop></audio>'+_inject2; }
    if(_hasAud){ _inject2='<audio id="__dcAud" src="'+M.dcAudio.dataUrl+'" preload="auto"></audio>'+_inject2; }
    if(/<\/body>/i.test(doc)) doc=doc.replace(/<\/body>/i, _inject2+"</body>"); else doc+=_inject2;
  }
  return doc;
}
function buildPreviewDc(){
  try{
    if(!M.plainDeck && !M.supportPath){ log("support.js が見つかりません。Claude Design の完全な書き出し（support.js を含むZIP）を一度開くと、以後は内蔵ランタイムでプレビューできます。", true); return; }
    $("#frame").srcdoc=buildDcDoc(false);
    { var _ap=$("#audPlay"),_sk=$("#audSeek"); if(_ap){_ap.disabled=false; _ap.textContent="\u25b6 再生";} if(_sk)_sk.disabled=false; setTimeout(function(){ try{ _audPost("rate", parseFloat(($("#audRate")&&$("#audRate").value)||"1")); }catch(e){} },300); }
    log("プレビュー（ネイティブ .dc.html：React + support.js + image-slot.js を注入"+(M._moduleGraphCount?"／ZIP内ES module "+M._moduleGraphCount+"本を仮想解決":"")+"）を再描画しました。");
  }catch(e){ log("プレビュー生成エラー: "+e.message, true); }
}
async function ensureDcDataUrls(){ for(const id in (M.imgAssign||{})){ const a=M.imgAssign[id]; if(a && !a.dataUrl && a.file){ try{ const b=new Uint8Array(await a.file.arrayBuffer()); a.bytes=b; a.dataUrl="data:"+(a.file.type||"image/png")+";base64,"+u8ToB64(b); }catch(_){} } } }
function _zipNormPath(p){ var out=[]; String(p||"").replace(/\\/g,"/").split("/").forEach(function(x){if(!x||x===".")return;if(x===".."){if(out.length)out.pop();return;}out.push(x);});return out.join("/"); }
function _zipRelative(fromDir,toPath){ var a=_zipNormPath(fromDir).split("/").filter(Boolean),b=_zipNormPath(toPath).split("/").filter(Boolean),i=0;while(i<a.length&&i<b.length&&a[i].toLowerCase()===b[i].toLowerCase())i++;return new Array(a.length-i+1).join("../")+b.slice(i).join("/"); }
function _zipHref(p){ return String(p||"").split("/").map(function(x){return x===".."?x:encodeURIComponent(x);}).join("/"); }
async function _prepareZipSlotAssets(deckDir){
  var used={}; for(const p of M.files.keys())used[String(p).toLowerCase()]=1; var files=[],state={};
  function unique(p){var raw=p,ext=extOf(raw),stem=ext?raw.slice(0,-ext.length-1):raw,n=2;while(used[p.toLowerCase()])p=stem+"_"+(n++)+(ext?("."+ext):"");used[p.toLowerCase()]=1;return p;}
  for(const id in (M.imgAssign||{})){ var a=M.imgAssign[id]; if(!a)continue; var path=null,bytes=null;
    if(a.assetPath&&M.files.has(a.assetPath)) path=a.assetPath;
    else{
      try{ if(a.bytes)bytes=a.bytes; else if(a.file)bytes=new Uint8Array(await a.file.arrayBuffer()); else if(a.dataUrl){var c=a.dataUrl.indexOf(","),bin=atob(a.dataUrl.slice(c+1));bytes=new Uint8Array(bin.length);for(var bi=0;bi<bin.length;bi++)bytes[bi]=bin.charCodeAt(bi);} }catch(_){}
      if(!bytes)continue;
      var fallback=(a.kind==="video"?"mp4":"png"),name=_safeFn(id)+"__"+_safeFn(a.name||("slot."+fallback));if(!extOf(name))name+="."+fallback;
      path=unique((deckDir||"")+"assets/cde-slots/"+name); files.push({path:path,bytes:bytes});
    }
    var rel=_zipHref(_zipRelative(deckDir||"",path)); a._zipUrl=rel; a._zipPath=path; state[id]={u:rel,s:1,x:0,y:0}; if(a.kind==="video")state[id].vin=_vinRound(a.vin);
  }
  return {files:files,state:state};
}
function _clearZipSlotAssets(){ for(const id in (M.imgAssign||{})){var a=M.imgAssign[id];if(a){delete a._zipUrl;delete a._zipPath;}} }
function detectRenderMode(){
  var txt=(M.dcSource||"");
  try{ for(const [p,f] of M.files){ if(p===M.supportPath||p===M.imgSlotPath) continue; if(/\.(?:js|mjs|jsx|tsx)$/i.test(p)){ try{ txt+="\n"+dec.decode(f.bytes); }catch(_){} } } }catch(_){}
  var low=txt.toLowerCase();
  var marks=["getcontext","<canvas","webgl","offscreencanvas","createimagebitmap","transfercontroltooffscreen"];
  var reasons=[]; for(var i=0;i<marks.length;i++){ if(low.indexOf(marks[i])>=0) reasons.push(marks[i]); }
  return { vt: reasons.length>0, reasons: reasons };
}
function stampRenderMode(html, mode){
  try{
    if(/<x-dc\b[^>]*\bdata-render-mode\s*=/i.test(html)) return html.replace(/(<x-dc\b[^>]*\bdata-render-mode\s*=\s*)(["'])[^"']*\2/i, '$1$2'+mode+'$2');
    if(/<x-dc\b/i.test(html)) return html.replace(/<x-dc\b/i, '<x-dc data-render-mode="'+mode+'"');
  }catch(_){}
  return html;
}
