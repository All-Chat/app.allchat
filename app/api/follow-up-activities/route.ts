/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { getServerSession } from "next-auth";

import { connectDB } from "@/lib/mongodb";
import { authOptions } from "@/lib/auth";

import User from "@/models/User";
import LeadType from "@/models/LeadType";
import Reminder from "@/models/Reminder";
import FollowUpActivity from "@/models/FollowUpActivity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const INTERACTION_TYPES = [
  "Call",
  "WhatsApp",
  "Meeting",
  "Email",
  "Other",
] as const;

const OUTCOMES = [
  "Interested",
  "Not Interested",
  "No Answer",
  "Call Back Requested",
  "Negotiation in Progress",
  "Meeting Scheduled",
  "Converted",
  "Other",
] as const;

async function getUserContext() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return { error: "Unauthorized", status: 401 as const };
  }

  const user = (await User.findById(session.user.id).lean()) as any;

  if (!user) {
    return { error: "User not found", status: 404 as const };
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

  return { user, tenantId, filter };
}

function isObjectId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    mongoose.Types.ObjectId.isValid(value)
  );
}

function parseActivityBody(body: any) {
  const personContacted = String(
    body.personContacted || ""
  ).trim();

  const summary = String(body.summary || "").trim();

  const occurredAt = new Date(body.occurredAt);

  const nextFollowUpAt = body.nextFollowUpAt
    ? new Date(body.nextFollowUpAt)
    : null;

  if (!personContacted) {
    throw new Error("Please enter the person you spoke with.");
  }

  if (!summary) {
    throw new Error("Please enter a conversation summary.");
  }

  if (summary.length > 3000) {
    throw new Error("Summary cannot exceed 3000 characters.");
  }

  if (Number.isNaN(occurredAt.getTime())) {
    throw new Error("Please provide a valid conversation date and time.");
  }

  if (!INTERACTION_TYPES.includes(body.interactionType)) {
    throw new Error("Please select a valid interaction type.");
  }

  if (!OUTCOMES.includes(body.outcome)) {
    throw new Error("Please select a valid outcome.");
  }

  if (
    nextFollowUpAt &&
    Number.isNaN(nextFollowUpAt.getTime())
  ) {
    throw new Error("Please provide a valid next follow-up date.");
  }

  return {
    personContacted,
    summary,
    occurredAt,
    interactionType: body.interactionType,
    outcome: body.outcome,
    nextFollowUpAt,
  };
}

async function verifyContact(
  context: any,
  leadTypeId: string,
  contactId: string
) {
  const leadType = await LeadType.findOne({
    _id: leadTypeId,
    ...context.filter,
  });

  if (!leadType) return null;

  const contact = leadType.contacts?.id(contactId);

  if (!contact) return null;

  return { leadType, contact };
}

// GET: Load one contact's activity history
export async function GET(request: NextRequest) {
  try {
    await connectDB();

    const context = await getUserContext();

    if ("error" in context) {
      return NextResponse.json(
        { success: false, message: context.error },
        { status: context.status }
      );
    }

    const params = request.nextUrl.searchParams;

    const leadTypeId = params.get("leadTypeId") || "";
    const contactId = params.get("contactId") || "";

    if (
      !isObjectId(leadTypeId) ||
      !isObjectId(contactId)
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid contact details." },
        { status: 400 }
      );
    }

    const verified = await verifyContact(
      context,
      leadTypeId,
      contactId
    );

    if (!verified) {
      return NextResponse.json(
        { success: false, message: "Contact not found." },
        { status: 404 }
      );
    }

    const activities = await FollowUpActivity.find({
      ...context.filter,
      leadTypeId,
      contactId,
    })
      .sort({ occurredAt: -1, createdAt: -1 })
      .lean();

    return NextResponse.json({
      success: true,
      activities,
    });
  } catch (error: any) {
    console.error("GET follow-up activities:", error);

    return NextResponse.json(
      {
        success: false,
        message:
          error.message || "Unable to load activity history.",
      },
      { status: 500 }
    );
  }
}

