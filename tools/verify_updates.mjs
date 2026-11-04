/** Actual Node-signed HTTP releases -> Python verifier -> real Node gateway, no Windows/ADB required. */
import {createServer} from 'node:http';
import {once} from 'node:events';
import {spawn} from 'node:child_process';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,rmSync,symlinkSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {zipSync,unzipSync} from 'fflate';
import assert from 'node:assert/strict';
process.env.HC_SESSION_SECRET='update-test-only-secret-'.repeat(3);
const {handleDesktopUpdates}=await import('../src/server/desktopUpdates.ts');
const root=resolve(import.meta.dirname,'..'),dir=join(root,'desktop_release');
const originalMeta=readFileSync(join(dir,'release.json'));const original=JSON.parse(originalMeta);const originalZip=readFileSync(join(dir,original.sha256+'.zip'));
const temp=mkdtempSync(join(tmpdir(),'hc-updates-e2e-'));const created=[];
const server=createServer((req,res)=>{void handleDesktopUpdates(req,res,new URL(req.url,'http://localhost').pathname).then(handled=>{if(!handled)res.writeHead(404).end();}).catch(()=>res.writeHead(500).end());});
server.listen(0,'127.0.0.1');await once(server,'listening');const url='http://127.0.0.1:'+server.address().port;
async function python(expectedVersion){
 const code=`import sys,json,types,contextlib\nfrom pathlib import Path\nsys.path.insert(0,${JSON.stringify(join(root,'client'))})\nfrom auto_update import Updates\nfrom desktop_launcher import start_gateway,stop_server\nw=types.SimpleNamespace(HKEY_LOCAL_MACHINE=0,KEY_READ=0,KEY_WOW64_64KEY=0,OpenKey=lambda *a:contextlib.nullcontext(None),QueryValueEx=lambda *a:('test-machine',None))\nsys.modules['winreg']=w\nr=Path(${JSON.stringify(temp)})\nu=Updates(r,r/'updates',allow_http=True)\np=None\ntry:\n with (r/'gateway.log').open('w') as log:\n  for payload,meta in u.candidates():\n   try:\n    p,address=start_gateway(r,payload,log,r,u.url,meta['version'] if meta else 'bundled')\n    u.accept(meta)\n    assert meta['version']==${JSON.stringify(expectedVersion)},'Wrong activated release'\n    break\n   except Exception:\n    stop_server(p);p=None;u.reject(meta)\n  assert p is not None,'No working gateway'\nfinally:\n stop_server(p);u.cleanup()\n`;
 const child=spawn('python3',['-c',code],{cwd:root,stdio:['ignore','pipe','pipe']});let stderr='';child.stderr.on('data',b=>stderr+=b);
 const [exit]=await once(child,'exit');assert.equal(exit,0,stderr);
}
function publish(change,offset){
 const files=unzipSync(originalZip);change(files);const bytes=zipSync(files);const digest=createHash('sha256').update(bytes).digest('hex');
 const meta={...original,release:original.release+offset,version:digest.slice(0,16),sha256:digest,size:bytes.length,url:'/desktop/bundles/'+digest+'.zip'};
 const path=join(dir,digest+'.zip');writeFileSync(path,bytes);created.push(path);writeFileSync(join(dir,'release.json'),JSON.stringify(meta));return meta;
}
try{
 const key=await(await fetch(url+'/desktop/update-key.json')).json();assert.equal(key.algorithm,'Ed25519');
 writeFileSync(join(temp,'update-pin.json'),JSON.stringify({server_url:url,public_key:key.public_key,min_release:original.release}));
 mkdirSync(join(temp,'runtime'));mkdirSync(join(temp,'bridge'));mkdirSync(join(temp,'baseline'));
 symlinkSync(process.execPath,join(temp,'runtime/node.exe'));writeFileSync(join(temp,'bridge/hc_bridge.exe'),'test placeholder');
 await python(original.version);
 const newer=publish(files=>{const text=new TextDecoder().decode(files['dist/index.html']);files['dist/index.html']=new TextEncoder().encode(text+'\n<!-- UI updated from server -->');},10);
 await python(newer.version);
 publish(files=>{files['src/server/gateway.mjs']=new TextEncoder().encode('process.exit(7);');},20);
 await python(newer.version); // failed signed update must launch last known good gateway
 const cache=JSON.parse(readFileSync(join(temp,'updates/last-good.json')));assert.equal(cache.sha256,newer.sha256);
 console.log('PASS: actual HTTP Ed25519 manifests + SHA256 payloads, first install, server-only UI update, gateway startup, automatic rollback after signed broken release.');
}finally{
 await new Promise(r=>server.close(r));writeFileSync(join(dir,'release.json'),originalMeta);
 for(const path of created)if(path!==join(dir,original.sha256+'.zip'))rmSync(path,{force:true});
 rmSync(temp,{recursive:true,force:true});
}
