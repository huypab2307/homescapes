/** License authority. Keys are hashed at rest; bearer tokens are short lived. */
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { displayDeviceId } from './deviceId.ts';
import { SessionError } from './errors.ts';

type License = { id: string; key_hash: string; hint: string; note: string; created_at: number; expires_at: number; device_hash: string | null; revoked: number; version: number; role: 'user' | 'owner'; max_devices: number; allowed_devices: string | null };
type Claims = { role: 'admin' | 'user'; sub: string; device: string; version: number; exp: number; remember?: boolean };
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const now = () => Math.floor(Date.now() / 1000);
const secret = process.env.HC_SESSION_SECRET ?? '';
const password = process.env.HC_ADMIN_PASSWORD ?? '';
const ownerKeyHash = process.env.HC_OWNER_KEY_HASH ?? '40176778b564e53f35f0adb51b256e2c4d161df4db63ea9f60db0218bf25d444';
const OWNER_ID = 'hc-owner-bootstrap-v1';
let query: (sql: string, params?: unknown[]) => Promise<any[]>;
let ready: Promise<void> | undefined;
export function initLicenses() { return ready ??= (async () => {
  if (!/^[a-f0-9]{64}$/i.test(ownerKeyHash)) throw new Error('HC_OWNER_KEY_HASH must be a SHA-256 hex hash.');
  if (secret.length < 32 || password.length < 12) throw new Error('Set HC_SESSION_SECRET (32+ characters) and HC_ADMIN_PASSWORD (12+ characters).');
  if (process.env.DATABASE_URL) {
    const { Pool } = await import('pg');
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5, connectionTimeoutMillis: 10000, query_timeout: 15000 });
    pool.on('error', () => console.error('License database connection interrupted.')); 
    query = async (sql, params = []) => (await pool.query(sql, params)).rows;
  } else if (process.env.HC_LICENSE_DEV_DB && process.env.HC_CLOUD_MODE !== '1') {
    // Local tests only. Production always requires persistent PostgreSQL.
    const { DatabaseSync } = await import('node:sqlite');
    const db = new DatabaseSync(process.env.HC_LICENSE_DEV_DB);
    query = async (sql, params = []) => {
      const statement = db.prepare(sql.replace(/\$\d+/g, '?'));
      return statement.all(...params as any[]);
    };
  } else throw new Error('DATABASE_URL is required. License data must use persistent PostgreSQL.');
  await query(`CREATE TABLE IF NOT EXISTS hc_licenses (
    id TEXT PRIMARY KEY, key_hash TEXT UNIQUE NOT NULL, hint TEXT NOT NULL,
    note TEXT NOT NULL, created_at BIGINT NOT NULL, expires_at BIGINT NOT NULL,
    device_hash TEXT, revoked INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 1, role TEXT NOT NULL DEFAULT 'user')`);
  // Upgrade existing installations without changing keys, bindings or expiry.
  if (process.env.DATABASE_URL) {
    await query("ALTER TABLE hc_licenses ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'");
  } else {
    const columns = await query('PRAGMA table_info(hc_licenses)');
    if (!columns.some(c => c.name === 'role')) await query("ALTER TABLE hc_licenses ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");
  }
  for (const [name, definition] of [['max_devices', 'INTEGER NOT NULL DEFAULT 1'], ['allowed_devices', 'TEXT']]) {
    if (process.env.DATABASE_URL) await query(`ALTER TABLE hc_licenses ADD COLUMN IF NOT EXISTS ${name} ${definition}`);
    else if (!(await query('PRAGMA table_info(hc_licenses)')).some(c => c.name === name)) await query(`ALTER TABLE hc_licenses ADD COLUMN ${name} ${definition}`);
  }
  // Seed once. Never undo a web-admin revocation/unbind or reset the owner device.
  await query(`INSERT INTO hc_licenses (id,key_hash,hint,note,created_at,expires_at,role)
    VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING RETURNING id`,
    [OWNER_ID, ownerKeyHash.toLowerCase(), 'OWNER', 'Owner — issue keys in desktop', now(), 0, 'owner']);
})(); }
function sign(c: Omit<Claims, 'exp'>, duration = 1800) {
  const data = Buffer.from(JSON.stringify({ ...c, exp: now() + duration })).toString('base64url');
  return data + '.' + createHmac('sha256', secret).update(data).digest('base64url');
}
function equal(a: string, b: string) { return timingSafeEqual(Buffer.from(hash(a)), Buffer.from(hash(b))); }
function claims(req: IncomingMessage, remember = false): Claims {
  const token = String(req.headers.authorization ?? '').replace(/^Bearer /, '');
  if (token.length > 4096) throw new SessionError('Invalid login token', 401);
  const [data, signature, extra] = token.split('.');
  if (!data || !signature || extra || !equal(signature, createHmac('sha256', secret).update(data).digest('base64url'))) throw new SessionError('Please log in again', 401);
  let c: Claims;
  try { c = JSON.parse(Buffer.from(data, 'base64url').toString()); } catch { throw new SessionError('Invalid token', 401); }
  if (!Number.isFinite(c.exp) || c.exp <= now()) throw new SessionError('Login expired. Please log in again.', 401);
  if (!!c.remember !== remember) throw new SessionError('Invalid token type', 401);
  return c;
}
async function authorizedLicense(req: IncomingMessage, remember = false) {
  await initLicenses();
  const c = claims(req, remember);
  if (c.role !== 'user') throw new SessionError('A license login is required', 401);
  const [l] = await query('SELECT * FROM hc_licenses WHERE id=$1', [c.sub]) as License[];
  if (!l || l.revoked || (Number(l.expires_at) !== 0 && Number(l.expires_at) <= now()) || (l.role !== 'owner' && !(l.allowed_devices ? JSON.parse(l.allowed_devices).includes(c.device) : l.device_hash === c.device)) || Number(l.version) !== c.version) throw new SessionError('Key expired, revoked or device binding changed. Please log in again.', 401);
  return l;
}
export async function licenseScope(req: IncomingMessage) {
  const l = await authorizedLicense(req);
  return l.id + ':' + claims(req).device + ':' + l.version;
}
const attempts = new Map<string, { count: number; until: number }>();
function throttle(req: IncomingMessage) {
  // Render's trusted edge supplies the final X-Forwarded-For address.
  const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',').at(-1)?.trim();
  const ip = process.env.HC_CLOUD_MODE === '1' ? forwarded || req.socket.remoteAddress || 'unknown' : req.socket.remoteAddress || 'unknown';
  const t = now();
  for (const [k, v] of attempts) if (v.until <= t) attempts.delete(k);
  const entry = attempts.get(ip) ?? { count: 0, until: t + 60 };
  if (++entry.count > 15 || attempts.size > 10000) throw new SessionError('Too many login attempts. Retry in one minute.', 429);
  attempts.set(ip, entry);
}
async function readJson(req: IncomingMessage) {
  let size = 0; const chunks: Buffer[] = [];
  for await (const data of req) { const b = Buffer.from(data); size += b.length; if (size > 8192) throw new SessionError('Request too large', 413); chunks.push(b); }
  try { return JSON.parse(Buffer.concat(chunks).toString()); } catch { throw new SessionError('Invalid JSON', 400); }
}
function send(res: ServerResponse, value: unknown) { res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify({ ok: true, ...value as object })); }
export async function handleLicenses(req: IncomingMessage, res: ServerResponse, path: string): Promise<boolean> {
  if (path === '/admin' && req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer', 'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'" });
    res.end(await readFile(new URL('./admin.html', import.meta.url))); return true;
  }
  if (path === '/admin.js' && req.method === 'GET') { res.writeHead(200, { 'content-type': 'text/javascript', 'cache-control': 'no-store' }); res.end(await readFile(new URL('./admin.js', import.meta.url))); return true; }
  if (!path.startsWith('/api/auth/') && !path.startsWith('/api/admin/')) return false;
  await initLicenses();
  if (req.method !== 'POST' && !(path === '/api/admin/licenses' && req.method === 'GET')) throw new SessionError('Method not allowed', 405);
  if (path === '/api/auth/login') {
    throttle(req); const b = await readJson(req);
    if (typeof b.key !== 'string' || b.key.length > 256 || typeof b.deviceId !== 'string' || !/^[a-zA-Z0-9_-]{16,128}$/.test(b.deviceId)) throw new SessionError('Invalid key or device ID', 400);
    const [l] = await query('SELECT * FROM hc_licenses WHERE key_hash=$1', [hash(b.key.trim().toUpperCase())]) as License[];
    if (!l || l.revoked || (Number(l.expires_at) !== 0 && Number(l.expires_at) <= now())) throw new SessionError('Key invalid, expired or revoked', 401);
    const device = l.allowed_devices ? hash(displayDeviceId(b.deviceId)) : hash(b.deviceId);
    if (l.role !== 'owner') {
      if (l.allowed_devices) {
        if (!JSON.parse(l.allowed_devices).includes(device)) throw new SessionError('Key không được cấp cho Device ID này', 401);
      } else {
        await query('UPDATE hc_licenses SET device_hash=$1 WHERE id=$2 AND device_hash IS NULL RETURNING id', [device, l.id]);
      }
    }
    const [bound] = await query('SELECT * FROM hc_licenses WHERE id=$1', [l.id]) as License[];
    if (!bound || bound.revoked || (Number(bound.expires_at) !== 0 && Number(bound.expires_at) <= now()) || (bound.role !== 'owner' && !(bound.allowed_devices ? JSON.parse(bound.allowed_devices).includes(device) : bound.device_hash === device))) throw new SessionError('Key invalid for this device', 401);
    const identity = { role: 'user' as const, sub: l.id, device, version: Number(bound.version) };
    send(res, { accessToken: sign(identity), rememberToken: sign({ ...identity, remember: true }, 30 * 86400), expiresAt: Number(bound.expires_at), tokenSeconds: 1800, isOwner: bound.role === 'owner' }); return true;
  }
  if (path === '/api/auth/refresh') {
    const l = await authorizedLicense(req, true); const c = claims(req, true);
    const b = await readJson(req);
    if (typeof b.deviceId !== 'string' || (l.allowed_devices ? hash(displayDeviceId(b.deviceId)) : hash(b.deviceId)) !== c.device) throw new SessionError('Device mismatch', 401);
    send(res, { accessToken: sign({ role: 'user', sub: l.id, device: c.device, version: Number(l.version) }), expiresAt: Number(l.expires_at), tokenSeconds: 1800, isOwner: l.role === 'owner' }); return true;
  }
  if (path === '/api/admin/login') {
    throttle(req); const b = await readJson(req);
    if (typeof b.password !== 'string' || !equal(b.password, password)) throw new SessionError('Incorrect admin password', 401);
    send(res, { accessToken: sign({ role: 'admin', sub: 'admin', device: '', version: 1 }) }); return true;
  }
  const c = claims(req);
  if (c.role !== 'admin') {
    const caller = await authorizedLicense(req);
    if (caller.role !== 'owner') throw new SessionError('Owner permission required to manage keys', 403);
  }
  if (path === '/api/admin/licenses' && req.method === 'GET') {
    const rows = await query('SELECT id,hint,note,created_at,expires_at,device_hash,revoked,version,role,max_devices,allowed_devices FROM hc_licenses ORDER BY created_at DESC LIMIT 1000');
    send(res, { licenses: rows.map(l => ({ ...l, bound: !!l.device_hash || !!l.allowed_devices, device_hash: undefined, allowed_devices: undefined })) }); return true;
  }
  const b = await readJson(req);
  if (path === '/api/admin/create') {
    const days = Number(b.days);
    if (!Number.isInteger(days) || days < 0 || days > 36500 || typeof b.note !== 'string' || b.note.length > 500) throw new SessionError('days must be 0–36500; note max 500 characters', 400);
    const maxDevices = Number(b.maxDevices ?? 1);
    const ids = Array.isArray(b.deviceIds) ? b.deviceIds : [];
    if (!Number.isInteger(maxDevices) || maxDevices < 1 || maxDevices > 100 || !ids.length || ids.length > maxDevices || ids.some((id: unknown) => typeof id !== 'string' || !/^VIP-(?:[A-HJ-NP-Z2-9]{4}-){4}[A-HJ-NP-Z2-9]{4}$/.test(id))) throw new SessionError('Nhập Device ID hợp lệ; số ID không vượt quá số máy (1–100)', 400);
    if (new Set(ids).size !== ids.length) throw new SessionError('Device ID bị trùng', 400);
    const allowed = JSON.stringify(ids.map(hash));
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const text = Array.from(randomBytes(20), b => alphabet[b & 31]).join('');
    const key = 'VIP-' + text.match(/.{4}/g)!.join('-');
    const id = randomUUID(); const expires = days ? now() + days * 86400 : 0;
    await query('INSERT INTO hc_licenses (id,key_hash,hint,note,created_at,expires_at,max_devices,allowed_devices) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id', [id, hash(key), key.slice(-8), b.note, now(), expires, maxDevices, allowed]);
    send(res, { id, key, expiresAt: expires }); return true;
  }
  if (['/api/admin/revoke', '/api/admin/unbind'].includes(path)) {
    if (typeof b.id !== 'string') throw new SessionError('License ID required', 400);
    const [target] = await query('SELECT role,allowed_devices FROM hc_licenses WHERE id=$1', [b.id]);
    if (c.role !== 'admin' && target?.role === 'owner') throw new SessionError('Use the web Admin to manage owner keys', 403);
    if (path.endsWith('unbind') && target?.allowed_devices) throw new SessionError('Key đã cấp theo ID cố định; hãy thu hồi và cấp lại cho ID mới', 400);
    const rows = await query(path.endsWith('revoke') ? 'UPDATE hc_licenses SET revoked=1,version=version+1 WHERE id=$1 RETURNING id' : 'UPDATE hc_licenses SET device_hash=NULL,version=version+1 WHERE id=$1 RETURNING id', [b.id]);
    if (!rows.length) throw new SessionError('Key not found', 404);
    send(res, {}); return true;
  }
  throw new SessionError('Unknown auth endpoint', 404);
}
