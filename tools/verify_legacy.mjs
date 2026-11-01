// node --experimental-strip-types tools/verify_legacy.mjs PATH_TO_SAVE
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { api } from '../src/lib/api.ts';

const input = process.argv[2];
if (!input) throw new Error('Pass a SaveGame.db path. The test edits memory only; the input is never overwritten.');
const reservation = createServer();
reservation.listen(0, '127.0.0.1');
await once(reservation, 'listening');
const port = reservation.address().port;
await new Promise((done) => reservation.close(done));
const child = spawn(process.execPath, ['--experimental-strip-types', 'src/server/main.ts'], {
  cwd: resolve(import.meta.dirname, '..'), env: { ...process.env, HC_PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'],
});
const originalFetch = globalThis.fetch;
const base = `http://127.0.0.1:${port}`;
try {
  await Promise.race([once(child.stdout, 'data'), new Promise((_, reject) => {
    const t=setTimeout(()=>reject(new Error('API startup timeout')),10000);t.unref();
    child.once('exit',()=>{clearTimeout(t);reject(new Error('API exited before startup'));});
  })]);
  globalThis.fetch = (url, init) => originalFetch(new URL(String(url), base), init);
  const raw = async (path, body) => {
    const response = await originalFetch(base + path, body === undefined ? {} : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    assert.ok(response.ok, `${path}: ${response.status}`);
    return response.json();
  };
  const contents=readFileSync(input).toString('base64');
  const account = await raw('/api/session/load', { b64: contents, name: 'account-under-test' });
  const id=account.overview.meta.id;
  await api.overview(); // UI adopts A
  const donor = await raw('/api/session/load', { b64: contents, name: 'temporary-donor' });
  assert.notEqual(id,donor.overview.meta.id); // Server now defaults to B; UI must stay on A.
  const ops = [
    { path:'Properties.coins',value:123456 },
    { path:'Properties.earnedStars',value:54321 },
    { path:'Properties.lives.current',value:8 },
    { path:'PlayerItems.HammerBonus',value:765 },
  ];
  const applied = await api.apply(ops,true);
  assert.ok(applied.ok);
  const values=await api.values();
  assert.equal(values['Properties.coins'],123456);
  const accountExport=await raw('/api/export?sessionId='+id);
  const donorExport=await raw('/api/export?sessionId='+donor.overview.meta.id);
  assert.equal(accountExport.Properties.coins,123456);
  assert.notEqual(donorExport.Properties.coins,123456);
  assert.equal(accountExport.PlayerItems.HammerBonus,765);
  assert.equal(accountExport.Properties['lives.current'],8);
  assert.equal(accountExport.Properties.earnedStars,54321);
  const currency=await api.discover('Currency.');
  assert.ok(currency.length>0);
  const cardResult=await api.cardsGrant({cards:[1,2,3],copies:1});
  assert.ok(cardResult.ok);
  assert.equal(cardResult.overview.meta.id,id);
  const groups=await api.cosmeticsCatalog();
  const frame=groups.find(g=>g.kind==='frames');
  const item=frame.items[0];
  const cosmetics=await api.cosmeticsApply({grant:{frames:[item.id]},equip:{frames:item.id}});
  assert.ok(cosmetics.ok);
  assert.equal(cosmetics.overview.meta.id,id);
  const state=await api.cosmeticsState();
  assert.equal(state.frames.equipped,item.id);
  const gp=await api.maxGP(id);
  assert.ok(gp.ok);
  const final=await raw('/api/export?sessionId='+id);
  assert.equal(final.Currency[gp.season+'Points.amount'],10000);
  assert.equal(final.PlayerItems[gp.source],1);
  assert.equal(final.Properties.coins,123456);
  assert.equal((await api.overview()).meta.id,id);
  console.log('PASS: real HTTP load -> temporary donor -> coins/stars/lives/booster -> cards -> frame equip -> MAX_GP -> export, all on the same UI session.');
} finally {
  globalThis.fetch=originalFetch;
  child.kill();
  await once(child,'exit');
}
