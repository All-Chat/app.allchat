/* eslint-disable @typescript-eslint/no-explicit-any */
// scripts/backfill-campaign-stats.ts
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import Campaign from "@/models/Campaign";

async function run() {
  await connectDB();

  const campaigns = await Campaign.find({}, { _id: 1, reportData: 1 }).lean();
  console.log(`Backfilling ${campaigns.length} campaigns…`);

  for (const c of campaigns as any) {
    const stats = { replied: 0, read: 0, delivered: 0, sent: 0, failed: 0, invalid: 0, duplicate: 0 };

    for (const r of c.reportData || []) {
      const status = (r.status || "").toLowerCase();
      if (stats[status as keyof typeof stats] !== undefined) stats[status as keyof typeof stats]++;

      const hasReply =
        (r.reply && r.reply !== "") ||
        (Array.isArray(r.replies) && r.replies.some((x: any) => x !== null && x !== ""));
      if (hasReply) stats.replied++;
    }

    await Campaign.updateOne({ _id: c._id }, { $set: { stats } });
  }

  console.log("Done.");
  await mongoose.disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
