/* eslint-disable @typescript-eslint/no-explicit-any */

// eslint-disable-next-line @typescript-eslint/no-explicit-any

import { NextRequest, NextResponse } from "next/server";

import mongoose from "mongoose";

import { getServerSession } from "next-auth";

import { connectDB } from "@/lib/mongodb";

import { authOptions } from "@/lib/auth";

import User from "@/models/User";

import LeadType from "@/models/LeadType";

import { getNextAutoAssignedUser } from "@/lib/autoAssignment";

export const dynamic = "force-dynamic";

async function getUserContext() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.id) {
    return { error: "Unauthorized", status: 401 };
  }

  const user = await User.findById(session.user.id).lean();

  if (!user) {
    return { error: "User not found", status: 404 };
  }

  let tenantId: string | null = null;

  if (user.isTenant) {
    tenantId = user.tenantId
      ? String(user.tenantId)
      : String(user._id);
  } else if (user.parentTenantId) {
    tenantId = String(user.parentTenantId);
  }

  const filter = { userId: user._id };

  return {
    user,
    tenantId,
    filter,
  };
}

function normalizePhone(phone: string) {
  return phone.replace(/[\s().-]/g, "").trim();
}

function cleanKeywords(keywords: unknown) {
  if (!Array.isArray(keywords)) return [];

  return Array.from(
    new Set(
      keywords
        .map((keyword) => String(keyword).trim())
        .filter(Boolean)
    )
  ).slice(0, 100);
}

/**
 * Supported modes:
 * exact   = complete message must match the keyword
 * include = keyword can appear anywhere in the message
 *
 * Both modes are case-insensitive.
 */
