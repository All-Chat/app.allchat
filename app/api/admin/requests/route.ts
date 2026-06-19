/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import SettingsRequest from "@/models/SettingsRequest";
import { incrementUsage } from "@/lib/limits";

const ADMIN_SECRET = process.env.ADMIN_SECRET_KEY || "admin123";

function validateAdminKey(req: Request): boolean {
  return req.headers.get("x-admin-key") === ADMIN_SECRET;
}

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
      const user = await User.findById(settingsReq.userId);
      if (!user) return NextResponse.json({ message: "User not found" }, { status: 404 });

      // Check if it's an edit request AND the numberId exists
      if (settingsReq.requestType === "edit" && settingsReq.numberId) {
        const numIdStr = settingsReq.numberId.toString();
        const index = user.whatsappNumbers.findIndex((n: any) => n._id.toString() === numIdStr);
        
        if (index !== -1) {
          // Directly update the array element
          user.whatsappNumbers[index].name = settingsReq.name;
          user.whatsappNumbers[index].wabaId = settingsReq.wabaId;
          user.whatsappNumbers[index].whatsappPhoneNumberId = settingsReq.whatsappPhoneNumberId;
          
          if (settingsReq.whatsappAccessToken) {
            user.whatsappNumbers[index].whatsappAccessToken = settingsReq.whatsappAccessToken;
          }

          // If the edited number was active, sync the root fields
          if (user.whatsappNumbers[index].isActive) {
            user.wabaId = settingsReq.wabaId;
            user.whatsappPhoneNumberId = settingsReq.whatsappPhoneNumberId;
            user.whatsappAccessToken = settingsReq.whatsappAccessToken || user.whatsappNumbers[index].whatsappAccessToken;
          }
          
          // Force Mongoose to save the nested array changes
          user.markModified('whatsappNumbers');
        } else {
          return NextResponse.json({ message: "Original number not found to edit." }, { status: 404 });
        }
      } else {
        // Handle Add Request
        user.whatsappNumbers.forEach((n: any) => n.isActive = false);
        user.whatsappNumbers.push({
          name: settingsReq.name || "WhatsApp Number",
          wabaId: settingsReq.wabaId,
          whatsappPhoneNumberId: settingsReq.whatsappPhoneNumberId,
          whatsappAccessToken: settingsReq.whatsappAccessToken,
          isActive: true
        });
        user.wabaId = settingsReq.wabaId;
        user.whatsappPhoneNumberId = settingsReq.whatsappPhoneNumberId;
        user.whatsappAccessToken = settingsReq.whatsappAccessToken;
        await incrementUsage(settingsReq.userId.toString(), "whatsappNumbers");
      }

      await user.save();

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
