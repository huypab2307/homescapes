/* Dump the save's GlobalVars subtree + every path that mentions golden/SeasonPass/SSP. */
import { readFileSync } from "node:fs";
import { decodeSave } from "./src/engine/codec.ts";
import { openSave } from "./src/engine/savegame.ts";

const file = process.argv[2]!;
const c = decodeSave(new Uint8Array(readFileSync(file)));
const s = openSave(c.bytes, c.wasEncrypted);

console.log(`== GlobalVars children (direct) ==`);
try { console.log(s.children("GlobalVars").join(", ")); } catch (e) { console.log("err", e); }

const re = /(golden|seasonpass|sspspooky|sspprocedure|spooky|gold)/i;
let n = 0;
for (const p of s.paths()) {
  if (!re.test(p)) continue;
  const f = s.field(p);
  const k = f.kind;
  if (k === "object" || k === "array") {
    console.log(`OBJ ${p}`);
    continue;
  }
  const v = String(f.value).replace(/\s+/g, " ").slice(0, 110);
  console.log(`${p} = ${v}`);
  if (++n > 400) { console.log("(cut)"); break; }
}
console.log(`\nTotal matching path prints: ${n}`);

// GlobalVars scalar dump
console.log(`\n== GlobalVars scalars (first 250) ==`);
let g = 0;
for (const p of s.paths()) {
  if (!p.startsWith("GlobalVars")) continue;
  const f = s.field(p);
  if (f.kind === "object" || f.kind === "array") continue;
  console.log(`${p} = ${String(f.value).replace(/\s+/g, " ").slice(0, 100)}`);
  if (++g > 250) { console.log("(cut)"); break; }
}
