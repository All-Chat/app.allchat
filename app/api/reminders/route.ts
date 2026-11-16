
/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { getServerSession } from "next-auth";

import { connectDB } from "@/lib/mongodb";
import { authOptions } from "@/lib/auth";

import User from "@/models/User";
import LeadType from "@/models/LeadType";
import Reminder from "@/models/Reminder";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";


// --------------------------------------------------
// USER CONTEXT
// --------------------------------------------------

async function getUserContext() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return {
      error: "Unauthorized",
      status: 401,
    };
  }

  const user: any = await User.findById(session.user.id).lean();

  if (!user) {
    return {
      error: "User not found",
      status: 404,
    };
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

  return {
    user,
    tenantId,
    filter,
  };
}


// --------------------------------------------------
// HELPERS
// --------------------------------------------------

function validObjectId(value: string) {
  return mongoose.Types.ObjectId.isValid(value);
}


function buildNotifications(
  followUpAt: Date,
  notifications: any[]
) {
  const followUpTime = new Date(followUpAt).getTime();

  return notifications.map((item: any) => {
    const offsetMinutes = Number(item.offsetMinutes);

    if (!Number.isFinite(offsetMinutes)) {
      throw new Error("Invalid notification timing.");
    }

    return {
      label: String(item.label || "Custom reminder"),
      offsetMinutes,

      notifyAt: new Date(
        followUpTime + offsetMinutes * 60 * 1000
      ),

      status: "pending",
      notifiedAt: null,
    };
  });
}


function errorResponse(error: any, message: string) {
  console.error(message, error);

  return NextResponse.json(
    {
      success: false,
      message: error?.message || message,
    },
    { status: 500 }
  );
}


// --------------------------------------------------
// GET: FETCH ACTIVE REMINDERS
// --------------------------------------------------

export async function GET() {
  try {
    await connectDB();

    const context: any = await getUserContext();

    if (context.error) {
      return NextResponse.json(
        {
          success: false,
          message: context.error,
        },
        { status: context.status }
      );
    }

    const reminders = await Reminder.find({
      ...context.filter,
      status: "active",
    })
      .sort({ followUpAt: 1 })
      .lean();

    return NextResponse.json({
      success: true,
      reminders,
    });

  } catch (error: any) {
    return errorResponse(error, "Unable to load reminders.");
  }
}


// --------------------------------------------------
// POST: CREATE REMINDER OR POLL NOTIFICATIONS
// --------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    await connectDB();

    const context: any = await getUserContext();

    if (context.error) {
      return NextResponse.json(
        {
          success: false,
          message: context.error,
        },
        { status: context.status }
      );
    }

    const body = await request.json();


    // ==============================================
    // POLL DUE NOTIFICATIONS
    // ==============================================

    if (body.action === "poll") {
      const now = new Date();

      // Match status and notifyAt on the SAME
      // notification subdocument.
      const dueReminders = await Reminder.find({
        ...context.filter,
        status: "active",

        notifications: {
          $elemMatch: {
            status: "pending",
            notifyAt: { $lte: now },
          },
        },
      });

      const events: any[] = [];

      for (const reminder of dueReminders) {
        let changed = false;

        for (const notification of reminder.notifications) {
          const notificationTime = new Date(
            notification.notifyAt
          ).getTime();

          if (
            notification.status === "pending" &&
            Number.isFinite(notificationTime) &&
            notificationTime <= now.getTime()
          ) {
            notification.status = "notified";
            notification.notifiedAt = now;

            events.push({
              reminderId: String(reminder._id),
              eventId: String(notification._id),

              leadTypeId: String(reminder.leadTypeId),
              contactId: String(reminder.contactId),

              message: reminder.message,
              contactName: reminder.contactName,
              phone: reminder.phone,

              label: notification.label,
              followUpAt: reminder.followUpAt,

              notifyAt: notification.notifyAt,
            });

            changed = true;
          }
        }

        if (changed) {
          await reminder.save();
        }
      }


      // Diagnostic information:
      // Shows pending notifications and their next scheduled time.
      const pendingReminders: any[] = await Reminder.find({
        ...context.filter,
        status: "active",

        notifications: {
          $elemMatch: {
            status: "pending",
          },
        },
      })
        .select("notifications")
        .lean();

      let pendingCount = 0;
      let nextNotifyAt: Date | null = null;

      for (const reminder of pendingReminders) {
        for (const notification of reminder.notifications || []) {
          if (notification.status === "pending") {
            pendingCount++;

            const notifyAt = new Date(notification.notifyAt);

            if (
              !Number.isNaN(notifyAt.getTime()) &&
              (!nextNotifyAt || notifyAt < nextNotifyAt)
            ) {
              nextNotifyAt = notifyAt;
            }
          }
        }
      }

      return NextResponse.json({
        success: true,

        events,

        debug: {
          serverTime: now.toISOString(),
          dueCount: events.length,
          pendingCount,
          nextNotifyAt: nextNotifyAt
            ? nextNotifyAt.toISOString()
            : null,
        },
      });
    }


    // ==============================================
    // CREATE REMINDER
    // ==============================================

    const {
      leadTypeId,
      contactId,
      message,
      followUpAt,
      notifications,
    } = body;

    if (
      !leadTypeId ||
      !contactId ||
      !validObjectId(leadTypeId) ||
      !validObjectId(contactId)
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid contact or Lead Type.",
        },
        { status: 400 }
      );
    }

    if (!String(message || "").trim()) {
      return NextResponse.json(
        {
          success: false,
          message: "Reminder message is required.",
        },
        { status: 400 }
      );
    }

    const followUpDate = new Date(followUpAt);

    if (Number.isNaN(followUpDate.getTime())) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid follow-up date.",
        },
        { status: 400 }
      );
    }

    if (
      !Array.isArray(notifications) ||
      notifications.length === 0 ||
      notifications.length > 30
    ) {
      return NextResponse.json(
        {
          success: false,
          message: "Add at least one notification timing.",
        },
        { status: 400 }
      );
    }


    // Verify Lead Type belongs to this tenant/user.
    const leadType = await LeadType.findOne({
      _id: leadTypeId,
      ...context.filter,
    });

    if (!leadType) {
      return NextResponse.json(
        {
          success: false,
          message: "Lead Type not found.",
        },
        { status: 404 }
      );
    }

    const contact = leadType.contacts.id(contactId);

    if (!contact) {
      return NextResponse.json(
        {
          success: false,
          message: "Contact not found.",
        },
        { status: 404 }
      );
    }


    const reminder = await Reminder.create({
      userId: context.user._id,
      tenantId: context.tenantId,
      createdBy: context.user._id,

      leadTypeId,
      contactId,

      contactName: contact.name,
      phone: contact.phone,

      message: String(message).trim(),
      followUpAt: followUpDate,

      notifications: buildNotifications(
        followUpDate,
        notifications
      ),

      status: "active",
    });

    return NextResponse.json({
      success: true,
      message: "Follow-up reminder created successfully.",
      reminder,
    });

  } catch (error: any) {
    return errorResponse(error, "Unable to create or check reminders.");
  }
}


