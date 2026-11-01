/* donor_convert: plaintext IGG donor JSON -> device-format SaveGame.db
   under the CURRENT install's XOR key (taken from a current device save).
   Usage: npx tsx .donor_convert.ts <cur_save.db> <IGG-account.db> <out.db> */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { decodeSave, encodeSave } from "./src/engine/codec.ts";

const [curFile, donorFile, outFile] = process.argv.slice(2);

const cur = decodeSave(new Uint8Array(readFileSync(curFile!)));
console.log(`container template: keyId=${cur.keyId} md5=${createHash("md5").update(cur.key!).digest("hex")} trailer=${cur.trailer.length}`);

const donorRaw = new Uint8Array(readFileSync(donorFile!));
// donor is plaintext JSON (fast path); keep its bytes as-is
const donor = decodeSave(donorRaw);
console.log(`donor: wasEncrypted=${donor.wasEncrypted} json=${donor.bytes.length}`);

const out = encodeSave(donor.bytes, cur);
writeFileSync(outFile!, Buffer.from(out));
console.log(`wrote ${outFile}: ${out.length} bytes md5=${createHash("md5").update(out).digest("hex")}`);

// verify round-trip: decode output with the same key must equal donor json
const back = decodeSave(new Uint8Array(out));
const same = Buffer.compare(Buffer.from(back.bytes), Buffer.from(donor.bytes)) === 0;
console.log(`round-trip verify: json-equal=${same} keyId=${back.keyId}`);
