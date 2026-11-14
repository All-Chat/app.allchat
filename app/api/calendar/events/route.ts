/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { connectDB } from "@/lib/mongodb";
import { authOptions } from "@/lib/auth";

import User from "@/models/User";
import LeadType from "@/models/LeadType";
import FollowUpActivity from "@/models/FollowUpActivity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const COLORS = [
  "#0CCB66",
  "#3B82F6",
  "#F59E0B",
  "#A855F7",
  "#EC4899",
  "#06B6D4",
  "#F97316",
  "#14B8A6",
];

function getColor(id: string, savedColor?: string) {
  if (savedColor) return savedColor;

  const hash = [...id].reduce(
    (total, char) => total + char.charCodeAt(0),
    0
  );

  return COLORS[hash % COLORS.length];
}

export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, message: "Unauthorized" },
        { status: 401 }
      );
    }

    const user = await User.findById(session.user.id).lean() as any;

    if (!user) {
      return NextResponse.json(
        { success: false, message: "User not found" },
        { status: 404 }
      );
    }

    let tenantId: string | null = null;

    if (user.isTenant) {
      tenantId = user.tenantId
        ? String(user.tenantId)
        : String(user._id);
    } else if (user.parentTenantId) {
      tenantId = String(user.parentTenantId);
    }

    const filter = tenantId
      ? { tenantId }
      : { userId: user._id };

    const month = request.nextUrl.searchParams.get("month");

    if (!month || !/^\d{4}-\d{2}$/.test(month)) {
      return NextResponse.json(
        { success: false, message: "Invalid month" },
        { status: 400 }
      );
    }

    const [year, monthNumber] = month.split("-").map(Number);

    const startDate = new Date(year, monthNumber - 1, 1);
    const endDate = new Date(year, monthNumber, 1);

    const activities = await FollowUpActivity.find({
      ...filter,
      occurredAt: {
        $gte: startDate,
        $lt: endDate,
      },
    })
      .sort({ occurredAt: 1 })
      .lean() as any[];

    const leadTypeIds = [
      ...new Set(
        activities
          .map((activity) => String(activity.leadTypeId))
          .filter(Boolean)
      ),
    ];

    const leadTypes = await LeadType.find({
      ...filter,
      _id: { $in: leadTypeIds },
    }).lean() as any[];

    const leadTypeMap = new Map<string, any>();

    leadTypes.forEach((leadType) => {
      leadTypeMap.set(String(leadType._id), leadType);
    });

    const events = activities.map((activity) => {
      const leadType = leadTypeMap.get(
        String(activity.leadTypeId)
      );

      const contacts = Array.isArray(leadType?.contacts)
        ? leadType.contacts
        : [];

      const contact = contacts.find(
        (item: any) =>
          String(item._id) === String(activity.contactId)
      );

      return {
        id: String(activity._id),

        date: activity.occurredAt,

        leadTypeId: String(activity.leadTypeId),

        leadTypeName: leadType?.name || "Unknown Lead Type",

        color: getColor(
          String(activity.leadTypeId),
          leadType?.color
        ),

        contactId: String(activity.contactId || ""),

        customerName:
          contact?.name ||
          activity.contactName ||
          "",

        phone:
          contact?.phone ||
          activity.phone ||
          "",

        interactionType: activity.interactionType || "",

        personContacted: activity.personContacted || "",

        agentName: activity.agentName || "",

        outcome: activity.outcome || "",

        summary: activity.summary || "",

        nextFollowUpAt: activity.nextFollowUpAt || null,

        reminderId: activity.reminderId
          ? String(activity.reminderId)
          : "",

        createdAt: activity.createdAt || null,

        updatedAt: activity.updatedAt || null,
      };
    });

    return NextResponse.json({
      success: true,
      month,
      total: events.length,
      events,
    });
  } catch (error: any) {
    console.error("Calendar Events API Error:", error);

    return NextResponse.json(
      {
        success: false,
        message: error.message || "Unable to load calendar events",
      },
      { status: 500 }
    );
  }
}
