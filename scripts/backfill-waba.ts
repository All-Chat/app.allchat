/* eslint-disable @typescript-eslint/no-explicit-any */
// Run this ONCE with: npx tsx scripts/backfill-waba.ts

import mongoose from "mongoose";
import Workflow from "@/models/Workflow";
import User from "@/models/User";

const MONGODB_URI =
  process.env.MONGODB_URI || "mongodb://localhost:27017/your-db-name";

async function backfill() {
  await mongoose.connect(MONGODB_URI);
  console.log("✅ Connected to DB");

  // Get all users who have WABA numbers
  const users = await User.find({
    $or: [
      { wabaPhoneNumberId: { $exists: true, $ne: null } },
      { "whatsapp.phoneNumberId": { $exists: true, $ne: null } },
    ],
  });

  console.log(`Found ${users.length} users with WABA numbers`);

  for (const user of users) {
    const whatsapp = (user as any).whatsapp;
    const phoneNumberId = (user as any).wabaPhoneNumberId || whatsapp?.phoneNumberId;
    const phoneNumber = (user as any).wabaPhoneNumber || whatsapp?.phoneNumber;

    if (!phoneNumberId) continue;

    // Update all workflows for this user that don't have wabaPhoneNumberId
    const result = await Workflow.updateMany(
      { userId: user._id, wabaPhoneNumberId: null },
      {
        $set: {
          wabaPhoneNumberId: phoneNumberId,
          wabaPhoneNumber: phoneNumber,
        },
      }
    );

    const displayName = (user as any).email || user.name;
    console.log(
      `User ${user._id} (${displayName}): Updated ${result.modifiedCount} workflows with WABA ID ${phoneNumberId}`
    );
  }

  console.log("✅ Backfill complete!");
  process.exit(0);
}

backfill().catch((err) => {
  console.error("❌ Backfill failed:", err);
  process.exit(1);
});
