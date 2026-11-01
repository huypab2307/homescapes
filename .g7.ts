/* g7: A) verify what the game recorded after the gp6 claim session
        (fresh = pre-push, spooky = pushed, after = pulled post-session)
     B) dump donor46 vs spooky48 purchase-shaped components in FULL field
        detail — hunt the field that makes the gold row render unlocked. */
import { readFileSync } from "node:fs";
import { decodeSave } from "./src/engine/codec.ts";
import { openSave, type SaveGame } from "./src/engine/savegame.ts";

function load(f: string): SaveGame {
  const c = decodeSave(new Uint8Array(readFileSync(f)));
  return openSave(c.bytes, c.wasEncrypted);
}
const fresh = load(process.argv[2]!);
const pushed = load(process.argv[3]!);
const after = load(process.argv[4]!);
const donor = load(process.argv[5]!);

const SP = "SpecialEvents.SSPSpooky48.v";
const logic = `${SP}.components[16].v.second.v.ptr.v`;
const log26 = `${SP}.components[26].v.second.v.ptr.v`;
const hold40 = `${SP}.components[40].v.second.v.ptr.v`;
const stages = `${logic}.stages.v.ptr.v.stages`;

/* ---------- helpers ---------- */
function scalars(s: SaveGame, base: string, skip: RegExp | null = null) {
  const rows: string[] = [];
  for (const p of s.paths()) {
    if (!p.startsWith(base)) continue;
    const rel = p.slice(base.length) || "(self)";
    if (skip && skip.test(rel)) continue;
    const f = s.field(p);
    if (f.kind === "object" || f.kind === "array") continue;
    rows.push(`  ${rel} = ${String(f.value)}`);
  }
  return rows;
}

/* ---------- PART A: three-way state check ---------- */
console.log(`\n########## PART A: game-recorded state (sizes fresh/pushed/after) ##########`);
const KEYS: Array<[string, string, RegExp | null]> = [
  ["currency spooky amount", `Currency.SSPSpooky48Points.amount`, null],
  ["currency spooky prev", `Currency.SSPSpooky48Points.prevAmount`, null],
  ["currency 46 amount", `Currency.SSPProcedure46Points.amount`, null],
  ["logic currProgress", `${logic}.currProgress`, null],
  ["logic prevProgress", `${logic}.previousProgress`, null],
  ["logic isProgressUpdated", `${logic}.isProgressUpdated`, null],
  ["logic isGTPurchaseWindowShown", `${logic}.isGTPurchaseWindowShown`, null],
  ["log26 goldenPassBought", `${log26}.goldenPassBought`, null],
  ["state spooky48", `${SP}.statesGraph.v.ptr.v.currentState`, null],
  ["state 46", `SpecialEvents.SSPProcedure46.v.statesGraph.v.ptr.v.currentState`, null],
  ["cache goldenPassPurchased", `SeasonPassInfoCache.goldenPassPurchased`, null],
  ["cache unlockedGold", `SeasonPassInfoCache.unlockedGold`, null],
  ["cache collectedGold", `SeasonPassInfoCache.collectedGold`, null],
  ["cache goldenPassSeasonId", `SeasonPassInfoCache.goldenPassSeasonId`, null],
];
for (const s of [fresh, pushed, after]) {
  console.log(`--- save ${s === fresh ? "FRESH(pre)" : s === pushed ? "PUSHED(v6)" : "AFTER(session)"} ---`);
  for (const [label, path] of KEYS) {
    const v = s.has(path) ? String(s.field(path).value) : "<absent>";
    console.log(`  ${label.padEnd(30)} ${v}`);
  }
  const done: number[] = [];
  for (let i = 0; i <= 30; i++) {
    const b = `${stages}[${i}].v.ptr.v.completed`;
    if (s.has(b) && s.field(b).value === true) done.push(i);
  }
  console.log(`  stages completed: ${done.join(",") || "(none)"}`);
  const stores = s.paths().filter((p) => p.startsWith("NewGameEventsAutoStores.SSPSpooky48."));
  const storeRoots = new Set(
    stores.map((p) => (p.match(/^NewGameEventsAutoStores\.SSPSpooky48\.[^.]+/) || [p])[0]),
  );
  for (const r of storeRoots) {
    const rr = r.replace("NewGameEventsAutoStores.SSPSpooky48.", "");
    const got = s.has(`${r}.receivedRewards`) ? String(s.field(`${r}.receivedRewards`).value ?? "?") : "(no receivedRewards)";
    console.log(`  store ${rr}: ${got.slice(0, 90)}`);
  }
}

/* ---------- PART A2: log26 + hold40 full scalar dumps for AFTER ---------- */
console.log(`\n########## AFTER log26 [26] scalars ##########`);
for (const r of scalars(after, log26)) console.log(r);
console.log(`\n########## AFTER hold40 [40] scalars ##########`);
for (const r of scalars(after, hold40, /^award|^rewards/)) console.log(r);

/* ---------- PART B: purchase-shaped components, donor46 vs spooky48 ---------- */
console.log(`\n########## PART B: component name maps ##########`);
function compNames(s: SaveGame, root: string): string[] {
  const names: string[] = [];
  for (const p of s.paths()) {
    const mt = new RegExp(`^${root}\\.v\\.components\\[(\\d+)\\]\\.v\\.first$`).exec(p);
    if (mt) names[Number(mt[1])] = String(s.field(p).value);
  }
  return names;
}
const donorNames = compNames(donor, "SpecialEvents.SSPProcedure46");
const spookyNames = compNames(after, "SpecialEvents.SSPSpooky48");
const BUY = /Golden|Purchase|Ticket|Offer|buy|Iap|IAP|Currency/i;
console.log(`--- donor46 purchase-shaped ---`);
for (const [i, n] of donorNames.entries()) if (n && BUY.test(n)) console.log(`  [${i}] ${n}`);
console.log(`--- spooky48 purchase-shaped (AFTER) ---`);
for (const [i, n] of spookyNames.entries()) if (n && BUY.test(n)) console.log(`  [${i}] ${n}`);

/* full field dump of each donor purchase-shaped component */
console.log(`\n########## DONOR46 purchase components — FULL fields ##########`);
for (const [i, n] of donorNames.entries()) {
  if (!n || !BUY.test(n)) continue;
  const base = `SpecialEvents.SSPProcedure46.v.components[${i}].v.second.v.ptr.v`;
  const hasSecond = donor.has(base);
  console.log(`\n--- donor46 [${i}] ${n} second=${hasSecond} ---`);
  if (!hasSecond) continue;
  const rows = scalars(donor, base);
  for (const r of rows.slice(0, 60)) console.log(r);
  if (rows.length > 60) console.log(`  ... (+${rows.length - 60} more)`);
}

/* same dump for spooky48 purchase-shaped components (AFTER rows) */
console.log(`\n########## SPOOKY48 purchase components — FULL fields (AFTER) ##########`);
for (const [i, n] of spookyNames.entries()) {
  if (!n || !BUY.test(n)) continue;
  const base = `SpecialEvents.SSPSpooky48.v.components[${i}].v.second.v.ptr.v`;
  if (!after.has(base)) { console.log(`\n--- spooky48 [${i}] ${n} second=absent ---`); continue; }
  console.log(`\n--- spooky48 [${i}] ${n} ---`);
  const rows = scalars(after, base);
  for (const r of rows.slice(0, 60)) console.log(r);
  if (rows.length > 60) console.log(`  ... (+${rows.length - 60} more)`);
}
