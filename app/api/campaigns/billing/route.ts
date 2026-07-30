/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Campaign from "@/models/Campaign";
import User from "@/models/User";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET() {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ success: false }, { status: 401 });

    // 1. Fetch pricing fields
    const user = await User.findById(session.user.id)
      .select("enabledCountries priceMarketing priceUtility priceAuthentication pricePerMessage")
      .lean();
      
    if (!user) return NextResponse.json({ success: false }, { status: 404 });

    // Pre-process countries: sort by code length DESCENDING
    const enabledCountries = (user.enabledCountries || []).map((c: any) => ({ ...c }));
    enabledCountries.sort((a, b) => String(b.code || "").length - String(a.code || "").length);

    // 2. 🚀 NATIVE MONGODB PROJECTION: 
    // This forces the DB engine to ONLY return the 1st phone number, ignoring the other 49,999.
    const campaigns = await Campaign.find({ userId: session.user.id })
      .sort({ createdAt: -1 })
      .select({
        _id: 1,
        name: 1,
        templateName: 1,
        templateCategory: 1,
        status: 1,
        totalMessages: 1,
        sentCount: 1,
        failedCount: 1,
        totalDeducted: 1,
        scheduledAt: 1,
        createdAt: 1,
        updatedAt: 1,
        startedAt: 1,
        completedAt: 1,
        liveStats: 1,
        phoneNumbers: { $slice: 1 } // 🚀 Native DB slice, much faster than Mongoose slice
      })
      .lean();

    // 3. Map campaigns
    const mappedCampaigns = campaigns.map(c => {
      let currentPrice = 0;
      let matchedCountry = null;
      
      const firstPhone = c.phoneNumbers?.[0] ? String(c.phoneNumbers[0]).replace(/\D/g, "") : "";
      
      if (firstPhone) {
        matchedCountry = enabledCountries.find(country => firstPhone.startsWith(String(country.code || "")));
      }
      if (!matchedCountry && enabledCountries.length > 0) {
        matchedCountry = enabledCountries[0];
      }

      const rawCategory = String(c.templateCategory || "").trim().toUpperCase();
      const category = (rawCategory === "UTILITY" || rawCategory === "AUTHENTICATION") ? rawCategory : "MARKETING";

      if (matchedCountry) {
        if (category === "MARKETING") {
          currentPrice = Number(matchedCountry.priceMarketing) || Number(user.priceMarketing) || 0;
        } else if (category === "UTILITY") {
          currentPrice = Number(matchedCountry.priceUtility) || Number(user.priceUtility) || 0;
        } else if (category === "AUTHENTICATION") {
          currentPrice = Number(matchedCountry.priceAuthentication) || Number(user.priceAuthentication) || 0;
        }
      } else {
        if (category === "MARKETING") currentPrice = Number(user.priceMarketing) || 0;
        else if (category === "UTILITY") currentPrice = Number(user.priceUtility) || 0;
        else if (category === "AUTHENTICATION") currentPrice = Number(user.priceAuthentication) || 0;
        else currentPrice = Number(user.pricePerMessage) || 0;
      }

      return {
        ...c,
        currentPrice
      };
    });

    return NextResponse.json({ success: true, campaigns: mappedCampaigns });
  } catch (error) {
    console.error("Error in campaign billing:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
