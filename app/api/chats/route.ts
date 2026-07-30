/* eslint-disable prefer-const */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* =====================================================================
   GET /api/chats - UNIFIED TENANT VIEW WITH WABA ISOLATION
   ===================================================================== */

import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Message from "@/models/Message";
import User from "@/models/User";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import mongoose from "mongoose";

const getCoreNumber = (phone: string) => {
  if (!phone) return "";
  let clean = phone.replace(/\D/g, "");
  if (clean.length === 12 && clean.startsWith("91")) clean = clean.substring(2);
  else if (clean.length === 11 && clean.startsWith("0")) clean = clean.substring(1);
  return clean;
};

export async function GET(req: Request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ success: false, chats: [], hasMore: false }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const wabaId = searchParams.get("whatsappPhoneNumberId") || "";
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "20");
    const skip = (page - 1) * limit;

    const currentUser = await User.findById(session.user.id).select("whatsappNumbers isTenant tenantId parentTenantId").lean();
    if (!currentUser) return NextResponse.json({ success: false, chats: [], hasMore: false }, { status: 404 });

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
      // Find ALL users in the tenant scope who own this specific WABA
      const owners = await User.find({ 
        _id: { $in: userIdsArray }, 
        "whatsappNumbers.whatsappPhoneNumberId": wabaId 
      }).select("_id").lean();
      
      if (owners.length > 0) {
        targetUserIds = owners.map(o => o._id);
      } else {
        // Fallback for standalone admins or direct ownership
        const adminOwnsIt = currentUser.whatsappNumbers?.some((n: any) => n.whatsappPhoneNumberId === wabaId);
        if (adminOwnsIt) {
          targetUserIds = [currentUser._id];
        } else {
          // If no one in the tenant owns it, check if ANYONE owns it globally
          const globalOwner = await User.findOne({ "whatsappNumbers.whatsappPhoneNumberId": wabaId }).select("_id").lean();
          if (globalOwner) {
            targetUserIds = [globalOwner._id];
          } else {
            return NextResponse.json({ success: false, chats: [], hasMore: false }, { status: 403 });
          }
        }
      }

      // Safety Net: If the current user is the Tenant Admin, include them in the search 
      // so their outbound messages on this WABA also show up in the shared list.
      if (currentUser.isTenant && !targetUserIds.some(id => id.equals(currentUser._id))) {
        targetUserIds.push(currentUser._id);
      }
    } else {
      // "All Numbers" - fetch for all tenant users
      targetUserIds = userIdsArray;
    }

    // ✅ STEP 3: Build the WABA Isolation Filter
    // This prevents bleed-over from other WABAs if a user has multiple, 
    // while still catching old messages with corrupted/missing wabaId tags.
    const wabaIsolationFilter = wabaId && wabaId !== "all" ? {
      $or: [
        { whatsappPhoneNumberId: { $exists: false } },
        { whatsappPhoneNumberId: null },
        { whatsappPhoneNumberId: "" },
        { whatsappPhoneNumberId: wabaId }
      ]
    } : {};

    // ✅ STEP 4: Fetch distinct phones
    const baseMatch = {
      userId: { $in: targetUserIds },
      ...wabaIsolationFilter
    };

    const matchingPhones = await Message.distinct("phone", { ...baseMatch, direction: "in" }).lean();
    const outPhones = await Message.distinct("phone", { ...baseMatch, direction: "out" }).lean();
    
    const allPhones = [...new Set([...matchingPhones, ...outPhones])];

    if (allPhones.length === 0) return NextResponse.json({ success: true, chats: [], hasMore: false });

    // ✅ STEP 5: Aggregate chats
    const aggregateMatch = {
      ...baseMatch,
      phone: { $in: allPhones }
    };

    const rawChats = await Message.aggregate([
      { $match: aggregateMatch },
      { $sort: { createdAt: -1 } },
      {
        $group: {
          _id: "$phone",
          phone: { $first: "$phone" },
          name: { $first: "$contactName" },
          lastMessage: { $first: "$text" },
          lastDirection: { $first: "$direction" },
          lastMessageType: { $first: "$messageType" },
          updatedAt: { $first: "$createdAt" },
          whatsappPhoneNumberId: { $first: "$whatsappPhoneNumberId" },
        },
      },
      { $sort: { updatedAt: -1 } },
      { $skip: skip },
      { $limit: limit }
    ]);

    // ✅ STEP 6: Deduplicate and KEEP the +91 format
    const uniqueChatsMap = new Map();
    rawChats.forEach(c => {
      const coreId = getCoreNumber(c._id);
      if (!coreId) return;
      
      if (!uniqueChatsMap.has(coreId)) {
        uniqueChatsMap.set(coreId, { ...c });
      } else {
        const existing = uniqueChatsMap.get(coreId);
        let bestPhone = existing.phone;
        if (c.phone && c.phone.includes("+") && !existing.phone.includes("+")) {
          bestPhone = c.phone;
        }
        let bestChat = new Date(c.updatedAt) > new Date(existing.updatedAt) ? c : existing;
        uniqueChatsMap.set(coreId, { ...bestChat, _id: bestPhone, phone: bestPhone });
      }
    });

    const chats = Array.from(uniqueChatsMap.values()).sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    const totalChats = allPhones.length;
    const hasMore = skip + chats.length < totalChats && chats.length === limit;

    return NextResponse.json({ success: true, chats, hasMore });
  } catch (error) {
    console.error("Error in /api/chats:", error);
    return NextResponse.json({ success: false, chats: [], hasMore: false }, { status: 500 });
  }
}
