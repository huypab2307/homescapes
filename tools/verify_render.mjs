/** Integration test, no Render account or real ADB required.
 * node --experimental-strip-types tools/verify_render.mjs PATH_TO_SAVE
 */
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createServer} from 'node:net';
import {readFileSync,writeFileSync,mkdtempSync,chmodSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
const fixture=resolve(process.argv[2]??'../upload/SaveGame.db');
if(process.platform==='win32')throw new Error('This integration harness uses a Linux fake bridge; build/run the actual desktop on Windows separately.');
const root=resolve(import.meta.dirname,'..');
const temp=mkdtempSync(join(tmpdir(),'hcs-render-test-'));
const processes=[];
async function start(env){
 const portReservation=createServer();portReservation.listen(0,'127.0.0.1');await once(portReservation,'listening');
 const port=portReservation.address().port;await new Promise(r=>portReservation.close(r));
 const child=spawn(process.execPath,['--experimental-strip-types','src/server/main.ts'],{cwd:root,env:{...process.env,...env,PORT:String(port)},stdio:['ignore','pipe','pipe']});
 processes.push(child);
 const started=once(child.stdout,'data');
 await Promise.race([started,once(child,'exit').then(()=>{throw new Error('Server startup failed');})]);
 return 'http://127.0.0.1:'+port;
}
async function request(base,path,data,headers={}){
 const r=await fetch(base+path,{headers:{'content-type':'application/json',...headers},...(data===undefined?{}:{method:'POST',body:JSON.stringify(data)})});
 const text=await r.text();let result;try{result=JSON.parse(text);}catch{result=text;}
 return {status:r.status,result};
}
try{
 const key='integration-test-secret-'.repeat(3);
 const cloud=await start({HC_CLOUD_MODE:'1',HC_API_KEY:key});
 assert.equal((await request(cloud,'/api/health')).status,200);
 assert.equal((await request(cloud,'/api/overview')).status,401);
 const headers={'authorization':'Bearer '+key,'x-hc-client':'separate-test-client-0001'};
 assert.equal((await request(cloud,'/api/device/pull',{serial:'x'},headers)).status,403);
 assert.equal((await request(cloud,'/api/session/load',{path:fixture},headers)).status,400);
 const fake=join(temp,'bridge');const pushed=join(temp,'pushed.db');
 writeFileSync(fake,`#!/usr/bin/env python3\nimport sys,json,base64,pathlib\na=sys.argv[1:]\nif a[0]=='pull':\n print(json.dumps({'ok':True,'b64':base64.b64encode(pathlib.Path(${JSON.stringify(fixture)}).read_bytes()).decode(),'file':'/data/data/com.playrix.homescapes/files/SaveGame.db','package':'com.playrix.homescapes'}))\nelif a[0]=='push':\n pathlib.Path(${JSON.stringify(pushed)}).write_bytes(pathlib.Path(a[a.index('--in')+1]).read_bytes())\n print(json.dumps({'ok':True,'relaunched':True,'package':'com.playrix.homescapes'}))\nelse:print(json.dumps({'ok':True,'info':{'found':True,'devices':[]}}))\n`);
 chmodSync(fake,0o755);
 const configPath=join(temp,'settings.json');
 const desktop=await start({HC_CLOUD_MODE:'0',HC_ALLOW_HTTP_REMOTE:'1',HC_CONFIG_PATH:configPath,HC_BRIDGE_EXE:fake});
 assert.equal((await request(desktop,'/api/remote/config',{url:cloud,apiKey:'wrong'})).status,401);
 assert.equal((await request(desktop,'/api/remote/config',{url:cloud,apiKey:key})).status,200);
 const settings=(await request(desktop,'/api/remote/config')).result;
 assert.equal(settings.mode,'remote');assert.ok(!('apiKey' in settings));
 const loaded=await request(desktop,'/api/device/pull',{serial:'local-device'});
 assert.equal(loaded.status,200,JSON.stringify(loaded.result));
 const id=loaded.result.overview.meta.id;
 assert.equal((await request(cloud,'/api/overview?sessionId='+id,undefined,headers)).status,404);
 const ops=[{path:'Properties.coins',value:123456},{path:'PlayerItems.HammerBonus',value:777}];
 assert.equal((await request(desktop,'/api/apply',{sessionId:id,ops,refreshIntegrity:false})).status,200);
 const gp=await request(desktop,'/api/seasonpass/max-gp',{sessionId:id});
 assert.equal(gp.status,200);
 assert.equal((await request(desktop,'/api/device/push',{sessionId:id,serial:'other-device'})).status,400);
 const sent=await request(desktop,'/api/device/push',{sessionId:id,serial:'local-device'});
 assert.equal(sent.status,200,JSON.stringify(sent.result));
 const actual=JSON.parse(readFileSync(pushed,'utf8'));
 assert.equal(actual.Properties.coins,123456);assert.equal(actual.PlayerItems.HammerBonus,777);
 assert.equal(actual.PlayerItems[gp.result.source],1);assert.equal(actual.Currency[gp.result.season+'Points.amount'],10000);
 const cloned=await request(desktop,'/api/clone-content',{serial:'local-device'});
 assert.equal(cloned.status,200,JSON.stringify(cloned.result));
 assert.ok(cloned.result.overview.meta.id);
 const legacy=await request(desktop,'/api/seasonpass/unlock',{serial:'local-device'});
 assert.equal(legacy.status,200,JSON.stringify(legacy.result));
 assert.ok(legacy.result.relaunched);
 const reset=await request(desktop,'/api/session/reset',{sessionId:id});
 assert.equal(reset.status,200);assert.notEqual(reset.result.overview.meta.id,id);
 assert.equal((await request(desktop,'/api/device/push',{sessionId:reset.result.overview.meta.id,serial:'local-device'})).status,200);
 assert.equal((await request(desktop,'/api/remote/config',{url:'https://example.com',apiKey:key},{origin:'https://untrusted.example'})).status,403);
 console.log('PASS: cloud auth, denied file/device endpoints, client isolation, settings, local pull -> cloud edits/MAX_GP -> local Push, wrong-device refusal, clone and legacy season actions, reset/provenance, CSRF rejection.');
}finally{
 for(const child of processes)child.kill();
 await Promise.all(processes.map(child=>child.exitCode===null?once(child,'exit'):Promise.resolve()));
 rmSync(temp,{recursive:true,force:true});
}
