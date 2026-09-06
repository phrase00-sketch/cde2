// One portable project state for AI handoff, editable ZIPs, and renderer ZIPs.
const CDE2_VERSION=36;
function projectJsonFile(files,path,value){files.set(path,{bytes:enc.encode(JSON.stringify(value,null,2)),mime:"application/json"});}
function projectOwnedPath(files,preferred,old){
  if(old&&files.has(old))return old;
  let p=preferred,n=2;const at=preferred.lastIndexOf("."),hasExt=at>preferred.lastIndexOf("/"),stem=hasExt?preferred.slice(0,at):preferred,ext=hasExt?preferred.slice(at):"";
  while(files.has(p))p=stem+"_"+(n++)+ext;return p;
}
async function addProjectState(files,deck){
  for(const p of files.keys())if(/(^|\/)\.(?:dc-audio|dc-voice|dc-bgm|cde2-project)\.json$/i.test(p))files.delete(p);
  const track=(a,kind)=>{if(!a?.dataUrl)return null;const mime=_duMime(a.dataUrl),p=projectOwnedPath(files,".cde2/"+kind+"."+_mimeExt(mime),M.audioOwned?.[kind]);
    files.set(p,{bytes:_duBytes(a.dataUrl),mime});return {path:p,name:a.name||kind,mime};};
  const audio=track(M.dcAudio,"voice"),bgm=track(M.dcBgm,"bgm"),comments=[];
  for(const c of M.comments||[]){const row={...c,atts:[]};for(const a of c.atts||[]){
    if(!a.file)throw new Error("コメント添付を読めません: "+a.name);
    const p=projectOwnedPath(files,".cde2/attachments/"+_safeFn(a.expName||a.name),a.projectPath);
    const bytes=new Uint8Array(await a.file.arrayBuffer());files.set(p,{bytes,mime:a.mime||a.file.type||mimeOf(a.name)});
    row.atts.push({name:a.name,mime:a.mime||a.file.type,kind:a.kind,expName:a.expName,path:p});
  }comments.push(row);}
  const meta={schema:"cde2.project/v1",cde2Version:CDE2_VERSION,deck,audio,bgm,bgmVolume:M.bgmVol??0.25,bgmFade:M.bgmFade!==false,comments};
  projectJsonFile(files,".cde2-project.json",meta);
  if(audio){projectJsonFile(files,".dc-audio.json",audio);projectJsonFile(files,".dc-voice.json",audio);}
  if(bgm)projectJsonFile(files,".dc-bgm.json",{...bgm,volume:meta.bgmVolume,fade:meta.bgmFade});
  return meta;
}
function restoreProjectMetadata(){
  const read=name=>{const p=_findSidecar(name);return p?JSON.parse(dec.decode(M.files.get(p).bytes)):null;};
  const track=row=>{if(!row)return null;const f=M.files.get(row.path);if(!f)throw new Error("保存済みの音声がありません: "+row.path);const mime=row.mime||f.mime;return {name:row.name||baseName(row.path),path:row.path,mime,dataUrl:"data:"+mime+";base64,"+u8ToB64(f.bytes)};};
  const meta=read(".cde2-project.json");
  if(meta){
    if(meta.schema!=="cde2.project/v1")throw new Error("この作品の保存形式には未対応です");
    M.dcAudio=track(meta.audio);M.dcBgm=track(meta.bgm);M.audioSelectionExplicit=true;
    M.audioOwned={voice:meta.audio?.path||null,bgm:meta.bgm?.path||null};
    M.bgmVol=Number.isFinite(meta.bgmVolume)?Math.max(0,Math.min(1,meta.bgmVolume)):0.25;M.bgmFade=meta.bgmFade!==false;
    M.comments=(meta.comments||[]).map(c=>({...c,atts:(c.atts||[]).map(a=>{const f=M.files.get(a.path);if(!f)throw new Error("保存済みの添付がありません: "+a.path);const file=new Blob([f.bytes],{type:a.mime||f.mime});return {...a,file,url:URL.createObjectURL(file),projectPath:a.path};})}));
    return;
  }
  const voice=read(".dc-voice.json")||read(".dc-audio.json"),bgm=read(".dc-bgm.json");
  if(voice){M.dcAudio=track(voice);M.audioSelectionExplicit=true;}
  if(bgm){M.dcBgm=track(bgm);M.bgmVol=Number.isFinite(bgm.volume)?Math.max(0,Math.min(1,bgm.volume)):0.25;M.bgmFade=bgm.fade!==false;}
}
