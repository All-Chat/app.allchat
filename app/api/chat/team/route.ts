/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export async function GET() {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ success: false }, { status: 401 });

    const currentUser = await User.findById(session.user.id).select("isTenant tenantId parentTenantId").lean();
    if (!currentUser) return NextResponse.json({ success: false }, { status: 404 });

    let tenantId = null;
    if (currentUser.isTenant) tenantId = currentUser.tenantId || currentUser._id.toString();
    else if (currentUser.parentTenantId) tenantId = currentUser.parentTenantId;

    if (!tenantId) return NextResponse.json({ success: true, members: [] });

    const admin = await User.findOne({ tenantId, isTenant: true }).select("_id name").lean();
    const subUsers = await User.find({ parentTenantId: tenantId, isTenant: false }).select("_id name").lean();

    let members: any[] = [...subUsers];
    if (admin) members.push(admin);

    // Exclude the currently logged-in user
    members = members.filter(m => m._id.toString() !== session.user.id);

    return NextResponse.json({ success: true, members });
  } catch (error) {
    console.error("Error fetching team members:", error);
    return NextResponse.json({ success: false, members: [] }, { status: 500 });
  }
}
