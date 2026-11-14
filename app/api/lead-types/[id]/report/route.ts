/* eslint-disable @typescript-eslint/no-explicit-any */

import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import ExcelJS from "exceljs";
import { getServerSession } from "next-auth";

import { connectDB } from "@/lib/mongodb";
import { authOptions } from "@/lib/auth";

import User from "@/models/User";
import LeadType from "@/models/LeadType";
import Reminder from "@/models/Reminder";
import FollowUpActivity from "@/models/FollowUpActivity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function getUserContext() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return {
      error: "Unauthorized",
      status: 401,
    };
  }

  const user = await User.findById(session.user.id).lean() as any;

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

  return { user, tenantId, filter };
}

function dateValue(value: any) {
  if (!value) return "";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "";

  return date;
}

function displayDate(value: any) {
  const date = dateValue(value);

  return date
    ? date.toLocaleString("en-IN", {
        dateStyle: "medium",
        timeStyle: "short",
      })
    : "";
}

function reminderStatus(reminder: any, now: Date) {
  if (reminder.status === "completed") return "Completed";
  if (reminder.status === "cancelled") return "Cancelled";

  const followUpAt = dateValue(reminder.followUpAt);

  if (followUpAt && followUpAt.getTime() < now.getTime()) {
    return "Overdue";
  }

  return "Pending";
}

function followUpStatus(activity: any, contactActivities: any[], now: Date) {
  if (!activity.nextFollowUpAt) {
    return "No next follow-up scheduled";
  }

  const dueDate = dateValue(activity.nextFollowUpAt);

  if (!dueDate) return "Invalid follow-up date";

  const laterInteraction = contactActivities.some((next: any) => {
    const interactionDate = dateValue(next.occurredAt);

    return (
      interactionDate &&
      interactionDate.getTime() >= dueDate.getTime() &&
      interactionDate.getTime() > new Date(activity.occurredAt).getTime()
    );
  });

  if (laterInteraction) {
    return "Follow-up interaction logged";
  }

  if (dueDate.getTime() < now.getTime()) {
    return "Overdue - no later interaction logged";
  }

  return "Pending";
}

