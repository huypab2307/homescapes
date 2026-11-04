import { licenseScope } from "./licenses.ts";
import type { IncomingMessage } from "node:http";
import { SessionError } from "./session.ts";

export const CLOUD = process.env.HC_CLOUD_MODE === "1";
const routes = new Set([
  "/api/session/close", "/api/fresh-start/authorize", "/api/fresh-start/prepare", "/api/health", "/api/sessions", "/api/session/load", "/api/session/reset", "/api/overview",
  "/api/values", "/api/discover", "/api/field", "/api/apply", "/api/export",
  "/api/cosmetics/catalog", "/api/cosmetics/state", "/api/cosmetics", "/api/cards/grant",
  "/api/clone/source", "/api/clone-content", "/api/seasonpass/unlock", "/api/seasonpass/max-gp",
]);
export async function cloudScope(req: IncomingMessage, path: string): Promise<string> {
  if (!routes.has(path)) throw new SessionError("This endpoint is available only in the desktop client", 403);
  return licenseScope(req);
}
