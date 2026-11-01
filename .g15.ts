/* g15: find rewardFlowMode in save text + event settings components. */
import { readFileSync } from "node:fs";
import { decodeSave } from "./src/engine/codec.ts";
import { openSave, type SaveGame } from "./src/engine/savegame.ts";

function load(f: string): SaveGame {
  const c = decodeSave(new Uint8Array(readFileSync(f)));
  return openSave(c.bytes, c.wasEncrypted);
}
const after = load(process.argv[2]!);

const text = new TextDecoder().decode(after.plain?.length ? after.plain : new Uint8Array());
void text;

console.log("=== rewardFlowMode in engine save-tree paths ===");
let hits = 0;
for (const p of after.paths()) {
  if (/rewardFlowMode|SettingsComponent|eventSettings|PassSettings/i.test(p)) {
    const f = after.field(p);
    const val = f.kind === "object" || f.kind === "array" ? `[${f.kind}]` : String(f.value);
    if (hits < 40) console.log(`  ${p} = ${val}`);
    hits++;
  }
}
console.log(`total: ${hits}`);

console.log("\n=== all spooky48 component names ===");
const SP = "SpecialEvents.SSPSpooky48.v";
for (const idx of after.children(`${SP}.components`)) {
  const nm = `${SP}.components[${idx}].v.first`;
  if (after.has(nm)) console.log(`[${idx}] ${String(after.field(nm).value)}`);
}
