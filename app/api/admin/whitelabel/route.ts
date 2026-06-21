/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { exec } from "child_process"; // ✅ Added

export async function POST(req: Request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    
    const isAdmin = session?.user?.name === "TRL" || session?.user?.email === "TRL";
    if (!isAdmin) {
      return NextResponse.json({ success: false, message: "Admin access required" }, { status: 403 });
    }

    const { userId, whiteLabelData } = await req.json();

    if (!userId) {
      return NextResponse.json({ success: false, message: "User ID is required" }, { status: 400 });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $set: { whiteLabel: whiteLabelData } },
      { new: true, upsert: true }
    ).select("-password");

    if (!updatedUser) {
      return NextResponse.json({ success: false, message: "User not found" }, { status: 404 });
    }

    // ✅ AUTOMATICALLY PROVISION SSL IF DOMAIN IS PROVIDED AND ENABLED
    if (whiteLabelData.enabled && whiteLabelData.brandUrl) {
      const domain = whiteLabelData.brandUrl.replace(/https?:\/\//, "").replace(/\/$/, "");
      
      // Run the bash script asynchronously so the API doesn't hang
      exec(`sudo /usr/local/bin/setup-domain.sh ${domain}`, (error, stdout, stderr) => {
        if (error) {
          console.error(`SSL Provisioning Error for ${domain}:`, stderr);
        } else {
          console.log(`SSL Provisioning Success for ${domain}:`, stdout);
        }
      });
    }

    return NextResponse.json({
      success: true,
      message: "Settings saved! Domain SSL provisioning started in the background.",
      user: updatedUser,
    });

  } catch (error: any) {
    console.error("Error updating white label:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}
