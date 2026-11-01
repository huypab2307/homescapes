/* Verify an account save: progress, season state, purchase flags. */
import { readFileSync } from "node:fs";
import { openSave } from "./src/engine/savegame.ts";
import { decodeSave } from "./src/engine/codec.ts";

const c = decodeSave(new Uint8Array(readFileSync(process.argv[2]!)));
const s = openSave(c.bytes, c.wasEncrypted);
const g = (p: string): string => (s.has(p) ? String(s.field(p).value) : "(ABSENT)");

console.log(`  file bytes    : ${readFileSync(process.argv[2]!).length}`);
console.log(`  level         : ${g("Properties.LID_Lvl")}`);
console.log(`  coins         : ${g("Properties.coins")}`);
console.log(`  stars         : ${g("Properties.earnedStars")}`);
console.log(`  name          : ${g("Properties.name")}`);
console.log(
  `  areas open    : ${s.paths().filter((p) => /^Repairs\.[^.]+\.v\.@opened$/.test(p) && s.field(p).value === true).length}`,
);
console.log(`  StepsState    : ${s.paths().filter((p) => /^StepsState\./.test(p)).length} leaves`);
console.log(`  paths total   : ${s.paths().length}`);
console.log(`  points curr   : ${g("Currency.SSPProcedure46Points")}`);
console.log(`  points amount : ${g("Currency.SSPProcedure46Points.amount")}`);

const EL = "SpecialEvents.SSPProcedure46.v.components[16].v.second.v.ptr.v";
for (const k of ["currProgress", "maxStagesProgress", "previousProgress", "bonusBankCurrentStage"]) {
  console.log(`  ${k.padEnd(14)}: ${g(`${EL}.${k}`)}`);
}
console.log(`  goldenBought  : ${g("SpecialEvents.SSPProcedure46.v.components[26].v.second.v.ptr.v.goldenPassBought")}`);
const ST = `${EL}.stages.v.ptr.v.stages`;
const re = new RegExp(`^${ST.replace(/[.[\]*]/g, (ch) => "\\" + ch)}\\[\\d+\\]\\.v\\.ptr\\.v\\.completed$`);
let done = 0;
let tot = 0;
for (const p of s.paths()) if (re.test(p)) { tot++; if (s.field(p).value === true) done++; }
console.log(`  stages done   : ${done}/${tot}`);
console.log(`  vault         : ${g(`${ST}.vault.v.ptr.v.currentPoints`)} / ${g(`${ST}.vault.v.ptr.v.pointsToComplete`)}`);
