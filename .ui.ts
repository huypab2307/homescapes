/* Which component actually holds the free-row tile count? Dump the ones the
   track could be reading, on the live device save, in full JSON. */
import { readFileSync } from "node:fs";
import { openSave } from "./src/engine/savegame.ts";
import { decodeSave } from "./src/engine/codec.ts";

const c = decodeSave(new Uint8Array(readFileSync(process.argv[2]!)));
const s = openSave(c.bytes, c.wasEncrypted);

const names = new Map<string, string>();
for (const p of s.paths()) {
  const mt = /^SpecialEvents\.SSPProcedure46\.v\.components\[(\d+)\]\.v\.first$/.exec(p);
  if (mt) names.set(mt[1], String(s.field(p).value));
}

const WANT = [
  "MainWindow",
  "NormalRewards",
  "PremiumRewards",
  "VaultRewards",
  "RewardHolder",
  "RewardWindowUncollectedRewards",
  "HudCurrencyController",
  "Z_ValidateComponent",
  "EventReward",
  "Currency",
  "EventStatesInterface",
  "SeasonPassDiscountMechanics",
];

for (const want of WANT) {
  const idx = [...names.entries()].find(([, v]) => v === want)?.[0];
  if (idx === undefined) {
    console.log(`\n=== ${want}: absent ===`);
    continue;
  }
  const base = `SpecialEvents.SSPProcedure46.v.components[${idx}]`;
  const leaves = s.paths().filter((p) => p.startsWith(base)).length;
  console.log(`\n=== [${idx}] ${want} (${leaves} leaves) ===`);
  for (const p of s.paths().filter((p) => p.startsWith(base)).sort()) {
    const rel = p.slice(base.length).replace(/^\.v\.second\.v\.ptr\.v\./, "· ").replace(/^\./, "");
    const v = String(s.field(p).value).replace(/\s+/g, " ");
    if (v.length > 150) continue;
    console.log(`    ${rel.slice(0, 58).padEnd(58)} = ${v.slice(0, 150)}`);
  }
}
