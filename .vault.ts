/* The vault holds the real key balance: currentPoints / pointsToComplete
   (the UI's "0/1"), plus lastPointsAccepted and lastPointsAdded, which look
   like the guard the client checks a balance against. Read both saves. */
import { readFileSync } from "node:fs";
import { openSave, type SaveGame } from "./src/engine/savegame.ts";
import { decodeSave } from "./src/engine/codec.ts";

function load(f: string): SaveGame {
  const c = decodeSave(new Uint8Array(readFileSync(f)));
  return openSave(c.bytes, c.wasEncrypted);
}
const donor = load(process.argv[2]!);
const device = load(process.argv[3]!);

const SEASONS = ["SSPProcedure46", "SSPProcedure47", "SSPProcedure49"];

for (const season of SEASONS) {
  console.log(`\n################ ${season} ################`);
  for (const [label, s] of [["donor", donor], ["device", device]] as const) {
    const base = `SpecialEvents.${season}.v.components[16].v.second.v.ptr.v.stages.v.ptr.v`;
    const ps = s.paths().filter((p) => p.startsWith(base) && !p.includes(".stages["));
    console.log(`--- ${label}: stages container (${ps.length} leaves) ---`);
    for (const p of ps.sort()) {
      const rel = p.slice(base.length).replace(/^\./, "");
      console.log(`    ${rel.slice(0, 62).padEnd(62)} = ${String(s.field(p).value).replace(/\s+/g, " ").slice(0, 58)}`);
    }
  }
}

console.log(`\n################ SSPProcedure46: EventLogic fields outside stages ################`);
for (const [label, s] of [["donor", donor], ["device", device]] as const) {
  const base = "SpecialEvents.SSPProcedure46.v.components[16].v.second.v.ptr.v";
  const ps = s.paths().filter((p) => p.startsWith(base) && !p.includes(".stages"));
  console.log(`--- ${label} (${ps.length}) ---`);
  for (const p of ps.sort()) {
    console.log(`    ${p.slice(base.length).replace(/^\./, "").slice(0, 58).padEnd(58)} = ${String(s.field(p).value).replace(/\s+/g, " ").slice(0, 58)}`);
  }
}
