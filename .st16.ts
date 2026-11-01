/* Dump SSPSpooky48 components (names + config scalars), the stage/ladder subtree, GameEvents.json. */
import { readFileSync } from "node:fs";
import { decodeSave } from "./src/engine/codec.ts";
import { openSave } from "./src/engine/savegame.ts";

const c = decodeSave(new Uint8Array(readFileSync(process.argv[2]!)));
const s = openSave(c.bytes, c.wasEncrypted);
const SP = "SpecialEvents.SSPSpooky48.v";

console.log(`===== components[5..59] names =====`);
for (const idx of s.children(`${SP}.components`)) {
  const nm = `${SP}.components[${idx}].v.first`;
  if (s.has(nm)) console.log(`[${idx}] ${String(s.field(nm).value)}`);
}

console.log(`\n===== find season-stages subtree (type seasonPassStage) =====`);
const rows: [string, string][] = [];
for (const p of s.paths()) {
  if (/.*stages\[\d+]\.second\.v\.type$/.test(p) && p.startsWith(SP)) {
    rows.push([p, String(s.field(p).value)]);
  }
}
for (const [p, t] of rows.slice(0, 40)) console.log(`${p} = ${t}`);
console.log(`stage-typed rows: ${rows.length}`);

console.log(`\n===== ladder thresholds of spooky stages =====`);
const stageBase = `${SP}.components[16].v.second.v.ptr.v.stages.v.ptr.v.stages`;
for (const idx of s.children(stageBase)) {
  const b = `${stageBase}[${idx}].v.ptr.v`;
  const pts = s.has(`${b}.savedPointsToComplete`) ? s.field(`${b}.savedPointsToComplete`).value : "?";
  const done = s.has(`${b}.completed`) ? s.field(`${b}.completed`).value : "?";
  console.log(`stage[${idx}] threshold=${pts} completed=${done}`);
}

console.log(`\n===== spooky48 primary-event chips (currProgress etc.) =====`);
for (const k of ["currProgress", "maxStagesProgress", "previousProgress", "isProgressUpdated", "startEventTimestamp", "lastShownStageIndex", "seasonId", "type"]) {
  for (const p of s.paths()) {
    const m = p.match(/^SpecialEvents\.SSPSpooky48\.v\.components\[\d+\]\.v\.second\.v\.ptr\.v\.(.+)$/);
    if (m && m[1] === k) console.log(`${p} = ${String(s.field(p).value)}`);
  }
}

console.log(`\n===== Currency for spooky48 =====`);
for (const p of s.paths()) {
  if (/^Currency\.[^.]/.test(p) && /spooky|Spooky|48/.test(p)) console.log(`${p} = ${String(s.field(p).value)}`);
}
try {
  for (const idx of s.children("Currency")) console.log(`Currency child: ${idx}`);
} catch { /* none */ }
