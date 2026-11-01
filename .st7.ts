/* Print the RAW Currency object text (first ~1400 chars) + leaf kinds. */
import { readFileSync } from "node:fs";
import { decodeSave } from "./src/engine/codec.ts";
import { openSave, type SaveGame } from "./src/engine/savegame.ts";

function load(f: string): SaveGame {
  const c = decodeSave(new Uint8Array(readFileSync(f)));
  return openSave(c.bytes, c.wasEncrypted);
}
const file = process.argv[2]!;
const s = load(file);
console.log(`file: ${file}`);

const cur = s.field("Currency"); // root object itself
const raw = s.rawText("Currency");
console.log(`Currency kind=${cur.kind} rawlen=${raw.length}`);
console.log("Currency children count =", s.children("Currency").length);
console.log("\n--- raw (first 1200) ---");
console.log(raw.slice(0, 1200));
console.log("--- raw (around SSPProcedure46, first match) ---");
const i = raw.indexOf("SSPProcedure46");
if (i >= 0) console.log(raw.slice(Math.max(0, i - 60), i + 400));
else console.log("(SSPProcedure46 not found in Currency raw)");
for (const p of ["Currency.SSPProcedure46Points", "Currency.SSPProcedure46Points.amount", "Currency.ExpeditionTickets.amount", "Currency.coins"]) {
  if (!s.has(p)) { console.log(`MISSING leaf: ${p}`); continue; }
  const f2 = s.field(p);
  console.log(`leaf ${p.padEnd(46)} kind=${f2.kind} tag=${f2.tag ?? "-"} raw=${s.rawText(p).slice(0, 60)}`);
}
