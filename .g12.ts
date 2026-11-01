/* g12: what did the game do to the v7 GT fields? */
import { readFileSync } from "node:fs";
import { decodeSave } from "./src/engine/codec.ts";
import { openSave, type SaveGame } from "./src/engine/savegame.ts";

function load(f: string): SaveGame {
  const c = decodeSave(new Uint8Array(readFileSync(f)));
  return openSave(c.bytes, c.wasEncrypted);
}
const pushed = load(process.argv[2]!);
const after = load(process.argv[3]!);

const SP = "SpecialEvents.SSPSpooky48.v";
const paths: Array<[string, string]> = [
  ["offer isGoldenTicketBought", `${SP}.components[20].v.second.v.ptr.v.alternatives[0].v.second.v.ptr.v.isGoldenTicketBought`],
  ["logic isGTPurchaseWindowShown", `${SP}.components[16].v.second.v.ptr.v.isGTPurchaseWindowShown`],
  ["logic currProgress", `${SP}.components[16].v.second.v.ptr.v.currProgress`],
  ["log26 goldenPassBought", `${SP}.components[26].v.second.v.ptr.v.goldenPassBought`],
  ["log26 premiumRewardsCollectedCount", `${SP}.components[26].v.second.v.ptr.v.premiumRewardsCollectedCount`],
  ["log26 normalRewardsCollectedCount", `${SP}.components[26].v.second.v.ptr.v.normalRewardsCollectedCount`],
  ["state", `${SP}.statesGraph.v.ptr.v.currentState`],
  ["currency amount", `Currency.SSPSpooky48Points.amount`],
  ["buyWnd openTimesCount", `${SP}.components[3].v.second.v.ptr.v.openTimesCount`],
  ["success isShownOnce", `${SP}.components[48].v.second.v.ptr.v.isShownOnce`],
];
for (const [label, p] of paths) {
  const a = pushed.has(p) ? String(pushed.field(p).value) : "<absent>";
  const b = after.has(p) ? String(after.field(p).value) : "<absent>";
  console.log(`${label.padEnd(36)} pushed=${a.padEnd(10)} after=${b}`);
}
