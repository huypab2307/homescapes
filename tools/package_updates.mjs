/** Builds the thin, cross-platform payload on every server deploy. Never packages authority. */
import {readFileSync,writeFileSync,mkdirSync,readdirSync,statSync,rmSync} from 'node:fs';
import {resolve,relative,join} from 'node:path';
import {createHash} from 'node:crypto';
import {zipSync} from 'fflate';
import {buildSync} from 'esbuild';
const root=resolve(import.meta.dirname,'..'),files={};
function add(path,name){files[name]=[new Uint8Array(readFileSync(path)),{mtime:new Date('2020-01-01T00:00:00Z')}];}
function tree(dir){for(const name of readdirSync(dir).sort()){const path=join(dir,name);if(statSync(path).isDirectory())tree(path);else add(path,relative(root,path).replaceAll('\\','/'));}}
tree(join(root,'dist'));
const bundled=buildSync({entryPoints:[join(root,'src/server/gateway.ts')],bundle:true,platform:'node',target:'node24',format:'esm',packages:'bundle',write:false,metafile:true});
for(const input of Object.keys(bundled.metafile.inputs))if(/src[\\/]engine[\\/]|(?:licenses|session|cloud|desktopUpdates)\.ts$/.test(input))throw Error('Server authority/engine must not enter a desktop update: '+input);
files['src/server/gateway.mjs']=[bundled.outputFiles[0].contents,{mtime:new Date('2020-01-01T00:00:00Z')}];
add(join(root,'client/hc_client.py'),'client/hc_client.py');
files['package.json']=[new TextEncoder().encode('{"type":"module"}\n'),{mtime:new Date('2020-01-01T00:00:00Z')}];
const bytes=zipSync(files,{level:6});
const sha256=createHash('sha256').update(bytes).digest('hex');
const dir=join(root,'desktop_release');rmSync(dir,{recursive:true,force:true});mkdirSync(dir,{recursive:true});
writeFileSync(join(dir,sha256+'.zip'),bytes);
const manifest={schema:1,release:Date.now(),version:sha256.slice(0,16),sha256,size:bytes.length,min_bootstrap:1,url:'/desktop/bundles/'+sha256+'.zip'};
writeFileSync(join(dir,'release.json'),JSON.stringify(manifest));
console.log('Desktop update payload built:',manifest.version,bytes.length,'bytes');
