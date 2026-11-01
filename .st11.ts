/* Full diff of SpecialEvents.SSPProcedure46 between two saves (gp4_state=pre, gp4_after=post). */
import { readFileSync } from "node:fs";
import { decodeSave } from "./src/engine/codec.ts";
import { openSave, type SaveGame } from "./src/engine/savegame.ts";

function load(f: string): SaveGame {
  const c = decodeSave(new Uint8Array(readFileSync(f)));
  return openSave(c.bytes, c.wasEncrypted);
}

const files = process.argv.slice(2) as string[];
const saves = files.map((f) => ({ f, s: load(f) }));

// union of scalar paths under the event (skip array indices), plus SeasonPassInfoCache
const set = new Map<string, unknown>();
for (const { s } of saves) {
  const re = /^SpecialEvents\.SSPProcedure46\.v\.([^\[\]]+)(\.[^\[\]]+)*$/;
  for (const p of s.paths()) {
    if (re.test(p) && s.field(p).kind !== "object" && s.field(p).kind !== "array") {
      if (!set.has(p)) set.set(p, s.field(p).value);
    }
  }
}
// also stage flags per row index
for (const p of saves[0]!.s.paths()) {
  if (/^SpecialEvents\.SSPProcedure46\.v\.components\[16\]\.v\.second\.v\.ptr\.v\.stages\.v\.ptr\.v\.stages\[\d+\]\.v\.ptr\.v\.(completed|savedPointsToComplete)$/.test(p)) set.set(p, null);
}
const keys = [...set.keys()].sort();
console.log("path".padEnd(70), saves.map((x) => x.f.match(/\w+\.szb/)![0]).join(" | "));
for (const k of keys) {
  const vals = saves.map(({ s }) => (s.has(k) ? String(s.field(k).value).replace(/\s+/g, " ").slice(0, 40) : "(absent)"));
  const differs = new Set(vals).size > 1;
  console.log((differs ? "* " : "  ") + (differs ? k : k).padEnd(68), vals.join(" | "));
}

// statesGraph raw
console.log("\n-- statesGraph raw (each) --");
for (const { f, s } of saves) {
  const p = "SpecialEvents.SSPProcedure46.v.statesGraph";
  console.log(`${f}:`, s.has(p) ? s.rawText(p).slice(0, 300) : "(absent)");
}
console.log("\n-- launchTable raw (each) --");
for (const { f, s } of saves) {
  const p = "SpecialEvents.SSPProcedure46.v.launchTable";
  console.log(`${f}:`, s.has(p) ? s.rawText(p).slice(0, 400) : "(absent)");
}
console.log("\n-- idCurrentCondition / cached season (each) --");
for (const { f, s } of saves) {
  for (const p of ["SpecialEvents.SSPProcedure46.v.idCurrentCondition", "SeasonPassInfoCache.seasonPassEventId"]) {
    console.log(`${f}: ${p} =`, s.has(p) ? String(s.field(p).value) : "(absent)");
  }
}
