/** Thin desktop gateway. No save decoder/editor or admin authority is imported. */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handleRemote } from './remote.ts';
import { SessionError } from './errors.ts';
const root = fileURLToPath(new URL('../../', import.meta.url));
const dist = resolve(root, 'dist');
const port = Number(process.env.HC_PORT ?? 8787);
const exec = promisify(execFile);
function send(res: ServerResponse, data: unknown, code = 200) { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(data)); }
async function bridge(args: string[]) {
  const exe = process.env.HC_BRIDGE_EXE;
  try {
    const result = await exec(exe ?? process.env.PYTHON ?? 'python', exe ? args : [resolve(root, 'client/hc_client.py'), ...args], { timeout: 180000, windowsHide: true, maxBuffer: 96 * 1024 * 1024 });
    return JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1)!);
  } catch (error: any) {
    if (error.stdout) { try { return JSON.parse(String(error.stdout).trim().split(/\r?\n/).at(-1)!); } catch {} }
    throw new SessionError('ADB bridge failed. Check emulator/root and try again.', 400);
  }
}
async function json(req: IncomingMessage) { let body = ''; for await (const part of req) { body += part; if (body.length > 8192) throw new SessionError('Request too large', 413); } try { return JSON.parse(body); } catch { throw new SessionError('Invalid JSON', 400); } }
const mime: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
createServer((req, res) => { void (async () => {
  try {
    if (!['127.0.0.1', 'localhost'].some(host => req.headers.host === `${host}:${port}`)) throw new SessionError('Invalid Host', 403);
    if (req.headers.origin && ![`http://127.0.0.1:${port}`, `http://localhost:${port}`].includes(req.headers.origin)) throw new SessionError('Origin not allowed', 403);
    const url = new URL(req.url ?? '/', `http://127.0.0.1:${port}`);
    if (url.pathname === '/api/health') { send(res, { ok: true, app: 'Homescapes Save Studio', clientVersion: process.env.HC_DESKTOP_VERSION ?? 'development' }); return; }
    if (await handleRemote(req, res, url, bridge)) return;
    if (req.method === 'GET' && url.pathname === '/api/devices') { send(res, await bridge(['adb-info'])); return; }
    const commands: Record<string, string> = { '/api/device/stop': 'force-stop', '/api/device/start': 'start', '/api/device/restore': 'restore-backup' };
    const command = commands[url.pathname];
    if (req.method === 'POST' && command) {
      const data = await json(req); if (typeof data.serial !== 'string' || !data.serial) throw new SessionError('Select a device first', 400);
      const result = await bridge([command, '--serial', data.serial]); send(res, result, result.ok ? 200 : 400); return;
    }
    if (url.pathname.startsWith('/api/')) throw new SessionError('Endpoint unavailable', 404);
    if (req.method !== 'GET') throw new SessionError('Method not allowed', 405);
    const path = resolve(dist, '.' + decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname));
    if (!path.startsWith(dist + sep)) throw new SessionError('Invalid path', 403);
    if (!(await stat(path)).isFile()) throw new SessionError('Not found', 404);
    res.writeHead(200, { 'content-type': mime[extname(path)] ?? 'application/octet-stream', 'x-content-type-options': 'nosniff' }); res.end(await readFile(path));
  } catch (error) { if (!res.headersSent) send(res, { ok: false, error: error instanceof Error ? error.message : 'Request failed' }, error instanceof SessionError ? error.status : 500); else res.end(); }
})(); }).listen(port, '127.0.0.1', () => console.log(`Desktop gateway ready on 127.0.0.1:${port}`));
