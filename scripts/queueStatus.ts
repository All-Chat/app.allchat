/**
 * Queue diagnostics script.
 *
 * Usage:
 *   npx tsx scripts/queueStatus.ts
 *   npx tsx scripts/queueStatus.ts <campaignId>
 */

import { Queue } from "bullmq";
import * as dotenv from "dotenv";
import * as path from "path";

// ✅ Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const connection = {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: parseInt(process.env.REDIS_PORT || "6379"),
  password: process.env.REDIS_PASSWORD || undefined,
  tls: process.env.REDIS_HOST ? {} : undefined,
};

async function main() {
  const campaignId = process.argv[2];
  const queue = new Queue("campaign-processing", { connection });

  const counts = await queue.getJobCounts(
    "waiting",
    "active",
    "completed",
    "failed",
    "delayed",
    "paused"
  );

  console.log("\n=== campaign-processing queue: job counts ===");
  console.table(counts);

  if ((counts.waiting || 0) === 0 && (counts.active || 0) === 0) {
    console.log(
      "\n⚠️  No waiting or active jobs right now. If a campaign shows as " +
        "'running' in the dashboard but nothing is moving, its chunks are " +
        "not in the queue at all — the /start recovery logic likely " +
        "needs to be re-triggered (or chunks are permanently stuck in " +
        "reportData with status 'queued', which the old positional-$ bug " +
        "would leave behind)."
    );
  }

  if (campaignId) {
    console.log(`\n=== Jobs for campaign ${campaignId} ===`);
    const states: ("waiting" | "active" | "completed" | "failed" | "delayed")[] = [
      "waiting",
      "active",
      "failed",
      "delayed",
    ];

    for (const state of states) {
      const jobs = await queue.getJobs([state], 0, 500);
      const matching = jobs.filter((j) => j.data?.campaignId === campaignId);
      console.log(`\n-- ${state} (${matching.length}) --`);
      for (const j of matching) {
        const reason = j.failedReason ? ` | reason: ${j.failedReason}` : "";
        console.log(
          `  job ${j.id} | chunk ${j.data.startIdx}-${j.data.endIdx} | attemptsMade: ${j.attemptsMade}${reason}`
        );
      }
    }
  }

  await queue.close();
  process.exit(0);
}

main().catch((err) => {
  console.error("Diagnostics script failed:", err);
  process.exit(1);
});
