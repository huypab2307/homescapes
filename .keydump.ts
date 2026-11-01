import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { decodeSave } from "./src/engine/codec.ts";

for (const f of process.argv.slice(2)) {
  const c = decodeSave(new Uint8Array(readFileSync(f)));
  const key = c.key;
  if (!key) { console.log(`${f}: no key (plaintext)`); continue; }
  const md5 = createHash("md5").update(key).digest("hex");
  const head = Array.from(key.slice(0, 12)).map(b => b.toString(16).padStart(2, "0")).join("");
  console.log(`${f.split(/[\\/]/).pop()}: keyId=${c.keyId} md5=${md5} head=${head}`);
}
