/* Where does "SSPProcedure46Points" appear? Full-text grep over decoded JSON. */
import { readFileSync } from "node:fs";
import { decodeSave } from "./src/engine/codec.ts";
import { openSave } from "./src/engine/savegame.ts";

for (const f of [process.argv[2], process.argv[3]]) {
  if (!f) continue;
  const c = decodeSave(new Uint8Array(readFileSync(f)));
  const text = Buffer.from(c.bytes).toString("utf8");
  const id = "SSPProcedure46Points";
  console.log(`\n== ${f}: ${id} appears ${text.split(id).length - 1}x ==`);
  let idx = 0;
  let shown = 0;
  while ((idx = text.indexOf(id, idx + 1)) >= 0 && shown < 12) {
    shown++;
    console.log("  ...\x1b" + text.slice(Math.max(0, idx - 120), idx + id.length + 60).replace(/\n/g, " ") + "...");
  }
  const gen = "SSPProcedurePoints";
  console.log(`  (${gen}: ${text.split(gen).length - 1}x)`);
}
