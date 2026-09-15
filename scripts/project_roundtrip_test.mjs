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
const modernScreenshot=fs.readFileSync(path.join(root,'node_modules/modern-screenshot/dist/index.js'));
let fontRoutes=null;
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
async function fresh(context,fileMode=false){const p=await context.newPage();await p.setViewport({width:1500,height:1000});p.on('pageerror',e=>errors.push(e.message));await p.setRequestInterception(true);p.on('request',r=>{if(fontRoutes&&r.url().startsWith('https://cde2-fonts.test/'))r.respond(fontRoutes(r));else if(r.url().includes('/modern-screenshot@4.4.39/'))r.respond({status:200,contentType:'text/javascript',body:modernScreenshot});else if(r.url().includes('/jszip@3.10.1/'))r.respond({status:200,contentType:'text/javascript',body:jszip});else r.continue();});await p.goto(fileMode?pathToFileURL(target).href:base,{waitUntil:'load'});await p.waitForFunction('typeof WORKSPACE!=="undefined" && WORKSPACE.ready');return p;}
async function load(p,name,files){const z=new JSZip();for(const [key,value] of Object.entries(files))z.file(key,value);const data=(await z.generateAsync({type:'nodebuffer'})).toString('base64');await p.evaluate(async ({name,data})=>loadFile(new File([Uint8Array.from(atob(data),c=>c.charCodeAt(0))],name,{type:'application/zip'})),{name,data});await p.waitForFunction(()=>!WORKSPACE.loading&&!!document.querySelector('#frame').contentDocument?.querySelector('.stage'));}
async function audio(p,id,data,name){await p.evaluate(({id,data,name})=>{const input=document.getElementById(id),dt=new DataTransfer();dt.items.add(new File([Uint8Array.from(atob(data),c=>c.charCodeAt(0))],name,{type:'audio/wav'}));input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));},{id,data:data.toString('base64'),name});await p.waitForFunction((id,name)=>(id==='audFile'?M.dcAudio:M.dcBgm)?.name===name,{},id,name);}
async function comment(p,text){await p.evaluate(text=>{openCommentDialog({mode:'select',text:'日本語',rectN:{x:0,y:0,w:0,h:0}});document.querySelector('#cmDlgText').value=text;document.querySelector('#cmDlgSave').click();},text);}
async function edit(p,value){await p.evaluate(value=>{renderTextEditor();const t=[...document.querySelectorAll('.tinput')].find(e=>e.value.endsWith(' 日本語'));if(!t)throw new Error('Text field missing');t.value=value;t.dispatchEvent(new Event('input',{bubbles:true}));checkpointProject();},value);}
async function output(p,fn){return p.evaluate(async fn=>{const captures=[];download=(blob,name)=>captures.push({blob,name});await window[fn]();if(!captures.length)throw new Error(document.querySelector('#status').textContent);const files={};for(const c of captures){const z=await JSZip.loadAsync(c.blob);for(const [p,f] of Object.entries(z.files))if(!f.dir)files[p]=await f.async('base64');}return files;},fn);}
const bytesMap=files=>Object.fromEntries(Object.entries(files).map(([p,b])=>[p,Buffer.from(b,'base64')]));
async function tracks(p){return p.evaluate(()=>({voice:M.dcAudio?.dataUrl?.split(',')[1]||null,bgm:M.dcBgm?.dataUrl?.split(',')[1]||null,volume:M.bgmVol,fade:M.bgmFade,comments:M.comments.map(c=>c.comment)}));}
async function test(name,run){if(process.env.CDE2_TEST_FILTER&&!name.includes(process.env.CDE2_TEST_FILTER))return;const context=await browser.createBrowserContext();try{await run(context);console.log('PASS: '+name);}catch(e){for(const p of await context.pages())try{console.error(JSON.stringify(await p.evaluate(()=>({status:document.querySelector('#status')?.textContent,files:typeof M==='undefined'?null:[...M.files.keys()],deck:typeof M==='undefined'?null:M.dcPath,images:[...(document.querySelector('#frame')?.contentDocument||document).querySelectorAll('img')].map(x=>({src:x.getAttribute('src')?.slice(0,180),width:x.naturalWidth}))}))));}catch{}throw e;}finally{await context.close();}}
try{
await test('PNG preserves cross-origin Japanese fonts, weights, imports, and retry state',async c=>{
  let blocked=false;const requested=[];
  const face=(weight,range='U+0041,U+4E2D',file='png-font-'+weight+'.woff')=>`@font-face{font-family:CaptureSquares; font-weight:${weight}; src:url("${file}") format("woff"); unicode-range:${range};}`;
  fontRoutes=r=>{
    const url=new URL(r.url());requested.push(url.pathname);
    const response={status:200,headers:{'access-control-allow-origin':'*','cache-control':'no-store'}};
    if(blocked&&r.resourceType()==='fetch')return {...response,status:503,body:'unavailable'};
    if(url.pathname==='/font.css')return {...response,contentType:'text/css',body:'@import url("nested/weights.css");'};
    if(url.pathname==='/nested/weights.css')return {...response,contentType:'text/css',body:face(400)+face(900)+face(400,'U+9000-9FFF','unused.woff')};
    if(/\/png-font-(400|900)\.woff$/.test(url.pathname))return {...response,contentType:'font/woff',body:fs.readFileSync(path.join(root,'scripts/fixtures',path.basename(url.pathname)))};
    return {...response,status:404,body:'unexpected resource'};
  };
  try{for(const fileMode of [false,true]){
    const p=await fresh(c,fileMode);
    const source=deck('Fonts').replace('<style>','<link rel="stylesheet" href="https://cde2-fonts.test/font.css"><style>')
      .replace('<div class="stage"','<div data-cde-stage="1" class="stage" style="width:640px;height:360px;background:#0a1733;color:white;filter:brightness(1)"')
      .replace('<h1>Fonts 日本語</h1>','<div style="font:400 100px/140px CaptureSquares,serif">A中</div><div style="font:900 100px/140px CaptureSquares,serif">中A</div>');
    await load(p,'font-fixture.zip',{'deck.html':source});
    const f=await (await p.$('#frame')).contentFrame();await f.evaluate(()=>document.fonts.ready);
    assert.equal(await f.evaluate(()=>{try{[...document.styleSheets].find(s=>s.href?.includes('cde2-fonts.test')).cssRules;return false;}catch(e){return e.name==='SecurityError';}}),true,'Fixture must reproduce an unreadable cross-origin stylesheet');
    const frameStyle=await p.evaluate(()=>{const e=document.querySelector('#frame'),s=e.getAttribute('style');e.style.cssText='position:fixed;left:0;top:0;width:640px;height:360px;z-index:2147483647;border:0;max-width:none;max-height:none';return s;});
    await new Promise(r=>setTimeout(r,200));
    const reference=Buffer.from(await p.screenshot({clip:{x:0,y:0,width:640,height:360}})).toString('base64');
    await p.evaluate(s=>{const e=document.querySelector('#frame');s===null?e.removeAttribute('style'):e.setAttribute('style',s);},frameStyle);
    await p.evaluate(()=>{window.fontPngs=[];download=async blob=>{window.fontPngs.push(u8ToB64(new Uint8Array(await blob.arrayBuffer())));};});
    const original=await f.evaluate(()=>document.querySelector('.stage').getAttribute('style'));
    blocked=true;await p.evaluate(()=>exportDcPng({w:640,h:360}));
    assert.equal(await p.evaluate(()=>M._pngBusy),false);
    assert.match(await p.$eval('#status',e=>e.textContent),/PNG用フォントを埋め込めませんでした/);
    assert.equal(await p.evaluate(()=>fontPngs.length),0,'Never download an image with silently substituted fonts');
    assert.equal(await f.evaluate(()=>document.querySelector('.stage').getAttribute('style')),original);
    blocked=false;
    for(let capture=0;capture<2;capture++){
      await p.evaluate(()=>exportDcPng({w:640,h:360}));await p.waitForFunction(n=>fontPngs.length===n,{},capture+1);
      const diff=await p.evaluate(async reference=>{
        async function pixels(src){const im=new Image();im.src='data:image/png;base64,'+src;await im.decode();const c=document.createElement('canvas');c.width=640;c.height=360;const x=c.getContext('2d');x.drawImage(im,0,0);return x.getImageData(0,0,640,360).data;}
        const a=await pixels(reference),b=await pixels(fontPngs.at(-1));let mismatch=0;
        for(let i=0;i<a.length;i+=4)if(Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]))>16)mismatch++;
        return mismatch/(640*360);
      },reference);
      if(diff>=.002&&process.env.CDE2_TEST_ARTIFACTS){fs.mkdirSync(process.env.CDE2_TEST_ARTIFACTS,{recursive:true});fs.writeFileSync(path.join(process.env.CDE2_TEST_ARTIFACTS,'reference.png'),Buffer.from(reference,'base64'));fs.writeFileSync(path.join(process.env.CDE2_TEST_ARTIFACTS,'export.png'),Buffer.from(await p.evaluate(()=>fontPngs.at(-1)),'base64'));}
      assert.ok(diff<.002,'PNG glyphs must match the browser preview, mismatch '+diff);
      assert.equal(await f.evaluate(()=>document.querySelector('.stage').getAttribute('style')),original);
    }
    assert.ok(!requested.some(p=>p.endsWith('/unused.woff')),'Do not download irrelevant Unicode subsets');
    await p.close();
  }}finally{fontRoutes=null;}
});
await test('declared duration survives variable assignments and renderer audio export',async c=>{
  for(const attr of ['data-cde-stage="1" data-duration="2.125"','data-om-exportable-video-with-duration-secs="2.125"']){
    const p=await fresh(c);
    const source=deck('Duration').replace('data-om-exportable-video-with-duration-secs="2"',attr)
      .replace('const duration=2;','const DUR=2.125;window.__DECK__={duration:DUR};');
    await load(p,'duration.zip',{'deck.html':source});
    assert.equal(await p.evaluate(()=>dcParseBounds().dur),2.125);
    await audio(p,'audFile',voice,'voice.wav');await audio(p,'bgmFile',bgm,'bgm.wav');
    const out=await output(p,'exportDcZip');
    const manifest=JSON.parse(Buffer.from(out['manifest.json'],'base64'));
    assert.equal(manifest.duration,2.125);
    const mix=Buffer.from(out[manifest.audio],'base64');
    assert.equal(mix.readUInt32LE(40)/mix.readUInt32LE(28),2.125);
    const q=await fresh(c);await load(q,'saved.zip',bytesMap(out));
    assert.equal(await q.evaluate(()=>dcParseBounds().dur),2.125);
    await q.close();await p.close();
  }
  const p=await fresh(c);
  const cases=[
    ['<div data-cde-stage data-duration="49.065"></div><script>const duration=99;</script>',49.065],
    ['<div data-cde-stage data-duration="NaN"></div><script>const duration=2;</script>',2],
    ['<div data-cde-stage data-duration="-1"></div><script>const BOUNDS=[0,1];</script>',9],
    ['<script>this.duration=2.25;</script>',2.25],
  ];
  for(const [src,expected] of cases)assert.equal(await p.evaluate(src=>{M.dcMode=false;M.dcSource=src;return dcParseBounds().dur;},src),expected);
});
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
await test('declared main and section stages fit and retain export dimensions',async c=>{
  const p=await fresh(c);
  await p.evaluate(()=>{
    const fake='<div data-cde-stage="1" style="width:500px;height:500px">';
    const ignored='<!--'+fake+'--><script>const sample='+JSON.stringify(fake)+';</script><style>/* '+fake+' */</style><title>'+fake+'</title><textarea>'+fake+'</textarea>';
    for(const marker of ['data-cde-stage','data-cde-stage=true','data-cde-stage="1920x1080"']){
      const src=ignored+'<div style="width:800px;height:600px"></div><main '+marker+' title="a > b" style="height:1080px;width:1920px"><div style="width:950px;height:1184px"></div></main>';
      const size=dcStageSize(src),stamped=stampCanonicalStage(src);
      if(size.w!==1920||size.h!==1080||!stamped.includes('<main data-cde-stage="1" title="a > b"')||!stamped.startsWith(ignored))throw new Error('Declared stage or original markup changed');
    }
    const cls='<section class="stage" style="width:1080px;height:1920px"><div style="width:900px;height:900px"></div></section>';
    if(dcStageSize(cls).h!==1920||!stampCanonicalStage(cls).startsWith('<section data-cde-stage="1"'))throw new Error('Stage class fallback failed');
    const legacy='<div style="width:640px;height:360px"><div style="width:900px;height:900px"></div></div>';
    if(dcStageSize(legacy).w!==640)throw new Error('Legacy outer div changed');
  });
  await p.close();
  for(const fileMode of [false,true])for(const [tag,w,h] of [['main',1920,1080],['section',1080,1920]]){
    const p=await fresh(c,fileMode);
    const source=`<!doctype html><html><head><style>body{margin:0}.stage{position:relative;overflow:hidden;background:#123;color:white}h1{font:36px sans-serif}#edge{position:absolute;right:0;bottom:0;width:64px;height:64px;background:rgb(19,241,73)}</style></head><body><div style="display:none;width:800px;height:640px"></div><${tag} class="stage" data-cde-stage="${w}x${h}" data-duration="2" style="width:${w}px;height:${h}px"><div data-cde-stage="1" style="width:950px;height:1184px;position:absolute;left:20px;top:0;background:#234"></div><h1 style="position:relative">Stage 日本語</h1><div id="edge"></div></${tag}><script>const BOUNDS=[0];const duration=2;</script></body></html>`;
    await load(p,'stage.zip',{'deck.dc.html':source});
    assert.deepEqual(await p.evaluate(()=>dcCurStageSize()),{w,h});
    async function fitted(mode){
      await p.select('#previewFitMode',mode);
      const f=await(await p.$('#frame')).contentFrame();
      await f.waitForFunction(()=>window.__cdeFit&&document.querySelector('#__cdePreviewScale'));
      await f.evaluate(()=>window.__cdeFit());
      return f.evaluate(()=>{const s=document.querySelector('.stage'),r=s.getBoundingClientRect(),edge=document.querySelector('#edge').getBoundingClientRect();return {tag:document.querySelector('[data-cde-stage="1"]').tagName,x:r.x,y:r.y,w:r.width,h:r.height,vw:innerWidth,vh:innerHeight,edgeRight:edge.right,edgeBottom:edge.bottom};});
    }
    for(const viewport of [{width:1500,height:1000},{width:1100,height:700}]){
      await p.setViewport(viewport);
      let r=await fitted('contain');
      assert.equal(r.tag,tag.toUpperCase());assert.ok(r.x>=-1&&r.y>=-1&&r.edgeRight<=r.vw+1&&r.edgeBottom<=r.vh+1,JSON.stringify(r));
      r=await fitted('width');assert.ok(Math.abs(r.w-r.vw)<2&&r.x>=-1,JSON.stringify(r));
    }
    await edit(p,'Changed 日本語');await edit(p,'Stage 日本語');
    await fitted('contain');
    for(const fn of ['exportProjectZip','exportDcZip']){
      const out=await output(p,fn),entry=Object.keys(out).find(n=>n.endsWith('.dc.html'));
      const saved=Buffer.from(out[entry],'base64').toString();
      assert.ok(saved.includes(`<${tag} class="stage" data-cde-stage="1"`));assert.ok(!saved.includes('__cdePreviewScale'));
      await load(p,'saved.zip',bytesMap(out));assert.deepEqual(await p.evaluate(()=>dcCurStageSize()),{w,h});await fitted('contain');
    }
    const standalone=await p.evaluate(async()=>{let result;download=blob=>{result=blob;};await exportDcHtml();return result.text();});
    assert.ok(standalone.includes(`<${tag} class="stage" data-cde-stage="1"`));assert.ok(!standalone.includes('__cdePreviewScale'));
    await p.evaluate(async()=>{window.stagePng=null;download=async blob=>{window.stagePng=u8ToB64(new Uint8Array(await blob.arrayBuffer()));};await exportDcPng(dcCurStageSize());});
    await p.waitForFunction(()=>window.stagePng);
    const png=await p.evaluate(async()=>{const im=new Image();im.src='data:image/png;base64,'+window.stagePng;await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const x=c.getContext('2d');x.drawImage(im,0,0);return {w:im.width,h:im.height,pixel:[...x.getImageData(im.width-8,im.height-8,1,1).data]};});
    assert.deepEqual(png,{w,h,pixel:[19,241,73,255]});
    await fitted('contain');await p.close();
  }
});
await test('static x-dc HTML scene ranges and preview fit survive export',async c=>{
  const p=await fresh(c);
  const html='<!doctype html><html><body><x-dc><div class="stage" data-cde-stage="1080x1920" data-render-mode="css" style="position:relative;width:1080px;height:1920px"><!-- SCENE 01 --><div id="S_ONE" data-screen-label="One"><div title="a > b">First <span>nested</span></div></div><!-- SCENE 02: Two --><section id="S_TWO"><div>Second</div></section><div id="overlay">Overlay</div></div></x-dc><script>window.BOUNDS=[0,1];window.duration=2;const example=\'<div data-screen-label="fake"></div>\';</script></body></html>';
  await load(p,'static.zip',{'main.dc.html':html});
  const check=await p.evaluate(()=>{const src=currentJsxText(),b=dcCollectSceneBlocks(src);return {labels:b.map(x=>x.label),parts:b.map(x=>src.slice(x.start,x.end)),first:dcSceneIndexForPos(src,src.indexOf('nested')),overlay:dcSceneIndexForPos(src,src.indexOf('Overlay'))};});
  assert.equal(check.labels.length,2);assert.equal(check.first,0);assert.equal(check.overlay,-1);assert.ok(check.parts[0].endsWith('</div></div>'));assert.ok(!check.parts[0].includes('Second'));
  const f=await(await p.$('#frame')).contentFrame();await f.waitForFunction(()=>document.getElementById('__cdePreviewScale'));
  async function fit(mode){await f.evaluate(mode=>window.postMessage({__cdePreviewFit:1,mode},'*'),mode);await new Promise(r=>setTimeout(r,120));return f.evaluate(()=>{const r=document.querySelector('[data-cde-stage]').getBoundingClientRect();return {w:r.width,h:r.height,x:r.x,y:r.y,vw:innerWidth,vh:innerHeight};});}
  let r=await fit('contain');assert.ok(r.x>=-1&&r.y>=-1&&r.w<=r.vw+1&&r.h<=r.vh+1,JSON.stringify(r));
  r=await fit('width');assert.ok(Math.abs(r.w-r.vw)<2,JSON.stringify(r));
  await p.setViewport({width:1100,height:700});r=await fit('contain');assert.ok(r.h<=r.vh+1&&r.w<=r.vw+1);
  const data=await p.evaluate(async()=>{let saved;download=b=>saved=b;await exportZip();return u8ToB64(new Uint8Array(await saved.arrayBuffer()));});
  const z=await JSZip.loadAsync(Buffer.from(data,'base64'));const file=Object.keys(z.files).find(n=>n.endsWith('.dc.html'));const saved=await z.file(file).async('string');assert.ok(!saved.includes('__cdePreviewScale'));assert.ok(saved.includes('1080'));assert.ok(saved.includes('1920'));
  await load(p,'again.zip',{'main.dc.html':saved});assert.equal(await p.evaluate(()=>detectScenes(currentJsxText()).length),2);
});
await test('scene declarations take priority over nested conditional decoration',async c=>{
  const p=await fresh(c);
  const results=await p.evaluate(()=>{
    const inspect=src=>{const b=dcCollectSceneBlocks(src);return {values:b.map(x=>x.value),labels:b.map(x=>x.label),parts:b.map(x=>src.slice(x.start,x.end))};};
    const wrapper=(body,bounds='[0,1]')=>'<x-dc><div class="stage" data-cde-stage="1">'+body+'</div></x-dc><script>const BOUNDS='+bounds+';</script>';
    const sc=(value,body)=>'<sc-if value="{{ '+value+' }}">'+body+'</sc-if>';
    const section=(i,body)=>'<!-- SCENE '+i+': Main '+i+' --><section id="S_'+i+'" data-screen-label="Main '+i+'">'+body+'</section>';
    const mixed=wrapper(Array.from({length:5},(_,i)=>section(i+1,i===3?Array.from({length:4},(_,j)=>sc('nameIndex','Number '+j)).join(''):'Shared text')).join(''),'[0,1,2,3,4]');
    return {
      mixed:inspect(mixed),
      nestedIndex:dcSceneIndexForPos(mixed,mixed.indexOf('Number 2')),
      native:inspect(wrapper('<!-- SCENE 1: Native one -->'+sc('s1',section(10,'Nested layer'))+'<!-- SCENE 2: Native two -->'+sc('s2','Second')+sc('c1','Caption')+sc('archive','Overlay'))),
      numbered:inspect(wrapper(sc('s1','First')+sc('s2','Second')+sc('c1','Caption')+sc('archive','Overlay'))),
      htmlParent:inspect(wrapper(section(1,sc('s1','Nested shot'))+section(2,sc('s2','Nested shot')))),
      siblings:inspect(wrapper(section(1,'First')+'<!-- SCENE 2: Native two -->'+sc('s2','Second'))),
      fallback:inspect(wrapper(sc('firstState','First')+sc('secondState','Second')+sc('c1','Caption')))
    };
  });
  assert.deepEqual(results.mixed.values,['S_1','S_2','S_3','S_4','S_5']);assert.equal(results.nestedIndex,3);
  assert.ok(results.mixed.parts[3].startsWith('<section'));assert.ok(results.mixed.parts[3].endsWith('</section>'));
  assert.deepEqual(results.native.values,['s1','s2']);assert.deepEqual(results.native.labels,['シーン1：Native one','シーン2：Native two']);
  assert.deepEqual(results.numbered.values,['s1','s2']);assert.deepEqual(results.htmlParent.values,['S_1','S_2']);
  assert.deepEqual(results.siblings.values,['S_1','s2']);assert.deepEqual(results.fallback.values,['firstState','secondState']);
});
await test('scene follow switches from global instructions and protects comment editing',async c=>{
  const bounds=[0,.8,1.6,2.4,3.2],labels=bounds.map((_,i)=>'Main '+(i+1));
  const source=`<!doctype html><html><head><style>.stage{position:relative;width:640px;height:360px}section{position:absolute;inset:0;opacity:0;animation:show .8s linear forwards}@keyframes show{0%,99.99%{opacity:1}100%{opacity:0}}</style></head><body><x-dc data-render-mode="css"><div class="stage" data-cde-stage="1" data-duration="4" data-render-mode="css" data-cde-time-mode="absolute">${bounds.map((t,i)=>`<!-- SCENE ${i+1}: Main ${i+1} --><section id="S_${i+1}" data-screen-label="${labels[i]}" style="animation-delay:${t}s"><h1>Shared 日本語</h1>${i===3?Array.from({length:4},(_,j)=>`<sc-if value="{{ nameIndex }}">Number ${j}</sc-if>`).join(''):''}</section>`).join('')}</div></x-dc><script>const BOUNDS=[0,.8,1.6,2.4,3.2];const duration=4;</script></body></html>`;
  for(const fileMode of [false,true]){
    const p=await fresh(c,fileMode);await load(p,'scene-follow.zip',{'deck.html':source,'voice.wav':wav(220,4)});
    assert.match(await p.$eval('#status',e=>e.textContent),/5 シーン/);
    let f=await(await p.$('#frame')).contentFrame();await f.waitForFunction(()=>document.getElementById('__dcAud')?.readyState>=2);
    const selected=()=>p.$eval('#scSel',e=>e.value),following=()=>p.$eval('#scFollow',e=>e.checked);
    const seek=async t=>{await f.evaluate(t=>window.postMessage({__dcAudCmd:1,cmd:'seek',value:t},'*'),t);await p.waitForFunction(t=>Math.abs(M._audT-t)<.002,{},t);};
    const expect=async label=>p.waitForFunction(label=>document.querySelector('#scSel').value===label,{timeout:2500},label);
    await expect(labels[0]);assert.equal(await following(),true);
    for(const t of [.79,.81,1.59,1.61,2.39,2.41,3.19,3.21,.2]){await seek(t);await expect(labels[bounds.findLastIndex(b=>t>=b)]);}
    await p.select('#scSel','__ALL__');assert.equal(await following(),false);
    await p.type('#scText','Keep the overall pacing.');await seek(1.1);assert.equal(await selected(),'__ALL__');
    await p.click('#scFollow');assert.equal(await following(),true);await expect(labels[1]);
    await p.type('#scText','Keep this scene note.');await seek(2);await new Promise(r=>setTimeout(r,1400));
    assert.equal(await selected(),labels[1]);assert.equal(await p.$eval('#scText',e=>e.value),'Keep this scene note.');
    await p.$eval('#scText',e=>e.blur());await expect(labels[2]);
    await p.click('#scFollow');await seek(3.5);await new Promise(r=>setTimeout(r,1400));assert.equal(await selected(),labels[2]);
    await p.select('#scSel',labels[0]);await p.click('#scFollow');await expect(labels[4]);
    await seek(0);await expect(labels[0]);await p.click('#audPlay');
    const samples=await p.evaluate(async()=>new Promise(resolve=>{const rows=[];function tick(){const t=M._audT;rows.push({t,label:document.querySelector('#scSel').value});if(t>=3.65)resolve(rows);else requestAnimationFrame(tick);}requestAnimationFrame(tick);}));
    await p.click('#audPlay');assert.ok(samples.length>20);
    assert.deepEqual([...new Set(samples.map(r=>r.label))],labels);
    for(const r of samples)assert.equal(r.label,labels[bounds.findLastIndex(b=>r.t>=b)],'Follow must use the current preview time: '+JSON.stringify(r));
    const saved=await output(p,'exportProjectZip');await load(p,'again.zip',bytesMap(saved));
    assert.deepEqual(await p.evaluate(()=>detectScenes(currentJsxText()).map(s=>s.label)),labels);
    const notes=await p.evaluate(()=>M.comments.map(c=>({mode:c.mode,scene:c.scene,comment:c.comment})));
    assert.ok(notes.some(c=>c.mode==='deck'&&c.comment==='Keep the overall pacing.'));
    assert.ok(notes.some(c=>c.mode==='scene'&&c.scene==='Main 2'&&c.comment==='Keep this scene note.'));
    await p.close();
  }
});
await test('main stage wins over a native review wrapper and excludes stage/caption IDs',async c=>{
  const p=await fresh(c);
  const helper='<!doctype html><html><body><x-dc><h1>Review UI</h1><iframe src="main.dc.html"></iframe></x-dc><script type="text/x-dc" data-dc-script>class Component extends DCLogic {}</script></body></html>';
  const html='<!doctype html><html><body><div id="S_STAGE" class="stage" data-cde-stage="true" style="width:640px;height:360px">'+Array.from({length:9},(_,i)=>'<section id="S_'+i+'" data-screen-label="Scene '+i+'"><div>Scene text '+i+'</div></section>').join('')+'<div id="S_SUBTITLES" data-screen-label="Captions">Global captions</div></div><script>const BOUNDS=[0,1,2,3,4,5,6,7,8];const duration=9;</script></body></html>';
  for(const files of [{'review.dc.html':helper,'main.dc.html':html},{'main.dc.html':html,'review.dc.html':helper}]){
    await load(p,'multiple.zip',files);
    const state=await p.evaluate(()=>{const src=currentJsxText();return {path:M.dcPath,labels:detectScenes(src).map(x=>x.label),caption:dcSceneIndexForPos(src,src.indexOf('Global captions')),frames:document.querySelector('#frame').contentDocument.querySelectorAll('iframe').length};});
    assert.equal(state.path,'main.dc.html');assert.equal(state.labels.length,9);assert.equal(state.caption,-1);assert.equal(state.frames,0);
  }
  const saved=deck('Saved entry').replace('data-om-exportable-video-with-duration-secs="2"','');
  await load(p,'explicit.zip',{'review.dc.html':helper,'main.dc.html':html,'saved.html':saved,'.cde2-project.json':JSON.stringify({schema:'cde2.project/v1',deck:'saved.html'})});
  assert.equal(await p.evaluate(()=>M.dcPath),'saved.html','saved entry must retain priority over inferred stage');
});
await test('video source offsets survive metadata, seeks, exports, edits and recovery',async c=>{
  const clip=fs.readFileSync(path.join(root,'scripts/fixtures/inpoint-clip.webm'));
  const source=`<!doctype html><html><body><div class="stage" data-cde-stage="1" data-duration="4" data-render-mode="css" data-cde-time-mode="absolute" style="width:640px;height:360px">
    <section id="S_FIRST"><h1>開始位置 日本語</h1><video id="first" src="media/clip.webm" data-t0="0" data-vin="0" muted playsinline></video></section>
    <section id="S_SECOND"><video id="second" src="./media/clip.webm" data-t0="2" data-vin="1.4" muted playsinline></video></section>
    <video id="precision" src="media/clip.webm" data-t0="0" data-vin="0.05" muted playsinline></video>
    <video id="default" src="media/clip.webm" data-t0="0" muted playsinline></video>
    </div><script>const BOUNDS=[0,2];const duration=4;</script></body></html>`;
  const files={'project/deck.html':source,'project/media/clip.webm':clip,'voice.wav':wav(220,4)},original=['0','1.4','0.05',null];
  async function check(p,expected=original){
    const f=await(await p.$('#frame')).contentFrame();
    await f.waitForFunction(()=>document.querySelectorAll('video').length===4&&[...document.querySelectorAll('video')].every(v=>v.readyState>=2&&!v.seeking));
    assert.deepEqual(await f.evaluate(()=>[...document.querySelectorAll('video')].map(v=>Number(v.getAttribute('data-vin')))),expected.map(Number));
    return f;
  }
  for(const fileMode of [false,true]){
    const p=await fresh(c,fileMode);await load(p,'per-use.zip',files);let f=await check(p);
    const mixed=await p.evaluate(()=>({value:document.querySelector('#assets .ivinnum').value,text:document.querySelector('#assets .ivinmeta').textContent,prompt:buildAiPrompt({includeSource:false})}));
    assert.equal(mixed.value,'');assert.match(mixed.text,/0秒 \/ 1.4秒 \/ 0.05秒/);assert.ok(!mixed.prompt.includes('→ `<video data-vin='),'Do not tell AI to collapse untouched source offsets');
    // Merely blurring an empty mixed-value control must not apply zero everywhere.
    await p.$eval('#assets .ivinnum',e=>e.dispatchEvent(new Event('change',{bubbles:true})));await check(p);
    for(const t of [.8,2.4,.4]){
      await f.evaluate(t=>window.postMessage({__dcAudCmd:1,cmd:'seek',value:t},'*'),t);
      await f.waitForFunction(t=>{const a=document.getElementById('__dcAud'),v=document.getElementById('second');return Math.abs(a.currentTime-t)<.001&&!v.seeking&&Math.abs(v.currentTime-(1.4+Math.max(0,t-2)))<.08;},{},t);
    }
    for(const fn of ['exportProjectZip','exportDcZip','exportDeltaBundle','exportFullSplitBundles']){
      const saved=await output(p,fn),main=Object.entries(saved).find(([n])=>/project\/deck\.(?:dc\.)?html$/.test(n));
      assert.ok(main);assert.deepEqual(await p.evaluate(text=>[...new DOMParser().parseFromString(text,'text/html').querySelectorAll('video')].map(v=>v.getAttribute('data-vin')),Buffer.from(main[1],'base64').toString()),original);
      assert.ok(!Object.keys(saved).some(n=>n.endsWith('.asset-video-vin.state.json')),'Untouched in-points must not become file-wide overrides');
      const q=await fresh(c,fileMode);await load(q,'roundtrip.zip',fn==='exportDeltaBundle'?{...files,...bytesMap(saved)}:bytesMap(saved));await check(q);await q.close();
    }
    const standalone=await p.evaluate(async()=>{let saved;download=b=>saved=b;await exportDcHtml();return saved.text();});
    assert.deepEqual(await p.evaluate(text=>[...new DOMParser().parseFromString(text,'text/html').querySelectorAll('video')].map(v=>v.getAttribute('data-vin')),standalone),original);
    // The representative value is already zero: the override flag itself must
    // create an undo checkpoint and recover the other occurrences on undo.
    await p.evaluate(()=>{checkpointProject();_setAssetVin('project/media/clip.webm',0,true);checkpointProject();});await check(p,['0','0','0','0']);
    await p.evaluate(()=>travelHistory(-1));await check(p);
    await p.evaluate(()=>travelHistory(1));await check(p,['0.0','0.0','0.0','0.0']);
    await p.evaluate(()=>travelHistory(-1));await check(p);
    await p.evaluate(()=>saveDraft());await p.close();
    const q=await fresh(c,fileMode);await q.click('#projectDrafts');await q.waitForSelector('#draftList button');
    await q.evaluate(()=>[...document.querySelectorAll('#draftList button')].find(b=>b.textContent.startsWith('per-use.zip —')).click());await check(q);
    await q.evaluate(()=>{_setAssetVin('project/media/clip.webm',1.2,true);checkpointProject();});await check(q,['1.2','1.2','1.2','1.2']);
    const edited=await output(q,'exportProjectZip'),side=JSON.parse(Buffer.from(edited['.asset-video-vin.state.json'],'base64'));
    assert.deepEqual(side,{'project/media/clip.webm':{vin:1.2,override:true}});
    await load(q,'edited.zip',bytesMap(edited));await check(q,['1.2','1.2','1.2','1.2']);
    await load(q,'legacy.zip',{...files,'.asset-video-vin.state.json':JSON.stringify({'project/media/clip.webm':{vin:2.2}})});await check(q,['2.2','2.2','2.2','2.2']);
    await q.evaluate(async()=>replaceAssetWithFile('project/media/clip.webm',new File([M.files.get('project/media/clip.webm').bytes],'clip.webm',{type:'video/webm'})));await check(q,['0.0','0.0','0.0','0.0']);
    await q.close();
  }
});
assert.deepEqual(errors,[],'Unexpected browser errors');console.log('PASS: complete v36 browser suite ('+path.basename(target)+')');
}catch(e){console.error(e.stack);process.exitCode=1;}finally{await browser.close();server.close();}