function normalizeKeywordMatchMode(
  value: unknown
): "exact" | "include" {
  return String(value || "").toLowerCase() === "include"
    ? "include"
    : "exact";
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function serializeLeadType(leadType: any) {
  const item =
    typeof leadType.toObject === "function"
      ? leadType.toObject()
      : leadType;

  return {
    ...item,
    _id: String(item._id),
    keywords: Array.isArray(item.keywords) ? item.keywords : [],
    keywordMatchMode: normalizeKeywordMatchMode(
      item.keywordMatchMode
    ),
    contacts: Array.isArray(item.contacts)
      ? item.contacts.map((contact: any) => ({
          ...contact,
          _id: String(contact._id),
          name: contact.name || "",
          phone: contact.phone || "",
          notes: contact.notes || "",
          source: contact.source || "WhatsApp",
          customSource: contact.customSource || "",
          assignedTo: contact.assignedTo
            ? String(contact.assignedTo)
            : null,
          createdAt: contact.createdAt || null,
          updatedAt: contact.updatedAt || null,
        }))
      : [],
  };
}

function canManageAllContacts(context: any) {
  return Boolean(context.user.isTenant);
}

function canAccessContact(contact: any, context: any) {
  if (canManageAllContacts(context)) return true;

  return (
    contact.assignedTo &&
    String(contact.assignedTo) === String(context.user._id)
  );
}

function isSameTenant(targetUser: any, context: any) {
  if (!context.tenantId) {
    return String(targetUser._id) === String(context.user._id);
  }

  if (targetUser.isTenant) {
    const targetTenantId = targetUser.tenantId
      ? String(targetUser.tenantId)
      : String(targetUser._id);

    return targetTenantId === String(context.tenantId);
  }

  return (
    String(targetUser.parentTenantId || "") ===
    String(context.tenantId)
  );
}

async function getOrCreateUserLeadType(
  targetUser: any,
  sourceLeadType: any,
  context: any
) {
  let targetLeadType = await LeadType.findOne({
    userId: targetUser._id,
    tenantId: context.tenantId,
    name: {
      $regex: `^${escapeRegex(String(sourceLeadType.name))}$`,
      $options: "i",
    },
  });

  if (!targetLeadType) {
    targetLeadType = await LeadType.create({
      userId: targetUser._id,
      tenantId: context.tenantId,
      createdBy: context.user._id,
      name: sourceLeadType.name,
      keywords: Array.isArray(sourceLeadType.keywords)
        ? sourceLeadType.keywords
        : [],
      keywordMatchMode: normalizeKeywordMatchMode(
        sourceLeadType.keywordMatchMode
      ),
      contacts: [],
    });
  }

  return targetLeadType;
}

async function userAlreadyHasPhone(
  userId: mongoose.Types.ObjectId,
  tenantId: string | null,
  phone: string
) {
  const leadTypes = await LeadType.find({
    userId,
    ...(tenantId ? { tenantId } : {}),
  }).select("contacts");

  return leadTypes.some((item: any) =>
    (item.contacts || []).some(
      (contact: any) =>
        normalizePhone(contact.phone) === phone
    )
  );
}

/* =========================================================
   GET LEAD TYPES
========================================================= */

export async function GET() {
  try {
    await connectDB();

    const context = await getUserContext();

    if ("error" in context) {
      return NextResponse.json(
        { success: false, message: context.error },
        { status: context.status }
      );
    }

    const leadTypes = await LeadType.find(context.filter)
      .sort({ createdAt: 1 })
      .lean();

    const normalizedLeadTypes = leadTypes.map((item: any) => {
      const contacts = Array.isArray(item.contacts)
        ? item.contacts
        : [];

      const visibleContacts = canManageAllContacts(context)
        ? contacts
        : contacts.filter(
            (contact: any) =>
              contact.assignedTo &&
              String(contact.assignedTo) ===
                String(context.user._id)
          );

      return {
        ...item,
        _id: String(item._id),
        keywords: Array.isArray(item.keywords)
          ? item.keywords
          : [],
        keywordMatchMode: normalizeKeywordMatchMode(
          item.keywordMatchMode
        ),
        contacts: visibleContacts.map((contact: any) => ({
          ...contact,
          _id: String(contact._id),
          source: contact.source || "WhatsApp",
          customSource: contact.customSource || "",
          assignedTo: contact.assignedTo
            ? String(contact.assignedTo)
            : null,
        })),
      };
    });

    return NextResponse.json({
      success: true,
      leadTypes: normalizedLeadTypes,
    });
  } catch (error: any) {
    console.error("GET Lead Types Error:", error);

    return NextResponse.json(
      {
        success: false,
        message: error.message || "Failed to fetch Lead Types",
      },
      { status: 500 }
    );
  }
}

/* =========================================================
   POST - CREATE LEAD TYPE / ADD CONTACT
========================================================= */

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

    /* =====================================================
       ADD CONTACT
    ===================================================== */

    if (body.action === "addContact") {
      const {
        leadTypeId,
        name,
        phone,
        notes = "",
        source = "WhatsApp",
        customSource = "",
      } = body;

      const allowedSources = [
        "WhatsApp",
        "Instagram",
        "Facebook",
        "Other",
      ];

      const cleanSource = String(source).trim();
      const cleanCustomSource = String(customSource || "").trim();

      if (!allowedSources.includes(cleanSource)) {
        return NextResponse.json(
          { success: false, message: "Invalid lead source." },
          { status: 400 }
        );
      }

      if (cleanSource === "Other" && !cleanCustomSource) {
        return NextResponse.json(
          {
            success: false,
            message: "Please enter the custom lead source.",
          },
          { status: 400 }
        );
      }

      if (cleanSource !== "Other" && cleanCustomSource) {
        return NextResponse.json(
          {
            success: false,
            message:
              "Custom source is only allowed when source is Other.",
          },
          { status: 400 }
        );
      }

      if (
        !leadTypeId ||
        !mongoose.Types.ObjectId.isValid(leadTypeId)
      ) {
        return NextResponse.json(
          { success: false, message: "Invalid Lead Type" },
          { status: 400 }
        );
      }

      if (!name?.trim() || !phone?.trim()) {
        return NextResponse.json(
          {
            success: false,
            message:
              "Customer name and phone number are required.",
          },
          { status: 400 }
        );
      }

      const cleanPhone = normalizePhone(phone);

      if (!/^\+?[0-9]{7,15}$/.test(cleanPhone)) {
        return NextResponse.json(
          {
            success: false,
            message: "Please enter a valid phone number.",
          },
          { status: 400 }
        );
      }

      const leadType = await LeadType.findOne({
        _id: leadTypeId,
        ...context.filter,
      });

      if (!leadType) {
        return NextResponse.json(
          { success: false, message: "Lead Type not found." },
          { status: 404 }
        );
      }

      if (!Array.isArray(leadType.contacts)) {
        leadType.contacts = [];
      }

      const alreadyExists = leadType.contacts.some(
        (contact: any) =>
          normalizePhone(contact.phone) === cleanPhone
      );

      if (alreadyExists) {
        return NextResponse.json(
          {
            success: false,
            message:
              "This contact already exists in this Lead Type.",
          },
          { status: 409 }
        );
      }

      if (context.user.isTenant && context.tenantId) {
        const assignedUserId =
          await getNextAutoAssignedUser(context.tenantId);

        if (assignedUserId) {
          const targetUser = await User.findOne({
            _id: assignedUserId,
            parentTenantId: context.tenantId,
            isTenant: false,
            accountStatus: "active",
          }).lean();

          if (targetUser) {
            const duplicateForUser = await userAlreadyHasPhone(
              targetUser._id,
              context.tenantId,
              cleanPhone
            );

            if (duplicateForUser) {
              return NextResponse.json(
                {
                  success: false,
                  message:
                    "This contact already exists for the assigned user.",
                },
                { status: 409 }
              );
            }

            const targetLeadType = await getOrCreateUserLeadType(
              targetUser,
              leadType,
              context
            );

            if (!Array.isArray(targetLeadType.contacts)) {
              targetLeadType.contacts = [];
            }

            targetLeadType.contacts.push({
              name: name.trim(),
              phone: cleanPhone,
              notes: String(notes || "").trim(),
              source: cleanSource,
              customSource:
                cleanSource === "Other" ? cleanCustomSource : "",
              assignedTo: targetUser._id,
            } as any);

            await targetLeadType.save();

            return NextResponse.json({
              success: true,
              message: `Contact automatically assigned to ${targetUser.name}.`,
              assignedTo: {
                _id: String(targetUser._id),
                name: targetUser.name,
              },
              leadType: serializeLeadType(targetLeadType),
            });
          }
        }
      }

      leadType.contacts.push({
        name: name.trim(),
        phone: cleanPhone,
        notes: String(notes || "").trim(),
        source: cleanSource,
        customSource:
          cleanSource === "Other" ? cleanCustomSource : "",
        assignedTo: context.user._id,
      } as any);

      await leadType.save();

      return NextResponse.json({
        success: true,
        message: "Contact added successfully.",
        leadType: serializeLeadType(leadType),
      });
    }

    /* =====================================================
       CREATE LEAD TYPE
    ===================================================== */

    const name = String(body.name || "").trim();

    if (!name) {
      return NextResponse.json(
        { success: false, message: "Lead Type name is required." },
        { status: 400 }
      );
    }

    const leadType = await LeadType.create({
      userId: context.user._id,
      tenantId: context.tenantId,
      createdBy: context.user._id,
      name,
      keywords: [],
      keywordMatchMode: "exact",
      contacts: [],
    });

    return NextResponse.json({
      success: true,
      message: "Lead Type created successfully.",
      leadType: serializeLeadType(leadType),
    });
  } catch (error: any) {
    console.error("POST Lead Types Error:", error);

    return NextResponse.json(
      {
        success: false,
        message: error.message || "Failed to process request.",
      },
      { status: 500 }
    );
  }
}

