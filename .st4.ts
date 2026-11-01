/* Instant state check: level, coins, buildcoins, season currency, pass stage state. */
import { readFileSync } from "node:fs";
import { decodeSave } from "./src/engine/codec.ts";
import { openSave } from "./src/engine/savegame.ts";

const f = process.argv[2]!;
const c = decodeSave(new Uint8Array(readFileSync(f)));
const s = openSave(c.bytes, c.wasEncrypted);

const want = [
  "Properties.level.value",
  "Properties.SaveVersionNumber",
  "Currency.coins",
  "Currency.buildcoins",
  "Currency.stars",
  "Currency.SSPProcedure46Points",
  "Currency.SSPProcedurePoints",
  "SpecialEvents.SSPProcedure46.v.statesGraph",
];
for (const p of s.paths().filter((p) => /^(Properties\.level|Properties\.SaveVersionNumber|Currency\.)$/.test(p) || want.includes(p))) {
  console.log(`  ${p.padEnd(46)} = ${String(s.field(p).value).slice(0, 200)}`);
}
console.log("\n-- Currency titles (balances) --");
for (const p of s.paths().filter((p) => p.startsWith("Currency.") && p.endsWith(".count")).sort()) {
  console.log(`  ${p.padEnd(46)} = ${String(s.field(p).value).slice(0, 30)}`);
}
console.log("\n-- SSPProcedure46 EventLogic stage state --");
for (const p of s.paths().filter((p) => /SSPProcedure46/.test(p) && /(currProgress|maxStagesProgress|previousProgress|currentOpenedStageIndex|savedPointsToComplete|pointsToComplete|seasonPoints|collected)/i.test(p)).sort()) {
  console.log(`  ${p.padEnd(80)} = ${String(s.field(p).value).replace(/\s+/g, " ").slice(0, 60)}`);
}
console.log("\n-- save size / profile --");
for (const p of s.paths().filter((p) => /ProfileName|hstest|SwrveUserInfo/i.test(p)).sort()) {
  console.log(`  ${p.padEnd(64)} = ${String(s.field(p).value).replace(/\s+/g, " ").slice(0, 60)}`);
}
