/* Pin the exact tree shape so a donor-shape copier can be written safely. */
import { readFileSync } from "node:fs";
import { openSave, type SaveGame } from "./src/engine/savegame.ts";
import { decodeSave } from "./src/engine/codec.ts";

function load(f: string): SaveGame {
  const c = decodeSave(new Uint8Array(readFileSync(f)));
  return openSave(c.bytes, c.wasEncrypted);
}
const donor = load(process.argv[2]!);
const device = load(process.argv[3]!);

for (const [label, s] of [["donor", donor], ["device", device]] as const) {
  console.log(`\n===== ${label} =====`);
  for (const p of [
    "SpecialEvents.SSPProcedure46",
    "SpecialEvents.SSPProcedure46.v",
    "SpecialEvents.SSPProcedure46.v.components",
  ]) {
    const f = s.field(p);
    console.log(`  ${p.padEnd(44)} kind=${f.kind.padEnd(12)} children=${JSON.stringify(s.children(p))}`);
  }
  console.log(`  rawText(v).slice(0,120) = ${s.rawText("SpecialEvents.SSPProcedure46.v").slice(0, 120)}`);
  console.log(`  rawText(root).slice(0,160) = ${s.rawText("SpecialEvents.SSPProcedure46").slice(0, 160)}`);
}

console.log(`\n===== all 59 component names (donor) =====`);
const names: string[] = [];
for (const p of donor.paths()) {
  const mt = /^SpecialEvents\.SSPProcedure46\.v\.components\[(\d+)\]\.v\.first$/.exec(p);
  if (mt) names[Number(mt[1])] = String(donor.field(p).value);
}
names.forEach((n, i) => console.log(`  ${String(i).padStart(2)}  ${n}`));

console.log(`\n===== does the donor's event carry a purchase-shaped component? =====`);
for (const [i, n] of names.entries()) {
  if (/Golden|Purchase|Ticket|Offer|Currency/i.test(n)) {
    const base = `SpecialEvents.SSPProcedure46.v.components[${i}]`;
    console.log(`  [${i}] ${n}: ${donor.paths().filter((p) => p.startsWith(base)).length} leaves`);
  }
}
