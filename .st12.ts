/* Donor vs device statesGraph + lifecycle fields + the season registry. */
import { readFileSync } from "node:fs";
import { decodeSave } from "./src/engine/codec.ts";
import { openSave, type SaveGame } from "./src/engine/savegame.ts";

function load(f: string): SaveGame {
  const c = decodeSave(new Uint8Array(readFileSync(f)));
  return openSave(c.bytes, c.wasEncrypted);
}
const donor = load(process.argv[2]!);
const device = load(process.argv[3]!);

for (const [name, s] of [["DONOR", donor], ["DEVICE", device]] as const) {
  console.log(`\n================ ${name} ================`);
  const sg = "SpecialEvents.SSPProcedure46.v.statesGraph";
  const txt = s.rawText(sg);
  // pull the key fields out of the raw ds graph
  const cur = /"currentState"\s*:\s*([^,}\]]+)/.exec(txt)?.[1];
  console.log(`statesGraph.currentState = ${cur}`);
  console.log(`statesGraph length = ${txt.length}`);
  const ip = /"InProgress","second":\{"([^}]{0,220})?/.exec(txt)?.[1];
  console.log(`InProgress payload ≈ ${ip?.slice(0, 200)}`);

  const EL = "SpecialEvents.SSPProcedure46.v.components[16].v.second.v.ptr.v";
  for (const k of ["currProgress", "maxStagesProgress", "previousProgress", "isProgressUpdated", "startEventTimestamp", "lastShownStageIndex"]) {
    const p = `${EL}.${k}`;
    console.log(`  ${k.padEnd(24)} = ${s.has(p) ? String(s.field(p).value) : "(absent)"}`);
  }

  const LH = "SpecialEvents.SSPProcedure46.v.components[40].v.second.v.ptr.v";
  for (const k of ["collectedFree", "collectedGold", "normalRewardsCollectedCount", "normalFinishRewardsCollectedCount", "premiumRewardsCollectedCount", "premiumFinishRewardsCollectedCount"]) {
    for (const base of [`${LH}`, "SeasonPassInfoCache"]) {
      const p = base.endsWith("Cache") ? `${base}.${k}` : `${base}.${k}`;
      if (s.has(p)) console.log(`  ${base === "SeasonPassInfoCache" ? "cache." : "holder."}${k.padEnd(24)} = ${String(s.field(p).value)}`);
    }
  }
  const bought = `${EL.replace("components[16]", "components[26]")}.goldenPassBought`;
  if (s.has(bought)) console.log(`  log.goldenPassBought     = ${s.field(bought).value}`);

  console.log("SpecialEvents children:", s.children("SpecialEvents").join(", "));
  for (const id of ["SSPProcedure46", "SSPProcedure47", "SSPSpooky48", "SSPProcedure49"]) {
    const p = `SpecialEvents.${id}.v.launchTable.v.ptr.v.launchIndex`;
    console.log(`  ${id} launchIndex=`, s.has(p) ? String(s.field(p).value) : "(absent)");
  }
  for (const p of s.paths().filter((p) => p.startsWith("Configs.") || p.startsWith("Definitions."))) {
    if (s.field(p).kind !== "object" && s.field(p).kind !== "array") console.log(`  cfg ${p} = ${String(s.field(p).value).slice(0, 60)}`);
  }
}
