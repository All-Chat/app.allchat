/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import SettingsRequest from "@/models/SettingsRequest";

const ADMIN_SECRET = process.env.ADMIN_SECRET_KEY || "admin123";

function validateAdminKey(req: Request): boolean {
  return req.headers.get("x-admin-key") === ADMIN_SECRET;
}

// GET: Fetch all pending requests
export async function GET(req: Request) {
  try {
    if (!validateAdminKey(req)) return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
    
    await connectDB();
    const requests = await SettingsRequest.find({ status: "pending" }).sort({ createdAt: -1 }).lean();
    
    return NextResponse.json({ success: true, requests });
  } catch (error: any) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}

// PUT: Approve or Reject a request
export async function PUT(req: Request) {
  try {
    if (!validateAdminKey(req)) return NextResponse.json({ message: "Unauthorized" }, { status: 403 });
    
    await connectDB();
    const { requestId, action } = await req.json();

    if (!requestId || !action) return NextResponse.json({ message: "Missing data" }, { status: 400 });

    const settingsReq = await SettingsRequest.findById(requestId);
    if (!settingsReq || settingsReq.status !== "pending") {
      return NextResponse.json({ message: "Request not found or already processed" }, { status: 404 });
    }

    if (action === "approve") {
      // Apply changes to the User model
      const updateData: any = {};
      if (settingsReq.wabaId !== null) updateData.wabaId = settingsReq.wabaId;
      if (settingsReq.whatsappPhoneNumberId !== null) updateData.whatsappPhoneNumberId = settingsReq.whatsappPhoneNumberId;
      if (settingsReq.whatsappAccessToken !== null) updateData.whatsappAccessToken = settingsReq.whatsappAccessToken;

      await User.findByIdAndUpdate(settingsReq.userId, updateData);
      
      settingsReq.status = "approved";
      settingsReq.adminNote = "Approved by admin";
      await settingsReq.save();

      return NextResponse.json({ success: true, message: "Request approved and applied successfully" });

    } else if (action === "reject") {
      settingsReq.status = "rejected";
      settingsReq.adminNote = "Rejected by admin";
      await settingsReq.save();

      return NextResponse.json({ success: true, message: "Request rejected successfully" });
    }

    return NextResponse.json({ message: "Invalid action" }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}
