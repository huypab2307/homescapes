/* v6: max the LIVE season pass (SSPSpooky48) with the proven v4 mechanics,
   plus the user-authorized goldenPassBought=true gold-row test.
   Usage: npx tsx .v6.ts <device.szb> <out.szb> */
import { readFileSync, writeFileSync } from "node:fs";
import { openSave } from "./src/engine/savegame.ts";
import { decodeSave, encodeSave } from "./src/engine/codec.ts";
import { runApply } from "./src/engine/operations.ts";

const deviceFile = process.argv[2]!;
const outFile = process.argv[3]!;

const vC = decodeSave(new Uint8Array(readFileSync(deviceFile)));
const device = openSave(vC.bytes, vC.wasEncrypted);

const season = "SSPSpooky48";
const stages = `SpecialEvents.${season}.v.components[16].v.second.v.ptr.v.stages.v.ptr.v.stages`;
const logic = `SpecialEvents.${season}.v.components[16].v.second.v.ptr.v`;
const log26 = `SpecialEvents.${season}.v.components[26].v.second.v.ptr.v`;

// 46's donor ladder (survives pushes, drives completion + UI)
const donorLadder = [0, 1, 3, 5, 10, 15, 20, 30, 40, 50, 65, 80, 95, 110, 125, 150, 175, 200, 225, 250, 290, 330, 370, 410, 450, 505, 560, 615, 685, 755, 845];

const ops: Array<{ path: string; value: unknown }> = [];

// the game rewrites empty-value placeholders on every save cycle; re-normalize
if (device.field("Currency.SSPProcedure46Points").value === null && device.rawText("Currency.SSPProcedure46Points").length === 0) {
  ops.push({ path: "Currency.SSPProcedure46Points", value: null });
}
// stage flags: [0]=false (donor pattern), [1..30]=true + thresholds
for (let i = 0; i < 31; i++) {
  const base = `${stages}[${i}].v.ptr.v`;
  ops.push({ path: `${base}.savedPointsToComplete`, value: donorLadder[i] });
  ops.push({ path: `${base}.completed`, value: i !== 0 });
}

// progress pointers (donor pattern)
ops.push({ path: `${logic}.currProgress`, value: 30 });
ops.push({ path: `${logic}.previousProgress`, value: 30 });
ops.push({ path: `${logic}.isProgressUpdated`, value: true });
ops.push({ path: `${logic}.isGTPurchaseWindowShown`, value: true });

// flat currency pair (v4-proven convention)
ops.push({ path: `Currency.${season}Points.amount`, value: 845 });
ops.push({ path: `Currency.${season}Points.prevAmount`, value: 844 });

// the user-authorized gold-row assertion: donor pattern = true
ops.push({ path: `${log26}.goldenPassBought`, value: true });

console.log(`ops: ${ops.length}`);
const applied = runApply(vC.bytes, ops);
if (!applied.ok) {
  console.error("APPLY FAILED:", applied.errors.slice(0, 6));
  process.exit(1);
}
console.log("apply ok; warnings:", applied.warnings.slice(0, 4).join(" | ") || "none");

const out = openSave(applied.bytes);
console.log("verify in-memory:");
console.log("  currency =", out.field(`Currency.${season}Points.amount`).value, "/", out.field(`Currency.${season}Points.prevAmount`).value);
console.log("  bought   =", out.field(`${log26}.goldenPassBought`).value);
console.log("  stage30  =", out.field(`${stages}[30].v.ptr.v.completed`).value);
console.log("  state    =", out.field(`SpecialEvents.${season}.v.statesGraph.v.ptr.v.currentState`).value);

const container = encodeSave(applied.bytes, vC);
writeFileSync(outFile, Buffer.from(container));
console.log(`wrote ${outFile}: ${container.length} bytes (source ${vC.bytes.length})`);

// safety: ensure no purchase-window/offer flow states were touched inadvertently
const touched = new Set(ops.map((o) => o.path.split(".").slice(0, 4).join(".")));
console.log("op groups:", [...touched].join(", "));
