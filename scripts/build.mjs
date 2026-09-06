import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2),option=name=>{const i=args.indexOf(name);return i<0?null:args[i+1];};
const modules=['core.js','import.js','editing.js','handoff.js','preview.js','export.js','audio.js','project-archive.js','workspace.js','boot.js'];
let html=fs.readFileSync(path.join(root,'src/shell.html'),'utf8').replace('{{CDE2_SCRIPT}}',()=>modules.map(p=>fs.readFileSync(path.join(root,'src',p),'utf8')).join(''));
const personal=option('--personal-from'),output=path.resolve(root,option('--output')||'index.html');
if(personal){
  const relative=path.relative(root.toLowerCase(),output.toLowerCase());
  if(!relative||(!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative)))throw new Error('Personal runtime seeds must never be written inside the public repository');
  const seed=fs.readFileSync(path.resolve(root,personal),'utf8');
  for(const id of ['__cde_seed_support','__cde_seed_imgslot']){
    const rx=new RegExp('(<script type="text/plain" id="'+id+'">)([\\s\\S]*?)(</script>)');
    const found=seed.match(rx);if(!found)throw new Error('Missing private seed: '+id);html=html.replace(rx,(_,open,_data,close)=>open+found[2]+close);
  }
}
if(args.includes('--check')){
  if(!fs.existsSync(output)||fs.readFileSync(output,'utf8')!==html)throw new Error('Distribution does not match src/: '+output);
  console.log('PASS: generated distribution matches source');
}else{fs.writeFileSync(output,html);console.log('Built '+path.basename(output));}
