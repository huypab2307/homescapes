/* Deep state probe: stage flags, real balances, statesGraph, level. */
import { readFileSync } from "node:fs";
import { decodeSave } from "./src/engine/codec.ts";
import { openSave } from "./src/engine/savegame.ts";

const f = process.argv[2]!;
const c = decodeSave(new Uint8Array(readFileSync(f)));
const s = openSave(c.bytes, c.wasEncrypted);

function dump(prefix: string, filter: RegExp, max = 100) {
  console.log(`\n== ${prefix} ==`);
  let n = 0;
  for (const p of s.paths().filter((p) => filter.test(p) && s.field(p).type !== "object" && s.field(p).type !== "array").sort()) {
    if (++n > max) { console.log("  ..."); break; }
    console.log(`  ${p.padEnd(76)} = ${String(s.field(p).value).replace(/\s+/g, " ").slice(0, 48)}`);
  }
}

dump("Currency leaves", /^Currency\.|^Currency$/);
dump("stage[0] subtree", /components\[16\].*stages\[0\]/);
dump("stage[29..30] flags", /components\[16\].*stages\[29\]|components\[16\].*stages\[30\]/);
dump("statesGraph subtree", /statesGraph/);
dump("level/areas/coins", /^Properties\.|^Levels|^Areas|^Homes|^Rooms/);
console.log(`\nlevel leaf: ${s.paths().filter((p) => /level/i.test(p) && !/orable|Leveling|LevelBooster/i.test(p)).slice(0, 40).join("\n")}`);
