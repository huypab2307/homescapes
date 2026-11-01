/* Diff donor vs device on the exact fields that decide rendering:
   stages[].completed, currency shape, statesGraph, FamilyEvent-ish extras. */
import { readFileSync } from "node:fs";
import { decodeSave } from "./src/engine/codec.ts";
import { openSave, type SaveGame } from "./src/engine/savegame.ts";

function load(f: string): SaveGame {
  const c = decodeSave(new Uint8Array(readFileSync(f)));
  return openSave(c.bytes, c.wasEncrypted);
}
const donor = load(process.argv[2]!);
const device = load(process.argv[3]!);

const B46 = "SpecialEvents.SSPProcedure46.v.components[16].v.second.v.ptr.v.";

console.log("== stages completed flags (donor vs device), Procedure46 ==");
for (let i = 0; i < 31; i++) {
  const p = `${B46}stages.v.ptr.v.stages[${i}].v.ptr.v`;
  const dv = donor.field(p + ".completed");
  const ev = device.field(p + ".completed");
  const dsp = donor.field(p + ".savedPointsToComplete");
  const esp = device.field(p + ".savedPointsToComplete");
  console.log(`  [${String(i).padStart(2)}] donor: completed=${dv.value} pts=${dsp.value}   device: completed=${ev.value} pts=${esp.value}`);
}

console.log("\n== donor currency subtree: every Currency.* path containing SSP ==");
for (const p of donor.paths().filter((p) => p.startsWith("Currency.") && /SSP/i.test(p)).sort()) {
  const t = donor.field(p).type;
  console.log(`  ${p.padEnd(56)} [${t}] = ${String(donor.field(p).value).replace(/\s+/g, " ").slice(0, 70)}`);
}

console.log("\n== device currency subtree: every Currency.* path containing SSP ==");
for (const p of device.paths().filter((p) => p.startsWith("Currency.") && /SSP/i.test(p)).sort()) {
  const t = device.field(p).type;
  console.log(`  ${p.padEnd(56)} [${t}] = ${String(device.field(p).value).replace(/\s+/g, " ").slice(0, 70)}`);
}

console.log("\n== state machine / lifecycle fields, Procedure46 (donor vs device) ==");
for (const p of donor.paths().filter((p) => p.startsWith("SpecialEvents.SSPProcedure46.") && s(p)));

function s(p: string): boolean {
  const t = donor.field(p).type;
  if (t === "object" || t === "array") return false;
  return !/stages\[|Rewards/.test(p);
}
