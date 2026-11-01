/* Compare level/coins/stars across two saves. */
import { readFileSync } from "node:fs";
import { decodeSave } from "./src/engine/codec.ts";
import { openSave, type SaveGame } from "./src/engine/savegame.ts";

function load(f: string): SaveGame {
  const c = decodeSave(new Uint8Array(readFileSync(f)));
  return openSave(c.bytes, c.wasEncrypted);
}
const a = load(process.argv[2]!);
const b = load(process.argv[3]!);

for (const [name, s] of [["A:" + process.argv[2]!, a], ["B:" + process.argv[3]!, b]] as const) {
  console.log(`\n== ${name} ==`);
  const wanted = /^(Properties|Properties\.level|Properties\.coins|Properties\.stars|Currency\.ExpeditionTickets\.amount)/;
  for (const p of s.paths().filter((p) => wanted.test(p) && s.field(p).kind !== "object" && s.field(p).kind !== "array").sort()) {
    console.log(`  ${p.padEnd(50)} = ${String(s.field(p).value).slice(0, 40)}`);
  }
  for (const p of s.paths().filter((p) => /coin|star/i.test(p) && s.field(p).kind !== "object" && s.field(p).kind !== "array" && !/Star_|starship/i.test(p)).slice(0, 30).sort()) {
    const v = s.field(p).value;
    if (typeof v === "number" && v === 0) continue;
    console.log(`  ~ ${p.padEnd(50)} = ${String(v).slice(0, 40)}`);
  }
}
