/* Open the two blobs that were still closed: the event's variables context
   asset, and the donor's income ledger entries for season points. */
import { readFileSync } from "node:fs";
import { openSave, type SaveGame } from "./src/engine/savegame.ts";
import { decodeSave } from "./src/engine/codec.ts";

function load(f: string): SaveGame {
  const c = decodeSave(new Uint8Array(readFileSync(f)));
  return openSave(c.bytes, c.wasEncrypted);
}
const donor = load(process.argv[2]!);
const device = load(process.argv[3]!);

const raw = (s: SaveGame, p: string): string =>
  s.has(p) ? String(s.field(p).value).replace(/\s+/g, " ") : "(ABSENT)";

for (const [label, s] of [["donor", donor], ["device", device]] as const) {
  console.log(`\n===== ${label} vault.v.ptr.v =====`);
  console.log(raw(s, "SpecialEvents.SSPProcedure46.v.components[16].v.second.v.ptr.v.stages.v.ptr.v.vault.v.ptr.v"));
  console.log(`\n===== ${label} dataContextAsset.v =====`);
  console.log(
    raw(s, "SpecialEvents.SSPProcedure46.v.components[16].v.second.v.ptr.v.dataContextAsset.v").slice(0, 2000),
  );
  console.log(`\n===== ${label} EventLogic tail fields =====`);
  const base = "SpecialEvents.SSPProcedure46.v.components[16].v.second.v.ptr.v";
  for (const p of s.paths().filter((p) => p.startsWith(base) && !p.includes(".stages")).sort()) {
    const rel = p.slice(base.length).replace(/^\./, "");
    if (["dataContextAsset", "dataContextAsset.v", "dataContextAsset.t", "dataContextAsset.v.embeddedAsset"].includes(rel))
      continue;
    console.log(`  ${rel.slice(0, 50).padEnd(50)} = ${raw(s, p).slice(0, 60)}`);
  }
}

console.log(`\n===== donor: Incomes entries mentioning Points/Season =====`);
const inc = donor.paths().filter((p) => /^Incomes\./.test(p) && /point|season|ssp/i.test(p));
for (const p of inc.slice(0, 40)) console.log(`  ${p.padEnd(60)} = ${raw(donor, p).slice(0, 40)}`);
console.log(`  (${inc.length} matching leaves)`);

console.log(`\n===== donor: IncomesHistory entry count / last entries =====`);
const hist = donor.paths().filter((p) => /^Incomes\.IncomesHistory\[\d+\]\.v\.amount$/.test(p));
console.log(`  ${hist.length} entries`);
for (const p of hist.slice(-6)) console.log(`  ${p.padEnd(46)} = ${raw(donor, p).slice(0, 30)}`);
