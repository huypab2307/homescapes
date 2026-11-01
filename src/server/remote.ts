/** Desktop gateway: ADB/UI stay local; save processing is forwarded over HTTPS. */
import type { IncomingMessage, ServerResponse } from "node:http";
import { randomUUID } from "node:crypto";
import { writeFile, mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { SessionError } from "./errors.ts";

interface Config { url: string; apiKey: string; clientId: string }
let config: Config = { url: process.env.HC_REMOTE_URL ?? "https://homescapes-save-api.onrender.com", apiKey: "", clientId: process.env.HC_DEVICE_ID ?? randomUUID() };
let licenseKey = "";
let tokenUntil = 0;
let expiresAt = 0;
let refreshPending: Promise<void> | undefined;
const provenance = new Map<string, { serial: string; package: string; file: string }>();
const initialize = async () => {};
async function activate(key: string) {
  const response = await fetch(endpoint(config.url) + '/api/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ key, deviceId: config.clientId }), redirect: 'error', signal: AbortSignal.timeout(120000),
  });
  const data = await response.json() as any;
  if (!response.ok) throw new SessionError(data.error ?? 'Login failed', response.status);
  config.apiKey = data.accessToken; tokenUntil = Date.now() + data.tokenSeconds * 1000; expiresAt = data.expiresAt;
}
async function ensureToken() {
  if (!licenseKey) throw new SessionError('Please log in with your license key', 401);
  if (Date.now() < tokenUntil - 60000) return;
  await (refreshPending ??= activate(licenseKey).catch(error => { config.apiKey = ''; licenseKey = ''; throw error; }).finally(() => { refreshPending = undefined; }));
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
    if (response.status === 401) { licenseKey = ''; config.apiKey = ''; provenance.clear(); }
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
  if (url.pathname === '/api/local/auth') {
    if (req.method === 'POST') {
      const data = JSON.parse((await body(req)).toString());
      if (data.logout) { licenseKey = ''; config.apiKey = ''; provenance.clear(); }
      else {
        if (typeof data.key !== 'string' || data.key.length > 256) throw new SessionError('Invalid license key', 400);
        await activate(data.key.trim()); licenseKey = data.key.trim(); provenance.clear();
      }
    } else if (req.method !== 'GET') throw new SessionError('Method not allowed', 405);
    send(res, { ok: true, loggedIn: !!licenseKey && !!config.apiKey, deviceId: config.clientId, url: config.url, expiresAt });
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
  if (response.status === 401) { licenseKey = ''; config.apiKey = ''; provenance.clear(); }
  res.writeHead(response.status, { "content-type": response.headers.get("content-type") ?? "application/json", "cache-control": "no-store" });
  res.end(Buffer.from(await response.arrayBuffer()));
  return true;
}
