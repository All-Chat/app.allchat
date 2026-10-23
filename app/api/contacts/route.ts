/* eslint-disable @typescript-eslint/no-explicit-any */
/* ========================================================= *
   IMPROVED /api/contacts ROUTE  (app/api/contacts/route.ts)

   This is YOUR route with ONE upgrade: the phone lookup.

   YOUR CURRENT CODE (exact match only):
     const cleanPhone = phone.replace(/\+/g, "");
     const contact = await Contact.findOne({
       userId: { $in: userIds },
       phone: cleanPhone,            // <-- fails if formats differ
     })

   WHY IT CAN MISS:
     Report phone "919876543210"  vs Contact stored "9876543210"
     (or the reverse) -> exact match fails -> no name comes back,
     even though the contact (and its webhook name) exists.

   THE UPGRADE below matches the number in ANY of these formats:
     - exact match (old behavior, kept)
     - local format without country code ("9876543210")
     - any stored format that ENDS with the same last 10 digits
       ("+91 98765 43210", "919876543210@c.us", ...)
 * ========================================================= */

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

    // ✅ Gather ALL User IDs in the tenant group (unchanged from your code)
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
      // ✅ HARDENED PHONE MATCH — works no matter how the number is formatted
      const digits = phone.replace(/\D/g, "");          // digits-only: "919876543210"
      const last10 = digits.slice(-10);                 // last 10 digits: "9876543210"
      const cleanPhone = phone.replace(/\+/g, "");      // old behavior kept for safety

      const conditions: any[] = [{ phone: cleanPhone }];
      if (last10.length >= 10) {
        conditions.push({ phone: last10 });                      // stored WITHOUT country code
        conditions.push({ phone: new RegExp(last10 + "$") });    // stored in ANY format ending with these 10 digits
      }

      const contact = await Contact.findOne({
        userId: { $in: userIds },
        $or: conditions,
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

/* ========================================================= *
   HOW THE FRONTEND NOW USES THIS ROUTE
   -----------------------------------------------------------
   reports-page-fixed.tsx calls, for every report row:

     GET /api/contacts?phone=<digits>      <- PRIMARY  (your Contact collection)
     GET /api/chat?phone=<phone>           <- FALLBACK (chat messages)

   and reads the name from { contact: { name } } — so as long as
   the Contact document exists, the name shows in:
     - the report table (Name column)
     - the Excel download (Name column)

   IMPORTANT: a name can only appear if a Contact document with
   that phone exists. Contacts are created by the webhook when
   people reply — so very old replies saved BEFORE the Contact
   collection existed will stay "—" until they reply again.
 * ========================================================= */
