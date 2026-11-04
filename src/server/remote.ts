/** Desktop gateway: ADB/UI stay local; save processing is forwarded over HTTPS. */
import type { IncomingMessage, ServerResponse } from "node:http";
import { displayDeviceId } from "./deviceId.ts";
import { randomUUID } from "node:crypto";
import { writeFile, readFile, readdir, open, rename, mkdir, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { homedir, tmpdir } from "node:os";
import { SessionError } from "./errors.ts";

interface Config { url: string; apiKey: string; clientId: string }
let config: Config = { url: process.env.HC_REMOTE_URL ?? "https://homescapes-save-api.onrender.com", apiKey: "", clientId: process.env.HC_DEVICE_ID ?? randomUUID() };
let licenseKey = "";
let tokenUntil = 0;
let expiresAt = 0;
let isOwner = false;
let newAccountBusy = false;
let refreshPending: Promise<void> | undefined;
const provenance = new Map<string, { serial: string; package: string; file: string }>();
const initialize = async () => {};
function clearAuth() { licenseKey = ''; config.apiKey = ''; isOwner = false; tokenUntil = 0; expiresAt = 0; provenance.clear(); }
async function activate(key: string) {
  const response = await fetch(endpoint(config.url) + '/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ key, deviceId: config.clientId }), redirect: 'error', signal: AbortSignal.timeout(120000),
  });
  const data = await response.json() as any;
  if (!response.ok) throw new SessionError(data.error ?? 'Login failed', response.status);
  config.apiKey = data.accessToken; tokenUntil = Date.now() + data.tokenSeconds * 1000; expiresAt = data.expiresAt; isOwner = data.isOwner === true;
}
async function ensureToken() {
  if (!licenseKey) throw new SessionError('Please log in with your license key', 401);
  if (Date.now() < tokenUntil - 60000) return;
  await (refreshPending ??= activate(licenseKey).catch(error => { clearAuth(); throw error; }).finally(() => { refreshPending = undefined; }));
}
async function body(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const chunk of req) { const b = Buffer.from(chunk); size += b.length;
    if (size > 96 * 1024 * 1024) throw new SessionError("Request too large", 413); chunks.push(b); }
  return Buffer.concat(chunks);
}
function endpoint(value: string): string {
  if (!value) return "";
  const url = new URL(value);
  const testLocal = process.env.HC_ALLOW_HTTP_REMOTE === "1" && url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
  if ((!testLocal && url.protocol !== "https:") || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new SessionError("Use an HTTPS server origin, for example https://your-app.onrender.com", 400);
  }
  return url.origin;
}
async function remote(path: string, method = "GET", data?: Buffer | object, settings = config): Promise<Response> {
  await ensureToken();
  try {
    const response = await fetch(endpoint(settings.url) + path, {
      method, headers: { authorization: `Bearer ${settings.apiKey}`, "x-hc-client": settings.clientId, "content-type": "application/json" },
      body: data === undefined ? undefined : Buffer.isBuffer(data) ? new Uint8Array(data) : JSON.stringify(data),
      signal: AbortSignal.timeout(120_000), redirect: "error",
    });
    if (response.status === 401) { clearAuth(); }
    return response;
  } catch {
    throw new SessionError("Cannot reach Render. Check the URL, connection and server status, then retry. Your game has not been pushed.", 502);
  }
}
async function jsonRemote(path: string, data?: object, settings = config): Promise<any> {
  const response = await remote(path, data ? "POST" : "GET", data, settings);
  let result: any;
  try { result = await response.json(); } catch { throw new SessionError("Render returned an unexpected response", 502); }
  if (!response.ok || result.ok === false) throw new SessionError(result.error ?? result.errors?.join("; ") ?? "Remote operation failed", response.status);
  return result;
}
function send(res: ServerResponse, result: unknown, status = 200) {
  res.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  res.end(JSON.stringify(result));
}