// --------------------------------------------------
// PATCH: COMPLETE, SNOOZE OR EDIT REMINDER
// --------------------------------------------------

export async function PATCH(request: NextRequest) {
  try {
    await connectDB();

    const context: any = await getUserContext();

    if (context.error) {
      return NextResponse.json(
        {
          success: false,
          message: context.error,
        },
        { status: context.status }
      );
    }

    const body = await request.json();

    const { id, action } = body;

    if (!id || !validObjectId(id)) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid reminder ID.",
        },
        { status: 400 }
      );
    }

    const reminder = await Reminder.findOne({
      _id: id,
      ...context.filter,
    });

    if (!reminder) {
      return NextResponse.json(
        {
          success: false,
          message: "Reminder not found.",
        },
        { status: 404 }
      );
    }


    // ==============================================
    // COMPLETE
    // ==============================================

    if (action === "complete") {
      return NextResponse.json(
        {
          success: false,
          message:
            "Please log the customer conversation before completing this reminder.",
        },
        { status: 400 }
      );
    }


    // ==============================================
    // SNOOZE
    // ==============================================

    if (action === "snooze") {
      const { eventId, minutes = 10 } = body;

      if (
        !eventId ||
        !validObjectId(eventId) ||
        !Number.isFinite(Number(minutes)) ||
        Number(minutes) < 1 ||
        Number(minutes) > 10080
      ) {
        return NextResponse.json(
          {
            success: false,
            message: "Invalid snooze settings.",
          },
          { status: 400 }
        );
      }

      const notification = reminder.notifications.id(eventId);

      if (!notification) {
        return NextResponse.json(
          {
            success: false,
            message: "Notification not found.",
          },
          { status: 404 }
        );
      }

      notification.notifyAt = new Date(
        Date.now() + Number(minutes) * 60 * 1000
      );

      notification.status = "pending";
      notification.notifiedAt = null;

      await reminder.save();

      return NextResponse.json({
        success: true,
        message: "Notification snoozed successfully.",
      });
    }


    // ==============================================
    // UPDATE
    // ==============================================

    if (action === "update") {
      const message = String(body.message || "").trim();

      const followUpDate = new Date(body.followUpAt);

      if (
        !message ||
        Number.isNaN(followUpDate.getTime())
      ) {
        return NextResponse.json(
          {
            success: false,
            message: "Invalid reminder details.",
          },
          { status: 400 }
        );
      }

      if (
        !Array.isArray(body.notifications) ||
        body.notifications.length === 0 ||
        body.notifications.length > 30
      ) {
        return NextResponse.json(
          {
            success: false,
            message: "Invalid notification timings.",
          },
          { status: 400 }
        );
      }

      reminder.message = message;
      reminder.followUpAt = followUpDate;

      reminder.notifications = buildNotifications(
        followUpDate,
        body.notifications
      ) as any;

      reminder.status = "active";

      await reminder.save();

      return NextResponse.json({
        success: true,
        message: "Reminder updated successfully.",
      });
    }


    return NextResponse.json(
      {
        success: false,
        message: "Invalid action.",
      },
      { status: 400 }
    );

  } catch (error: any) {
    return errorResponse(error, "Unable to update reminder.");
  }
}


// --------------------------------------------------
// DELETE REMINDER
// --------------------------------------------------

export async function DELETE(request: NextRequest) {
  try {
    await connectDB();

    const context: any = await getUserContext();

    if (context.error) {
      return NextResponse.json(
        {
          success: false,
          message: context.error,
        },
        { status: context.status }
      );
    }

    const { searchParams } = new URL(request.url);

    const id = searchParams.get("id");

    if (!id || !validObjectId(id)) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid reminder ID.",
        },
        { status: 400 }
      );
    }

    const reminder = await Reminder.findOneAndDelete({
      _id: id,
      ...context.filter,
    });

    if (!reminder) {
      return NextResponse.json(
        {
          success: false,
          message: "Reminder not found.",
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Reminder deleted successfully.",
    });

  } catch (error: any) {
    return errorResponse(error, "Unable to delete reminder.");
  }
}
