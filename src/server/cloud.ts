import { createHash, timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { SessionError } from "./session.ts";

export const CLOUD = process.env.HC_CLOUD_MODE === "1";
const key = process.env.HC_API_KEY ?? "";
if (CLOUD && key.length < 32) throw new Error("HC_API_KEY must be at least 32 characters in cloud mode");
const routes = new Set([
  "/api/health", "/api/sessions", "/api/session/load", "/api/session/reset", "/api/overview",
  "/api/values", "/api/discover", "/api/field", "/api/apply", "/api/export",
  "/api/cosmetics/catalog", "/api/cosmetics/state", "/api/cosmetics", "/api/cards/grant",
  "/api/clone/source", "/api/clone-content", "/api/seasonpass/unlock", "/api/seasonpass/max-gp",
]);
export function cloudScope(req: IncomingMessage, path: string): string {
  if (!routes.has(path)) throw new SessionError("This endpoint is available only in the desktop client", 403);
  const supplied = String(req.headers.authorization ?? "").replace(/^Bearer /, "");
  const hash = (value: string) => createHash("sha256").update(value).digest();
  if (!timingSafeEqual(hash(supplied), hash(key))) throw new SessionError("Invalid server API key", 401);
  const client = String(req.headers["x-hc-client"] ?? "");
  if (!/^[a-zA-Z0-9_-]{16,128}$/.test(client)) throw new SessionError("A desktop client id is required", 400);
  return client;
}
