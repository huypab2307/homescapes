/* Shallow (depth<=2) scalar comparison of the season-pass logic/log/holder components. */
import { readFileSync } from "node:fs";
import { decodeSave } from "./src/engine/codec.ts";
import { openSave } from "./src/engine/savegame.ts";

function load(f: string) {
  const c = decodeSave(new Uint8Array(readFileSync(f)));
  return openSave(c.bytes, c.wasEncrypted);
}
const device = load(process.argv[2]!);
const donor = load(process.argv[3]!);

const CHIPS: Array<[string, string, string]> = [
  ["SPOOKY48  logic", "SpecialEvents.SSPSpooky48.v.components[16].v.second.v.ptr.v.", device],
  ["DONOR46   logic", "SpecialEvents.SSPProcedure46.v.components[16].v.second.v.ptr.v.", donor],
  ["SPOOKY48  log26", "SpecialEvents.SSPSpooky48.v.components[26].v.second.v.ptr.v.", device],
  ["DONOR46   log26", "SpecialEvents.SSPProcedure46.v.components[26].v.second.v.ptr.v.", donor],
  ["SPOOKY48  hold40", "SpecialEvents.SSPSpooky48.v.components[40].v.second.v.ptr.v.", device],
  ["DONOR46   hold40", "SpecialEvents.SSPProcedure46.v.components[40].v.second.v.ptr.v.", donor],
];
for (const [label, base, s] of CHIPS) {
  console.log(`\n===== ${label} =====`);
  for (const p of s.paths()) {
    if (!p.startsWith(base)) continue;
    const rel = p.slice(base.length);
    if (rel.startsWith("stages")) continue;
    if (rel.includes("[") || rel.includes(".")) { // deeper than 2 segments
      const segs = rel.split(".");
      if (segs.length > 2) continue;
    }
    const f = s.field(p);
    if (f.kind === "object" || f.kind === "array") continue;
    console.log(`  ${rel} = ${String(f.value).replace(/\s+/g, " ").slice(0, 120)}`);
  }
}
