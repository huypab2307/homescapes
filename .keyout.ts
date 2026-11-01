import { readFileSync, writeFileSync } from "node:fs";
import { decodeSave } from "./src/engine/codec.ts";
const c = decodeSave(new Uint8Array(readFileSync(process.argv[2]!)));
if (!c.key) { console.log("no key"); process.exit(1); }
writeFileSync(process.argv[3]!, Buffer.from(c.key));
console.log("key written", c.key.length, "bytes keyId=", c.keyId);