export async function handleRemote(req: IncomingMessage, res: ServerResponse, url: URL,
  bridge: (args: string[]) => Promise<any>): Promise<boolean> {
  await initialize();
  if (newAccountBusy && url.pathname.startsWith('/api/') && url.pathname !== '/api/health') throw new SessionError('New-account operation in progress. Wait until it finishes.', 409);
  if (url.pathname === '/api/local/auth') {
    if (req.method === 'POST') {
      const data = JSON.parse((await body(req)).toString());
      if (data.logout) { clearAuth(); }
      else {
        if (typeof data.key !== 'string' || data.key.length > 256) throw new SessionError('Invalid license key', 400);
        await activate(data.key.trim()); licenseKey = data.key.trim(); provenance.clear();
      }
    } else if (req.method !== 'GET') throw new SessionError('Method not allowed', 405);
    send(res, { ok: true, loggedIn: !!licenseKey && !!config.apiKey, deviceId: displayDeviceId(config.clientId), url: config.url, expiresAt, isOwner: !!licenseKey && !!config.apiKey && isOwner });
    return true;
  }
  if (url.pathname === '/api/remote/config') {
    if (req.method !== 'GET') throw new SessionError('Server URL is configured by the release owner. Use license login.', 403);
    send(res, { ok: true, url: config.url, hasApiKey: !!licenseKey, mode: 'remote' }); return true;
  }
  if (!config.url || !url.pathname.startsWith("/api/") || url.pathname === "/api/health") return false;
  const path = url.pathname;
  await ensureToken();
  // Device controls remain on the local bridge, including discovery and backup restore.
  if (["/api/devices", "/api/device/stop", "/api/device/start", "/api/device/restore"].includes(path)) return false;

  if (path === '/api/fresh-start/new-account' || path === '/api/fresh-start/restore') {
    if (req.method !== 'POST') throw new SessionError('Method not allowed', 405);
    const data = JSON.parse((await body(req)).toString());
    if (typeof data.serial !== 'string' || !data.serial) throw new SessionError('Chọn thiết bị để tiếp tục', 400);
    const restoring = path.endsWith('/restore');
    const source = provenance.get(data.sessionId);
    if (!restoring && (data.confirmation !== 'DELETE_SAVE_FILES' || !source || source.serial !== data.serial)) throw new SessionError('Kết nối lại thiết bị trước khi tiếp tục', 400);
    newAccountBusy = true;
    let localBackup = '';
    try {
      const backupDir = process.env.HC_BACKUP_DIR ?? join(process.env.LOCALAPPDATA ?? homedir(), 'HomescapesSaveStudio', 'backups');
      if (restoring) {
        await jsonRemote('/api/sessions'); // verify license is still valid before restoring
        let files: string[] = [];
        try { files = (await readdir(backupDir)).filter(name => /^fresh-start-\d+-[a-f0-9-]+\.json$/.test(name)).sort().reverse(); } catch {}
        for (const name of files) {
          try {
            const record = JSON.parse(await readFile(join(backupDir, name), 'utf8'));
            if (record.serial === data.serial) { localBackup = join(backupDir, name); break; }
          } catch { /* Skip incomplete or unavailable records. */ }
        }
        if (!localBackup) throw new SessionError('Chưa có bản sao lưu cho thiết bị này', 400);
      } else {
        await jsonRemote('/api/fresh-start/authorize', { sessionId: data.sessionId, confirmation: data.confirmation });
        const snapshot = await bridge(['fresh-start-snapshot', '--serial', data.serial, '--expect-package', source!.package, '--expect-file', source!.file]);
        if (!snapshot.ok || snapshot.serial !== data.serial || snapshot.package !== source!.package || snapshot.file !== source!.file || !snapshot.files) throw new SessionError('Không thể chuẩn bị bản sao lưu. Hãy kết nối lại thiết bị.', 400);
        const expected = ['SaveGame.db', 'SaveGame.db.bak', 'SaveGame.db.buf'];
        if (Object.keys(snapshot.files).length !== 3 || expected.some(name => !(name in snapshot.files))) throw new SessionError('Bản sao lưu chưa đầy đủ', 400);
        const total = expected.reduce((sum, name) => sum + (typeof snapshot.files[name] === 'string' ? Buffer.from(snapshot.files[name], 'base64').length : 0), 0);
        if (!snapshot.files['SaveGame.db'] || total < 16 || total > 64 * 1024 * 1024) throw new SessionError('Bản sao lưu không hợp lệ', 400);
        await mkdir(backupDir, { recursive: true });
        localBackup = join(backupDir, `fresh-start-${Date.now()}-${randomUUID()}.json`);
        const pendingBackup = join(backupDir, `.pending-${randomUUID()}.tmp`);
        try {
          const handle = await open(pendingBackup, 'wx', 0o600);
          try { await handle.writeFile(JSON.stringify(snapshot)); await handle.sync(); }
          finally { await handle.close(); }
          await rename(pendingBackup, localBackup);
        } finally { await rm(pendingBackup, { force: true }); }
        await jsonRemote('/api/fresh-start/authorize', { sessionId: data.sessionId, confirmation: data.confirmation });
      }
      const retired = [...provenance].filter(([, entry]) => entry.serial === data.serial).map(([id]) => id);
      for (const id of retired) provenance.delete(id);
      const result = await bridge([restoring ? 'fresh-start-restore' : 'fresh-start', '--serial', data.serial, '--snapshot', localBackup]);
      if (!result.ok) throw new SessionError(restoring ? 'Không thể khôi phục tài khoản trước đó' : 'Không thể hoàn tất. Hãy thử khôi phục tài khoản trước đó.', 400);
      await Promise.allSettled(retired.map(sessionId => jsonRemote('/api/session/close', { sessionId })));
      send(res, { ...result, ok: true, localBackup, needsReconnect: true });
    } catch (error) {
      console.error('Fresh Start:', error instanceof Error ? error.message : String(error));
      if (error instanceof SessionError) throw error;
      throw new SessionError('Không thể hoàn tất. Hãy kết nối lại thiết bị hoặc khôi phục tài khoản trước đó.', 500);
    } finally { newAccountBusy = false; }
    return true;
  }

  const uploaded = async (serial: string) => {
    if (!serial) throw new SessionError("Select a device first", 400);
    const pulled = await bridge(["pull", "--serial", serial]);
    if (!pulled.ok || !pulled.b64) throw new SessionError(pulled.error ?? "Could not read local save", 400);
    const loaded = await jsonRemote("/api/session/load", { b64: pulled.b64, name: `device:${serial}` });
    const id = loaded.overview.meta.id;
    provenance.set(id, { serial, package: pulled.package, file: pulled.file });
    return { ...pulled, ...loaded };
  };
  const pushRemote = async (id: string, serial: string, restart: boolean) => {
    const source = provenance.get(id);
    if (!source || source.serial !== serial) throw new SessionError("Connect this device again before pushing the remote save", 400);
    // Refuse to write into a different package/path if the local device changed.
    const current = await bridge(["pull", "--serial", serial]);
    if (!current.ok || current.package !== source.package || current.file !== source.file) {
      throw new SessionError("The device save source changed. Connect again before Push.", 400);
    }
    const response = await remote(`/api/export?sessionId=${encodeURIComponent(id)}`);
    if (!response.ok) { const error = await response.json() as any; throw new SessionError(error.error ?? "Cannot download edited save. Connect again.", response.status); }
    const data = new Uint8Array(await response.arrayBuffer());
    if (data.length < 16 || data.length > 64 * 1024 * 1024) throw new SessionError("Invalid save download", 502);
    const folder = await mkdtemp(join(tmpdir(), "hcs-render-"));
    try {
      const file = join(folder, "SaveGame.db"); await writeFile(file, data);
      const args = ["push", "--serial", serial, "--in", file]; if (!restart) args.push("--no-restart");
      const result = await bridge(args);
      if (!result.ok) throw new SessionError(result.error ?? "Local Push failed", 400);
      return result;
    } finally { await rm(folder, { recursive: true, force: true }); }
  };
  if (req.method === "POST" && ["/api/device/pull", "/api/device/push", "/api/clone-content", "/api/seasonpass/unlock"].includes(path)) {
    const data = JSON.parse((await body(req)).toString());
    if (path === "/api/device/pull") send(res, await uploaded(data.serial));
    else if (path === "/api/device/push") send(res, await pushRemote(data.sessionId, data.serial, data.restart !== false));
    else {
      const loaded = await uploaded(data.serial);
      const result = await jsonRemote(path, { ...data, path: undefined, sessionId: loaded.overview.meta.id });
      if (path === "/api/seasonpass/unlock") {
        const pushed = await pushRemote(result.overview.meta.id, data.serial, true);
        send(res, { ...result, relaunched: pushed.relaunched });
      } else send(res, result);
    }
    return true;
  }
  if (path === "/api/session/load") throw new SessionError("Use Connect to load a local device save in remote mode", 400);
  if (path === "/api/session/reset" && req.method === "POST") {
    const data = JSON.parse((await body(req)).toString());
    const result = await jsonRemote(path, data);
    const source = provenance.get(data.sessionId); if (source) provenance.set(result.overview.meta.id, source);
    send(res, result); return true;
  }
  // Stream the protocol response back. Never expose the server API key to JS.
  const response = await remote(url.pathname + url.search, req.method,
    req.method === "GET" ? undefined : await body(req));
  if (response.status === 401) { clearAuth(); }
  res.writeHead(response.status, { "content-type": response.headers.get("content-type") ?? "application/json", "cache-control": "no-store" });
  res.end(Buffer.from(await response.arrayBuffer()));
  return true;
}
