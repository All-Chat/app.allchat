/* eslint-disable @typescript-eslint/no-explicit-any */
import SheetCampaign from "@/models/SheetCampaign";
import SheetSyncConfig from "@/models/SheetSyncConfig";
import SheetMessage from "@/models/SheetMessage";
import Message from "@/models/Message";

const normalizePhone = (p: string) => String(p || "").replace(/\D/g, "");

function isValidReply(msg: any): boolean {
  const text = (msg.text || "").trim();
  if (msg.messageType && ["image", "video", "audio", "document", "sticker", "location", "contacts", "interactive", "button"].includes(msg.messageType)) return true;
  if (!text) return false;
  if (/^\[.*\]$/.test(text)) return false; // Filter old junk like "[button]"
  return true;
}

export async function getSheetCampaignReportData(campaignId: string) {
  const campaign = await SheetCampaign.findById(campaignId);
  if (!campaign) return null;

  const sheetConfig = await SheetSyncConfig.findById(campaign.sheetConfigId);
  const sheetUrl = sheetConfig ? sheetConfig.sheetUrl : null;
  const additionalFields = sheetConfig ? sheetConfig.additionalFields : [];

  // 1. Fetch all OUTBOUND messages from SheetMessage
  const outboundMessages = await SheetMessage.find({
    userId: campaign.userId,
    campaignId: campaignId,
    direction: "out",
    isSheetCampaign: true
  }).sort({ createdAt: -1 }).lean();

  if (outboundMessages.length === 0) {
    return { 
      campaign: { ...campaign.toObject(), sheetUrl, additionalFields, reportSpreadsheetUrl: campaign.reportSpreadsheetUrl }, 
      messages: [] 
    };
  }

  // 2. Extract phone numbers (last 10 digits) to search for inbound replies
  const campaignPhonesList = outboundMessages
    .map((d: any) => normalizePhone(d.phone).slice(-10))
    .filter((p: string) => p.length >= 7);

  // 3. Fetch inbound messages from the last 24 hours (or since campaign creation)
  const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const campaignCreated = new Date(campaign.createdAt);
  const since = campaignCreated > twentyFourHoursAgo ? campaignCreated : twentyFourHoursAgo;

  const inboundMessages = await Message.find({
    userId: campaign.userId,
    direction: "in",
    createdAt: { $gte: since },
  }).sort({ createdAt: 1 }).lean();

  // 4. Group replies by phone (max 5)
  const repliesMap: Record<string, string[]> = {};
  for (const msg of inboundMessages) {
    const msgPhoneLast10 = normalizePhone(msg.phone).slice(-10);
    if (msgPhoneLast10 && campaignPhonesList.includes(msgPhoneLast10)) {
      if (!isValidReply(msg)) continue;
      if (!repliesMap[msgPhoneLast10]) repliesMap[msgPhoneLast10] = [];
      if (repliesMap[msgPhoneLast10].length < 5) {
        let displayText = (msg.text || "").trim();
        if (!displayText && msg.messageType && msg.messageType !== "text") displayText = `[${msg.messageType}]`;
        repliesMap[msgPhoneLast10].push(displayText);
      }
    }
  }

  // 5. Fetch webhook status updates (read, delivered) from Message collection
  const wamids = outboundMessages.map(m => m.whatsappMessageId).filter(Boolean);
  let webhookUpdates: any[] = [];
  try {
    webhookUpdates = await Message.find({ 
      userId: campaign.userId, 
      whatsappMessageId: { $in: wamids }, 
      direction: "out" 
    }).lean();
  } catch (e) {}

  const statusMap = new Map<string, string>();
  webhookUpdates.forEach((msg: any) => {
    if (msg.whatsappMessageId && msg.status) {
      const current = statusMap.get(msg.whatsappMessageId);
      const priority: any = ["sent", "delivered", "read"];
      if (!current || priority.indexOf(msg.status) > priority.indexOf(current)) {
        statusMap.set(msg.whatsappMessageId, msg.status);
      }
    }
  });

  // 6. Combine outbound messages with their aggregated replies and statuses
  const combinedMessages = outboundMessages.map(outMsg => {
    const p10 = normalizePhone(outMsg.phone).slice(-10);
    const replies = repliesMap[p10] || [];
    let finalStatus = outMsg.status;
    
    if (outMsg.whatsappMessageId && statusMap.has(outMsg.whatsappMessageId)) {
      finalStatus = statusMap.get(outMsg.whatsappMessageId);
    }
    
    const isReplied = replies.length > 0;
    if (isReplied) finalStatus = "replied";

    return {
      _id: outMsg._id,
      phone: outMsg.phone,
      name: outMsg.name || "",
      status: finalStatus,
      createdAt: outMsg.createdAt,
      replies: replies,
      isReplied: isReplied,
      additionalData: outMsg.additionalData || [],
    };
  });

  // 7. Sort by priority: Replied > Read > Delivered > Sent > Failed > Invalid > Duplicate
  const statusOrder = (status: string) => {
    const order: any = { "replied": 1, "read": 2, "delivered": 3, "sent": 4, "failed": 5, "invalid": 6, "duplicate": 7 };
    return order[status] || 99;
  };

  combinedMessages.sort((a, b) => {
    const orderA = statusOrder(a.status);
    const orderB = statusOrder(b.status);
    if (orderA !== orderB) return orderA - orderB;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  return { 
    campaign: { ...campaign.toObject(), sheetUrl, additionalFields, reportSpreadsheetUrl: campaign.reportSpreadsheetUrl }, 
    messages: combinedMessages 
  };
}