/* =========================================================
   PATCH - UPDATE / EDIT / DELETE / MOVE / TRANSFER
========================================================= */

export async function PATCH(request: NextRequest) {
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

    /* =====================================================
       UPDATE KEYWORDS + MATCH MODE
       Frontend payload:
       {
         action: "updateKeywords",
         leadTypeId: "...",
         keywords: [...],
         keywordMatchMode: "exact" | "include"
       }
    ===================================================== */

    if (body.action === "updateKeywords") {
      const leadTypeId = body.leadTypeId || body.id;

      if (
        !leadTypeId ||
        !mongoose.Types.ObjectId.isValid(leadTypeId)
      ) {
        return NextResponse.json(
          { success: false, message: "Invalid Lead Type ID." },
          { status: 400 }
        );
      }

      if (!Array.isArray(body.keywords)) {
        return NextResponse.json(
          { success: false, message: "Keywords must be an array." },
          { status: 400 }
        );
      }

      const leadType = await LeadType.findOne({
        _id: leadTypeId,
        ...context.filter,
      });

      if (!leadType) {
        return NextResponse.json(
          { success: false, message: "Lead Type not found." },
          { status: 404 }
        );
      }

      leadType.keywords = cleanKeywords(body.keywords);

      if (body.keywordMatchMode !== undefined) {
        leadType.keywordMatchMode = normalizeKeywordMatchMode(
          body.keywordMatchMode
        );
      }

      await leadType.save();

      return NextResponse.json({
        success: true,
        message: "Keywords updated successfully.",
        leadType: serializeLeadType(leadType),
      });
    }

    /* =====================================================
       TRANSFER CONTACT
    ===================================================== */

    if (body.action === "transferContact") {
      const leadTypeId =
        body.sourceLeadTypeId || body.leadTypeId;

      const { contactId, targetUserId } = body;

      if (
        !leadTypeId ||
        !contactId ||
        !targetUserId ||
        !mongoose.Types.ObjectId.isValid(leadTypeId) ||
        !mongoose.Types.ObjectId.isValid(contactId) ||
        !mongoose.Types.ObjectId.isValid(targetUserId)
      ) {
        return NextResponse.json(
          {
            success: false,
            message:
              "Invalid Lead Type, contact, or destination user.",
          },
          { status: 400 }
        );
      }

      if (String(context.user._id) === String(targetUserId)) {
        return NextResponse.json(
          {
            success: false,
            message: "You cannot transfer a lead to yourself.",
          },
          { status: 400 }
        );
      }

      const targetUser = await User.findById(targetUserId).lean();

      if (!targetUser || !isSameTenant(targetUser, context)) {
        return NextResponse.json(
          {
            success: false,
            message: "Destination user not found in your tenant.",
          },
          { status: 404 }
        );
      }

      const source = await LeadType.findOne({
        _id: leadTypeId,
        ...context.filter,
      });

      if (!source) {
        return NextResponse.json(
          { success: false, message: "Source Lead Type not found." },
          { status: 404 }
        );
      }

      if (!Array.isArray(source.contacts)) {
        source.contacts = [];
      }

      const contact = source.contacts.id(contactId);

      if (!contact) {
        return NextResponse.json(
          { success: false, message: "Contact not found." },
          { status: 404 }
        );
      }

      if (!canAccessContact(contact, context)) {
        return NextResponse.json(
          {
            success: false,
            message:
              "You do not have permission to transfer this lead.",
          },
          { status: 403 }
        );
      }

      const cleanPhone = normalizePhone(contact.phone);

      const targetLeadTypes = await LeadType.find({
        userId: targetUser._id,
        ...(context.tenantId
          ? { tenantId: context.tenantId }
          : {}),
      });

      const duplicate = targetLeadTypes.some((item: any) =>
        (item.contacts || []).some(
          (existing: any) =>
            normalizePhone(existing.phone) === cleanPhone
        )
      );

      if (duplicate) {
        return NextResponse.json(
          {
            success: false,
            message:
              "This lead already exists for the destination user.",
          },
          { status: 409 }
        );
      }

      const targetLeadType = await getOrCreateUserLeadType(
        targetUser,
        source,
        context
      );

      if (!Array.isArray(targetLeadType.contacts)) {
        targetLeadType.contacts = [];
      }

      targetLeadType.contacts.push({
        name: contact.name,
        phone: cleanPhone,
        notes: contact.notes || "",
        source: contact.source || "WhatsApp",
        customSource: contact.customSource || "",
        assignedTo: targetUser._id,
      } as any);

      await targetLeadType.save();

      try {
        contact.deleteOne();
        await source.save();
      } catch (sourceError) {
        const addedContact =
          targetLeadType.contacts[
            targetLeadType.contacts.length - 1
          ];

        if (addedContact) {
          addedContact.deleteOne();
          await targetLeadType.save();
        }

        throw sourceError;
      }

      return NextResponse.json({
        success: true,
        message: `Lead successfully transferred to ${targetUser.name}.`,
      });
    }

    /* =====================================================
       EDIT CONTACT
    ===================================================== */

    if (body.action === "editContact") {
      const {
        leadTypeId,
        contactId,
        name,
        phone,
        notes,
        source,
        customSource,
      } = body;

      if (
        !leadTypeId ||
        !contactId ||
        !mongoose.Types.ObjectId.isValid(leadTypeId) ||
        !mongoose.Types.ObjectId.isValid(contactId)
      ) {
        return NextResponse.json(
          { success: false, message: "Invalid contact or Lead Type." },
          { status: 400 }
        );
      }

      const leadType = await LeadType.findOne({
        _id: leadTypeId,
        ...context.filter,
      });

      if (!leadType) {
        return NextResponse.json(
          { success: false, message: "Lead Type not found." },
          { status: 404 }
        );
      }

      if (!Array.isArray(leadType.contacts)) {
        leadType.contacts = [];
      }

      const contact = leadType.contacts.id(contactId);

      if (!contact) {
        return NextResponse.json(
          { success: false, message: "Contact not found." },
          { status: 404 }
        );
      }

      if (!canAccessContact(contact, context)) {
        return NextResponse.json(
          { success: false, message: "You cannot edit this contact." },
          { status: 403 }
        );
      }

      // Keep existing values when the request sends only selected fields.
      const nextName =
        name !== undefined
          ? String(name).trim()
          : String(contact.name || "");

      const nextPhone =
        phone !== undefined
          ? normalizePhone(String(phone))
          : normalizePhone(String(contact.phone || ""));

      if (!nextName || !nextPhone) {
        return NextResponse.json(
          {
            success: false,
            message:
              "Customer name and phone number are required.",
          },
          { status: 400 }
        );
      }

      if (!/^\+?[0-9]{7,15}$/.test(nextPhone)) {
        return NextResponse.json(
          { success: false, message: "Invalid phone number." },
          { status: 400 }
        );
      }

      // Check duplicate phone numbers only when the phone is changed.
      const phoneChanged =
        nextPhone !== normalizePhone(String(contact.phone || ""));

      if (phoneChanged) {
        const duplicate = leadType.contacts.some(
          (item: any) =>
            String(item._id) !== String(contactId) &&
            normalizePhone(String(item.phone || "")) === nextPhone
        );

        if (duplicate) {
          return NextResponse.json(
            {
              success: false,
              message:
                "Another contact with this phone number already exists in this stage.",
            },
            { status: 409 }
          );
        }
      }

      contact.name = nextName;
      contact.phone = nextPhone;

      if (notes !== undefined) {
        contact.notes = String(notes || "").trim();
      }

      // Update Lead Source only when it is included in the request.
      if (source !== undefined) {
        const allowedSources = [
          "WhatsApp",
          "Instagram",
          "Facebook",
          "Other",
        ];

        const cleanSource = String(source).trim();
        const cleanCustomSource = String(customSource || "").trim();

        if (!allowedSources.includes(cleanSource)) {
          return NextResponse.json(
            { success: false, message: "Invalid lead source." },
            { status: 400 }
          );
        }

        if (cleanSource === "Other" && !cleanCustomSource) {
          return NextResponse.json(
            {
              success: false,
              message: "Please enter the custom lead source.",
            },
            { status: 400 }
          );
        }

        contact.source = cleanSource;
        contact.customSource =
          cleanSource === "Other" ? cleanCustomSource : "";
      } else if (
        customSource !== undefined &&
        contact.source === "Other"
      ) {
        const cleanCustomSource = String(customSource || "").trim();

        if (!cleanCustomSource) {
          return NextResponse.json(
            {
              success: false,
              message: "Please enter the custom lead source.",
            },
            { status: 400 }
          );
        }

        contact.customSource = cleanCustomSource;
      }

      await leadType.save();

      return NextResponse.json({
        success: true,
        message: "Contact updated successfully.",
        leadType: serializeLeadType(leadType),
      });
    }

    /* =====================================================
       DELETE CONTACT
    ===================================================== */

    if (body.action === "deleteContact") {
      const { leadTypeId, contactId } = body;

      if (
        !leadTypeId ||
        !contactId ||
        !mongoose.Types.ObjectId.isValid(leadTypeId) ||
        !mongoose.Types.ObjectId.isValid(contactId)
      ) {
        return NextResponse.json(
          { success: false, message: "Invalid contact or Lead Type." },
          { status: 400 }
        );
      }

      const leadType = await LeadType.findOne({
        _id: leadTypeId,
        ...context.filter,
      });

      if (!leadType) {
        return NextResponse.json(
          { success: false, message: "Lead Type not found." },
          { status: 404 }
        );
      }

      if (!Array.isArray(leadType.contacts)) {
        leadType.contacts = [];
      }

      const contact = leadType.contacts.id(contactId);

      if (!contact) {
        return NextResponse.json(
          { success: false, message: "Contact not found." },
          { status: 404 }
        );
      }

      if (!canAccessContact(contact, context)) {
        return NextResponse.json(
          {
            success: false,
            message: "You cannot delete this contact.",
          },
          { status: 403 }
        );
      }

      contact.deleteOne();
      await leadType.save();

      return NextResponse.json({
        success: true,
        message: "Contact deleted successfully.",
      });
    }

    /* =====================================================
       MOVE CONTACT
    ===================================================== */

    if (body.action === "moveContact") {
      const leadTypeId =
        body.sourceLeadTypeId || body.leadTypeId;

      const { contactId, targetLeadTypeId } = body;

      if (
        !leadTypeId ||
        !contactId ||
        !targetLeadTypeId ||
        !mongoose.Types.ObjectId.isValid(leadTypeId) ||
        !mongoose.Types.ObjectId.isValid(contactId) ||
        !mongoose.Types.ObjectId.isValid(targetLeadTypeId)
      ) {
        return NextResponse.json(
          { success: false, message: "Invalid Lead Type or contact." },
          { status: 400 }
        );
      }

      if (String(leadTypeId) === String(targetLeadTypeId)) {
        return NextResponse.json(
          {
            success: false,
            message: "Contact is already in this stage.",
          },
          { status: 400 }
        );
      }

      const source = await LeadType.findOne({
        _id: leadTypeId,
        ...context.filter,
      });

      const target = await LeadType.findOne({
        _id: targetLeadTypeId,
        ...context.filter,
      });

      if (!source || !target) {
        return NextResponse.json(
          {
            success: false,
            message: "Source or target Lead Type not found.",
          },
          { status: 404 }
        );
      }

      if (!Array.isArray(source.contacts)) source.contacts = [];
      if (!Array.isArray(target.contacts)) target.contacts = [];

      const contact = source.contacts.id(contactId);

      if (!contact) {
        return NextResponse.json(
          { success: false, message: "Contact not found." },
          { status: 404 }
        );
      }

      if (!canAccessContact(contact, context)) {
        return NextResponse.json(
          {
            success: false,
            message: "You cannot move this contact.",
          },
          { status: 403 }
        );
      }

      const duplicate = target.contacts.some(
        (item: any) =>
          normalizePhone(item.phone) ===
          normalizePhone(contact.phone)
      );

      if (duplicate) {
        return NextResponse.json(
          {
            success: false,
            message:
              "This contact already exists in the target stage.",
          },
          { status: 409 }
        );
      }

      target.contacts.push({
        name: contact.name,
        phone: contact.phone,
        notes: contact.notes || "",
        source: contact.source || "WhatsApp",
        customSource: contact.customSource || "",
        assignedTo: contact.assignedTo || context.user._id,
      } as any);

      await target.save();

      try {
        contact.deleteOne();
        await source.save();
      } catch (sourceError) {
        const addedContact =
          target.contacts[target.contacts.length - 1];

        if (addedContact) {
          addedContact.deleteOne();
          await target.save();
        }

        throw sourceError;
      }

      return NextResponse.json({
        success: true,
        message: "Contact moved successfully.",
      });
    }

    /* =====================================================
       GENERAL LEAD TYPE UPDATE
       Accepts id, leadTypeId, or sourceLeadTypeId.
    ===================================================== */

    const id =
      body.id ||
      body.leadTypeId ||
      body.sourceLeadTypeId;

    const { name, keywords, keywordMatchMode } = body;

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, message: "Invalid Lead Type ID." },
        { status: 400 }
      );
    }

    const leadType = await LeadType.findOne({
      _id: id,
      ...context.filter,
    });

    if (!leadType) {
      return NextResponse.json(
        { success: false, message: "Lead Type not found." },
        { status: 404 }
      );
    }

    if (name !== undefined) {
      const cleanName = String(name).trim();

      if (!cleanName) {
        return NextResponse.json(
          {
            success: false,
            message: "Lead Type name cannot be empty.",
          },
          { status: 400 }
        );
      }

      leadType.name = cleanName;
    }

    if (keywords !== undefined) {
      if (!Array.isArray(keywords)) {
        return NextResponse.json(
          { success: false, message: "Keywords must be an array." },
          { status: 400 }
        );
      }

      leadType.keywords = cleanKeywords(keywords);
    }

    if (keywordMatchMode !== undefined) {
      leadType.keywordMatchMode = normalizeKeywordMatchMode(
        keywordMatchMode
      );
    }

    await leadType.save();

    return NextResponse.json({
      success: true,
      message: "Lead Type updated successfully.",
      leadType: serializeLeadType(leadType),
    });
  } catch (error: any) {
    console.error("PATCH Lead Types Error:", error);

    return NextResponse.json(
      {
        success: false,
        message: error.message || "Failed to update Lead Type.",
      },
      { status: 500 }
    );
  }
}

/* =========================================================
   DELETE LEAD TYPE
========================================================= */

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

    const id = request.nextUrl.searchParams.get("id");

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return NextResponse.json(
        { success: false, message: "Invalid Lead Type ID." },
        { status: 400 }
      );
    }

    const deleted = await LeadType.findOneAndDelete({
      _id: id,
      ...context.filter,
    });

    if (!deleted) {
      return NextResponse.json(
        { success: false, message: "Lead Type not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Lead Type deleted successfully.",
    });
  } catch (error: any) {
    console.error("DELETE Lead Types Error:", error);

    return NextResponse.json(
      {
        success: false,
        message: error.message || "Failed to delete Lead Type.",
      },
      { status: 500 }
    );
  }
}
