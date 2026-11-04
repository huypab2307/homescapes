import {createHmac,createPrivateKey,createPublicKey,sign} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import type {IncomingMessage,ServerResponse} from 'node:http';
const folder=new URL('../../desktop_release/',import.meta.url);
function keys(){
  const secret=process.env.HC_UPDATE_SIGNING_SECRET??process.env.HC_SESSION_SECRET??'';
  if(secret.length<32)throw Error('Update signing secret must have at least 32 characters');
  const seed=createHmac('sha256',secret).update('Homescapes desktop update signing v1').digest();
  const privateKey=createPrivateKey({key:Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),seed]),format:'der',type:'pkcs8'});
  return {privateKey,publicKey:createPublicKey(privateKey).export({type:'spki',format:'der'}).toString('base64')};
}
export async function handleDesktopUpdates(req:IncomingMessage,res:ServerResponse,path:string){
  if(!path.startsWith('/desktop/'))return false;
  res.setHeader('cache-control','no-store');res.setHeader('x-content-type-options','nosniff');
  if(req.method!=='GET'){res.writeHead(405).end();return true;}
  try{
    if(path==='/desktop/update-key.json'){
      res.setHeader('content-type','application/json');res.end(JSON.stringify({algorithm:'Ed25519',public_key:keys().publicKey,bootstrap:1}));return true;
    }
    const meta=JSON.parse(await readFile(new URL('release.json',folder),'utf8'));
    if(path==='/desktop/manifest.json'){
      // Fixed field order is the wire signing format used by the Python bootstrap.
      const payload={schema:meta.schema,release:meta.release,version:meta.version,sha256:meta.sha256,size:meta.size,min_bootstrap:meta.min_bootstrap,url:meta.url};
      const signature=sign(null,Buffer.from(JSON.stringify(payload)),keys().privateKey).toString('base64');
      res.setHeader('content-type','application/json');res.end(JSON.stringify({...payload,signature}));return true;
    }
    if(path===meta.url&&/^\/desktop\/bundles\/[a-f0-9]{64}\.zip$/.test(path)){
      const data=await readFile(new URL(meta.sha256+'.zip',folder));
      res.setHeader('content-type','application/zip');res.setHeader('content-length',data.length);res.end(data);return true;
    }
    res.writeHead(404).end();return true;
  }catch{res.writeHead(503,{'content-type':'application/json'}).end(JSON.stringify({ok:false,error:'Desktop update unavailable. Build the desktop payload and configure a stable signing secret.'}));return true;}
}
