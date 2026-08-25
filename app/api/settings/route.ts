/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import SettingsRequest from "@/models/SettingsRequest";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkLimit } from "@/lib/limits";
import mongoose from "mongoose";

export async function GET() {
  try {
    const [, session] = await Promise.all([
      connectDB(),
      getServerSession(authOptions)
    ]);
    
    if (!session?.user?.id) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const user = await User.findById(session.user.id)
      .select("parentTenantId wabaId whatsappPhoneNumberId whatsappAccessToken whatsappNumbers balance totalRecharged googleSheetId hideIntegrations enabledCountries hiddenSidebarLinks")
      .lean();

    if (!user) return NextResponse.json({ message: "User not found" }, { status: 404 });

    // ✅ Fetch latest request in parallel with parent tenant if needed
    const fetchLatestRequest = SettingsRequest.findOne({ userId: session.user.id }).sort({ createdAt: -1 }).lean();
    
    let billingUser: any = user;
    let latestRequest: any = null;

    if (user.parentTenantId) {
      const [parent, req] = await Promise.all([
        User.findOne({ tenantId: user.parentTenantId }).select("balance totalRecharged").lean(),
        fetchLatestRequest
      ]);
      if (parent) billingUser = parent;
      latestRequest = req;
    } else {
      latestRequest = await fetchLatestRequest;
    }

    return NextResponse.json({
      success: true,
      settings: {
        wabaId: user.wabaId || "",
        whatsappPhoneNumberId: user.whatsappPhoneNumberId || "",
        whatsappAccessToken: user.whatsappAccessToken ? `${user.whatsappAccessToken.substring(0, 5)}${"*".repeat(15)}${user.whatsappAccessToken.slice(-4)}` : "",
        hasRealToken: !!user.whatsappAccessToken,
        whatsappNumbers: user.whatsappNumbers || [],
        balance: billingUser.balance || 0,
        totalRecharged: billingUser.totalRecharged || 0,
        pendingRequest: latestRequest ? { status: latestRequest.status, createdAt: latestRequest.createdAt } : null,
        googleSheetId: user.googleSheetId || null,
        hideIntegrations: user.hideIntegrations || false,
        enabledCountries: user.enabledCountries || [], 
        hiddenSidebarLinks: user.hiddenSidebarLinks || [],
      },
    });
  } catch (error) {
    console.error("Error fetching settings:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const [, session] = await Promise.all([
      connectDB(),
      getServerSession(authOptions)
    ]);
    if (!session?.user?.id) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { name, wabaId, whatsappPhoneNumberId, whatsappAccessToken } = body;

    const [user, existingPending] = await Promise.all([
      User.findById(session.user.id).select("name").lean(),
      SettingsRequest.findOne({ userId: session.user.id, status: "pending" }).select("_id").lean()
    ]);

    if (!user) return NextResponse.json({ message: "User not found" }, { status: 404 });

    const limitCheck = await checkLimit(session.user.id, "whatsappNumbers");
    if (!limitCheck.allowed) {
      return NextResponse.json({ message: `WhatsApp Number limit reached. You can only add ${limitCheck.limit} numbers.` }, { status: 429 });
    }

    if (existingPending) {
      return NextResponse.json({ message: "You already have a pending request. Please wait for admin approval." }, { status: 400 });
    }

    await SettingsRequest.create({
      userId: session.user.id,
      userName: user.name,
      requestType: "add",
      name: name || "New WhatsApp Number",
      wabaId: wabaId?.trim() || null,
      whatsappPhoneNumberId: whatsappPhoneNumberId?.trim() || null,
      whatsappAccessToken: whatsappAccessToken && !whatsappAccessToken.includes("*") ? whatsappAccessToken.trim() : null,
    });

    return NextResponse.json({ success: true, message: "Request to add new number sent to admin for approval." });
  } catch (error) {
    console.error("Error adding number:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const [, session] = await Promise.all([
      connectDB(),
      getServerSession(authOptions)
    ]);
    if (!session?.user?.id) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const body = await req.json();
    const { numberId, name, wabaId, whatsappPhoneNumberId, whatsappAccessToken } = body;

    const [user, existingPending] = await Promise.all([
      User.findById(session.user.id).select("whatsappNumbers name").lean(),
      SettingsRequest.findOne({ userId: session.user.id, status: "pending" }).select("_id").lean()
    ]);

    if (!user) return NextResponse.json({ message: "User not found" }, { status: 404 });

    if (existingPending) {
      return NextResponse.json({ message: "You already have a pending request. Please wait for admin approval." }, { status: 400 });
    }

    const numberToEdit = user.whatsappNumbers?.find((n: any) => n._id.toString() === numberId);
    if (!numberToEdit) return NextResponse.json({ message: "Number not found" }, { status: 404 });

    await SettingsRequest.create({
      userId: session.user.id,
      userName: user.name,
      requestType: "edit", 
      numberId: new mongoose.Types.ObjectId(numberId), 
      name: name || "WhatsApp Number",
      wabaId: wabaId?.trim() || null,
      whatsappPhoneNumberId: whatsappPhoneNumberId?.trim() || null,
      whatsappAccessToken: whatsappAccessToken && !whatsappAccessToken.includes("*") ? whatsappAccessToken.trim() : null,
    });

    return NextResponse.json({ success: true, message: "Request to edit number sent to admin for approval." });
  } catch (error) {
    console.error("Error editing number:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}

// PATCH: Switch Active Number (✅ ATOMIC UPDATE - NO .save())
export async function PATCH(req: Request) {
  try {
    const [, session] = await Promise.all([
      connectDB(),
      getServerSession(authOptions)
    ]);
    if (!session?.user?.id) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const { numberId } = await req.json();
    const userId = session.user.id;

    // 1. Verify number exists and get its details using .lean()
    const user = await User.findById(userId).select("whatsappNumbers").lean();
    if (!user) return NextResponse.json({ message: "User not found" }, { status: 404 });

    const selectedNumber = user.whatsappNumbers.find((n: any) => n._id.toString() === numberId);
    if (!selectedNumber) return NextResponse.json({ message: "Number not found" }, { status: 404 });

    // 2. Perform an atomic update directly in the database (Super Fast)
    await User.updateOne(
      { _id: userId },
      {
        $set: {
          "wabaId": selectedNumber.wabaId,
          "whatsappPhoneNumberId": selectedNumber.whatsappPhoneNumberId,
          "whatsappAccessToken": selectedNumber.whatsappAccessToken,
        }
      }
    );

    // 3. Update isActive status for all numbers atomically
    // Set all to false first
    await User.updateOne(
      { _id: userId },
      { $set: { "whatsappNumbers.$[elem].isActive": false } },
      { arrayFilters: [{ "elem._id": { $ne: new mongoose.Types.ObjectId(numberId) } }] }
    );
    
    // Set the selected one to true
    await User.updateOne(
      { _id: userId, "whatsappNumbers._id": numberId },
      { $set: { "whatsappNumbers.$.isActive": true } }
    );

    return NextResponse.json({ success: true, message: `Switched active number to ${selectedNumber.name}` });
  } catch (error) {
    console.error("Error switching number:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}

// DELETE: Remove a WhatsApp Number (✅ ATOMIC UPDATE - NO .save())
export async function DELETE(req: Request) {
  try {
    const [, session] = await Promise.all([
      connectDB(),
      getServerSession(authOptions)
    ]);
    if (!session?.user?.id) return NextResponse.json({ message: "Unauthorized" }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const numberId = searchParams.get("numberId");
    const userId = session.user.id;

    if (!numberId) return NextResponse.json({ message: "Number ID is required" }, { status: 400 });

    // 1. Check if the number being deleted is currently active
    const user = await User.findById(userId).select("whatsappNumbers").lean();
    if (!user) return NextResponse.json({ message: "User not found" }, { status: 404 });

    const numberToDelete = user.whatsappNumbers.find((n: any) => n._id.toString() === numberId);
    if (!numberToDelete) return NextResponse.json({ message: "Number not found" }, { status: 404 });

    const wasActive = numberToDelete.isActive;

    // 2. Remove the number atomically using $pull (Super Fast)
    await User.updateOne(
      { _id: userId },
      { $pull: { whatsappNumbers: { _id: new mongoose.Types.ObjectId(numberId) } } }
    );

    // 3. If the deleted number was active, assign a new active number atomically
    if (wasActive) {
      // Fetch the first remaining number
      const updatedUser = await User.findById(userId).select("whatsappNumbers").lean();
      const newActiveNumber = updatedUser?.whatsappNumbers?.[0];

      if (newActiveNumber) {
        // Set top-level credentials and mark as active
        await User.updateOne(
          { _id: userId, "whatsappNumbers._id": newActiveNumber._id },
          {
            $set: {
              "wabaId": newActiveNumber.wabaId,
              "whatsappPhoneNumberId": newActiveNumber.whatsappPhoneNumberId,
              "whatsappAccessToken": newActiveNumber.whatsappAccessToken,
              "whatsappNumbers.$.isActive": true
            }
          }
        );
      } else {
        // No numbers left, clear credentials
        await User.updateOne(
          { _id: userId },
          {
            $set: {
              "wabaId": null,
              "whatsappPhoneNumberId": null,
              "whatsappAccessToken": null
            }
          }
        );
      }
    }

    return NextResponse.json({ success: true, message: "Number deleted successfully" });
  } catch (error) {
    console.error("Error deleting number:", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
