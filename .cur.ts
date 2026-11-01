/* Exact shape of the season currency on both saves, next to a currency that
   survives the sync — and the event's own currency controller. */
import { readFileSync } from "node:fs";
import { openSave, type SaveGame } from "./src/engine/savegame.ts";
import { decodeSave } from "./src/engine/codec.ts";

function load(f: string): SaveGame {
  const c = decodeSave(new Uint8Array(readFileSync(f)));
  return openSave(c.bytes, c.wasEncrypted);
}
const donor = load(process.argv[2]!);
const device = load(process.argv[3]!);

for (const [label, s] of [["donor", donor], ["device", device]] as const) {
  console.log(`\n######## ${label} ########`);
  for (const p of [
    "Currency.SSPProcedure46Points",
    "Currency.ExpeditionTickets",
    "Currency.FarmTickets",
    "Currency.WinterResortTickets",
  ]) {
    if (!s.has(p)) {
      console.log(`  ${p.padEnd(34)} (absent)`);
      continue;
    }
    console.log(`  ${p.padEnd(34)} kind=${s.field(p).kind.padEnd(10)} raw=${s.rawText(p).slice(0, 110)}`);
  }
  console.log(`  --- event Currency component (10) ---`);
  console.log(`  ${s.rawText("SpecialEvents.SSPProcedure46.v.components[10]").replace(/\s+/g, " ").slice(0, 200)}`);
  console.log(`  --- HudCurrencyController (23) ---`);
  console.log(`  ${s.rawText("SpecialEvents.SSPProcedure46.v.components[23]").replace(/\s+/g, " ").slice(0, 300)}`);
}

console.log(`\n######## device: every top-level Currency member ########`);
const cur = device.paths().filter((p) => /^Currency\.[^.]+$/.test(p)).sort();
for (const p of cur) {
  console.log(`  ${p.padEnd(38)} kind=${device.field(p).kind.padEnd(10)} ${String(device.field(p).value).replace(/\s+/g, " ").slice(0, 60)}`);
}
