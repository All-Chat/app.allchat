/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import ChatTransfer from "@/models/ChatTransfer";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// GET: Check if chat is transferred
export async function GET(req: Request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ success: false }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const phone = searchParams.get("phone")?.replace(/\+/g, "");

    if (!phone) return NextResponse.json({ success: false }, { status: 400 });

    const currentUser = await User.findById(session.user.id).select("isTenant tenantId parentTenantId").lean();
    if (!currentUser) return NextResponse.json({ success: false }, { status: 404 });

    const tenantId = currentUser.isTenant ? (currentUser.tenantId || currentUser._id.toString()) : currentUser.parentTenantId;

    if (!tenantId) return NextResponse.json({ success: true, isTransferred: false });

    const transferRecord = await ChatTransfer.findOne({ tenantId, phone }).lean();
    
    if (!transferRecord) {
      return NextResponse.json({ success: true, isTransferred: false });
    }

    const targetUser = await User.findById(transferRecord.transferredTo).select("name").lean();
    
    return NextResponse.json({
      success: true,
      isTransferred: true,
      transferredToId: transferRecord.transferredTo.toString(),
      transferredToName: targetUser?.name || "Unknown User",
      transferredById: transferRecord.transferredBy.toString(),
    });
  } catch (error) {
    console.error("Error fetching transfer status:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

// POST: Transfer chat to another user
export async function POST(req: Request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ success: false }, { status: 401 });

    const { phone, targetUserId } = await req.json();
    if (!phone || !targetUserId) return NextResponse.json({ success: false }, { status: 400 });

    const cleanPhone = phone.replace(/\+/g, "");
    const currentUser = await User.findById(session.user.id).select("isTenant tenantId parentTenantId").lean();
    if (!currentUser) return NextResponse.json({ success: false }, { status: 404 });

    const tenantId = currentUser.isTenant ? (currentUser.tenantId || currentUser._id.toString()) : currentUser.parentTenantId;

    if (!tenantId) return NextResponse.json({ success: false, message: "No tenant context" }, { status: 400 });

    await ChatTransfer.findOneAndUpdate(
      { tenantId, phone: cleanPhone },
      { 
        transferredBy: session.user.id, 
        transferredTo: targetUserId, 
        transferredAt: new Date() 
      },
      { upsert: true, new: true }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error transferring chat:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

// DELETE: Take back / Reclaim chat
export async function DELETE(req: Request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ success: false }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const phone = searchParams.get("phone")?.replace(/\+/g, "");
    if (!phone) return NextResponse.json({ success: false }, { status: 400 });

    const currentUser = await User.findById(session.user.id).select("isTenant tenantId parentTenantId").lean();
    if (!currentUser) return NextResponse.json({ success: false }, { status: 404 });

    const tenantId = currentUser.isTenant ? (currentUser.tenantId || currentUser._id.toString()) : currentUser.parentTenantId;

    if (!tenantId) return NextResponse.json({ success: false }, { status: 400 });

    await ChatTransfer.deleteOne({ tenantId, phone });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error reclaiming chat:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
