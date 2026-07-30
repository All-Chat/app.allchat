/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Message from "@/models/Message";
import ChatTransfer from "@/models/ChatTransfer";
import User from "@/models/User";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function DELETE(req: Request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ success: false }, { status: 401 });

    const { searchParams } = new URL(req.url);
    let phone = searchParams.get("phone") || "";
    const wabaId = searchParams.get("whatsappPhoneNumberId") || "";

    if (!phone) return NextResponse.json({ success: false }, { status: 400 });
    phone = phone.replace(/\+/g, "");

    const currentUser = await User.findById(session.user.id).select("isTenant tenantId parentTenantId").lean();
    if (!currentUser) return NextResponse.json({ success: false }, { status: 404 });

    // Ensure we only delete messages belonging to this tenant's users
    const tenantId = currentUser.isTenant ? (currentUser.tenantId || currentUser._id.toString()) : currentUser.parentTenantId;
    if (!tenantId) return NextResponse.json({ success: false }, { status: 400 });

    const tenantUser = await User.findOne({ tenantId, isTenant: true }).select("_id").lean();
    const subUsers = await User.find({ parentTenantId: tenantId }).select("_id").lean();
    const targetUserIds = [tenantUser, ...subUsers].filter(Boolean).map((u: any) => u._id);

    const filter: any = { phone, userId: { $in: targetUserIds } };
    
    if (wabaId && wabaId !== "all") {
      filter.$or = [
        { whatsappPhoneNumberId: wabaId },
        { whatsappPhoneNumberId: { $in: [null, undefined, ""] } }
      ];
    }

    await Message.deleteMany(filter);
    await ChatTransfer.deleteOne({ tenantId, phone });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting chat:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
