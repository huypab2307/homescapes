/* Dry-run the v3 donor-shape copy against the real saves.
   Verifies the result SEMANTICALLY equals the donor's season state, that no
   purchase field was written, and that the account's own progress is intact.
   Writes a push file; pushes nothing. */
import { readFileSync, writeFileSync } from "node:fs";
import { openSave } from "./src/engine/savegame.ts";
import { decodeSave, encodeSave } from "./src/engine/codec.ts";
import { runApply } from "./src/engine/operations.ts";
import { planSeasonPass, PURCHASE_FIELDS } from "./src/engine/seasonpass.ts";

const donorFile = process.argv[2]!;
const deviceFile = process.argv[3]!;
const outFile = process.argv[4]!;

const dC = decodeSave(new Uint8Array(readFileSync(donorFile)));
const donor = openSave(dC.bytes, dC.wasEncrypted);
const vC = decodeSave(new Uint8Array(readFileSync(deviceFile)));
const device = openSave(vC.bytes, vC.wasEncrypted);

const plan = planSeasonPass(device, donor);
console.log(`PLAN`);
console.log(`  season    : ${plan.season}`);
console.log(`  points    : ${plan.points} via ${plan.pointsPath}`);
console.log(`  stages    : ${plan.completedStages} of 31`);
console.log(`  ops       : ${plan.ops.length}  (sets ${plan.stats.sets}, creates ${plan.stats.creates}, appends ${plan.stats.appends}, skipped ${plan.stats.skipped})`);
console.log(`  gold row  : REFUSED`);
console.log(`  notes:`);
for (const n of plan.notes) console.log(`    - ${n}`);

const applied = runApply(vC.bytes, plan.ops);
if (!applied.ok) {
  console.error(`\nAPPLY FAILED (${applied.errors.length}):`);
  for (const e of applied.errors.slice(0, 10)) console.error(`  ${e}`);
  process.exit(1);
}
console.log(`\napply: ok (${applied.warnings.length} warnings)`);
for (const w of applied.warnings.slice(0, 5)) console.log(`  warn: ${w}`);

const out = openSave(applied.bytes);
const root = `SpecialEvents.${plan.season}.v`;

/* ---- semantic equality with the donor ---- */
const canon = (v: unknown): string => JSON.stringify(v, (_k, x) => x);
const dj = JSON.parse(donor.rawText(root));
const oj = JSON.parse(out.rawText(root));
const djStr = canon(dj);
const ojStr = canon(oj);
console.log(`\nSEMANTIC MATCH vs donor`);
console.log(`  donor event JSON == result event JSON : ${djStr === ojStr}`);
if (djStr !== ojStr) {
  // Show the first differing top-level key.
  for (const k of Object.keys(dj)) {
    if (canon(dj[k]) !== canon((oj as Record<string, unknown>)[k])) {
      console.log(`  differs at: ${k}`);
    }
  }
}

/* ---- no purchase field written ---- */
console.log(`\nPURCHASE SAFETY`);
for (const f of PURCHASE_FIELDS) {
  const hits = plan.ops.filter((o) => o.path.endsWith(`.${f}`));
  console.log(`  ops writing ${f}: ${hits.length}  ${hits.length === 0 ? "OK" : "PROBLEM"}`);
}
const bought = out.has(`${root}.components[26].v.second.v.ptr.v.goldenPassBought`)
  ? out.field(`${root}.components[26].v.second.v.ptr.v.goldenPassBought`).value
  : "(absent)";
console.log(`  LogEventComponent.goldenPassBought = ${bought}  ${bought === false ? "OK" : "PROBLEM"}`);
console.log(`  SeasonPassInfoCache.goldenPassPurchased = ${out.has("SeasonPassInfoCache.goldenPassPurchased") ? out.field("SeasonPassInfoCache.goldenPassPurchased").value : "(absent)"} (untouched)`);

/* ---- headline state ---- */
const EL = `${root}.components[${plan.eventLogicIndex}].v.second.v.ptr.v`;
const g = (p: string): string => (out.has(p) ? String(out.field(p).value) : "(ABSENT)");
console.log(`\nHEADLINE STATE (in memory)`);
for (const k of ["currProgress", "maxStagesProgress", "previousProgress", "isProgressUpdated", "bonusBankCurrentStage", "bonusBankMaxStage", "startEventTimestamp"]) {
  console.log(`  ${k.padEnd(24)} = ${g(`${EL}.${k}`)}`);
}
console.log(`  ${"points currency".padEnd(24)} = ${g(`${plan.pointsPath}.amount`)}`);
const ST = `${EL}.stages.v.ptr.v.stages`;
const re = new RegExp(`^${ST.replace(/[.[\]*]/g, (c) => "\\" + c)}\\[\\d+\\]\\.v\\.ptr\\.v\\.completed$`);
let done = 0;
let tot = 0;
for (const p of out.paths()) if (re.test(p)) { tot++; if (out.field(p).value === true) done++; }
console.log(`  ${"stages completed".padEnd(24)} = ${done}/${tot}`);

/* ---- account untouched ---- */
console.log(`\nACCOUNT (must be untouched)`);
console.log(`  level=${g("Properties.LID_Lvl")} coins=${g("Properties.coins")} stars=${g("Properties.earnedStars")} name=${g("Properties.name")}`);
console.log(`  areas=${out.paths().filter((p) => /^Repairs\.[^.]+\.v\.@opened$/.test(p) && out.field(p).value === true).length}  StepsState=${out.paths().filter((p) => /^StepsState\./.test(p)).length}`);

const container = encodeSave(applied.bytes, vC);
writeFileSync(outFile!, Buffer.from(container));
console.log(`\nwrote ${outFile}: ${container.length} bytes (source ${readFileSync(deviceFile).length})`);
