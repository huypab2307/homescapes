/* Count EMPTY-value tokens (valStart==valEnd null spans) in a save. */
import { readFileSync } from "node:fs";
import { decodeSave } from "./src/engine/codec.ts";
import { openSave } from "./src/engine/savegame.ts";

const file = process.argv[2]!;
const c = decodeSave(new Uint8Array(readFileSync(file)));
const s = openSave(c.bytes, c.wasEncrypted);
let empty = [];
for (const p of s.paths()) {
  const m = s.span(p);
  if (m.type === "null" && m.valEnd - m.valStart === 0) empty.push(p);
}
console.log(`${file}: empty-value tokens = ${empty.length}`);
for (const p of empty) console.log(`  ${p}`);
