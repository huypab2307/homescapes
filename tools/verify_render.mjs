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
async function start(env, entry='tools/test_cloud_entry.mjs'){
 const portReservation=createServer();portReservation.listen(0,'127.0.0.1');await once(portReservation,'listening');
 const port=portReservation.address().port;await new Promise(r=>portReservation.close(r));
 const child=spawn(process.execPath,['--experimental-strip-types',entry],{cwd:root,env:{...process.env,...env,PORT:String(port),HC_PORT:String(port)},stdio:['ignore','pipe','pipe']});
 processes.push(child);
 child.stderr.on('data', b=>{ if (!String(b).includes('ExperimentalWarning') && !String(b).includes('trace-warnings')) process.stderr.write(b); });
 const started=once(child.stdout,'data');
 const timer=setTimeout(()=>child.kill(),30000);
 await Promise.race([started,once(child,'exit').then(()=>{throw new Error('Server startup failed');})]);clearTimeout(timer);
 return 'http://127.0.0.1:'+port;
}
async function request(base,path,data,headers={}){
 const r=await fetch(base+path,{headers:{'content-type':'application/json',...headers},...(data===undefined?{}:{method:'POST',body:JSON.stringify(data)})});
 const text=await r.text();let result;try{result=JSON.parse(text);}catch{result=text;}
 return {status:r.status,result};
}
try{
 const dbFile=join(temp,'licenses.db');
 const password='test-admin-password-1234';
 const serverEnv={HC_CLOUD_MODE:'0',HC_LICENSE_DEV_DB:dbFile,HC_ADMIN_PASSWORD:password,HC_SESSION_SECRET:'integration-session-secret-'.repeat(3)};
 let cloud=await start(serverEnv);
 assert.equal((await request(cloud,'/api/health')).status,200);
 assert.equal((await request(cloud,'/api/overview')).status,401);
 assert.equal((await request(cloud,'/api/admin/login',{password:'bad'})).status,401);
 let admin=(await request(cloud,'/api/admin/login',{password})).result.accessToken;
 const adminHeaders=()=>({authorization:'Bearer '+admin});
 const create=async(days=7)=>{const r=await request(cloud,'/api/admin/create',{days,note:'test <script> & unicode tiếng Việt'},adminHeaders());assert.equal(r.status,200,JSON.stringify(r.result));return r.result;};
 const login=async(key,deviceId='test-client-device-0001')=>request(cloud,'/api/auth/login',{key,deviceId});
 const license=await create(); const key=license.key;
 assert.match(key,/^VIP-(?:[A-HJ-NP-Z2-9]{4}-){4}[A-HJ-NP-Z2-9]{4}$/);
 assert.equal((await login('bad-key')).status,401);
 const signed=await login(key);assert.equal(signed.status,200);
 let headers={authorization:'Bearer '+signed.result.accessToken};
 assert.equal((await login(key,'test-client-device-0002')).status,401);
 assert.equal((await request(cloud,'/api/sessions',undefined,{authorization:'Bearer '+admin})).status,401);
 assert.equal((await request(cloud,'/api/sessions',undefined,{authorization:headers.authorization+'tampered'})).status,401);
 assert.equal((await request(cloud,'/api/device/pull',{serial:'x'},headers)).status,403);
 assert.equal((await request(cloud,'/api/session/load',{path:fixture},headers)).status,400);
 const listed=await request(cloud,'/api/admin/licenses',undefined,adminHeaders());
 assert.equal(listed.status,200);assert.ok(!JSON.stringify(listed).includes(key));assert.ok(!JSON.stringify(listed).includes('key_hash'));
 const second=await create(0);
 // A key created by the previous HC format must remain usable.
 const {DatabaseSync: SeedDB}=await import('node:sqlite');const legacyDb=new SeedDB(dbFile);
 const {createHash}=await import('node:crypto');second.key='HC-OLDKEY01-OLDKEY02-OLDKEY03-OLDKEY04-OLDKEY05';
 legacyDb.prepare('UPDATE hc_licenses SET key_hash=? WHERE id=?').run(createHash('sha256').update(second.key).digest('hex'),second.id);legacyDb.close();
 const secondLogin=await login(second.key,'second-independent-client-01');
 assert.equal(secondLogin.result.expiresAt,0);
 const fake=join(temp,'bridge');const pushed=join(temp,'pushed.db');const bridgeLog=join(temp,'bridge-log.jsonl');
 writeFileSync(fake,`#!/usr/bin/env python3\nimport sys,json,base64,pathlib\na=sys.argv[1:]\nwith pathlib.Path(${JSON.stringify(bridgeLog)}).open('a') as log: log.write(json.dumps(a)+'\\n')\nif a[0]=='pull':\n print(json.dumps({'ok':True,'b64':base64.b64encode(pathlib.Path(${JSON.stringify(fixture)}).read_bytes()).decode(),'file':'/data/data/com.playrix.homescapes/files/SaveGame.db','package':'com.playrix.homescapes'}))\nelif a[0]=='push':\n pathlib.Path(${JSON.stringify(pushed)}).write_bytes(pathlib.Path(a[a.index('--in')+1]).read_bytes())\n print(json.dumps({'ok':True,'relaunched':True,'package':'com.playrix.homescapes','toolBackup':'/data/data/com.playrix.homescapes/files/SaveGame.db.hcsbak'}))\nelse:print(json.dumps({'ok':True,'info':{'found':True,'devices':[]}}))\n`);
 chmodSync(fake,0o755);
 const desktop=await start({HC_CLOUD_MODE:'0',HC_ALLOW_HTTP_REMOTE:'1',HC_REMOTE_URL:cloud,HC_DEVICE_ID:'desktop-machine-id-0001',HC_BRIDGE_EXE:fake,HC_BACKUP_DIR:join(temp,'backups')}, 'src/server/gateway.ts');
 assert.equal((await request(desktop,'/api/sessions')).status,401);
 assert.equal((await request(desktop,'/api/local/auth',{key:'wrong'})).status,401);
 const desktopLicense=await create(30);
 assert.equal((await request(desktop,'/api/local/auth',{key:desktopLicense.key})).status,200);
 assert.equal((await request(desktop,'/api/remote/config',{url:'',apiKey:''})).status,403);
 const settings=(await request(desktop,'/api/local/auth')).result;
 assert.match(settings.deviceId,/^VIP-(?:[A-HJ-NP-Z2-9]{4}-){4}[A-HJ-NP-Z2-9]{4}$/);
 assert.equal(settings.loggedIn,true);assert.ok(!('accessToken' in settings));
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
 // New-account experiment: no work without explicit confirmation or matching provenance.
 const experimentId=reset.result.overview.meta.id;
 assert.equal((await request(desktop,'/api/fresh-start/new-account',{serial:'local-device',sessionId:experimentId})).status,400);
 assert.equal((await request(desktop,'/api/fresh-start/new-account',{serial:'wrong-device',sessionId:experimentId,confirmation:'FORMAT_REMOVE_FINAL_BRACE'})).status,400);
 assert.equal((await request(cloud,'/api/fresh-start/prepare',{sessionId:experimentId,b64:readFileSync(fixture).toString('base64'),confirmation:'FORMAT_REMOVE_FINAL_BRACE'},headers)).status,404);
 // A local backup failure must prevent the push entirely.
 const blockedDir=join(temp,'backup-file');writeFileSync(blockedDir,'not a directory');
 const blocked=await start({HC_ALLOW_HTTP_REMOTE:'1',HC_REMOTE_URL:cloud,HC_DEVICE_ID:'desktop-machine-id-0001',HC_BRIDGE_EXE:fake,HC_BACKUP_DIR:join(blockedDir,'child')},'src/server/gateway.ts');
 assert.equal((await request(blocked,'/api/local/auth',{key:desktopLicense.key})).status,200);
 const blockedLoad=await request(blocked,'/api/device/pull',{serial:'local-device'});
 const pushedBefore=readFileSync(pushed);
 const blockedResult=await request(blocked,'/api/fresh-start/new-account',{serial:'local-device',sessionId:blockedLoad.result.overview.meta.id,confirmation:'FORMAT_REMOVE_FINAL_BRACE'});
 assert.equal(blockedResult.status,500);assert.deepEqual(readFileSync(pushed),pushedBefore);
 const experiment=await request(desktop,'/api/fresh-start/new-account',{serial:'local-device',sessionId:experimentId,confirmation:'FORMAT_REMOVE_FINAL_BRACE'});
 assert.equal(experiment.status,200,JSON.stringify(experiment.result));
 assert.ok(experiment.result.needsReconnect);assert.deepEqual(readFileSync(experiment.result.localBackup),readFileSync(fixture));
 const brokenText=readFileSync(pushed,'utf8').replace(/\x00+$/,'');
 assert.throws(()=>JSON.parse(brokenText));
 assert.deepEqual(JSON.parse(brokenText+'}'),JSON.parse(readFileSync(fixture,'utf8').replace(/\x00+$/,'')));
 assert.match(brokenText,/\r\n    "/);
 const bridgeCalls=readFileSync(bridgeLog,'utf8').trim().split('\n').map(JSON.parse);
 assert.ok(bridgeCalls.some(args=>args[0]==='pull'&&args.includes('--stop-first')));
 assert.ok(bridgeCalls.some(args=>args[0]==='push'&&args.includes('--require-backup')&&args.includes('--expect-package')&&args.includes('--expect-file')));
 assert.equal((await request(desktop,'/api/device/push',{sessionId:experimentId,serial:'local-device'})).status,400);
 assert.equal((await request(desktop,'/api/overview?sessionId='+experimentId)).status,404);
 // Immediate revocation rejects the next edit, and invalidates the local login.
 assert.equal((await request(cloud,'/api/admin/revoke',{id:desktopLicense.id},adminHeaders())).status,200);
 assert.equal((await request(desktop,'/api/sessions')).status,401);
 assert.equal((await request(desktop,'/api/local/auth')).result.loggedIn,false);
 assert.equal((await request(desktop,'/api/local/auth',{key:desktopLicense.key})).status,401);
 assert.equal((await request(cloud,'/api/admin/unbind',{id:license.id},adminHeaders())).status,200);
 assert.equal((await request(cloud,'/api/sessions',undefined,headers)).status,401);
 assert.equal((await login(key,'test-client-device-0002')).status,200);
 // Expiry is checked against the DB for every request, including existing tokens.
 const {DatabaseSync}=await import('node:sqlite');const db=new DatabaseSync(dbFile);
 db.prepare('UPDATE hc_licenses SET expires_at=? WHERE id=?').run(Math.floor(Date.now()/1000)-1,second.id);
 assert.equal((await request(cloud,'/api/sessions',undefined,{authorization:'Bearer '+secondLogin.result.accessToken})).status,401);
 assert.equal((await login(second.key,'second-independent-client-01')).status,401);
 assert.ok(!JSON.stringify(db.prepare('SELECT * FROM hc_licenses').all()).includes(key));db.close();
 // Restart preserves key and device binding; save sessions are intentionally in memory.
 const original=processes[0];original.kill();await once(original,'exit');
 cloud=await start(serverEnv);
 assert.equal((await login(key,'test-client-device-0001')).status,401);
 assert.equal((await login(key,'test-client-device-0002')).status,200);
 admin=(await request(cloud,'/api/admin/login',{password})).result.accessToken;
 assert.equal((await request(cloud,'/api/admin/licenses',undefined,adminHeaders())).result.licenses.length,4);
 assert.equal((await request(cloud,'/admin')).status,200);
 assert.equal((await request(cloud,'/api/admin/create',{days:-1,note:''},adminHeaders())).status,400);
 let last;for(let i=0;i<18;i++)last=await request(cloud,'/api/admin/login',{password:'bad'});
 assert.equal(last.status,429);
 console.log('PASS: license creation/login/hash-at-rest, binding, isolation, token validation, revoke/unbind/expiry, persistent restart, rate limits; thin gateway pull -> cloud edit/MAX_GP -> local Push; clone, legacy unlock, reset and CSRF; fresh-start formatting/backup/failure-before-write/stale-session rejection.');

}finally{
 for(const child of processes)child.kill();
 await Promise.all(processes.map(child=>child.exitCode===null && child.signalCode===null?once(child,'exit'):Promise.resolve()));
 rmSync(temp,{recursive:true,force:true});
}
