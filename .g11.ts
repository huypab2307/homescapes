/* g11b: print the raw Currency-section region of the plain save text. */
import { readFileSync } from "node:fs";
import { decodeSave } from "./src/engine/codec.ts";

const c = decodeSave(new Uint8Array(readFileSync(process.argv[2]!)));
const text = new TextDecoder().decode(c.bytes);

const i = text.indexOf('"Currency"');
console.log(`"Currency" at ${i}`);
console.log(text.slice(i, i + 1400));
console.log("\n\n=== all ',\"SSP' member starts after currency ===");
const re2 = /"SSP[A-Za-z0-9_.]+":/g;
let m2: RegExpExecArray | null;
let n = 0;
while ((m2 = re2.exec(text))) {
  n++;
  if (n > 40) break;
  console.log(`${m2[1].padEnd(34)} @${m2.index}`);
}
