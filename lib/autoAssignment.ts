
import mongoose from "mongoose";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import AutoAssignment from "@/models/AutoAssignment";

export async function getNextAutoAssignedUser(
  tenantId: string
): Promise<mongoose.Types.ObjectId | null> {
  await connectDB();

  if (!tenantId) return null;

  // Make sure settings exist.
  await AutoAssignment.updateOne(
    { tenantId },
    { $setOnInsert: { enabled: false, counter: 0 } },
    { upsert: true }
  );

  // Get active sub-users in a consistent order.
  const subUsers = await User.find({
    parentTenantId: tenantId,
    isTenant: false,
    accountStatus: "active",
  })
    .select("_id")
    .sort({ createdAt: 1, _id: 1 })
    .lean();

  if (!subUsers.length) return null;

  // Atomically reserve the next position.
  const settings = await AutoAssignment.findOneAndUpdate(
    { tenantId, enabled: true },
    { $inc: { counter: 1 } },
    { new: true }
  ).lean();

  if (!settings) return null;

  const index = (settings.counter - 1) % subUsers.length;

  return subUsers[index]._id as mongoose.Types.ObjectId;
}
