import Campaign from "@/models/Campaign";
import { connectDB } from "@/lib/mongodb";

let isRunning = false;

export async function startInternalScheduler() {
  if (isRunning) return;
  isRunning = true;

  console.log("⏰ WatiX Internal Scheduler Started (Checks every 10s)");

  // Check every 10 seconds for campaigns that need to run
  setInterval(async () => {
    try {
      await connectDB();
      const now = new Date();
      
      // Find scheduled campaigns where the time has passed
      const campaignsToStart = await Campaign.find({
        status: "scheduled",
        scheduledAt: { $lte: now },
      });

      for (const campaign of campaignsToStart) {
        console.log(`🚀 Auto-starting scheduled campaign: ${campaign.name}`);
        
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${process.env.PORT || 3000}`;
        
        // ADDED: Pass the internal secret so the /api/campaigns/start route doesn't block us with a 401
        await fetch(`${baseUrl}/api/campaigns/start`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "x-internal-secret": process.env.INTERNAL_API_SECRET || "" 
          },
          body: JSON.stringify({ campaignId: campaign._id.toString() }),
        });
      }
    } catch (err) {
      console.error("Scheduler Tick Error:", err);
    }
  }, 10000); // 10 seconds
}