// lib/updateCampaignStats.ts
import Campaign from "@/models/Campaign";

// Explicit keys for campaign stats to avoid using the model as a type
type StatsKey =
  | "read"
  | "delivered"
  | "sent"
  | "failed"
  | "invalid"
  | "duplicate"
  | "replied";

const FIELD_BY_STATUS: Record<string, StatsKey> = {
  read: "read",
  delivered: "delivered",
  sent: "sent",
  failed: "failed",
  invalid: "invalid",
  duplicate: "duplicate",
};

/**
 * Atomically bump the counter for a new status (and optionally decrement the
 * previous one if a message is transitioning from one status to another).
 *
 * Example:
 *   await updateCampaignStats(campaignId, "delivered", "sent");
 *   // => stats.sent: -1, stats.delivered: +1
 */
export async function updateCampaignStats(
  campaignId: string,
  newStatus: string,
  prevStatus?: string
) {
  const inc: Record<string, number> = {};

  const newField = FIELD_BY_STATUS[(newStatus || "").toLowerCase()];
  if (newField) inc[`stats.${newField}`] = 1;

  if (prevStatus) {
    const prevField = FIELD_BY_STATUS[(prevStatus || "").toLowerCase()];
    if (prevField && prevField !== newField) inc[`stats.${String(prevField)}`] = -1;
  }

  if (Object.keys(inc).length === 0) return;
  await Campaign.updateOne({ _id: campaignId }, { $inc: inc });
}

/**
 * Call this when a reply comes in. `replied` is an overlay counter (a message
 * can be both delivered AND replied), so we never decrement it.
 */
export async function markCampaignReplied(campaignId: string) {
  await Campaign.updateOne({ _id: campaignId }, { $inc: { "stats.replied": 1 } });
}
