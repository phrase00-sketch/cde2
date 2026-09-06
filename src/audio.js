// ===== v12: BGM（背景音楽）ミックス =====
// プレビューはナレーションとBGMを別トラックのまま同期再生するが、書き出し（MP4／各ZIP）では
// OfflineAudioContext で「ナレーション＋BGM（ループ／尺カット／音量／終端フェード）」を1本のWAVに
// ミックスしてから同梱する。これで下流の RENDERER2 は無改修のままBGM入りMP4になる。
function _duBytes(du){ var c=du.indexOf(","); var bin=atob(du.slice(c+1)); var u8=new Uint8Array(bin.length); for(var i=0;i<bin.length;i++)u8[i]=bin.charCodeAt(i); return u8; }
function _duMime(du){ try{ return (du.slice(5,du.indexOf(",")).split(";")[0])||"audio/wav"; }catch(e){ return "audio/wav"; } }
function _mimeExt(m){ return ({"audio/wav":"wav","audio/x-wav":"wav","audio/wave":"wav","audio/mpeg":"mp3","audio/mp3":"mp3","audio/mp4":"m4a","audio/aac":"m4a","audio/ogg":"ogg","audio/webm":"webm"})[m]||"wav"; }
// WAVヘッダからサンプルレートを読む（非WAVなら0）。デコード先コンテキストのレートを元音声に合わせ、不要なリサンプルを避ける。
function _wavRate(u8){ try{ if(!u8||u8.length<44) return 0; var dv=new DataView(u8.buffer,u8.byteOffset,u8.byteLength); if(dv.getUint32(0,false)!==0x52494646||dv.getUint32(8,false)!==0x57415645) return 0; var off=12; while(off+8<=u8.length){ var id=dv.getUint32(off,false), sz=dv.getUint32(off+4,true); if(id===0x666d7420){ return dv.getUint32(off+12,true)||0; } off+=8+sz+(sz&1); } }catch(e){} return 0; }
async function _decodeDu(du,rate){ var AC=window.AudioContext||window.webkitAudioContext; var ctx=null; try{ ctx=(rate&&rate>=8000&&rate<=192000)? new AC({sampleRate:rate}) : new AC(); }catch(e){ ctx=new AC(); } try{ var u8=_duBytes(du); var buf=await ctx.decodeAudioData(u8.buffer.slice(0)); return buf; } finally { try{ ctx.close(); }catch(e){} } }
function _bufToWav(buf){
  var ch=buf.numberOfChannels, len=buf.length, sr=buf.sampleRate, bytes=new Uint8Array(44+len*ch*2), dv=new DataView(bytes.buffer);
  function ws(o,t){ for(var i=0;i<t.length;i++) dv.setUint8(o+i, t.charCodeAt(i)); }
  ws(0,"RIFF"); dv.setUint32(4,36+len*ch*2,true); ws(8,"WAVE"); ws(12,"fmt ");
  dv.setUint32(16,16,true); dv.setUint16(20,1,true); dv.setUint16(22,ch,true);
  dv.setUint32(24,sr,true); dv.setUint32(28,sr*ch*2,true); dv.setUint16(32,ch*2,true); dv.setUint16(34,16,true);
  ws(36,"data"); dv.setUint32(40,len*ch*2,true);
  var chans=[]; for(var c=0;c<ch;c++) chans.push(buf.getChannelData(c));
  var o=44;
  for(var i=0;i<len;i++){ for(var c2=0;c2<ch;c2++){ var v=chans[c2][i]; v=v<-1?-1:(v>1?1:v); dv.setInt16(o, v<0?v*0x8000:v*0x7fff, true); o+=2; } }
  return bytes;
}
// ナレーション（任意）＋BGMをミックスして {bytes, mime, duration, looped, cut} を返す。BGM未設定なら null。
async function mixVoiceAndBgm(){
  if(!(M.dcBgm && M.dcBgm.dataUrl)) return null;
  // 出力レート：ナレーションがWAVならその実レート、無ければBGMのWAVレート、どちらも不明なら 48000Hz。
  var _tr=0;
  try{ if(M.dcAudio && M.dcAudio.dataUrl) _tr=_wavRate(_duBytes(M.dcAudio.dataUrl)); }catch(e){}
  try{ if(!_tr) _tr=_wavRate(_duBytes(M.dcBgm.dataUrl)); }catch(e){}
  if(!_tr) _tr=48000;
  var voice=null;
  if(M.dcAudio && M.dcAudio.dataUrl){ voice=await _decodeDu(M.dcAudio.dataUrl,_tr); }
  var bgm=await _decodeDu(M.dcBgm.dataUrl,_tr);
  var deckDur=0; try{ deckDur=(dcParseBounds().dur)||0; }catch(e){}
  var total=Math.max(deckDur||0, voice?voice.duration:0);
  if(!(total>0)) total=bgm.duration;
  var sr=_tr||(voice&&voice.sampleRate)||bgm.sampleRate||48000;
  var OAC=window.OfflineAudioContext||window.webkitOfflineAudioContext;
  if(!OAC) throw new Error("OfflineAudioContext 未対応のブラウザです");
  var octx=new OAC(2, Math.max(1,Math.ceil(total*sr)), sr);
  if(voice){ var vs=octx.createBufferSource(); vs.buffer=voice; vs.connect(octx.destination); vs.start(0); }
  var bs=octx.createBufferSource(); bs.buffer=bgm; bs.loop=true; bs.loopStart=0; bs.loopEnd=bgm.duration;
  var g=octx.createGain(); var vol=Math.max(0,Math.min(1,(isFinite(M.bgmVol)?M.bgmVol:0.25)));
  g.gain.setValueAtTime(vol,0);
  var fd=M.bgmFade? Math.min(0.8, total*0.2) : 0;
  if(fd>0){ g.gain.setValueAtTime(vol, Math.max(0,total-fd)); g.gain.linearRampToValueAtTime(0.0001, total); }
  bs.connect(g); g.connect(octx.destination); bs.start(0); try{ bs.stop(total); }catch(e){}
  var out=await octx.startRendering();
  return { bytes:_bufToWav(out), mime:"audio/wav", duration:total, looped:(bgm.duration<total-0.05), cut:(bgm.duration>total+0.05) };
}
function _bgmMixLog(mx){
  try{ log("\ud83c\udfb6 BGMをミックスしました（尺 "+ (Math.round(mx.duration*10)/10) +"秒・音量 "+Math.round((M.bgmVol||0)*100)+"%"+(mx.looped?"・ループ":"")+(mx.cut?"・尺に合わせてカット":"")+(M.bgmFade?"・終端フェード":"")+"）。"); }catch(e){}
}
// ---- 音声挿入＋スライダー＋倍速（dcプレビュー）----
let _audSeeking=false;
function _audPost(cmd,value){ try{ const w=$("#frame").contentWindow; if(w) w.postMessage({__dcAudCmd:1,cmd,value},"*"); }catch(_){} }
// v19-2: BGMだけの変更ではsrcdocを作り直さない。デッキ・ナレーション・動画の現在位置を保持する。
function _syncPreviewBgm(){
  if(!M.dcMode){ buildPreview(); return; }
  try{
    const fr=$("#frame"), doc=fr&&fr.contentDocument;
    if(!doc||!doc.body){ buildPreview(); return; }
    let a=doc.getElementById("__dcBgm");
    if(!(M.dcBgm&&M.dcBgm.dataUrl)){
      if(a){ try{a.pause();}catch(_){} a.remove(); }
      _audPost("bgmRefresh");
      return;
    }
    if(!a){ a=doc.createElement("audio"); a.id="__dcBgm"; a.preload="auto"; a.loop=true; doc.body.appendChild(a); }
    a.preload="auto"; a.loop=true;
    if(a.__cdeBgmData!==M.dcBgm.dataUrl){
      try{a.pause();}catch(_){}
      a.__cdeBgmData=M.dcBgm.dataUrl;
      a.src=M.dcBgm.dataUrl;
      try{a.load();}catch(_){}
    }
    const refresh=()=>{ _audPost("bgmRefresh"); _audPost("bgmVol",M.bgmVol); _audPost("bgmFade",M.bgmFade); };
    if(a.readyState>=1) refresh(); else a.addEventListener("loadedmetadata",refresh,{once:true});
    refresh();
  }catch(e){ log("BGMプレビューの更新に失敗: "+((e&&e.message)||e),true); }
}
function _fmtT(s){ s=Math.max(0,Math.floor(+s||0)); const m=Math.floor(s/60), x=s%60; return m+":"+(x<10?"0":"")+x; }
// v7: ZIPに .dc-audio.json（CDE2自身の書き出しマニフェスト）が無い納品ZIP（Claude Design出力など）でも、
// 同梱の音声ファイル（audio/ フォルダ優先）を自動検出して挿入音声にセットする。既に音声がある場合は何もしない。
function _autoDetectZipAudio(){
  try{
    if(M.dcAudio || M.audioSelectionExplicit) return;
    var cands=[...M.files.keys()].filter(function(p){ return /\.(wav|mp3|m4a|ogg)$/i.test(p) && !/_bgm\.[a-z0-9]+$/i.test(p) && !/_mix\.[a-z0-9]+$/i.test(p); });
    if(!cands.length) return;
    cands.sort(function(a,b){ var aa=/(^|\/)audio\//i.test(a)?0:1, bb=/(^|\/)audio\//i.test(b)?0:1; return (aa-bb)||(a<b?-1:a>b?1:0); });
    var pick=cands[0], ent=M.files.get(pick); if(!ent||!ent.bytes) return;
    var bytes=ent.bytes, repaired=false, repFrom=0, repTo=0;
    if(/\.wav$/i.test(pick)){ var fx=_fixWavBytes(bytes); bytes=fx.bytes; repaired=!!fx.repaired; repFrom=fx.from; repTo=fx.to; }
    var mm=ent.mime||mimeOf(pick); if(!/^audio\//i.test(mm||"")) mm="audio/wav";
    var nm=pick.split("/").pop();
    M.dcAudio={name:nm, path:pick, dataUrl:"data:"+mm+";base64,"+u8ToB64(bytes), mime:mm};
    var extra=(cands.length>1?("（音声"+cands.length+"件中の先頭を採用。差し替えは「音声」ボタンから）"):"")+(repaired?("（WAVヘッダの不整合 byteRate "+repFrom+"→"+repTo+" を自動修正）"):"");
    log("ZIP同梱の音声 "+nm+" を選択しました"+extra+"。");
  }catch(e){}
}
// WAVヘッダ自己診断・修復：byteRate が sampleRate×blockAlign と食い違うと、ブラウザが再生速度を誤り音声と映像がズレる。挿入時に自動補正する。
function _fixWavBytes(u8){ try{ if(!u8||u8.length<44) return {bytes:u8,repaired:false}; var dv=new DataView(u8.buffer,u8.byteOffset,u8.byteLength); if(dv.getUint32(0,false)!==0x52494646||dv.getUint32(8,false)!==0x57415645) return {bytes:u8,repaired:false}; var off=12,found=-1; while(off+8<=u8.length){ var id=dv.getUint32(off,false), sz=dv.getUint32(off+4,true); if(id===0x666d7420){ found=off+8; break; } off+=8+sz+(sz&1); } if(found<0||found+16>u8.length) return {bytes:u8,repaired:false}; var ch=dv.getUint16(found+2,true), sr=dv.getUint32(found+4,true), byteRate=dv.getUint32(found+8,true), blockAlign=dv.getUint16(found+12,true), bits=dv.getUint16(found+14,true); var ba=blockAlign||(((ch*bits)>>3))||1; var correct=sr*ba; if(correct>0 && byteRate!==correct){ var out=u8.slice(); new DataView(out.buffer).setUint32(found+8,correct,true); return {bytes:out,repaired:true,from:byteRate,to:correct}; } return {bytes:u8,repaired:false}; }catch(e){ return {bytes:u8,repaired:false}; } }
(function(){ const af=$("#audFile"), ap=$("#audPlay"), ar=$("#audRate"), an=$("#audName"), sk=$("#audSeek");
  if(af) af.addEventListener("change", e=>{ const f=e.target.files&&e.target.files[0]; if(!f) return; const owner=M,r=new FileReader(); r.onload=()=>{ if(M!==owner||WORKSPACE.loading)return;try{ var u8=new Uint8Array(r.result); var fx=_fixWavBytes(u8); var mime=(/\.wav$/i.test(f.name||"")||/wav/i.test(f.type||""))?"audio/wav":(f.type||"audio/wav"); M.audioSelectionExplicit=true;M.dcAudio={name:f.name,dataUrl:"data:"+mime+";base64,"+u8ToB64(fx.bytes),mime:mime}; projectChanged();if(an) an.textContent="\ud83c\udfb5 "+f.name; if(ap) ap.disabled=false; if(sk) sk.disabled=false; buildPreview(); setTimeout(()=>_audPost("rate", parseFloat((ar&&ar.value)||"1")), 700); log(fx.repaired?("音声を読み込みました（WAVヘッダの不整合 byteRate "+fx.from+"→"+fx.to+" を自動修正し、再生速度ズレを防止）。"):"音声を読み込みました。「▶ 音声」で再生、スライダーで途中から再生できます。"); }catch(err){ M.dcAudio=null; log("音声の読み込みに失敗: "+((err&&err.message)||err), true); } }; r.readAsArrayBuffer(f); e.target.value=""; });
  // ---- v12: BGM（背景音楽） ----
  const bf=$("#bgmFile"), bv=$("#bgmVol"), bn=$("#bgmVolNum"), bnm=$("#bgmName"), bfd=$("#bgmFade"), bcl=$("#bgmClear");
  function _bgmUi(){
    if(bnm) bnm.textContent = M.dcBgm ? ("\ud83c\udfb6 "+(M.dcBgm.name||"BGM")) : "";
    if(bcl) bcl.style.display = M.dcBgm ? "" : "none";
    if(bn) bn.textContent = Math.round((M.bgmVol||0)*100)+"%";
  }
  if(bf) bf.addEventListener("change", e=>{
    const f=e.target.files&&e.target.files[0]; if(!f) return;
    const owner=M,r=new FileReader();
    r.onload=()=>{ if(M!==owner||WORKSPACE.loading)return;try{
      var u8=new Uint8Array(r.result);
      var mime=(/\.wav$/i.test(f.name||"")||/wav/i.test(f.type||""))?"audio/wav":(f.type||"audio/mpeg");
      if(/^audio\/wav$/i.test(mime)){ var fx=_fixWavBytes(u8); u8=fx.bytes; }
      M.dcBgm={name:f.name, dataUrl:"data:"+mime+";base64,"+u8ToB64(u8), mime:mime};
      projectChanged();_bgmUi(); _syncPreviewBgm();
      log("BGM「"+f.name+"」を読み込みました（再生位置を保持／音量 "+Math.round((M.bgmVol||0)*100)+"%／デッキ尺より長ければ自動カット・短ければループ"+(M.bgmFade?"／終端フェード":"")+"）。書き出し時はナレーションとミックスして同梱します。");
    }catch(err){ M.dcBgm=null; _bgmUi(); log("BGMの読み込みに失敗: "+((err&&err.message)||err), true); } };
    r.readAsArrayBuffer(f); e.target.value="";
  });
  if(bv) bv.addEventListener("input", ()=>{ M.bgmVol=Math.max(0,Math.min(1,(parseFloat(bv.value||"0")||0)/100)); if(bn) bn.textContent=Math.round(M.bgmVol*100)+"%"; _audPost("bgmVol", M.bgmVol); });
  if(bfd) bfd.addEventListener("change", ()=>{ M.bgmFade=!!bfd.checked; _audPost("bgmFade", M.bgmFade); });
  if(bcl) bcl.onclick=()=>{ M.dcBgm=null; _bgmUi(); _syncPreviewBgm(); log("BGMを解除しました（再生位置は保持）。"); };
  window._bgmUi=_bgmUi; _bgmUi();
  if(ap) ap.onclick=()=>_audPost("toggle");
  if(ar) ar.addEventListener("change", ()=>_audPost("rate", parseFloat(ar.value||"1")));
  if(sk){ sk.addEventListener("input", ()=>{ _audSeeking=true; const _t=parseFloat(sk.value||"0")||0; _audPost("seek", _t); const tt=$("#audTime"); if(tt) tt.textContent=_fmtT(sk.value)+" / "+_fmtT(sk.max); }); sk.addEventListener("change", ()=>{ _audPost("seek", parseFloat(sk.value||"0")||0); setTimeout(()=>{_audSeeking=false;},150); }); }
})();
