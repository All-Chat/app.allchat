/* eslint-disable @typescript-eslint/no-explicit-any */
/* =====================================================================
   GET /api/chat - UNIFIED TENANT VIEW + TRANSFERRED CHATS PERMISSIONS
   ===================================================================== */

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Message from "@/models/Message";
import User from "@/models/User";
import ChatTransfer from "@/models/ChatTransfer"; // Import the new model
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import mongoose from "mongoose";

export async function GET(req: Request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ success: false, messages: [] }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    let phone = searchParams.get("phone") || "";
    const wabaId = searchParams.get("whatsappPhoneNumberId") || "";

    if (!phone) {
      return NextResponse.json({ success: false, messages: [] }, { status: 400 });
    }
    phone = phone.replace(/\+/g, "");

    const currentUser = await User.findById(session.user.id).select("whatsappNumbers isTenant tenantId parentTenantId").lean();
    if (!currentUser) {
      return NextResponse.json({ success: false, messages: [] }, { status: 404 });
    }

    // ✅ STEP 1: Resolve ALL Tenant Users to allow shared visibility
    const userIdsArray: mongoose.Types.ObjectId[] = [currentUser._id];
    let tenantIdToSearch = null;

    if (currentUser.isTenant) tenantIdToSearch = currentUser.tenantId || currentUser._id.toString();
    else if (currentUser.parentTenantId) tenantIdToSearch = currentUser.parentTenantId;

    if (tenantIdToSearch) {
      const tenantUser = await User.findOne({ tenantId: tenantIdToSearch, isTenant: true }).select("_id").lean();
      if (tenantUser && !userIdsArray.some(id => id.equals(tenantUser._id))) userIdsArray.push(tenantUser._id);
      
      const subUsers = await User.find({ parentTenantId: tenantIdToSearch }).select("_id").lean();
      subUsers.forEach(u => {
        if (!userIdsArray.some(id => id.equals(u._id))) userIdsArray.push(u._id);
      });
    }

    // ✅ STEP 2: Resolve Target Users for the selected WABA
    let targetUserIds: mongoose.Types.ObjectId[] = [];

    if (wabaId && wabaId !== "all") {
      const owners = await User.find({ 
        _id: { $in: userIdsArray }, 
        "whatsappNumbers.whatsappPhoneNumberId": wabaId 
      }).select("_id").lean();
      
      if (owners.length > 0) {
        targetUserIds = owners.map(o => o._id);
      } else {
        const adminOwnsIt = currentUser.whatsappNumbers?.some((n: any) => n.whatsappPhoneNumberId === wabaId);
        if (adminOwnsIt) {
          targetUserIds = [currentUser._id];
        } else {
          const globalOwner = await User.findOne({ "whatsappNumbers.whatsappPhoneNumberId": wabaId }).select("_id").lean();
          if (globalOwner) {
            targetUserIds = [globalOwner._id];
          } else {
            return NextResponse.json({ success: false, messages: [] }, { status: 403 });
          }
        }
      }

      if (currentUser.isTenant && !targetUserIds.some(id => id.equals(currentUser._id))) {
        targetUserIds.push(currentUser._id);
      }
    } else {
      targetUserIds = userIdsArray;
    }

    // ✅ STEP 3: Check if this chat was transferred to the current user
    const transferRecord = await ChatTransfer.findOne({ phone }).lean();
    const isTransferredToMe = transferRecord && transferRecord.transferredTo.toString() === session.user.id;

    // ✅ STEP 4: Build the Database Filter
    let filter: Record<string, unknown> = { phone: phone };

    if (wabaId && wabaId !== "all") {
      // If a specific WABA is selected, we use an $or condition to catch perfectly tagged messages AND corrupted/untagged messages.
      // OR if the chat is transferred to me, I get full access to the shared history.
      filter = {
        phone: phone,
        $or: [
          { whatsappPhoneNumberId: wabaId }, 
          { 
            userId: { $in: targetUserIds }, 
            whatsappPhoneNumberId: { $in: [null, undefined, ""] } 
          },
          ...(isTransferredToMe ? [{ userId: { $in: targetUserIds } }] : []) // Full shared history if transferred to me
        ]
      };
    } else {
      // If viewing "All Numbers", we must filter by the tenant's user IDs to prevent data bleed
      filter = {
        phone: phone,
        userId: { $in: targetUserIds }
      };
    }

    // ✅ STEP 5: Fetch messages
    const messages = await Message.find(filter).sort({ createdAt: 1 }).lean();

    const mapped = messages.map((m) => ({
      _id: m._id,
      phone: m.phone,
      text: m.text,
      direction: m.direction,
      messageType: m.messageType,
      mediaUrl: m.mediaUrl,
      contactName: m.contactName,
      createdAt: m.createdAt,
      timestamp: m.createdAt,
      whatsappMessageId: m.whatsappMessageId,
      status: m.status,
      templateName: m.templateName || undefined,
      templateHeaderType: m.templateHeaderType || undefined,
      templateHeaderText: m.templateHeaderText || undefined,
      templateBodyText: m.templateBodyText || undefined,
      templateFooter: m.templateFooter || undefined,
      templateButtons: m.templateButtons || undefined,
      templateLanguage: m.templateLanguage || undefined,
      whatsappPhoneNumberId: m.whatsappPhoneNumberId || undefined,
      fromPhone: m.fromPhone || undefined,
      senderNumber: m.senderNumber || undefined,
    }));

    return NextResponse.json({ success: true, messages: mapped });
  } catch (error) {
    console.error("Error in /api/chat:", error);
    return NextResponse.json({ success: false, messages: [] }, { status: 500 });
  }
}
