/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import Contact from "@/models/Contact";
import User from "@/models/User";
import mongoose from "mongoose";

export async function GET(req: Request) {
  try {
    await connectDB();
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const currentUser = await User.findById(session.user.id).select("isTenant tenantId parentTenantId").lean();
    if (!currentUser) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // ✅ Gather ALL User IDs in the tenant group
    const userIds: mongoose.Types.ObjectId[] = [new mongoose.Types.ObjectId(session.user.id)];
    let tenantIdToSearch: string | null = null;

    if (currentUser.isTenant) {
      tenantIdToSearch = currentUser.tenantId || currentUser._id.toString();
    } else if (currentUser.parentTenantId) {
      tenantIdToSearch = currentUser.parentTenantId;
    }

    if (tenantIdToSearch) {
      const tenantUser = await User.findOne({ tenantId: tenantIdToSearch, isTenant: true }).select("_id").lean();
      if (tenantUser && !userIds.some(id => id.equals(tenantUser._id))) userIds.push(tenantUser._id);
      
      const subUsers = await User.find({ parentTenantId: tenantIdToSearch }).select("_id").lean();
      subUsers.forEach(u => {
        if (!userIds.some(id => id.equals(u._id))) userIds.push(u._id);
      });
    }

    const { searchParams } = new URL(req.url);
    const tag = searchParams.get("tag");
    const phone = searchParams.get("phone");

    if (phone) {
      const cleanPhone = phone.replace(/\+/g, "");
      const contact = await Contact.findOne({ 
        userId: { $in: userIds }, 
        phone: cleanPhone 
      }).select("phone name tags profilePicUrl -_id").lean(); 
      
      return NextResponse.json({ success: true, contact });
    }

    const query: any = { userId: { $in: userIds } }; 
    if (tag) query.tags = tag; 

    const contacts = await Contact.find(query).select("phone name tags profilePicUrl -_id").lean();
    return NextResponse.json({ success: true, contacts });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
