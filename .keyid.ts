import { readFileSync } from "node:fs";
import { decodeSave, describeCodec } from "./src/engine/codec.ts";

for (const f of process.argv.slice(2)) {
  const raw = new Uint8Array(readFileSync(f));
  const c = decodeSave(raw);
  console.log(`${f.split(/[\\/]/).pop()}: keyId=${c.keyId} wasEncrypted=${c.wasEncrypted} ` +
              `keylen=${c.key ? c.key.length : "-"} label=${describeCodec(c, raw)} ` +
              `json=${c.bytes.length}${c.warning ? " WARN=" + c.warning.slice(0, 60) : ""}`);
}
