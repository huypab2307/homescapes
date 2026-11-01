/* g13: FULL dump of RewardHolder [40] for device-after + donor46 (no skips). */
import { readFileSync } from "node:fs";
import { decodeSave } from "./src/engine/codec.ts";
import { openSave, type SaveGame } from "./src/engine/savegame.ts";

function load(f: string): SaveGame {
  const c = decodeSave(new Uint8Array(readFileSync(f)));
  return openSave(c.bytes, c.wasEncrypted);
}
const after = load(process.argv[2]!);
const donor = load(process.argv[3]!);

for (const [label, s, root] of [
  ["AFTER spooky48[40]", after, "SpecialEvents.SSPSpooky48"],
  ["DONOR 46[40]", donor, "SpecialEvents.SSPProcedure46"],
] as Array<[string, SaveGame, string]>) {
  const base = `${root}.v.components[40].v.second.v.ptr.v`;
  console.log(`\n########## ${label} ##########`);
  for (const p of s.paths()) {
    if (!p.startsWith(base)) continue;
    const f = s.field(p);
    const rel = p.slice(base.length) || "(self)";
    const val = f.kind === "object" || f.kind === "array" ? `[${f.kind}]` : String(f.value);
    console.log(`  ${rel} = ${val}`);
  }
}
