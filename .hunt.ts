/* Hunt for a SECOND balance that actually drives the tier.
   The pass UI counts KEYS (0/1 with a key icon), which need not be the same
   quantity as Currency.<season>Points. Check every balance-shaped place. */
import { readFileSync } from "node:fs";
import { openSave, type SaveGame } from "./src/engine/savegame.ts";
import { decodeSave } from "./src/engine/codec.ts";

function load(f: string): SaveGame {
  const c = decodeSave(new Uint8Array(readFileSync(f)));
  return openSave(c.bytes, c.wasEncrypted);
}
const donor = load(process.argv[2]!);
const device = load(process.argv[3]!);
const BASE = "SpecialEvents.SSPProcedure46.v.components";

const names = new Map<string, string>();
for (const p of donor.paths()) {
  const mt = /^SpecialEvents\.SSPProcedure46\.v\.components\[(\d+)\]\.v\.first$/.exec(p);
  if (mt) names.set(mt[1], String(donor.field(p).value));
}
const idxOf = (n: string): string | undefined =>
  [...names.entries()].find(([, v]) => v === n)?.[0];

console.log(`=== every Currency.* member (donor) with a non-zero amount ===`);
for (const p of donor.paths().filter((p) => /^Currency\.[^.]+\.amount$/.test(p)).sort()) {
  const v = Number(donor.field(p).value);
  if (v !== 0) console.log(`  ${p.padEnd(52)} = ${v}`);
}
console.log(`\n  (device) Currency members with a non-zero amount:`);
for (const p of device.paths().filter((p) => /^Currency\.[^.]+\.amount$/.test(p)).sort()) {
  const v = Number(device.field(p).value);
  if (v !== 0) console.log(`  ${p.padEnd(52)} = ${v}`);
}

console.log(`\n=== ALL Currency.* members on the donor (names only) ===`);
console.log(
  donor.paths()
    .filter((p) => /^Currency\.[^.]+$/.test(p))
    .map((p) => p.replace(/^Currency\./, ""))
    .sort()
    .join(", "),
);

const dump = (label: string, s: SaveGame, want: string, cap = 40): void => {
  const i = idxOf(want);
  if (i === undefined) {
    console.log(`\n=== ${want}: not a component on this procedure ===`);
    return;
  }
  const pfx = `${BASE}[${i}]`;
  const ps = s.paths().filter((p) => p.startsWith(pfx)).sort();
  console.log(`\n=== component ${i} ${want} — ${label} (${ps.length} leaves) ===`);
  for (const p of ps.slice(0, cap)) {
    const rel = p.slice(pfx.length).replace(/^\.v\.second\.v\.ptr\.v\./, "· ").replace(/^\./, "");
    console.log(`    ${rel.slice(0, 70).padEnd(70)} = ${String(s.field(p).value).replace(/\s+/g, " ").slice(0, 70)}`);
  }
  if (ps.length > cap) console.log(`    ... +${ps.length - cap} more`);
};

for (const want of [
  "VirtualCurrenciesBalance",
  "VirtualCurrenciesBalanceLog",
  "Cheats",
  "EventStatesInterface",
  "EventContext",
  "ContextProvider",
  "ContextLinker",
  "CommonVariables",
  "ComponentProviderDiscount",
  "RemoteParameters",
  "FeatureParams",
]) {
  dump("donor", donor, want);
  dump("device", device, want);
}
