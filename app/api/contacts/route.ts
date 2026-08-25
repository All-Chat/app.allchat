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
    // ✅ Run DB connection and session check in parallel
    const [, session] = await Promise.all([
      connectDB(),
      getServerSession(authOptions)
    ]);
    
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
      // ✅ Fetch tenant user and sub-users IN PARALLEL to save time
      const [tenantUser, subUsers] = await Promise.all([
        User.findOne({ tenantId: tenantIdToSearch, isTenant: true }).select("_id").lean(),
        User.find({ parentTenantId: tenantIdToSearch }).select("_id").lean()
      ]);

      if (tenantUser && !userIds.some(id => id.equals(tenantUser._id))) {
        userIds.push(tenantUser._id);
      }
      
      subUsers.forEach((u: { _id: string | mongoose.mongo.ObjectId | mongoose.mongo.BSON.ObjectIdLike | null | undefined; }) => {
        if (!u._id) return;
        const subUserId = new mongoose.Types.ObjectId(u._id.toString());
        if (!userIds.some(id => id.equals(subUserId))) userIds.push(subUserId);
      });
    }

    const { searchParams } = new URL(req.url);
    const tag = searchParams.get("tag");
    const phone = searchParams.get("phone");

    // ✅ Handle specific phone lookup
    if (phone) {
      const cleanPhone = phone.replace(/\+/g, "");
      const contact = await Contact.findOne({ 
        userId: { $in: userIds }, 
        phone: cleanPhone 
      }).select("phone name tags profilePicUrl -_id").lean(); 
      
      return NextResponse.json({ success: true, contact });
    }

    // ✅ Build query for fetching contacts
    const query: any = { userId: { $in: userIds } }; 
    if (tag) query.tags = tag; 

    // ✅ PAGINATION LOGIC (Prevents downloading 100,000 contacts at once)
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "0"); // 0 means "all" if not specified
    const skip = (page - 1) * limit;

    if (limit > 0) {
      // Fetch paginated contacts AND total count in parallel
      const [contacts, totalContacts] = await Promise.all([
        Contact.find(query)
          .select("phone name tags profilePicUrl -_id")
          .skip(skip)
          .limit(limit)
          .lean(),
        Contact.countDocuments(query)
      ]);

      return NextResponse.json({ 
        success: true, 
        contacts,
        currentPage: page,
        totalPages: Math.ceil(totalContacts / limit),
        totalContacts
      });
    }

    // Fallback: Fetch all if limit is 0 (used for dropdowns, etc.)
    const contacts = await Contact.find(query).select("phone name tags profilePicUrl -_id").lean();
    return NextResponse.json({ success: true, contacts });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
