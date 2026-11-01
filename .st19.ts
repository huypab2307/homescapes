/* Try decoding GlobalVars.xml (PLXE) with the save codec; dump its structure. */
import { readFileSync } from "node:fs";
import { decodeSave } from "./src/engine/codec.ts";
import { openSave } from "./src/engine/savegame.ts";

const buf = new Uint8Array(readFileSync(process.argv[2]!));
console.log("magic:", Buffer.from(buf.slice(0, 16)).toString("hex"), JSON.stringify(Buffer.from(buf.slice(0, 8)).toString("latin1")));
try {
  const c = decodeSave(buf);
  console.log("decode OK; wasEncrypted =", c.wasEncrypted, "bytes =", c.bytes.length);
  const s = openSave(c.bytes, c.wasEncrypted);
  const roots: string[] = [];
  try { for (const ch of s.children("root")) roots.push(ch); console.log("root children:", roots.join(", ")); } catch { console.log("(no 'root')"); }
  let n = 0;
  const re = /(golden|seasonpass|gold|spooky|sus|cheat)/i;
  for (const p of s.paths()) {
    if (n > 300) break;
    const f = s.field(p);
    const interesting = re.test(p);
    if (f.kind === "object" || f.kind === "array") {
      if (interesting) { console.log(`OBJ ${p}`); n++; }
      continue;
    }
    if (interesting || n < 120) {
      console.log(`${p} = ${String(f.value).replace(/\s+/g, " ").slice(0, 90)}`);
      n++;
    }
  }
} catch (e) {
  console.log("DECODE FAILED:", (e as Error).message);
  // try treating as plain ds graph (savegame raw)
  try {
    const s = openSave(buf);
    console.log("raw open OK; paths:");
    let n = 0;
    for (const p of s.paths()) {
      const f = s.field(p);
      if (f.kind === "object" || f.kind === "array") continue;
      if (n++ < 60) console.log(`${p} = ${String(f.value).replace(/\s+/g, " ").slice(0, 80)}`);
    }
  } catch (e2) {
    console.log("RAW OPEN FAILED:", (e2 as Error).message);
  }
}
