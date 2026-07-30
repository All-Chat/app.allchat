/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import Message from "@/models/Message";
import ChatTransfer from "@/models/ChatTransfer";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET() {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ success: false, chats: [] }, { status: 401 });

    const currentUser = await User.findById(session.user.id).select("isTenant tenantId parentTenantId").lean();
    if (!currentUser) return NextResponse.json({ success: false, chats: [] }, { status: 404 });

    const tenantId = currentUser.isTenant ? (currentUser.tenantId || currentUser._id.toString()) : currentUser.parentTenantId;
    if (!tenantId) return NextResponse.json({ success: false, chats: [] }, { status: 400 });

    // 1. Get all transfers TO the current user
    const transfers = await ChatTransfer.find({ transferredTo: session.user.id }).lean();
    const phones = transfers.map(t => t.phone.replace(/\+/g, ""));

    if (phones.length === 0) return NextResponse.json({ success: true, chats: [] });

    // 2. Get the userIds of the tenant to ensure we don't leak data from outside the tenant
    const tenantUser = await User.findOne({ tenantId, isTenant: true }).select("_id").lean();
    const subUsers = await User.find({ parentTenantId: tenantId }).select("_id").lean();
    const tenantUserIds = [tenantUser, ...subUsers]
      .filter((u): u is NonNullable<typeof tenantUser> => u != null)
      .map(u => u._id);

    // 3. Fetch latest message for each transferred phone
    const rawChats = await Message.aggregate([
      { $match: { phone: { $in: phones }, userId: { $in: tenantUserIds } } },
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
    ]);

    return NextResponse.json({ success: true, chats: rawChats });
  } catch (error) {
    console.error("Error fetching transferred chats:", error);
    return NextResponse.json({ success: false, chats: [] }, { status: 500 });
  }
}
