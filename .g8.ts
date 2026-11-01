/* g8: dump the runtime global-vars area of both saves — hunt goldenPassBought
        at the SAVE's GlobalVars store (what "Setting global bool" persists). */
import { readFileSync } from "node:fs";
import { decodeSave } from "./src/engine/codec.ts";
import { openSave, type SaveGame } from "./src/engine/savegame.ts";

function load(f: string): SaveGame {
  const c = decodeSave(new Uint8Array(readFileSync(f)));
  return openSave(c.bytes, c.wasEncrypted);
}
const after = load(process.argv[2]!);
const donor = load(process.argv[3]!);

function scanVarArea(s: SaveGame, label: string) {
  console.log(`\n===== ${label}: roots matching [Gg]lobal ====`)
  const roots = s.paths().filter((p) => /^[A-Za-z_]+$/.test(p) && /lobal/i.test(p));
  for (const r of roots) {
    const f = s.field(r);
    console.log(`  root ${r} kind=${f.kind} (t=${(f as any).t ?? "?"})`);
  }
  const GV = "GlobalVars";
  if (!s.has(GV)) { console.log(`  (no GlobalVars section)`); return; }
  console.log(`  kind GlobalVars = ${s.field(GV).kind}`);
  const rows: Array<[string, string]> = [];
  for (const p of s.paths()) {
    if (!p.startsWith(`${GV}.`)) continue;
    // keep depth small; capture scalar values
    const f = s.field(p);
    if (f.kind === "object" || f.kind === "array") continue;
    const rel = p.slice(GV.length + 1);
    if (/gold|pass|season|spooky|reward|ticket/i.test(rel)) rows.push([rel, String(f.value)]);
  }
  console.log(`  matching leaves (${rows.length}):`);
  for (const [k, v] of rows.slice(0, 80)) console.log(`    ${k} = ${v}`);
  // also show the first-level child names to learn the shape
  try {
    const kids = s.children(GV);
    console.log(`  GlobalVars children: ${JSON.stringify(kids).slice(0, 400)}`);
  } catch { /* leafish */ }
}
scanVarArea(after, "AFTER (device, spooky session)");
scanVarArea(donor, "DONOR (IGG 46)");

/* also dump ANY save path whose leaf name is exactly goldenPassBought outside [26] */
for (const [label, s] of [["AFTER", after], ["DONOR", donor]] as const) {
  const hits = s.paths().filter((p) => /(^|\.)(goldenPassBought)$/.test(p));
  console.log(`\n${label} goldenPassBought paths: ${hits.join(" | ") || "(none)"}`);
}
