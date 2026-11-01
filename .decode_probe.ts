import { readFileSync, writeFileSync } from "node:fs";
import { decodeSave } from "./src/engine/codec.ts";
const src = process.argv[2]!;
const dst = process.argv[3]!;
const vC = decodeSave(new Uint8Array(readFileSync(src)));
writeFileSync(dst, Buffer.from(vC.bytes));
console.log("decoded", vC.bytes.length, "bytes; wasEncrypted =", vC.wasEncrypted);
