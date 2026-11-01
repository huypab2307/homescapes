/* v5: reopen SSPProcedure46 by pointing the state machine back at InProgress.
   Reuses the donor-shape plan + flat currency (v4) and adds the one state flip. */
import { readFileSync, writeFileSync } from "node:fs";
import { openSave } from "./src/engine/savegame.ts";
import { decodeSave, encodeSave } from "./src/engine/codec.ts";
import { runApply } from "./src/engine/operations.ts";
import { planSeasonPass } from "./src/engine/seasonpass.ts";

const donorFile = process.argv[2]!;
const deviceFile = process.argv[3]!;
const outFile = process.argv[4]!;

const dC = decodeSave(new Uint8Array(readFileSync(donorFile)));
const donor = openSave(dC.bytes, dC.wasEncrypted);
const vC = decodeSave(new Uint8Array(readFileSync(deviceFile)));
const device = openSave(vC.bytes, vC.wasEncrypted);

const plan = planSeasonPass(device, donor);
const ops = [...plan.ops];

const sg = `SpecialEvents.${plan.season}.v.statesGraph.v.ptr.v.currentState`;
if (ops.some((o) => o.path === sg)) {
  console.log(`state flip: already in plan (${String(device.field(sg).value)} -> InProgress)${ops.length}`);
} else if (device.has(sg)) {
  const before = String(device.field(sg).value);
  if (before !== "InProgress") {
    ops.push({ path: sg, value: "InProgress" });
    console.log(`state flip: ${before} -> InProgress at ${sg}`);
  } else {
    console.log(`state: already InProgress`);
  }
} else {
  console.log(`no ${sg} on device — graph shape unexpected`);
}

console.log(`ops total: ${ops.length}`);
const applied = runApply(vC.bytes, ops);
if (!applied.ok) {
  console.error(`APPLY FAILED:`, applied.errors.slice(0, 5));
  process.exit(1);
}
console.log(`apply ok; warnings: ${applied.warnings.slice(0, 3).join(" | ") || "none"}`);
const out = openSave(applied.bytes);
console.log(`state now = ${out.field(sg).value}`);
console.log(`currency  = ${out.field(`Currency.${plan.season}Points.amount`).value} / ${out.field(`Currency.${plan.season}Points.prevAmount`).value}`);
console.log(`bought    = ${out.field(`SpecialEvents.${plan.season}.v.components[26].v.second.v.ptr.v.goldenPassBought`).value}`);
const container = encodeSave(applied.bytes, vC);
writeFileSync(outFile, Buffer.from(container));
console.log(`wrote ${outFile}: ${container.length} bytes (source ${readFileSync(deviceFile).length})`);
