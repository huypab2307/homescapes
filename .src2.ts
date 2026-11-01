/* If the client only REPORTS season_tokens_balance upward (telemetry, like
   payer_type and inapps_count/sum), then the client owns the balance and is
   recomputing it from some local accumulator. Find every place the donor's
   10000-point value appears, and the matching accumulator on the device. */
import { readFileSync } from "node:fs";
import { openSave, type SaveGame } from "./src/engine/savegame.ts";
import { decodeSave } from "./src/engine/codec.ts";

function load(f: string): SaveGame {
  const c = decodeSave(new Uint8Array(readFileSync(f)));
  return openSave(c.bytes, c.wasEncrypted);
}
const donor = load(process.argv[2]!);
const device = load(process.argv[3]!);

const nums = (s: SaveGame, p: string): number | null => {
  if (!s.has(p)) return null;
  const v = s.field(p).value;
  return typeof v === "number" ? v : null;
};

console.log(`=== donor: every leaf holding 10000 (the donor's season points) ===`);
for (const p of donor.paths()) {
  if (nums(donor, p) === 10000) console.log(`  ${p}`);
}

console.log(`\n=== device: leaves matching /point/i with a numeric value ===`);
for (const p of device.paths().filter((p) => /point/i.test(p)).sort()) {
  const v = nums(device, p);
  if (v === null) continue;
  console.log(`  ${p.padEnd(70)} = ${v}`);
}

console.log(`\n=== donor: leaves matching /point/i with a numeric value ===`);
for (const p of donor.paths().filter((p) => /point/i.test(p)).sort()) {
  const v = nums(donor, p);
  if (v === null) continue;
  console.log(`  ${p.padEnd(70)} = ${v}`);
}

console.log(`\n=== device: AccumulatedSatistics leaves (all) ===`);
for (const p of device.paths().filter((p) => p.startsWith("AccumulatedSatistics.")).sort()) {
  const v = nums(device, p);
  if (v === null) continue;
  console.log(`  ${p.padEnd(72)} = ${v}`);
}
