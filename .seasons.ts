/* Which season procedure is LIVE? Compare 46 / 47 / 49 on the device:
   launchTable, statesGraph, start timestamps, notifications. */
import { readFileSync } from "node:fs";
import { openSave } from "./src/engine/savegame.ts";
import { decodeSave } from "./src/engine/codec.ts";

const c = decodeSave(new Uint8Array(readFileSync(process.argv[2]!)));
const s = openSave(c.bytes, c.wasEncrypted);

for (const season of ["SSPProcedure46", "SSPProcedure47", "SSPProcedure49"]) {
  const root = `SpecialEvents.${season}.v`;
  if (!s.has(root)) {
    console.log(`\n##### ${season}: ABSENT #####`);
    continue;
  }
  console.log(`\n##### ${season} #####`);
  const j = JSON.parse(s.rawText(root));
  const comps = (j.components ?? []).map((x: any) => x?.v?.first);
  console.log(`  components: ${comps.length}  [${comps.slice(0, 6).join(", ")} ...]`);
  console.log(`  top-level keys: ${Object.keys(j).join(", ")}`);
  console.log(`  launchTable : ${JSON.stringify(j.launchTable).slice(0, 260)}`);
  console.log(`  statesGraph : ${JSON.stringify(j.statesGraph).slice(0, 300)}`);

  // EventLogic scalars
  const el = (j.components ?? []).find((x: any) => x?.v?.first === "EventLogic");
  const elv = el?.v?.second?.v?.ptr?.v ?? {};
  for (const k of [
    "currProgress",
    "maxStagesProgress",
    "previousProgress",
    "isProgressUpdated",
    "eventDuration",
    "startEventTimestamp",
    "cachedLastStartTimeStamp",
    "lastStartTimeStamp",
    "bonusBankCurrentStage",
    "bonusBankMaxStage",
    "idCurrStartCondition",
    "launchIndex",
  ]) {
    if (k in elv) console.log(`  EL.${k.padEnd(24)} = ${JSON.stringify(elv[k])}`);
  }
  const vault = elv?.stages?.v?.ptr?.v?.vault?.v?.ptr?.v;
  if (vault) console.log(`  vault = ${JSON.stringify(vault)}`);
  const stages = elv?.stages?.v?.ptr?.v?.stages ?? [];
  console.log(`  stages: ${stages.length}  completed=${stages.filter((x: any) => x?.v?.ptr?.v?.completed).length}`);
  console.log(`  ladder[0..5] = ${stages.slice(0, 6).map((x: any) => x?.v?.ptr?.v?.savedPointsToComplete).join(",")}`);

  // Notifications start time
  const n = (j.components ?? []).find((x: any) => x?.v?.first === "Notifications");
  console.log(`  Notifications = ${JSON.stringify(n?.v?.second?.v?.ptr?.v).slice(0, 160)}`);

  // Currency
  for (const k of ["amount", "prevAmount"]) {
    console.log(`  Currency.${season}Points.${k} = ${s.has(`Currency.${season}Points.${k}`) ? s.field(`Currency.${season}Points.${k}`).value : "(absent)"}`);
  }
  console.log(`  Currency.${season}Points = ${s.has(`Currency.${season}Points`) ? JSON.stringify(s.field(`Currency.${season}Points`).value).slice(0, 60) : "(absent)"}`);
}
