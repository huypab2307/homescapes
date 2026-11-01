/* max_golden_pass: patch the live donor save so BOTH season-pass rows
   (free + gold) are fully unlocked and fully collected on SSPProcedure46.
   Usage: npx tsx .max_golden_pass.ts <donor_live.db> <out.db> */
import { readFileSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { decodeSave, encodeSave } from "./src/engine/codec.ts";

const [srcFile, outFile] = process.argv.slice(2);
const c = decodeSave(new Uint8Array(readFileSync(srcFile!)));
const origText = new TextDecoder().decode(c.bytes);
// heal the game's non-standard empty token
const healed = origText.replace('"SSPProcedure46Points":,', '"SSPProcedure46Points":null,');
if (healed.length !== origText.length) console.log("healed empty token");
const j = JSON.parse(healed);

const EV = "SSPProcedure46";
const ev = j.SpecialEvents[EV].v;
const comps = ev.components;
const inner = (x: any) => x?.v?.second?.v?.ptr?.v;

// 1) comp[20] GoldenTicketOffer: flip the runtime lever
const offer = inner(comps[20]);
const alt = offer.alternatives[0].v.second.v.ptr.v;
const before1 = alt.isGoldenTicketBought;
alt.isGoldenTicketBought = true;
console.log(`comp[20].isGoldenTicketBought: ${before1} -> true`);

// 2) comp[26] stats: goldenPassBought true + max collected counts
const stats = inner(comps[26]);
console.log(`comp[26].goldenPassBought: ${stats.goldenPassBought} -> true; ` +
            `normal ${stats.normalRewardsCollectedCount} -> 31; ` +
            `premium ${stats.premiumRewardsCollectedCount} -> 31`);
stats.goldenPassBought = true;
stats.normalRewardsCollectedCount = 31;
stats.premiumRewardsCollectedCount = 31;

// 3) SeasonPassInfoCache: both rows fully collected
const cache = j.SeasonPassInfoCache;
console.log(`cache: collectedFree ${cache.collectedFree} -> 31; collectedGold ${cache.collectedGold} -> 31`);
cache.collectedFree = 31;
cache.collectedGold = 31;
cache.goldenPassPurchased = true;
cache.unlockedFree = 31;
cache.unlockedGold = 31;

// 4) comp[40]: populate both claim lists with every index 0..30
const collected = inner(comps[40]);
const mkEntry = (idx: number) => ({
  t: "ds",
  v: {
    rewardIndex: idx,
    rewardSnapshot: {
      t: "ds",
      v: {
        type: "rewardSnapshot",
        ptr: { t: "ds", v: { rewardItems: [], ribbonTextId: "" } },
      },
    },
  },
});
for (const listName of ["NormalRewards", "PremiumRewards"]) {
  const pair = collected.collectedRewards.find((p: any) => p.v.first === listName);
  const list = pair.v.second.v.collectedRewardsList;
  const have = new Set(list.map((e: any) => e.v.rewardIndex));
  let added = 0;
  for (let i = 0; i <= 30; i++) {
    if (!have.has(i)) { list.push(mkEntry(i)); added++; }
  }
  console.log(`${listName}: had ${have.size}, added ${added}, now ${list.length}`);
}

// re-encode under the SAME container (key + trailer)
const out = encodeSave(new TextEncoder().encode(JSON.stringify(j)), c);
writeFileSync(outFile!, Buffer.from(out));
console.log(`wrote ${outFile}: ${out.length} bytes md5=${createHash("md5").update(out).digest("hex")}`);

// verify round-trip
const back = decodeSave(new Uint8Array(out));
const bj = JSON.parse(new TextDecoder().decode(back.bytes));
const bOffer = inner(bj.SpecialEvents[EV].v.components[20]).alternatives[0].v.second.v.ptr.v;
console.log(`VERIFY isGoldenTicketBought=${bOffer.isGoldenTicketBought} ` +
            `collectedGold=${bj.SeasonPassInfoCache.collectedGold} ` +
            `collectedFree=${bj.SeasonPassInfoCache.collectedFree} ` +
            `premiumCount=${inner(bj.SpecialEvents[EV].v.components[26]).premiumRewardsCollectedCount}`);