// POST: Create activity; optionally complete linked reminder
export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const context = await getUserContext();

    if ("error" in context) {
      return NextResponse.json(
        { success: false, message: context.error },
        { status: context.status }
      );
    }

    const body = await request.json();

    const { leadTypeId, contactId, reminderId } = body;

    if (
      !isObjectId(leadTypeId) ||
      !isObjectId(contactId)
    ) {
      return NextResponse.json(
        { success: false, message: "Invalid contact details." },
        { status: 400 }
      );
    }

    const verified = await verifyContact(
      context,
      leadTypeId,
      contactId
    );

    if (!verified) {
      return NextResponse.json(
        { success: false, message: "Contact not found." },
        { status: 404 }
      );
    }

    let reminder: any = null;

    if (reminderId) {
      if (!isObjectId(reminderId)) {
        return NextResponse.json(
          { success: false, message: "Invalid reminder ID." },
          { status: 400 }
        );
      }

      reminder = await Reminder.findOne({
        _id: reminderId,
        ...context.filter,
        leadTypeId,
        contactId,
      });

      if (!reminder) {
        return NextResponse.json(
          {
            success: false,
            message: "Reminder not found for this contact.",
          },
          { status: 404 }
        );
      }

      if (reminder.status !== "active") {
        return NextResponse.json(
          {
            success: false,
            message: "This reminder is no longer active.",
          },
          { status: 409 }
        );
      }
    }

    const fields = parseActivityBody(body);
    const contact = verified.contact;

    const activity = await FollowUpActivity.create({
      ...context.filter,
      userId: context.user._id,
      tenantId: context.tenantId,
      createdBy: context.user._id,
      agentName:
        context.user.name ||
        context.user.email ||
        "Team member",
      leadTypeId,
      contactId,
      contactName: contact.name || body.contactName || "Customer",
      phone: contact.phone || body.phone || "",
      ...fields,
      reminderId: reminder?._id || null,
    });

    if (reminder) {
      try {
        reminder.status = "completed";

        for (const notification of reminder.notifications || []) {
          notification.status = "completed";
        }

        await reminder.save();
      } catch (error) {
        await FollowUpActivity.deleteOne({
          _id: activity._id,
          ...context.filter,
        });

        throw error;
      }
    }

    return NextResponse.json(
      {
        success: true,
        message: reminder
          ? "Activity saved and reminder completed."
          : "Activity saved successfully.",
        activity,
      },
      { status: 201 }
    );
  } catch (error: any) {
    console.error("POST follow-up activity:", error);

    return NextResponse.json(
      {
        success: false,
        message: error.message || "Unable to save activity.",
      },
      { status: 400 }
    );
  }
}

// PUT: Edit activity
export async function PUT(request: NextRequest) {
  try {
    await connectDB();

    const context = await getUserContext();

    if ("error" in context) {
      return NextResponse.json(
        { success: false, message: context.error },
        { status: context.status }
      );
    }

    const body = await request.json();

    if (!isObjectId(body.id)) {
      return NextResponse.json(
        { success: false, message: "Invalid activity ID." },
        { status: 400 }
      );
    }

    const activity = await FollowUpActivity.findOne({
      _id: body.id,
      ...context.filter,
    });

    if (!activity) {
      return NextResponse.json(
        { success: false, message: "Activity not found." },
        { status: 404 }
      );
    }

    const verified = await verifyContact(
      context,
      String(activity.leadTypeId),
      String(activity.contactId)
    );

    if (!verified) {
      return NextResponse.json(
        {
          success: false,
          message: "Linked contact no longer exists.",
        },
        { status: 404 }
      );
    }

    const fields = parseActivityBody(body);

    Object.assign(activity, fields);

    activity.contactName =
      verified.contact.name || activity.contactName;

    activity.phone =
      verified.contact.phone || activity.phone;

    await activity.save();

    return NextResponse.json({
      success: true,
      message: "Activity updated successfully.",
      activity,
    });
  } catch (error: any) {
    console.error("PUT follow-up activity:", error);

    return NextResponse.json(
      {
        success: false,
        message: error.message || "Unable to update activity.",
      },
      { status: 400 }
    );
  }
}

// DELETE: Delete activity
export async function DELETE(request: NextRequest) {
  try {
    await connectDB();

    const context = await getUserContext();

    if ("error" in context) {
      return NextResponse.json(
        { success: false, message: context.error },
        { status: context.status }
      );
    }

    const id = request.nextUrl.searchParams.get("id") || "";

    if (!isObjectId(id)) {
      return NextResponse.json(
        { success: false, message: "Invalid activity ID." },
        { status: 400 }
      );
    }

    const deleted = await FollowUpActivity.findOneAndDelete({
      _id: id,
      ...context.filter,
    });

    if (!deleted) {
      return NextResponse.json(
        { success: false, message: "Activity not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Activity deleted successfully.",
    });
  } catch (error: any) {
    console.error("DELETE follow-up activity:", error);

    return NextResponse.json(
      {
        success: false,
        message: error.message || "Unable to delete activity.",
      },
      { status: 500 }
    );
  }
}
