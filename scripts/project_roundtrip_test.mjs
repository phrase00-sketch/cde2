import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath,pathToFileURL} from 'node:url';
import puppeteer from 'puppeteer';
import JSZip from 'jszip';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const target=path.resolve(process.env.CDE2_TEST_HTML||path.join(root,'index.html'));
const jszip=fs.readFileSync(path.join(root,'node_modules/jszip/dist/jszip.min.js'));
const errors=[];let exportFiles={};
const server=http.createServer((req,res)=>{const u=new URL(req.url,'http://localhost');
  if(u.pathname.startsWith('/out/')){const p=decodeURIComponent(u.pathname.slice(5)),b=exportFiles[p];if(!b){res.writeHead(404);res.end('missing');return;}res.setHeader('Content-Type',p.endsWith('.svg')?'image/svg+xml':'text/html; charset=utf-8');res.end(Buffer.from(b,'base64'));return;}
  res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fs.readFileSync(target));});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
const browser=await puppeteer.launch({headless:true,args:['--autoplay-policy=no-user-gesture-required','--no-sandbox']});
function wav(hz,duration=2){const n=8000*duration,b=Buffer.alloc(44+n*2);b.write('RIFF');b.writeUInt32LE(b.length-8,4);b.write('WAVEfmt ',8);b.writeUInt32LE(16,16);b.writeUInt16LE(1,20);b.writeUInt16LE(1,22);b.writeUInt32LE(8000,24);b.writeUInt32LE(16000,28);b.writeUInt16LE(2,32);b.writeUInt16LE(16,34);b.write('data',36);b.writeUInt32LE(n*2,40);for(let i=0;i<n;i++)b.writeInt16LE(Math.round(Math.sin(2*Math.PI*hz*i/8000)*1000),44+i*2);return b;}
const a=wav(220),b=wav(440),voice=wav(660),bgm=wav(880);
const svg='<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="red"/></svg>';
function deck(name,extra=''){return `<!doctype html><html><head><meta charset="utf-8"><title>Fixture</title><style>body{margin:0;background:#123;color:white}.stage{width:640px;height:360px}h1{font:36px sans-serif}</style></head><body><div class="stage" data-om-exportable-video-with-duration-secs="2" data-om-sync-seek="true"><h1>${name} 日本語</h1>${extra}<span id="time">0</span></div><script>const BOUNDS=[0,1];const duration=2;const untouched='日本\\u0026米国';document.querySelector('.stage').addEventListener('data-om-seek-to-time-frame',e=>document.querySelector('#time').textContent=e.detail.time);</script></body></html>`;}
async function fresh(context,fileMode=false){const p=await context.newPage();await p.setViewport({width:1500,height:1000});p.on('pageerror',e=>errors.push(e.message));await p.setRequestInterception(true);p.on('request',r=>{if(r.url().includes('/jszip@3.10.1/'))r.respond({status:200,contentType:'text/javascript',body:jszip});else r.continue();});await p.goto(fileMode?pathToFileURL(target).href:base,{waitUntil:'load'});await p.waitForFunction('typeof WORKSPACE!=="undefined" && WORKSPACE.ready');return p;}
async function load(p,name,files){const z=new JSZip();for(const [key,value] of Object.entries(files))z.file(key,value);const data=(await z.generateAsync({type:'nodebuffer'})).toString('base64');await p.evaluate(async ({name,data})=>loadFile(new File([Uint8Array.from(atob(data),c=>c.charCodeAt(0))],name,{type:'application/zip'})),{name,data});await p.waitForFunction(()=>!WORKSPACE.loading&&!!document.querySelector('#frame').contentDocument?.querySelector('.stage'));}
async function audio(p,id,data,name){await p.evaluate(({id,data,name})=>{const input=document.getElementById(id),dt=new DataTransfer();dt.items.add(new File([Uint8Array.from(atob(data),c=>c.charCodeAt(0))],name,{type:'audio/wav'}));input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));},{id,data:data.toString('base64'),name});await p.waitForFunction((id,name)=>(id==='audFile'?M.dcAudio:M.dcBgm)?.name===name,{},id,name);}
async function comment(p,text){await p.evaluate(text=>{openCommentDialog({mode:'select',text:'日本語',rectN:{x:0,y:0,w:0,h:0}});document.querySelector('#cmDlgText').value=text;document.querySelector('#cmDlgSave').click();},text);}
async function edit(p,value){await p.evaluate(value=>{renderTextEditor();const t=[...document.querySelectorAll('.tinput')].find(e=>e.value.endsWith(' 日本語'));if(!t)throw new Error('Text field missing');t.value=value;t.dispatchEvent(new Event('input',{bubbles:true}));checkpointProject();},value);}
async function output(p,fn){return p.evaluate(async fn=>{const captures=[];download=(blob,name)=>captures.push({blob,name});await window[fn]();if(!captures.length)throw new Error(document.querySelector('#status').textContent);const files={};for(const c of captures){const z=await JSZip.loadAsync(c.blob);for(const [p,f] of Object.entries(z.files))if(!f.dir)files[p]=await f.async('base64');}return files;},fn);}
const bytesMap=files=>Object.fromEntries(Object.entries(files).map(([p,b])=>[p,Buffer.from(b,'base64')]));
async function tracks(p){return p.evaluate(()=>({voice:M.dcAudio?.dataUrl?.split(',')[1]||null,bgm:M.dcBgm?.dataUrl?.split(',')[1]||null,volume:M.bgmVol,fade:M.bgmFade,comments:M.comments.map(c=>c.comment)}));}
async function test(name,run){if(process.env.CDE2_TEST_FILTER&&!name.includes(process.env.CDE2_TEST_FILTER))return;const context=await browser.createBrowserContext();try{await run(context);console.log('PASS: '+name);}catch(e){for(const p of await context.pages())try{console.error(JSON.stringify(await p.evaluate(()=>({status:document.querySelector('#status')?.textContent,files:typeof M==='undefined'?null:[...M.files.keys()],deck:typeof M==='undefined'?null:M.dcPath,images:[...(document.querySelector('#frame')?.contentDocument||document).querySelectorAll('img')].map(x=>({src:x.getAttribute('src')?.slice(0,180),width:x.naturalWidth}))}))));}catch{}throw e;}finally{await context.close();}}
try{
await test('project switching and failed imports preserve independent state',async c=>{
  const p=await fresh(c);await load(p,'A.zip',{'deck.html':deck('A'),'audio/a.wav':a});await audio(p,'bgmFile',bgm,'A-bgm.wav');await comment(p,'Only for A');
  await load(p,'B.zip',{'deck.html':deck('B'),'audio/b.wav':b});assert.deepEqual(await tracks(p),{voice:b.toString('base64'),bgm:null,volume:.25,fade:true,comments:[]});
  const before=await p.evaluate(()=>({code:currentJsxText(),files:[...M.files.keys()],id:M.projectId}));
  await p.evaluate(async()=>{for(const f of [new File(['bad zip'],'bad.zip'),new File(['bad'],'bad.txt')]){let failed=false;try{await loadFile(f);}catch(e){failed=true;}if(!failed)throw new Error('Invalid file accepted');}});
  assert.deepEqual(await p.evaluate(()=>({code:currentJsxText(),files:[...M.files.keys()],id:M.projectId})),before);
  await assert.rejects(load(p,'broken-state.zip',{'deck.html':deck('broken'),'.cde2-project.json':JSON.stringify({schema:'cde2.project/v1',deck:'deck.html',audio:{path:'missing.wav'}})}));
  assert.deepEqual(await p.evaluate(()=>({code:currentJsxText(),files:[...M.files.keys()],id:M.projectId})),before);
  const native=deck('Runtime').replace('<div class="stage"','<x-dc><div class="stage"').replace('</div><script>','<sc-if value="s1"></sc-if></div></x-dc><script>'),runtime='window.localRuntimeLoaded = 1;';
  await load(p,'runtime.zip',{'deck.dc.html':native,'support.js':runtime});assert.equal(await p.evaluate(()=>localStorage.getItem(RT_KEY_S)),runtime);
  await assert.rejects(load(p,'bad-runtime.zip',{'deck.dc.html':native,'support.js':'// rejected runtime','.cde2-project.json':JSON.stringify({schema:'unsupported',deck:'deck.dc.html'})}));assert.equal(await p.evaluate(()=>localStorage.getItem(RT_KEY_S)),runtime);
  await load(p,'no-runtime.zip',{'deck.dc.html':native});assert.equal(await p.evaluate(()=>dec.decode(M.files.get(M.supportPath).bytes)),runtime);await p.waitForFunction(()=>document.querySelector('#frame').contentWindow.localRuntimeLoaded===1);
});
await test('text edit preserves untouched HTML entities and JS escapes',async c=>{
  const p=await fresh(c),source=deck('Edit','<p id="untouched">日本 &amp; 米国 &#169;</p>');await load(p,'text.zip',{'deck.html':source});await edit(p,'Edited 日本語');
  assert.equal(await p.evaluate(()=>currentJsxText()),source.replace('Edit 日本語','Edited 日本語'));
  await p.waitForFunction(()=>document.querySelector('#frame').contentDocument.querySelector('h1')?.textContent==='Edited 日本語');
  assert.equal(await p.evaluate(()=>document.querySelector('#frame').contentDocument.querySelector('#untouched').textContent),'日本 & 米国 ©');
  await p.evaluate(()=>travelHistory(-1));assert.equal(await p.evaluate(()=>currentJsxText()),source);
  await p.evaluate(()=>travelHistory(1));assert.equal(await p.evaluate(()=>currentJsxText()),source.replace('Edit 日本語','Edited 日本語'));
});
await test('AI delta, full ZIP, project ZIP, and renderer ZIP preserve tracks and comments',async c=>{
  const p=await fresh(c),original={'project/deck.html':deck('Tracks'),'audio/old.wav':a};await load(p,'tracks.zip',original);
  await audio(p,'audFile',voice,'new-voice.wav');await audio(p,'bgmFile',bgm,'new-bgm.wav');await comment(p,'Keep current edits');
  await p.evaluate(()=>{M.bgmVol=.17;M.bgmFade=false;addAtt(M.comments[0],[new File(['attachment payload'],'reference.png',{type:'image/png'})]);});
  for(const fn of ['exportDeltaBundle','exportFullSplitBundles','exportProjectZip','exportDcZip']){
    const out=await output(p,fn);assert.ok(Object.values(out).includes(voice.toString('base64')),fn+' voice');assert.ok(Object.values(out).includes(bgm.toString('base64')),fn+' bgm');
    const state=JSON.parse(Buffer.from(out['.cde2-project.json'],'base64'));assert.equal(state.cde2Version,36);
    const q=await fresh(c);await load(q,'roundtrip.zip',{...original,...bytesMap(out)});
    assert.deepEqual(await tracks(q),{voice:voice.toString('base64'),bgm:bgm.toString('base64'),volume:.17,fade:false,comments:['Keep current edits']});
    assert.equal(await q.evaluate(()=>M.comments[0].atts[0].file.text()),'attachment payload');await q.close();
  }
});
await test('native decks restore legacy audio metadata and explicit cleared tracks',async c=>{
  const p=await fresh(c),native=deck('Native').replace('<div class="stage"','<x-dc><div class="stage"').replace('</div><script>','<sc-if value="s1"></sc-if></div></x-dc><script>');
  const files={'deck.dc.html':native,'support.js':'// minimal local fixture runtime','audio/v.wav':voice,'audio/b.wav':bgm,'.dc-voice.json':JSON.stringify({path:'audio/v.wav',mime:'audio/wav',name:'voice'}),'.dc-bgm.json':JSON.stringify({path:'audio/b.wav',mime:'audio/wav',name:'bgm',volume:.3,fade:false})};
  await load(p,'native.zip',files);assert.equal((await tracks(p)).bgm,bgm.toString('base64'));
  await p.evaluate(()=>{M.dcBgm=null;M.dcAudio=null;M.audioSelectionExplicit=true;});const out=await output(p,'exportProjectZip');const q=await fresh(c);await load(q,'cleared.zip',bytesMap(out));assert.equal((await tracks(q)).voice,null);assert.equal((await tracks(q)).bgm,null);
});
await test('nested HTML export keeps image references working outside the editor',async c=>{
  const p=await fresh(c);await load(p,'nested.zip',{'project/deck.html':deck('Nested','<img id="asset" src="assets/red.svg">'),'project/assets/red.svg':svg});
  await p.waitForFunction(()=>document.querySelector('#frame').contentDocument.querySelector('#asset')?.naturalWidth>0);
  exportFiles=await output(p,'exportDcZip');const manifest=JSON.parse(Buffer.from(exportFiles['manifest.json'],'base64'));assert.equal(manifest.deck,'project/deck.dc.html');const q=await c.newPage();await q.goto(base+'/out/'+manifest.deck);await q.waitForFunction(()=>document.querySelector('#asset').naturalWidth===100);
});
await test('undo and redo restore comments, media replacement, and inserted audio',async c=>{
  const p=await fresh(c);await load(p,'history.zip',{'deck.html':deck('History'),'assets/red.svg':svg});await comment(p,'Undo me');await p.evaluate(()=>checkpointProject());await p.evaluate(()=>travelHistory(-1));assert.deepEqual((await tracks(p)).comments,[]);await p.evaluate(()=>travelHistory(1));assert.deepEqual((await tracks(p)).comments,['Undo me']);
  await audio(p,'audFile',voice,'voice.wav');await p.evaluate(()=>checkpointProject());await p.evaluate(()=>travelHistory(-1));assert.equal((await tracks(p)).voice,null);await p.evaluate(()=>travelHistory(1));assert.equal((await tracks(p)).voice,voice.toString('base64'));
  await p.evaluate(async()=>{await replaceAssetWithFile('assets/red.svg',new File(['replacement'],'red.svg',{type:'image/svg+xml'}));checkpointProject();});await p.evaluate(()=>travelHistory(-1));assert.equal(await p.evaluate(()=>dec.decode(M.files.get('assets/red.svg').bytes)),svg);
});
await test('draft survives reload with editable tracks and comments',async c=>{
  const p=await fresh(c);await load(p,'draft.zip',{'deck.html':deck('Draft')});await edit(p,'Saved 日本語');await audio(p,'audFile',voice,'voice.wav');await audio(p,'bgmFile',bgm,'bgm.wav');await comment(p,'Saved comment');await p.evaluate(()=>saveDraft());await p.close();
  const q=await fresh(c);await q.click('#projectDrafts');await q.waitForSelector('#draftList button');await q.click('#draftList button');await q.waitForFunction(()=>currentJsxText().includes('Saved 日本語'));assert.equal((await tracks(q)).voice,voice.toString('base64'));assert.deepEqual((await tracks(q)).comments,['Saved comment']);
});
await test('undo and recovery rebuild local module graphs once',async c=>{
  const p=await fresh(c),source=deck('Modules').replace('</body>','<script type="module" src="./main.js"></script></body>');
  await load(p,'modules.zip',{'deck.html':source,'main.js':'import { value } from "./dep.js"; window.moduleReady = value;', 'dep.js':'export const value = 42;'});
  const ready=()=>p.waitForFunction(()=>document.querySelector('#frame').contentWindow.moduleReady===42);
  await ready();await edit(p,'Changed 日本語');await p.waitForFunction(()=>document.querySelector('#frame').contentDocument.querySelector('h1')?.textContent==='Changed 日本語');await ready();
  await p.evaluate(()=>travelHistory(-1));await ready();assert.equal(await p.evaluate(()=>currentJsxText()),source);
  await p.evaluate(()=>travelHistory(1));await ready();await p.evaluate(()=>saveDraft());await p.close();
  const q=await fresh(c);await q.click('#projectDrafts');await q.waitForSelector('#draftList button');await q.click('#draftList button');await q.waitForFunction(()=>document.querySelector('#frame').contentWindow.moduleReady===42);
});
await test('slot assignments survive undo, redo, and project ZIP recovery',async c=>{
  const p=await fresh(c);await load(p,'slots.zip',{'deck.html':deck('Slots','<div data-img-slot="hero" style="width:100px;height:100px"></div>')});
  await p.evaluate(svg=>assignImgSlot('hero',new File([svg],'hero.svg',{type:'image/svg+xml'})),svg);
  await p.waitForFunction(()=>M.imgAssign.hero?.dataUrl);await p.evaluate(()=>checkpointProject());
  await p.evaluate(()=>travelHistory(-1));assert.equal(await p.evaluate(()=>!!M.imgAssign.hero),false);
  await p.evaluate(()=>travelHistory(1));assert.equal(await p.evaluate(()=>M.imgAssign.hero.file.text()),svg);
  const out=await output(p,'exportProjectZip'),q=await fresh(c);await load(q,'slot-restored.zip',bytesMap(out));assert.equal(await q.evaluate(()=>M.imgAssign.hero.file.text()),svg);
  const width=await q.evaluate(async()=>{const w=document.querySelector('#frame').contentWindow,el=w.document.querySelector('[data-img-slot="hero"]'),bg=w.getComputedStyle(el).backgroundImage,url=bg.slice(5,-2),img=new w.Image();img.src=url;try{await img.decode();}catch(e){throw new Error('Slot image: '+bg+' HTML: '+el.outerHTML);}return img.naturalWidth;});assert.equal(width,100);
});
await test('preflight ignores module documentation but reports actual missing references',async c=>{
  const p=await fresh(c);await load(p,'references.zip',{'deck.html':deck('References'), 'library.js':'/* import x from "./example.js"; new URL("https://example.invalid/model.glb"); */\n// import "./unused.js";\nimport "./required.js";'});
  const report=await p.evaluate(()=>inspectProject());assert.deepEqual(report.missing,['library.js → ./required.js']);assert.deepEqual(report.external,[]);
});
await test('preflight exposes missing assets and duration mismatch before export',async c=>{
  const p=await fresh(c);await load(p,'review.zip',{'deck.html':deck('Review','<img src="missing.png">'),'audio/voice.wav':wav(330,3),'audio/alternate.wav':a});await audio(p,'audFile',wav(330,3),'three.wav');await p.click('#expZip');await p.waitForFunction(()=>!document.querySelector('#preflightGo').disabled);
  const text=await p.$eval('#preflightBody',e=>e.textContent);assert.match(text,/missing\.png/);assert.match(text,/1\.00 秒/);
  await p.select('#projectVoiceSelect','none');await p.waitForFunction(()=>!document.querySelector('#preflightGo').disabled&&M.dcAudio===null);assert.equal((await tracks(p)).voice,null);
});
await test('local file opening supports autosave and recovery',async c=>{
  const p=await fresh(c,true);await load(p,'local.zip',{'deck.html':deck('Local')});await edit(p,'Recovered 日本語');await p.evaluate(()=>saveDraft());await p.close();const q=await fresh(c,true);await q.click('#projectDrafts');await q.waitForSelector('#draftList button');await q.click('#draftList button');await q.waitForFunction(()=>currentJsxText().includes('Recovered 日本語'));
});
await test('storage failure retains edits and project ZIP allows safe switching',async c=>{
  const p=await fresh(c);await load(p,'storage.zip',{'deck.html':deck('Storage')});await p.evaluate(()=>{draftTransaction=async()=>{throw new Error('Quota exceeded');};});await edit(p,'Unsaved 日本語');
  await assert.rejects(load(p,'blocked.zip',{'deck.html':deck('Blocked')}),/作品ZIP/);assert.ok(await p.evaluate(()=>currentJsxText().includes('Unsaved 日本語')));
  await output(p,'exportProjectZip');await load(p,'next.zip',{'deck.html':deck('Next')});assert.ok(await p.evaluate(()=>currentJsxText().includes('Next 日本語')));
});
await test('export review button produces a silent renderer track for cleared narration',async c=>{
  const p=await fresh(c);await load(p,'silent.zip',{'nested/deck.html':deck('Silent'),'nested/audio/old.wav':a});
  await p.evaluate(()=>{window.reviewCapture=null;download=(blob,name)=>{window.reviewCapture={blob,name};};});await p.click('#expZip');await p.waitForFunction(()=>!document.querySelector('#preflightGo').disabled);
  await p.select('#projectVoiceSelect','none');await p.waitForFunction(()=>!document.querySelector('#preflightGo').disabled&&M.dcAudio===null);await p.click('#preflightGo');await p.waitForFunction(()=>!!window.reviewCapture&&!WORKSPACE.exporting);
  const data=await p.evaluate(async()=>u8ToB64(new Uint8Array(await window.reviewCapture.blob.arrayBuffer()))),zip=await JSZip.loadAsync(Buffer.from(data,'base64'));
  const state=JSON.parse(await zip.file('.cde2-project.json').async('string')),pointer=JSON.parse(await zip.file('nested/.dc-audio.json').async('string'));assert.equal(state.audio,null);assert.equal(pointer.path,'../.cde2/render-silence.wav');
  const wav=await zip.file('.cde2/render-silence.wav').async('nodebuffer');assert.ok(wav.subarray(44).every(v=>v===0));
});
await test('explicit preview time hooks update scenes and preserve independent cue clocks',async c=>{
  for(const narrated of [false,true]){
    const p=await fresh(c);
    const source=`<!doctype html><html><head><style>body{margin:0}.stage{width:640px;height:360px;background:#123}#cue{width:40px;height:40px;background:red;animation:move 2s linear both}@keyframes move{to{transform:translateX(100px)}}</style></head><body><div class="stage"><div id="scene">0</div><div id="cue"></div></div><script>
    const BOUNDS=[0,0.5,1,1.5];const duration=2;
    function seek(t){window.seekTime=t;document.getElementById('scene').textContent=String(Math.floor(t/0.5));for(const a of document.getAnimations()){a.currentTime=(t-(t>=0.75?0.75:0))*1000;}}
    ${narrated?"window.__DECK__={marker:42,renderAt(t){if(this.marker!==42)throw Error('lost receiver');seek(t)}};window.renderAt=()=>{throw Error('wrong hook priority')};":"window.renderAt=seek;"}
    </script></body></html>`;
    await load(p,'explicit.zip',{'deck.html':source,...(narrated?{'audio/voice.wav':a}:{})});
    const frame=await (await p.$('#frame')).contentFrame();
    await frame.waitForFunction(()=>typeof window.renderAt==='function');
    if(narrated){
      await frame.waitForFunction(()=>document.getElementById('__dcAud')?.readyState>=2);
      const samples=await frame.evaluate(async()=>{
        const a=document.getElementById('__dcAud');a.currentTime=0;await a.play();
        return await new Promise(resolve=>{const rows=[];function sample(){const t=a.currentTime;rows.push({t,seek:window.seekTime,scene:Number(document.getElementById('scene').textContent)});if(t>=1.7){a.pause();resolve(rows);}else requestAnimationFrame(sample);}requestAnimationFrame(sample);});
      });
      assert.ok(samples.length>20);
      for(const r of samples){assert.ok(Math.abs(r.t-r.seek)<0.04,JSON.stringify(r));if(Math.abs(r.t*2-Math.round(r.t*2))>0.08)assert.equal(r.scene,Math.floor(r.t/0.5));}
    }
    await frame.evaluate(()=>window.postMessage({__dcAudCmd:1,cmd:'pause'},'*'));
    for(const t of [.9,.1,1.6]){
      await frame.evaluate(t=>window.postMessage({__dcAudCmd:1,cmd:'seek',value:t},'*'),t);
      await frame.waitForFunction(t=>Math.abs(window.seekTime-t)<.002,{},t);
      const state=await frame.evaluate(()=>({scene:Number(document.getElementById('scene').textContent),time:document.getAnimations()[0].currentTime}));
      assert.equal(state.scene,Math.floor(t/.5));assert.ok(Math.abs(state.time-(t-(t>=.75?.75:0))*1000)<2,JSON.stringify(state));
    }
    await p.close();
  }
});
await test('absolute CSS scene delays progress without resetting legacy clocks',async c=>{
  for(const mode of ["absolute","renamed-overlays","explicit","relative","explicit-relative","mismatch"]){
    const absolute=["absolute","renamed-overlays","explicit"].includes(mode);
    const p=await fresh(c);
    let source=`<!doctype html><html><head><style>@keyframes visible{0%,99.99%{opacity:1}100%{opacity:0}}.stage{position:relative;width:640px;height:360px}section{position:absolute;inset:0;opacity:0;animation:visible .5s linear forwards;animation-delay:var(--t0)}</style></head><body><div class="stage" ${mode!=="relative"?'data-cde-stage="true" data-render-mode="css" data-bounds="[0,0.5,1,1.5]"':''} ${mode==='explicit'?'data-cde-time-mode="absolute"':mode==='explicit-relative'?'data-cde-time-mode="scene-relative"':''}>${[0,.5,1,1.5].map((t,i)=>`<section id="s${i}" data-screen-label="${i}" style="--t0:${t}s">${i}</section>`).join('')}</div><script>const BOUNDS=[0,.5,1,1.5];const duration=2;</script></body></html>`;
    if(mode==='renamed-overlays')source=source.replaceAll('--t0','--s').replace('</div><script>','<aside>Global captions</aside></div><script>');
    if(mode==='explicit')source=source.replaceAll(/ data-screen-label="[^"]*"/g,'');
    if(mode==='mismatch')source=source.replace('data-bounds="[0,0.5,1,1.5]"','data-bounds="[0,0.4,1,1.5]"');
    await load(p,'css.zip' ,{'deck.html':source,'voice.wav':a});
    const frame=await (await p.$('#frame')).contentFrame();
    await frame.waitForFunction(()=>document.getElementById('__dcAud')?.readyState>=2);
    for(const t of [.7,1.7,.1,1.2]){
      await frame.evaluate(t=>window.postMessage({__dcAudCmd:1,cmd:'seek',value:t},'*'),t);
      await frame.waitForFunction(t=>Math.abs(document.getElementById('__dcAud').currentTime-t)<.001,{},t);
      await new Promise(r=>setTimeout(r,80));
      const state=await frame.evaluate(()=>({visible:[...document.querySelectorAll('section')].filter(e=>+getComputedStyle(e).opacity>.5).map(e=>e.id),time:document.getAnimations()[0].currentTime}));
      assert.deepEqual(state.visible,['s'+(absolute?Math.floor(t/.5):0)],JSON.stringify({mode,t,state}));
      assert.ok(Math.abs(state.time-(absolute?t:t%0.5)*1000)<2,JSON.stringify(state));
    }
    await p.close();
  }
});
assert.deepEqual(errors,[],'Unexpected browser errors');console.log('PASS: complete v36 browser suite ('+path.basename(target)+')');
}catch(e){console.error(e.stack);process.exitCode=1;}finally{await browser.close();server.close();}
