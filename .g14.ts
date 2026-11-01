/* g14: scan the plain save text for season-pass global-var persistence. */
import { readFileSync } from "node:fs";
import { decodeSave } from "./src/engine/codec.ts";

const c = decodeSave(new Uint8Array(readFileSync(process.argv[2]!)));
const text = new TextDecoder().decode(c.bytes);

for (const needle of [
  "SeasonPass_Gold",
  "GoldenPassBought",
  "goldenPassBought",
  "SeasonPassGoldenTicket",
  '"Vars"',
  '"GlobalVars"',
  '"Globals"',
  '"LuaVars"',
  "SSP.",
  '"SeasonPass',
]) {
  const idxs: number[] = [];
  let i = text.indexOf(needle);
  while (i >= 0 && idxs.length < 12) {
    idxs.push(i);
    i = text.indexOf(needle, i + 1);
  }
  console.log(`\n### '${needle}' x${idxs.length}`);
  for (const at of idxs.slice(0, 6)) console.log(`  @${at}: ${JSON.stringify(text.slice(Math.max(0, at - 60), at + 90))}`);
}
