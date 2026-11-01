/* The account shows "Collect Keys! (3/5, level 2)" yet holds NO
   Currency.SSPProcedure46Points. So the key balance is stored elsewhere.
   Hunt for it. */
import { readFileSync } from "node:fs";
import { openSave, type SaveGame } from "./src/engine/savegame.ts";
import { decodeSave } from "./src/engine/codec.ts";

function load(f: string): SaveGame {
  const c = decodeSave(new Uint8Array(readFileSync(f)));
  return openSave(c.bytes, c.wasEncrypted);
}
const donor = load(process.argv[2]!);
const device = load(process.argv[3]!);

console.log(`=== device: full SeasonPassInfoCache ===`);
for (const p of device.paths().filter((p) => p.startsWith("SeasonPassInfoCache")).sort()) {
  console.log(`  ${p.padEnd(52)} = ${String(device.field(p).value).replace(/\s+/g, " ").slice(0, 60)}`);
}
console.log(`\n=== donor: full SeasonPassInfoCache ===`);
for (const p of donor.paths().filter((p) => p.startsWith("SeasonPassInfoCache")).sort()) {
  console.log(`  ${p.padEnd(52)} = ${String(donor.field(p).value).replace(/\s+/g, " ").slice(0, 60)}`);
}

console.log(`\n=== device: ALL Currency.* members (any value) ===`);
for (const p of device.paths().filter((p) => /^Currency\./.test(p)).sort()) {
  console.log(`  ${p.padEnd(52)} = ${String(device.field(p).value).replace(/\s+/g, " ").slice(0, 40)}`);
}

console.log(`\n=== device: every path mentioning key/token/season (non-container) ===`);
for (const p of device.paths().filter((p) => /key|token|season/i.test(p)).sort()) {
  const t = device.field(p).type;
  if (t === "object" || t === "array") continue;
  console.log(`  ${p.padEnd(64)} = ${String(device.field(p).value).replace(/\s+/g, " ").slice(0, 40)}`);
}

console.log(`\n=== device: top-level members ===`);
console.log(
  device.paths()
    .filter((p) => !p.includes("."))
    .map((p) => p + " [" + device.field(p).type + "]")
    .sort()
    .join("\n"),
);
