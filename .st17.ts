/* Dump spooky48 logic components; compare with donor 46 for entitlement field names. */
import { readFileSync } from "node:fs";
import { decodeSave } from "./src/engine/codec.ts";
import { openSave } from "./src/engine/savegame.ts";

function load(f: string) {
  const c = decodeSave(new Uint8Array(readFileSync(f)));
  return openSave(c.bytes, c.wasEncrypted);
}
const device = load(process.argv[2]!);
const donor = load(process.argv[3]!);

const stageBase = (season: string) =>
  `SpecialEvents.${season}.v.components[16].v.second.v.ptr.v.stages.v.ptr.v.stages`;

console.log("===== spooky48 stage thresholds/completed =====");
for (let i = 0; i <= 30; i++) {
  const b = `${stageBase("SSPSpooky48")}[${i}].v.ptr.v`;
  const g = (k: string) => device.has(`${b}.${k}`) ? String(device.field(`${b}.${k}`).value) : "?";
  console.log(`stage[${i}] points=${g("savedPointsToComplete")} completed=${g("completed")}`);
}

const CHIPS: Array<[string, string, number]> = [
  ["device Spooky48 [16] logic", "SpecialEvents.SSPSpooky48.v.components[16].v.second.v.ptr.v", 0],
  ["donor 46 [16] logic (maxed+bought)", "SpecialEvents.SSPProcedure46.v.components[16].v.second.v.ptr.v", 0],
  ["donor 46 [26] log", "SpecialEvents.SSPProcedure46.v.components[26].v.second.v.ptr.v", 0],
  ["device Spooky48 [26] log", "SpecialEvents.SSPSpooky48.v.components[26].v.second.v.ptr.v", 0],
];
function dumpChip(label: string, base: string, s: ReturnType<typeof load>) {
  console.log(`\n===== ${label} =====`);
  for (const p of s.paths()) {
    if (!p.startsWith(base)) continue;
    const f = s.field(p);
    if (f.kind === "object" || f.kind === "array") continue;
    const rel = p.slice(base.length) || "(self)";
    console.log(`  ${rel} = ${String(f.value).replace(/\s+/g, " ").slice(0, 100)}`);
  }
}
dumpChip(CHIPS[0][0], CHIPS[0][1], device);
dumpChip(CHIPS[1][0], CHIPS[1][1], donor);
dumpChip(CHIPS[2][0], CHIPS[2][1], donor);
dumpChip(CHIPS[3][0], CHIPS[3][1], device);

function holder(label: string, base: string, s: ReturnType<typeof load>) {
  console.log(`\n===== ${label} =====`);
  for (const p of s.paths()) {
    if (!p.startsWith(base)) continue;
    const f = s.field(p);
    if (f.kind === "object" || f.kind === "array") continue;
    const rel = p.slice(base.length) || "(self)";
    console.log(`  ${rel} = ${String(f.value).replace(/\s+/g, " ").slice(0, 90)}`);
  }
}
holder("donor 46 [40] holder", "SpecialEvents.SSPProcedure46.v.components[40].v.second.v.ptr.v", donor);
holder("device Spooky48 [40] holder", "SpecialEvents.SSPSpooky48.v.components[40].v.second.v.ptr.v", device);
