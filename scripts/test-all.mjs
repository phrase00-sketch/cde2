import {spawnSync} from 'node:child_process';
const commands=[['python',['scripts/smoke_test.py']],...['build.mjs --check','v27_handoff_test.mjs','v30_png_restore_test.mjs','v31_download_fallback_test.mjs','v32_module_graph_test.mjs','v33_ximport_sources_test.mjs','v34_render_mode_test.mjs'].map(s=>[process.execPath,['scripts/'+s.split(' ')[0],...s.split(' ').slice(1)]])];
let failed=false;
for(const [cmd,args] of commands){const r=spawnSync(cmd,args,{encoding:'utf8'});if(r.status!==0){failed=true;console.error('FAIL: '+args.join(' ')+'\n'+(r.stderr||r.stdout).slice(0,1600));}else console.log(r.stdout.trim());}
if(failed)process.exitCode=1;
