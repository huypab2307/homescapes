/* max_spooky: unlock + max BOTH rows (free & gold) on the LIVE event SSPSpooky48.
   Usage: npx tsx .max_spooky.ts <donor_after_boot.db> <out.db> */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { decodeSave, encodeSave } from "./src/engine/codec.ts";

const [srcFile, outFile] = process.argv.slice(2);
const EV = "SSPSpooky48";
const c = decodeSave(new Uint8Array(readFileSync(srcFile!)));
const origText = new TextDecoder().decode(c.bytes);
const healed = origText.replace('"SSPProcedure46Points":,', '"SSPProcedure46Points":null,');
if (healed.length !== origText.length) console.log("healed empty token");
const j = JSON.parse(healed);

const ev = j.SpecialEvents[EV].v;
const comps = ev.components;
const inner = (x: any) => x?.v?.second?.v?.ptr?.v;

// 1) comp[20] GoldenTicketOffer -> bought
const alt = inner(comps[20]).alternatives[0].v.second.v.ptr.v;
console.log(`comp[20].isGoldenTicketBought: ${alt.isGoldenTicketBought} -> true`);
alt.isGoldenTicketBought = true;

// 2) comp[16] EventLogic: mark all stages completed, currProgress high
const logic = inner(comps[16]);
const stages = logic.stages.v.ptr.v.stages;
let done = 0;
for (const s of stages) {
  const st = s.v.ptr.v;
  if (!st.completed) { st.completed = true; done++; }
}
logic.currProgress = stages.length;
console.log(`comp[16]: marked ${done}/${stages.length} stages completed; currProgress -> ${stages.length}`);

// 3) comp[26] stats
const stats = inner(comps[26]);
console.log(`comp[26].goldenPassBought: ${stats.goldenPassBought} -> true; ` +
            `normal ${stats.normalRewardsCollectedCount} -> 31; ` +
            `premium ${stats.premiumRewardsCollectedCount} -> 31`);
stats.goldenPassBought = true;
stats.normalRewardsCollectedCount = 31;
stats.premiumRewardsCollectedCount = 31;

// 4) comp[1] currentRewardIndex -> last
const ri = inner(comps[1]);
if (ri && typeof ri.currentRewardIndex === "number" && ri.currentRewardIndex < 0) {
  ri.currentRewardIndex = stages.length - 1;
  console.log(`comp[1].currentRewardIndex -> ${ri.currentRewardIndex}`);
}

// 5) comp[40]: populate both claim lists 0..30
const collected = inner(comps[40]);
const mkEntry = (idx: number) => ({
  t: "ds",
  v: {
    rewardIndex: idx,
    rewardSnapshot: {
      t: "ds",
      v: { type: "rewardSnapshot", ptr: { t: "ds", v: { rewardItems: [], ribbonTextId: "" } } },
    },
  },
});
for (const listName of ["NormalRewards", "PremiumRewards"]) {
  const pair = collected.collectedRewards.find((p: any) => p.v.first === listName);
  if (!pair) { console.log(`WARN: no ${listName} list`); continue; }
  const list = pair.v.second.v.collectedRewardsList;
  const have = new Set(list.map((e: any) => e.v.rewardIndex));
  let added = 0;
  for (let i = 0; i <= 30; i++) if (!have.has(i)) { list.push(mkEntry(i)); added++; }
  console.log(`${listName}: had ${have.size}, added ${added}, now ${list.length}`);
}

// 6) event currency: ensure present + maxed
j.Currency = j.Currency || {};
const ck = `Currency.${EV}Points`;
const amt = 10000;
if (!j.Currency[`${EV}Points`]) {
  j.Currency[`${EV}Points`] = { amount: amt, prevAmount: amt };
  console.log(`${ck}: created amount=${amt}`);
} else {
  console.log(`${ck}: ${j.Currency[`${EV}Points`].amount} -> ${amt}`);
  j.Currency[`${EV}Points`].amount = amt;
  j.Currency[`${EV}Points`].prevAmount = amt;
}

// 7) SeasonPassInfoCache -> point at the live event, both rows 31
const cache = j.SeasonPassInfoCache;
console.log(`cache: ${JSON.stringify(cache)}`);
cache.seasonPassEventId = EV;
cache.collectedFree = 31;
cache.collectedGold = 31;
cache.goldenPassPurchased = true;
cache.unlockedFree = 31;
cache.unlockedGold = 31;
console.log(`cache -> ${JSON.stringify(cache)}`);

// 8) Buyings.coins_purchases ledger: record the golden-ticket coin purchase
//    (the entitlement reconcile reads this ledger; product = <Event>GoldenTicket)
const nowTs = "1793215000";
const prod = `${EV}GoldenTicket`;
j.Buyings = j.Buyings || { coins_purchases: [] };
j.Buyings.coins_purchases = j.Buyings.coins_purchases || [];
const hasLedger = j.Buyings.coins_purchases.some((e: any) => e.v?.product === prod);
if (!hasLedger) {
  j.Buyings.coins_purchases.push({
    t: "ds",
    v: { timestamp: { t: "i64", v: nowTs }, product: prod, coinsSpent: 9, level: 656 },
  });
  console.log(`Buyings.coins_purchases: added ${prod}`);
} else {
  console.log(`Buyings.coins_purchases: ${prod} already present`);
}

// 9) HistoryComponent: append the "Bought Golden Ticket" event-history entry
for (const [i, c] of comps.entries()) {
  let first: string | undefined;
  try { first = c.v.first; } catch { /* not a variant pair */ }
  if (first === "HistoryComponent") {
    const h = c.v.second.v.ptr.v;
    const entry = `(${nowTs}) Bought Golden Ticket`;
    if (!h.history.includes(entry)) {
      h.history.push(entry);
      console.log(`comp[${i}] HistoryComponent: added "${entry}" (now ${h.history.length})`);
    }
  }
}

// re-encode under same container
const out = encodeSave(new TextEncoder().encode(JSON.stringify(j)), c);
writeFileSync(outFile!, Buffer.from(out));
console.log(`wrote ${outFile}: ${out.length} md5=${createHash("md5").update(out).digest("hex")}`);

// verify
const back = decodeSave(new Uint8Array(out));
const bj = JSON.parse(new TextDecoder().decode(back.bytes));
const be = bj.SpecialEvents[EV].v;
const bo = inner(be.components[20]).alternatives[0].v.second.v.ptr.v;
const bs = inner(be.components[26]);
const bst = inner(be.components[16]).stages.v.ptr.v.stages;
const bdone = bst.filter((s: any) => s.v.ptr.v.completed).length;
console.log(`VERIFY ${EV}: isGoldenTicketBought=${bo.isGoldenTicketBought} ` +
            `goldenPassBought=${bs.goldenPassBought} normal=${bs.normalRewardsCollectedCount} ` +
            `premium=${bs.premiumRewardsCollectedCount} stagesDone=${bdone}/${bst.length} ` +
            `currency=${bj.Currency[`${EV}Points`].amount} cacheGold=${bj.SeasonPassInfoCache.collectedGold}`);
