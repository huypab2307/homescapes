/* Inspect Currency subtree on the game-written fresh pull. */
import { readFileSync } from "node:fs";
import { decodeSave, encodeSave } from "./src/engine/codec.ts";
import { openSave } from "./src/engine/savegame.ts";
import { runApply } from "./src/engine/operations.ts";

const vC = decodeSave(new Uint8Array(readFileSync(process.argv[2]!)));
const device = openSave(vC.bytes, vC.wasEncrypted);

console.log("kind =", device.field("Currency.SSPProcedure46Points").kind, " value =", JSON.stringify(device.field("Currency.SSPProcedure46Points").value));
console.log("rawText =", JSON.stringify(device.rawText("Currency.SSPProcedure46Points")));
console.log("has =", device.has("Currency.SSPProcedure46Points"));
const t = device.rawText("Currency").slice(0, 300);
console.log("Currency raw head:", t.replace(/\n/g, " ").slice(0, 280));
