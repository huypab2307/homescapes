/* Donor-vs-device diff for GameModifiers, NewGameEventsAutoStores, and the two SeasonPass events. */
import { readFileSync } from "node:fs";
import { decodeSave } from "./src/engine/codec.ts";
import { openSave } from "./src/engine/savegame.ts";

function load(f: string) {
  const c = decodeSave(new Uint8Array(readFileSync(f)));
  return openSave(c.bytes, c.wasEncrypted);
}
const donor = load(process.argv[2]!);
const device = load(process.argv[3]!);

const PREFIXES = ["GameModifiers", "NewGameEventsAutoStores"];
const SKIP = /SpecialEvents\.SSPProcedure46/; // already known donor-shaped
const leaves = new Map<string, [string, string][]>();
for (const [name, s] of [["donor", donor], ["device", device]] as const) {
  for (const p of s.paths()) {
    if (!PREFIXES.some((x) => p.startsWith(x + "."))) continue;
    const f = s.field(p);
    if (f.kind === "object" || f.kind === "array") continue;
    const key = p;
    const val = String(f.value).replace(/\s+/g, " ").slice(0, 80);
    (leaves.get(key) ?? leaves.set(key, []).get(key)!).push([name, val]);
  }
}
console.log(`===== differing leaves =====`);
for (const [p, vals] of [...leaves].sort()) {
  if (vals.length < 2) continue;
  const dv = vals.find((v) => v[0] === "donor")?.[1] ?? "(absent)";
  const ev = vals.find((v) => v[0] === "device")?.[1] ?? "(absent)";
  if (dv === ev) continue;
  console.log(`* ${p}\n    donor:  ${dv}\n    device: ${ev}`);
}
console.log(`\n===== only-in-donor leaves =====`);
for (const [p, vals] of [...leaves].sort()) {
  const dv = vals.find((v) => v[0] === "donor");
  const ev = vals.find((v) => v[0] === "device");
  if (dv && !ev) console.log(`+ ${p} = ${dv[1]}`);
}
console.log(`\n===== only-in-device leaves =====`);
for (const [p, vals] of [...leaves].sort()) {
  const dv = vals.find((v) => v[0] === "donor");
  const ev = vals.find((v) => v[0] === "device");
  if (ev && !dv) console.log(`- ${p} = ${ev[1]}`);
}
