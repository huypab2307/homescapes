/* Structural probes on the PLXE containers (GlobalVars.xml / GameEvents.json). */
import { readFileSync } from "node:fs";
import { f205Key } from "./src/engine/f205-key.ts";
import { xorKey } from "./src/engine/xor-key.ts";

for (const file of [process.argv[2]!, process.argv[3]!]) {
  const raw = readFileSync(file);
  console.log(`\n===== ${file} (${raw.length} B) =====`);
  console.log("head hex:", Buffer.from(raw.slice(0, 32)).toString("hex"));
  const ZSTD = new Uint8Array([0x28, 0xb5, 0x2f, 0xfd]);

  const find = (b: Uint8Array, pat: Uint8Array) => {
    const idx: number[] = [];
    outer: for (let i = 0; i < Math.min(b.length, 96); i++) {
      for (let j = 0; j < pat.length; j++) if (b[i + j] !== pat[j]) continue outer;
      idx.push(i);
    }
    return idx;
  };

  for (const [name, key] of [["f205", f205Key()], ["community", xorKey()]] as const) {
    const dec = raw.map((b, i) => b ^ key[i % key.length]!);
    console.log(`${name}-xor head:`, Buffer.from(dec.slice(0, 28)).toString("hex"), "zstd@<96:", find(dec, ZSTD));
  }
  console.log("raw zstd@<96:", find(raw, ZSTD));
  // plausible u32 fields in header
  const dv = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  for (const o of [4, 6, 8, 10, 12, 14, 16, 18, 20]) {
    if (o + 4 <= raw.length) console.log(`u32@${o} = ${dv.getUint32(o, true)} (0x${dv.getUint32(o, true).toString(16)})`);
  }
}
