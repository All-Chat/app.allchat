/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { Session } from "next-auth";
import { authOptions } from "@/lib/auth";
import { connectDB } from "@/lib/mongodb";
import User from "@/models/User";

type TenantSessionUser = Session["user"] & {
  id: string;
  tenantId?: string | null;
  isTenant?: boolean;
};

type TenantSession = Session & {
  user: TenantSessionUser;
};

const LIMIT_RESOURCES = ["tags", "workflows", "templates", "testMessages", "campaigns", "optNumbers", "forms"];

export async function GET() {
  try {
    const session = await getServerSession(authOptions) as TenantSession | null;
    if (!session?.user?.isTenant || !session?.user?.tenantId) {
      return NextResponse.json({ error: "Unauthorized. Not a tenant." }, { status: 403 });
    }

    await connectDB();
    
    // Fetch tenant's own limits to pass to frontend for validation
    const tenant = await User.findById(session.user.id).select("maxSubUsers limits");
    const maxSubUsers = tenant?.maxSubUsers || 0;
    const tenantLimits: any = tenant?.limits || {};

    // Fetch sub-users, INCLUDING password so tenant can view it
    const subUsers = await User.find({ parentTenantId: session.user.tenantId })
      .select("-whatsappAccessToken") // Only hiding the token
      .lean();

    return NextResponse.json({ 
      success: true, 
      users: subUsers,
      maxSubUsers: maxSubUsers,
      currentSubUsersCount: subUsers.length,
      tenantLimits: tenantLimits // Send tenant limits to frontend
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions) as TenantSession | null;
    if (!session?.user?.isTenant || !session?.user?.tenantId) {
      return NextResponse.json({ error: "Unauthorized. Not a tenant." }, { status: 403 });
    }

    await connectDB();
    const body = await req.json();
    const { name, password, limits } = body;

    if (!name || !password) return NextResponse.json({ error: "Name and password are required" }, { status: 400 });

    const existing = await User.findOne({ name });
    if (existing) return NextResponse.json({ error: "Username already exists" }, { status: 400 });

    const tenant = await User.findById(session.user.id);
    const currentSubUsersCount = await User.countDocuments({ parentTenantId: session.user.tenantId });
    if (currentSubUsersCount >= (tenant?.maxSubUsers || 0)) {
      return NextResponse.json({ error: `Limit reached. You can only create ${tenant?.maxSubUsers} sub-users.` }, { status: 400 });
    }

    // ==========================================
    // 🛡️ VALIDATE LIMIT INHERITANCE
    // ==========================================
    const tenantLimits: any = tenant?.limits || {};
    const userLimits: any = {};
    
    for (const res of LIMIT_RESOURCES) {
      const reqLimit = limits?.[res] || { max: -1, period: "unlimited" };
      const tLimit = tenantLimits[res] || { max: -1, period: "unlimited" };

      // If Tenant is NOT unlimited, enforce restriction
      if (tLimit.period !== "unlimited" && tLimit.max !== -1) {
        // If sub-user tries to be unlimited, reject
        if (reqLimit.period === "unlimited" || reqLimit.max === -1) {
          return NextResponse.json({ error: `You cannot set ${res} to Unlimited because your own limit is restricted.` }, { status: 400 });
        }
        // If sub-user max is greater than tenant max, reject
        if (reqLimit.max > tLimit.max) {
          return NextResponse.json({ error: `You cannot set ${res} limit to ${reqLimit.max} because your own limit is only ${tLimit.max}.` }, { status: 400 });
        }
      }

      userLimits[res] = {
        max: reqLimit.period === "unlimited" ? -1 : Math.max(0, Number(reqLimit.max) || 0),
        period: reqLimit.period || "unlimited"
      };
    }

    const newSubUser = await User.create({
      name, password,
      parentTenantId: session.user.tenantId,
      isTenant: false,
      accountStatus: "active",
      balance: 0,
      limits: userLimits,
    });

    return NextResponse.json({ success: true, user: { _id: newSubUser._id, name: newSubUser.name } });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const session = await getServerSession(authOptions) as TenantSession | null;
    if (!session?.user?.isTenant || !session?.user?.tenantId) {
      return NextResponse.json({ error: "Unauthorized. Not a tenant." }, { status: 403 });
    }

    await connectDB();
    const body = await req.json();
    const { userId, action, limits, suspendReason, name, password } = body;

    if (!userId) return NextResponse.json({ error: "User ID is required" }, { status: 400 });

    const subUser = await User.findById(userId);
    if (!subUser || subUser.parentTenantId !== session.user.tenantId) {
      return NextResponse.json({ error: "Sub-user not found or unauthorized" }, { status: 404 });
    }

    const tenant = await User.findById(session.user.id);

    if (action === "limits" && limits) {
      // ==========================================
      // 🛡️ VALIDATE LIMIT INHERITANCE ON EDIT
      // ==========================================
      const tenantLimits: any = tenant?.limits || {};
      const newLimits: any = {};
      
      for (const res of LIMIT_RESOURCES) {
        const reqLimit = limits[res] || { max: -1, period: "unlimited" };
        const tLimit = tenantLimits[res] || { max: -1, period: "unlimited" };

        if (tLimit.period !== "unlimited" && tLimit.max !== -1) {
          if (reqLimit.period === "unlimited" || reqLimit.max === -1) {
            return NextResponse.json({ error: `You cannot set ${res} to Unlimited because your own limit is restricted.` }, { status: 400 });
          }
          if (reqLimit.max > tLimit.max) {
            return NextResponse.json({ error: `You cannot set ${res} limit to ${reqLimit.max} because your own limit is only ${tLimit.max}.` }, { status: 400 });
          }
        }

        newLimits[res] = {
          max: reqLimit.period === "unlimited" ? -1 : Math.max(0, Number(reqLimit.max) || 0),
          period: reqLimit.period || "unlimited"
        };
      }
      subUser.limits = newLimits;
    }

    if (action === "status") {
      if (body.suspend) {
        subUser.accountStatus = "suspended";
        subUser.suspendedReason = suspendReason || "Suspended by Tenant";
      } else if (body.reactivate) {
        subUser.accountStatus = "active";
        subUser.suspendedReason = null;
      }
    }

    if (action === "credentials") {
      if (name && name.trim() !== "") subUser.name = name;
      if (password && password.trim() !== "") subUser.password = password;
    }

    await subUser.save();
    return NextResponse.json({ success: true, message: "Sub-user updated successfully" });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const session = await getServerSession(authOptions) as TenantSession | null;
    if (!session?.user?.isTenant || !session?.user?.tenantId) {
      return NextResponse.json({ error: "Unauthorized. Not a tenant." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    if (!userId) return NextResponse.json({ error: "User ID is required" }, { status: 400 });

    await connectDB();
    const subUser = await User.findById(userId);
    
    if (!subUser || subUser.parentTenantId !== session.user.tenantId) {
      return NextResponse.json({ error: "Sub-user not found or unauthorized" }, { status: 404 });
    }

    await User.findByIdAndDelete(userId);
    return NextResponse.json({ success: true, message: "Sub-user deleted successfully" });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
