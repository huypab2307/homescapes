/* g10 = v7 push: the gold-row entitlement experiment.
   Test: [20] GoldenTicketOffer.alternatives[0].v.second.v.ptr.v.isGoldenTicketBought = true
   (save-state edit of the field the client parses into the BOUGHT_GT runtime
    state; no billing flows involved). Also revert v6's isGTPurchaseWindowShown.
   Usage: npx tsx .g10.ts <device.szb> <out.szb> */
import { readFileSync, writeFileSync } from "node:fs";
import { openSave } from "./src/engine/savegame.ts";
import { decodeSave, encodeSave } from "./src/engine/codec.ts";
import { runApply } from "./src/engine/operations.ts";

const deviceFile = process.argv[2]!;
const outFile = process.argv[3]!;

const vC = decodeSave(new Uint8Array(readFileSync(deviceFile)));
console.log("healing the game's non-standard empty token before apply...");
const origText = new TextDecoder().decode(vC.bytes);
const healed = origText.replace('"SSPProcedure46Points":,', '"SSPProcedure46Points":null,');
if (healed.length !== origText.length) console.log(`healed empty token (len ${origText.length} -> ${healed.length})`);
const plainBytes = new TextEncoder().encode(healed);
const device = openSave(plainBytes, vC.wasEncrypted);
const SP = "SpecialEvents.SSPSpooky48.v";
const offer = `${SP}.components[20].v.second.v.ptr.v.alternatives[0].v.second.v.ptr.v`;
const logic = `${SP}.components[16].v.second.v.ptr.v`;
const log26 = `${SP}.components[26].v.second.v.ptr.v`;

const ops: Array<{ path: string; value: unknown }> = [
  { path: `${offer}.isGoldenTicketBought`, value: true },
  { path: `${logic}.isGTPurchaseWindowShown`, value: false },
  { path: `Currency.SSPSpooky48Points.amount`, value: 845 },
  { path: `Currency.SSPSpooky48Points.prevAmount`, value: 844 },
];
// NOTE: no empty-token re-normalize this round — the game tolerates/re-emits the
// placeholder itself, and runApply's patcher rejects null re-emit on the shrank save.

console.log(`ops: ${ops.length} -> ${ops.map((o) => `${o.path}=${o.value === null ? "null(renorm)" : String(o.value)}`).join("; ")}`);
const applied = runApply(plainBytes, ops);
if (!applied.ok) {
  console.error("APPLY FAILED:", applied.errors.slice(0, 6));
  process.exit(1);
}
console.log("apply ok; warnings:", applied.warnings.slice(0, 4).join(" | ") || "none");

const out = openSave(applied.bytes);
console.log("verify in-memory:");
for (const p of [
  `${offer}.isGoldenTicketBought`,
  `${logic}.isGTPurchaseWindowShown`,
  `${log26}.goldenPassBought`,
  `Currency.SSPSpooky48Points.amount`,
]) {
  console.log(`  ${p} = ${String(out.field(p).value)}`);
}

const container = encodeSave(applied.bytes, vC);
writeFileSync(outFile, Buffer.from(container));
console.log(`wrote ${outFile}: ${container.length} bytes (source ${vC.bytes.length})`);
