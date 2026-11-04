/** Regression: upgrade an existing DB; Owner-only issuance through the real desktop gateway. */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { displayDeviceId } from '../src/server/deviceId.ts';
import { DatabaseSync } from 'node:sqlite';
const root = resolve(import.meta.dirname, '..');
const folder = mkdtempSync(join(tmpdir(), 'hcs-owner-'));
const database = join(folder, 'licenses.db'); const processes = [];
const hash = s => createHash('sha256').update(s).digest('hex');
const ownerKey = 'TEST-OWNER-ONLY-KEY-123456';
const oldKey = 'HC-LEGACY-USER-KEY-123456';
const password = 'test-admin-recovery-password';
const env = { HC_LICENSE_DEV_DB: database, HC_ADMIN_PASSWORD: password, HC_SESSION_SECRET: 'owner-regression-signing-secret-'.repeat(3), HC_OWNER_KEY_HASH: hash(ownerKey) };
async function start(entry, extra) {
  const reservation = createServer(); reservation.listen(0, '127.0.0.1'); await once(reservation, 'listening');
  const port = reservation.address().port; await new Promise(r => reservation.close(r));
  const child = spawn(process.execPath, ['--experimental-strip-types', entry], { cwd: root, env: { ...process.env, ...env, ...extra, PORT: String(port), HC_PORT: String(port) }, stdio: ['ignore', 'pipe', 'pipe'] });
  processes.push(child); let log = ''; child.stderr.on('data', b => { log += b; });
  const timer = setTimeout(() => child.kill(), 30000);
  try { await Promise.race([once(child.stdout, 'data'), once(child, 'exit').then(() => { throw Error('Startup failed: ' + log); })]); } finally { clearTimeout(timer); }
  return { child, url: 'http://127.0.0.1:' + port };
}
async function api(base, path, body, token) {
  const response = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: response.status, data: await response.json() };
}
try {
  // Schema from the previous release: no role column. Its existing key must survive.
  const db = new DatabaseSync(database);
  db.exec(`CREATE TABLE hc_licenses (id TEXT PRIMARY KEY,key_hash TEXT UNIQUE NOT NULL,hint TEXT NOT NULL,note TEXT NOT NULL,created_at BIGINT NOT NULL,expires_at BIGINT NOT NULL,device_hash TEXT,revoked INTEGER NOT NULL DEFAULT 0,version INTEGER NOT NULL DEFAULT 1)`);
  db.prepare('INSERT INTO hc_licenses (id,key_hash,hint,note,created_at,expires_at) VALUES (?,?,?,?,?,?)').run('legacy', hash(oldKey), 'OLD', 'existing user', 1, 0);
  let cloud = await start('tools/test_cloud_entry.mjs');
  const login = (key, deviceId = 'test-owner-machine-0001') => api(cloud.url, '/api/auth/login', { key, deviceId });
  const old = await login(oldKey, 'legacy-machine-00001'); assert.equal(old.status, 200); assert.equal(old.data.isOwner, false);
  const owner = await login(ownerKey); assert.equal(owner.status, 200); assert.equal(owner.data.isOwner, true); assert.equal(owner.data.expiresAt, 0);
  const ownerId = db.prepare("SELECT id FROM hc_licenses WHERE role='owner'").get().id;
  assert.equal((await login(ownerKey, 'other-owner-machine-001')).status, 200);
  const desktop = await start('src/server/gateway.ts', { HC_REMOTE_URL: cloud.url, HC_ALLOW_HTTP_REMOTE: '1', HC_DEVICE_ID: 'test-owner-machine-0001', HC_AUTH_DIR: folder });
  const desktopLogin = await api(desktop.url, '/api/local/auth', { key: ownerKey, isOwner: false });
  assert.equal(desktopLogin.data.isOwner, true); assert.equal(desktopLogin.data.loggedIn, true);
  const listed = await api(desktop.url, '/api/admin/licenses'); assert.equal(listed.status, 200); assert.equal(listed.data.licenses.length, 2);
  assert.ok(!JSON.stringify(listed.data).includes(ownerKey)); assert.ok(!JSON.stringify(listed.data).includes('key_hash'));
  const issued = await api(desktop.url, '/api/admin/create', { days: 7, maxDevices: 2, deviceIds: [displayDeviceId('issued-user-machine-01'), displayDeviceId('issued-user-machine-02')], note: 'issued from EXE', role: 'owner', isOwner: true });
  assert.equal(issued.status, 200); assert.match(issued.data.key, /^VIP-(?:[A-HJ-NP-Z2-9]{4}-){4}[A-HJ-NP-Z2-9]{4}$/);
  assert.equal(db.prepare('SELECT role FROM hc_licenses WHERE id=?').get(issued.data.id).role, 'user');
  const user = await login(issued.data.key, 'issued-user-machine-01'); assert.equal(user.status, 200); assert.equal(user.data.isOwner, false);
  assert.equal((await login(issued.data.key, 'issued-user-machine-02')).status, 200);
  assert.equal((await login(issued.data.key, 'issued-user-machine-03')).status, 401);
  assert.equal((await api(cloud.url, '/api/auth/refresh', { deviceId: 'issued-user-machine-01' }, user.data.rememberToken)).status, 200);
  assert.equal((await api(cloud.url, '/api/auth/refresh', { deviceId: 'issued-user-machine-02' }, user.data.rememberToken)).status, 401);
  assert.equal((await api(cloud.url, '/api/sessions', undefined, user.data.rememberToken)).status, 401);
  for (const invalid of [{ maxDevices: 1, deviceIds: [] }, { maxDevices: 1, deviceIds: [displayDeviceId('a'), displayDeviceId('b')] }, { maxDevices: 2, deviceIds: [displayDeviceId('a'), displayDeviceId('a')] }, { maxDevices: 0, deviceIds: [displayDeviceId('a')] }]) {
    assert.equal((await api(cloud.url, '/api/admin/create', { days: 7, note: '', ...invalid }, owner.data.accessToken)).status, 400);
  }
  desktop.child.kill(); await once(desktop.child, 'exit');
  const remembered = await start('src/server/gateway.ts', { HC_REMOTE_URL: cloud.url, HC_ALLOW_HTTP_REMOTE: '1', HC_DEVICE_ID: 'test-owner-machine-0001', HC_AUTH_DIR: folder });
  const restoredLogin = await api(remembered.url, '/api/local/auth');
  assert.equal(restoredLogin.data.loggedIn, true); assert.equal(restoredLogin.data.isOwner, true);
  desktop.url = remembered.url;
  for (const [path, body] of [['licenses', undefined], ['create', { days: 0, note: '', role: 'owner', isOwner: true }], ['revoke', { id: 'legacy' }], ['unbind', { id: 'legacy' }]]) {
    assert.equal((await api(cloud.url, '/api/admin/' + path, body, user.data.accessToken)).status, 403);
  }
  // Ordinary keys cannot spoof owner status by supplying an isOwner field to the gateway.
  await api(desktop.url, '/api/local/auth', { logout: true });
  assert.equal((await api(desktop.url, '/api/admin/create', { days: 7, note: '' })).status, 401);
  const gatewayUser = await api(cloud.url, '/api/admin/create', { days: 7, maxDevices: 1, deviceIds: [displayDeviceId('test-owner-machine-0001')], note: 'normal gateway user' }, owner.data.accessToken);
  const spoof = await api(desktop.url, '/api/local/auth', { key: gatewayUser.data.key, isOwner: true });
  assert.equal(spoof.status, 200); assert.equal(spoof.data.isOwner, false);
  assert.equal((await api(desktop.url, '/api/admin/create', { days: 7, note: '', isOwner: true })).status, 403);
  assert.equal((await api(desktop.url, '/api/admin/licenses')).status, 403);
  await api(desktop.url, '/api/local/auth', { logout: true });
  const another = await api(desktop.url, '/api/local/auth', { key: oldKey, isOwner: true });
  assert.equal(another.status, 401); // already bound to another machine
  // Let the first owner session manage a normal user's binding and revoke it.
  assert.equal((await api(cloud.url, '/api/admin/unbind', { id: issued.data.id }, owner.data.accessToken)).status, 400);
  assert.equal((await api(cloud.url, '/api/admin/unbind', { id: 'legacy' }, owner.data.accessToken)).status, 200);
  assert.equal((await api(cloud.url, '/api/sessions', undefined, old.data.accessToken)).status, 401);
  assert.equal((await api(cloud.url, '/api/admin/revoke', { id: issued.data.id }, owner.data.accessToken)).status, 200);
  assert.equal((await login(issued.data.key, 'issued-user-machine-01')).status, 401);
  assert.equal((await api(cloud.url, '/api/admin/unbind', { id: ownerId }, owner.data.accessToken)).status, 403);
  // Demotion, expiration and revocation are verified in the database for every management call.
  db.prepare("UPDATE hc_licenses SET role='user' WHERE id=?").run(ownerId);
  assert.equal((await api(cloud.url, '/api/admin/create', { days: 7, note: '' }, owner.data.accessToken)).status, 401);
  db.prepare("UPDATE hc_licenses SET role='owner',expires_at=1 WHERE id=?").run(ownerId);
  assert.equal((await api(cloud.url, '/api/admin/create', { days: 7, note: '' }, owner.data.accessToken)).status, 401);
  db.prepare('UPDATE hc_licenses SET expires_at=0 WHERE id=?').run(ownerId);
  const web = await api(cloud.url, '/api/admin/login', { password }); assert.equal(web.status, 200);
  assert.equal((await api(cloud.url, '/api/admin/revoke', { id: ownerId }, web.data.accessToken)).status, 200);
  assert.equal((await api(cloud.url, '/api/admin/create', { days: 7, note: '' }, owner.data.accessToken)).status, 401);
  cloud.child.kill(); await once(cloud.child, 'exit'); cloud = await start('tools/test_cloud_entry.mjs');
  assert.equal((await login(ownerKey)).status, 401); // seed must not resurrect revoked owner
  assert.equal(db.prepare("SELECT count(*) AS n FROM hc_licenses WHERE role='owner'").get().n, 1);
  assert.equal(db.prepare('SELECT role FROM hc_licenses WHERE id=?').get('legacy').role, 'user');
  assert.ok(!JSON.stringify(db.prepare('SELECT * FROM hc_licenses').all()).includes(ownerKey)); db.close();
  console.log('PASS: old-schema migration; multi-device owner; preassigned device limits; persistent login restart and refresh token isolation; EXE issuance; all generated keys remain regular users; non-owner API denial; owner revoke/unbind; demotion/expiry/revoke immediately enforced; no owner resurrection on restart.');
} finally {
  for (const child of processes) child.kill();
  await Promise.all(processes.map(child => child.exitCode === null && child.signalCode === null ? once(child, 'exit') : Promise.resolve()));
  rmSync(folder, { recursive: true, force: true });
}