function styleWorksheet(
  worksheet: ExcelJS.Worksheet,
  widths: number[]
) {
  worksheet.views = [{ state: "frozen", ySplit: 1 }];

  worksheet.columns.forEach((column, index) => {
    column.width = widths[index] || 20;
  });

  const header = worksheet.getRow(1);

  header.height = 28;

  header.eachCell((cell) => {
    cell.font = {
      bold: true,
      color: { argb: "FFFFFFFF" },
      size: 10,
    };

    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF12352F" },
    };

    cell.alignment = {
      vertical: "middle",
      wrapText: true,
    };

    cell.border = {
      bottom: {
        style: "thin",
        color: { argb: "FF0CCB66" },
      },
    };
  });

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;

    row.alignment = {
      vertical: "top",
      wrapText: true,
    };

    if (rowNumber % 2 === 0) {
      row.eachCell((cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF3F7F6" },
        };
      });
    }
  });

  worksheet.autoFilter = {
    from: {
      row: 1,
      column: 1,
    },
    to: {
      row: 1,
      column: widths.length,
    },
  };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await connectDB();

    const context = await getUserContext();

    if ("error" in context) {
      return NextResponse.json(
        {
          success: false,
          message: context.error,
        },
        { status: context.status }
      );
    }

    const { id } = await params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        {
          success: false,
          message: "Invalid Lead Type ID.",
        },
        { status: 400 }
      );
    }

    const leadType = await LeadType.findOne({
      _id: id,
      ...context.filter,
    }).lean() as any;

    if (!leadType) {
      return NextResponse.json(
        {
          success: false,
          message: "Lead Type not found.",
        },
        { status: 404 }
      );
    }

    const contacts = Array.isArray(leadType.contacts)
      ? leadType.contacts
      : [];

    const now = new Date();

    const [activities, reminders] = await Promise.all([
      FollowUpActivity.find({
        ...context.filter,
        leadTypeId: id,
      })
        .sort({ occurredAt: 1, createdAt: 1 })
        .lean(),

      Reminder.find({
        ...context.filter,
        leadTypeId: id,
      })
        .sort({ followUpAt: 1, createdAt: 1 })
        .lean(),
    ]);

    const contactMap = new Map<string, any>();

    contacts.forEach((contact: any) => {
      contactMap.set(String(contact._id), contact);
    });

    const activitiesByContact = new Map<string, any[]>();
    const remindersByContact = new Map<string, any[]>();

    activities.forEach((activity: any) => {
      const key = String(activity.contactId);

      if (!activitiesByContact.has(key)) {
        activitiesByContact.set(key, []);
      }

      activitiesByContact.get(key)!.push(activity);
    });

    reminders.forEach((reminder: any) => {
      const key = String(reminder.contactId);

      if (!remindersByContact.has(key)) {
        remindersByContact.set(key, []);
      }

      remindersByContact.get(key)!.push(reminder);
    });

    const workbook = new ExcelJS.Workbook();

    workbook.creator = "AllChat CRM";
    workbook.lastModifiedBy = "AllChat CRM";
    workbook.created = now;
    workbook.modified = now;

    (workbook.properties as any).title = `${leadType.name} - Lead Type Report`;
    (workbook.properties as any).subject = "Lead Type contacts, activities and reminders";
    (workbook.properties as any).company = "AllChat";

    // --------------------------------------------------
    // SHEET 1: LEAD TYPE SUMMARY
    // --------------------------------------------------

    const summary = workbook.addWorksheet("Lead Type Summary");

    summary.addRow(["AllChat CRM - Lead Type Report", ""]);
    summary.addRow(["Lead Type", leadType.name || ""]);
    summary.addRow(["Generated On", displayDate(now)]);
    summary.addRow(["Total Contacts", contacts.length]);
    summary.addRow(["Total Interaction Logs", activities.length]);
    summary.addRow(["Total Reminders", reminders.length]);

    summary.addRow([
      "Completed Reminders",
      reminders.filter((item: any) => item.status === "completed").length,
    ]);

    summary.addRow([
      "Pending Reminders",
      reminders.filter((item: any) => reminderStatus(item, now) === "Pending").length,
    ]);

    summary.addRow([
      "Overdue Reminders",
      reminders.filter((item: any) => reminderStatus(item, now) === "Overdue").length,
    ]);

    summary.addRow([
      "Cancelled Reminders",
      reminders.filter((item: any) => item.status === "cancelled").length,
    ]);

    summary.addRow([
      "Contacts With Activity",
      contacts.filter((contact: any) =>
        (activitiesByContact.get(String(contact._id)) || []).length > 0
      ).length,
    ]);

    summary.addRow([
      "Contacts Without Activity",
      contacts.filter((contact: any) =>
        (activitiesByContact.get(String(contact._id)) || []).length === 0
      ).length,
    ]);

    summary.addRow([]);

    summary.addRow([
      "Follow-up status is based on saved reminder status and later interaction logs.",
      "",
    ]);

    summary.mergeCells("A1:B1");

    summary.getCell("A1").font = {
      bold: true,
      size: 16,
      color: { argb: "FF12352F" },
    };

    summary.getColumn(1).width = 48;
    summary.getColumn(2).width = 38;

    summary.eachRow((row, rowNumber) => {
      if (rowNumber > 1 && rowNumber <= 12) {
        row.getCell(1).font = { bold: true };
      }
    });

    // --------------------------------------------------
    // SHEET 2: CONTACTS
    // --------------------------------------------------

    const contactSheet = workbook.addWorksheet("Contacts");

    contactSheet.addRow([
      "Lead Type",
      "Contact Name",
      "Phone Number",
      "Contact Notes",
      "Total Interactions",
      "Total Reminders",
      "Last Interaction",
      "Next Scheduled Follow-up",
    ]);

    contacts.forEach((contact: any) => {
      const contactId = String(contact._id);

      const contactActivities =
        activitiesByContact.get(contactId) || [];

      const contactReminders =
        remindersByContact.get(contactId) || [];

      const lastActivity = [...contactActivities].sort(
        (a, b) =>
          new Date(b.occurredAt).getTime() -
          new Date(a.occurredAt).getTime()
      )[0];

      const nextReminder = contactReminders
        .filter((item: any) => item.status === "active")
        .sort(
          (a: any, b: any) =>
            new Date(a.followUpAt).getTime() -
            new Date(b.followUpAt).getTime()
        )[0];

      contactSheet.addRow([
        leadType.name || "",
        contact.name || "",
        contact.phone || "",
        contact.notes || "",
        contactActivities.length,
        contactReminders.length,
        displayDate(lastActivity?.occurredAt),
        displayDate(nextReminder?.followUpAt),
      ]);
    });

    styleWorksheet(contactSheet, [24, 26, 20, 45, 18, 16, 25, 25]);

    // --------------------------------------------------
    // SHEET 3: INTERACTION LOGS
    // --------------------------------------------------

    const activitySheet = workbook.addWorksheet("Interaction Logs");

    activitySheet.addRow([
      "Lead Type",
      "Lead Name",
      "Lead Number",
      "Interaction Date & Time",
      "Interaction Type",
      "Person Contacted",
      "Logged By / Agent",
      "Outcome",
      "Conversation Summary / Notes",
      "Next Follow-up Date",
      "Next Follow-up Status",
      "Linked Reminder ID",
      "Activity Created At",
      "Activity Last Updated",
    ]);

    // Each activity gets its own row, with the lead's name and number.
    activities.forEach((activity: any) => {
      const contact = contactMap.get(String(activity.contactId));

      const contactActivities =
        activitiesByContact.get(String(activity.contactId)) || [];

      activitySheet.addRow([
        leadType.name || "",
        contact?.name || activity.contactName || "",
        contact?.phone || activity.phone || "",
        displayDate(activity.occurredAt),
        activity.interactionType || "",
        activity.personContacted || "",
        activity.agentName || "",
        activity.outcome || "",
        activity.summary || "",
        displayDate(activity.nextFollowUpAt),
        followUpStatus(activity, contactActivities, now),
        activity.reminderId ? String(activity.reminderId) : "",
        displayDate(activity.createdAt),
        displayDate(activity.updatedAt),
      ]);
    });

    // Also include contacts that do not have any activity logs.
    contacts.forEach((contact: any) => {
      const contactActivities =
        activitiesByContact.get(String(contact._id)) || [];

      if (contactActivities.length === 0) {
        activitySheet.addRow([
          leadType.name || "",
          contact.name || "",
          contact.phone || "",
          "",
          "",
          "",
          "",
          "",
          "",
          "",
          "No activity logged",
          "",
          "",
          "",
        ]);
      }
    });

    styleWorksheet(activitySheet, [
      22, 24, 18, 25, 18, 22, 22,
      25, 55, 25, 38, 28, 25, 25,
    ]);

    // --------------------------------------------------
    // SHEET 4: REMINDERS
    // --------------------------------------------------

    const reminderSheet = workbook.addWorksheet("Reminders");

    reminderSheet.addRow([
      "Lead Type",
      "Contact Name",
      "Phone Number",
      "Reminder Message / Note",
      "Scheduled Follow-up Date",
      "Reminder Status",
      "Notification Label",
      "Notification Scheduled At",
      "Notification Status",
      "Notification Sent At",
      "Reminder Created At",
      "Reminder Last Updated",
      "Reminder ID",
    ]);

    reminders.forEach((reminder: any) => {
      const contact = contactMap.get(String(reminder.contactId));

      const notifications = Array.isArray(reminder.notifications)
        ? reminder.notifications
        : [];

      if (notifications.length === 0) {
        reminderSheet.addRow([
          leadType.name || "",
          contact?.name || reminder.contactName || "",
          contact?.phone || reminder.phone || "",
          reminder.message || "",
          displayDate(reminder.followUpAt),
          reminderStatus(reminder, now),
          "",
          "",
          "",
          "",
          displayDate(reminder.createdAt),
          displayDate(reminder.updatedAt),
          String(reminder._id),
        ]);
      } else {
        notifications.forEach((notification: any) => {
          reminderSheet.addRow([
            leadType.name || "",
            contact?.name || reminder.contactName || "",
            contact?.phone || reminder.phone || "",
            reminder.message || "",
            displayDate(reminder.followUpAt),
            reminderStatus(reminder, now),
            notification.label || "",
            displayDate(notification.notifyAt),
            notification.status || "",
            displayDate(notification.notifiedAt),
            displayDate(reminder.createdAt),
            displayDate(reminder.updatedAt),
            String(reminder._id),
          ]);
        });
      }
    });

    styleWorksheet(reminderSheet, [
      22, 24, 18, 48, 25, 20, 24,
      25, 20, 25, 25, 25, 28,
    ]);

    // --------------------------------------------------
    // SHEET 5: NEXT FOLLOW-UPS
    // --------------------------------------------------

    const followUpSheet = workbook.addWorksheet("Next Follow-ups");

    followUpSheet.addRow([
      "Lead Type",
      "Contact Name",
      "Phone Number",
      "Original Interaction Date",
      "Original Interaction Type",
      "Original Conversation Summary",
      "Next Follow-up Date",
      "Follow-up Status",
      "Later Interaction Date",
      "Later Interaction Type",
      "Later Interaction Outcome",
      "Later Interaction Summary",
      "Agent",
    ]);

    activities
      .filter((activity: any) => activity.nextFollowUpAt)
      .forEach((activity: any) => {
        const contactId = String(activity.contactId);

        const contact = contactMap.get(contactId);

        const contactActivities =
          activitiesByContact.get(contactId) || [];

        const dueDate = dateValue(activity.nextFollowUpAt);

        const laterActivity = contactActivities
          .filter((next: any) => {
            const interactionDate = dateValue(next.occurredAt);

            return (
              interactionDate &&
              dueDate &&
              interactionDate.getTime() >= dueDate.getTime() &&
              interactionDate.getTime() >
                new Date(activity.occurredAt).getTime()
            );
          })
          .sort(
            (a: any, b: any) =>
              new Date(a.occurredAt).getTime() -
              new Date(b.occurredAt).getTime()
          )[0];

        followUpSheet.addRow([
          leadType.name || "",
          contact?.name || activity.contactName || "",
          contact?.phone || activity.phone || "",
          displayDate(activity.occurredAt),
          activity.interactionType || "",
          activity.summary || "",
          displayDate(activity.nextFollowUpAt),
          followUpStatus(activity, contactActivities, now),
          displayDate(laterActivity?.occurredAt),
          laterActivity?.interactionType || "",
          laterActivity?.outcome || "",
          laterActivity?.summary || "",
          activity.agentName || "",
        ]);
      });

    styleWorksheet(followUpSheet, [
      22, 24, 18, 25, 20, 48, 25,
      40, 25, 20, 25, 48, 22,
    ]);

    // --------------------------------------------------
    // EXPORT WORKBOOK
    // --------------------------------------------------

    const safeName = String(leadType.name || "Lead-Type")
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
      .trim()
      .replace(/\s+/g, "_")
      .slice(0, 70) || "Lead-Type";

    const dateStamp = now.toISOString().slice(0, 10);

    const filename = `${safeName}_Report_${dateStamp}.xlsx`;

    const buffer = await workbook.xlsx.writeBuffer();

    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error: any) {
    console.error("Lead Type Excel Report Error:", error);

    return NextResponse.json(
      {
        success: false,
        message: error.message || "Unable to generate Lead Type report.",
      },
      { status: 500 }
    );
  }
}
