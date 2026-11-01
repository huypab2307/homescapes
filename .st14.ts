/* Full dump of GameModifiers groups, NewGameEventsAutoStores layout, SpecialEvents.SSPSpooky48. */
import { readFileSync } from "node:fs";
import { decodeSave } from "./src/engine/codec.ts";
import { openSave } from "./src/engine/savegame.ts";

const c = decodeSave(new Uint8Array(readFileSync(process.argv[2]!)));
const s = openSave(c.bytes, c.wasEncrypted);

const GROUPS = ["GameModifiers", "NewGameEventsAutoStores"];
for (const g of GROUPS) {
  console.log(`\n===== ${g} direct children =====`);
  for (const child of s.children(g)) {
    const row = `${g}.${child}`;
    let sub = "";
    try { sub = s.children(row).join(", "); } catch { /* leaf */ }
    console.log(`  ${child}: ${sub}`);
  }
}

const SP = "SpecialEvents.SSPSpooky48.v";
console.log(`\n===== SpecialEvents.SSPSpooky48 scalars =====`);
for (const p of s.paths()) {
  if (!p.startsWith(SP)) continue;
  const f = s.field(p);
  if (f.kind === "object" || f.kind === "array") continue;
  if (p.endsWith(".first") || p.endsWith(".second")) continue;
  console.log(`${p} = ${String(f.value).replace(/\s+/g, " ").slice(0, 80)}`);
}
console.log(`\n===== SSPSpooky48 component names =====`);
const comps = s.children(`${SP}.components`);
for (const idx of comps) {
  const nm = `${SP}.components[${idx}].v.first`;
  if (s.has(nm)) console.log(`  [${idx}] ${String(s.field(nm).value)}`);
}
console.log(`\n===== Spooky48 statesGraph / launchTable =====`);
for (const p of [`${SP}.statesGraph`, `${SP}.launchTable`, `${SP}.idUsedConditions`, `${SP}.idCurrentCondition`]) {
  if (s.has(p)) console.log(`${p} = ${s.rawText(p).slice(0, 420)}`);
  else console.log(`${p} (absent)`);
}
