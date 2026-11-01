/* g9: full dump of GoldenTicketOffer [20] (donor + device-after). */
import { readFileSync } from "node:fs";
import { decodeSave } from "./src/engine/codec.ts";
import { openSave, type SaveGame } from "./src/engine/savegame.ts";

function load(f: string): SaveGame {
  const c = decodeSave(new Uint8Array(readFileSync(f)));
  return openSave(c.bytes, c.wasEncrypted);
}
const after = load(process.argv[2]!);
const donor = load(process.argv[3]!);

for (const [label, s, comp] of [
  ["AFTER spooky48[20]", after, 20],
  ["DONOR 46[20]", donor, 20],
] as Array<[string, SaveGame, number]>) {
  const root = /^(DONOR)/.test(label) ? "SpecialEvents.SSPProcedure46" : "SpecialEvents.SSPSpooky48";
  const base = `${root}.v.components[${comp}].v.second.v.ptr.v`;
  console.log(`\n===== ${label} =====`);
  for (const p of s.paths()) {
    if (!p.startsWith(base)) continue;
    const f = s.field(p);
    const rel = p.slice(base.length) || "(self)";
    const val = f.kind === "object" || f.kind === "array" ? `[${f.kind}]` : String(f.value);
    console.log(`  ${rel} = ${val}`);
  }
}
