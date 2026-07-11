/* eslint-disable @typescript-eslint/no-explicit-any */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    console.log("🚀 [Background Worker] Initialized...");

    // ✅ START BULLMQ WORKER FOR STANDARD CAMPAIGNS
    await import("@/lib/queue");

    const getMs = (value: number, unit: string) => {
      if (unit === "seconds") return value * 1000;
      if (unit === "minutes") return value * 60 * 1000;
      if (unit === "hours") return value * 60 * 60 * 1000;
      return 5000;
    };

    const normalizePhone = (p: string) => String(p || "").replace(/\D/g, "");

    // ==========================================
    // ✅ 1. PROCESS SHEET SYNC CONFIGS (Manager Page Auto-Fetcher)
    // ==========================================
    const processSheetSync = async (config: any) => {
      try {
        const intervalMs = getMs(config.intervalValue, config.intervalUnit);
        const lastSynced = config.lastSynced ? new Date(config.lastSynced) : new Date(0);
        const diffMs = Date.now() - lastSynced.getTime();

        if (diffMs < intervalMs) return;

        console.log(`[Worker] Auto-fetching sheet data for: ${config.name || config._id}`);

        const match = config.sheetUrl.match(/\/d\/(.*?)(\/|$)/);
        if (!match || !match[1]) throw new Error("Invalid Sheet URL");
        
        const csvUrl = `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv`;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        
        const response = await fetch(csvUrl, { signal: controller.signal });
        clearTimeout(timeoutId);
        
        if (!response.ok) throw new Error(`Google responded with ${response.status}`);

        const text = await response.text();
        const lines = text.split(/\r?\n/).filter(line => line.trim() !== "");
        const rows = lines.slice(1).filter(row => row.trim() !== "");

        console.log(`[Worker] Successfully fetched ${rows.length} rows for: ${config.name}`);

        config.lastSynced = new Date();
        config.lastRunStatus = `Success (${rows.length} rows)`;
        await config.save();

      } catch (error: any) {
        console.error(`[Worker] Error auto-fetching sheet ${config._id}:`, error.message);
        try {
          config.lastSynced = new Date();
          config.lastRunStatus = `Error: ${error.message.substring(0, 50)}`;
          await config.save();
        } catch (e) {}
      }
    };

    // ==========================================
    // ✅ 2. PROCESS SHEET CAMPAIGNS (Send Messages & Update Google Sheet)
    // ==========================================
    const processCampaign = async (campaign: any) => {
      try {
        const mongoose = (await import("mongoose")).default;
        const SheetSyncConfig = (await import("@/models/SheetSyncConfig")).default;
        const User = (await import("@/models/User")).default;
        const SheetMessage = (await import("@/models/SheetMessage")).default;
        const Message = (await import("@/models/Message")).default;
        const { getPriceForCategory } = await import("@/lib/billing");
        const { syncSheetCampaignToGoogleSheet } = await import("@/lib/sheet-sync-oauth");
        const { getSheetCampaignReportData } = await import("@/lib/sheet-report-utils");

        // ✅ Inline Transaction Model for logging deductions
        const TransactionSchema = new mongoose.Schema({
          userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
          type: String,
          amount: Number,
          description: String,
          status: String,
          createdAt: { type: Date, default: Date.now },
          metadata: Object
        });
        const Transaction = mongoose.models.Transaction || mongoose.model('Transaction', TransactionSchema);

        const config = await SheetSyncConfig.findById(campaign.sheetConfigId);
        if (!config) {
          campaign.status = "failed";
          await campaign.save();
          return;
        }

        const intervalMs = getMs(config.intervalValue, config.intervalUnit);
        const lastSynced = campaign.lastSynced ? new Date(campaign.lastSynced) : new Date(0);
        const diffMs = Date.now() - lastSynced.getTime();

        if (diffMs < intervalMs) return;

        console.log(`[Worker] Processing campaign: ${campaign.name}`);

        const user = await User.findById(campaign.userId);
        if (!user) return;
        let payer = user;
        if (user.parentTenantId) {
          const parent = await User.findOne({ tenantId: user.parentTenantId });
          if (parent) payer = parent;
        }

        let PHONE_NUMBER_ID = payer.whatsappPhoneNumberId || process.env.WHATSAPP_PHONE_NUMBER_ID || "";
        let ACCESS_TOKEN = payer.whatsappAccessToken || process.env.META_ACCESS_TOKEN || "";
        if (payer.whatsappNumbers?.length > 0) {
          const active = payer.whatsappNumbers.find((n: any) => n.isActive) || payer.whatsappNumbers[0];
          PHONE_NUMBER_ID = active.whatsappPhoneNumberId || PHONE_NUMBER_ID;
          ACCESS_TOKEN = active.whatsappAccessToken || ACCESS_TOKEN;
        }

        if (!PHONE_NUMBER_ID || !ACCESS_TOKEN) {
          campaign.status = "failed";
          await campaign.save();
          return;
        }

        const match = config.sheetUrl.match(/\/d\/(.*?)(\/|$)/);
        if (!match || !match[1]) return;
        const csvUrl = `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv`;
        const sheetRes = await fetch(csvUrl);
        if (!sheetRes.ok) return;

        const text = await sheetRes.text();
        const lines = text.split(/\r?\n/).filter((line: string) => line.trim() !== "");
        if (lines.length < 2) return;

        const parseLine = (line: string) => {
          const cells: string[] = [];
          let curCell = "";
          let inQuotes = false;
          for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') inQuotes = !inQuotes;
            else if (char === ',' && !inQuotes) {
              cells.push(curCell.trim().replace(/^"|"$/g, ""));
              curCell = "";
            } else curCell += char;
          }
          cells.push(curCell.trim().replace(/^"|"$/g, ""));
          return cells;
        };

        const headers = parseLine(lines[0]);
        const phoneIdx = headers.indexOf(config.numberField);
        const nameIdx = headers.indexOf(config.nameField);
        const varIndices = (campaign.variableMappings || []).map((map: string) => map && map !== "skip" ? headers.indexOf(map) : -1);
        const additionalFieldNames = config.additionalFields || [];
        const additionalIndices = additionalFieldNames.map((f: string) => headers.indexOf(f));

        const existingLogs = await SheetMessage.find({
          userId: campaign.userId,
          campaignId: campaign._id.toString(),
          isSheetCampaign: true
        }).select("phone status").lean();
        
        const processedPhones = new Map<string, string>();
        existingLogs.forEach((log: any) => {
          if (!processedPhones.has(log.phone)) processedPhones.set(log.phone, log.status);
        });

        const messagePrice = getPriceForCategory(payer, campaign.templateCategory);
        let totalDeducted = 0;
        let newSentCount = 0;
        let newFailedCount = 0;

        for (let i = 1; i < lines.length; i++) {
          const row = parseLine(lines[i]);
          let phone = (row[phoneIdx] || "").replace(/[^\d+]/g, "");
          if (phone.startsWith("+")) phone = phone.substring(1);
          const name = nameIdx !== -1 ? (row[nameIdx] || "") : "";
          const additionalData = additionalIndices.map((idx: number) => idx !== -1 ? (row[idx] || "") : "");

          if (phone.length < 7) {
            if (!processedPhones.has(phone)) {
              await SheetMessage.create({
                userId: campaign.userId, campaignId: campaign._id.toString(), phone, name, text: "Invalid number skipped", direction: "out", 
                status: "invalid", templateName: campaign.templateName, templateLanguage: campaign.languageCode, 
                whatsappPhoneNumberId: PHONE_NUMBER_ID, isSheetCampaign: true, additionalData
              });
              processedPhones.set(phone, "invalid");
              campaign.failedCount++;
              newFailedCount++;
            }
            continue;
          }

          if (processedPhones.has(phone)) {
            if (processedPhones.get(phone) !== "duplicate" && processedPhones.get(phone) !== "invalid") {
               // Already sent successfully previously, do nothing.
            } else if (processedPhones.get(phone) !== "duplicate") {
               await SheetMessage.create({
                 userId: campaign.userId, campaignId: campaign._id.toString(), phone, name, text: "Duplicate number skipped", direction: "out", 
                 status: "duplicate", templateName: campaign.templateName, templateLanguage: campaign.languageCode, 
                 whatsappPhoneNumberId: PHONE_NUMBER_ID, isSheetCampaign: true, additionalData
               });
               processedPhones.set(phone, "duplicate");
            }
            continue;
          }

          processedPhones.set(phone, "sent");

          if (messagePrice > 0 && (payer.balance || 0) < messagePrice) {
            campaign.status = "failed";
            break; 
          }

          const variables = varIndices.map((idx: number) => idx !== -1 ? (row[idx] || "") : "");
          const components: any[] = [];

          if (campaign.mediaUrl && ["image", "video", "document"].includes(campaign.mediaType)) {
            const param: any = { type: campaign.mediaType };
            if (campaign.mediaType === "image") param.image = { id: campaign.mediaUrl };
            else if (campaign.mediaType === "video") param.video = { id: campaign.mediaUrl };
            else if (campaign.mediaType === "document") param.document = { id: campaign.mediaUrl, filename: "document.pdf" };
            components.push({ type: "header", parameters: [param] });
          }
          if (variables.length > 0) {
            components.push({ type: "body", parameters: variables.map((v: string) => ({ type: "text", text: v })) });
          }

          const payload = {
            messaging_product: "whatsapp",
            to: phone,
            type: "template",
            template: { name: campaign.templateName, language: { code: campaign.languageCode }, components },
          };

          try {
            const res = await fetch(`https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`, {
              method: "POST",
              headers: { Authorization: `Bearer ${ACCESS_TOKEN}`, "Content-Type": "application/json" },
              body: JSON.stringify(payload),
            });
            const data = await res.json();
            const wamid = data?.messages?.[0]?.id;

            if (res.ok || wamid) {
              campaign.sentCount++;
              newSentCount++;
              if (messagePrice > 0) {
                payer.balance = Math.max(0, Math.round(((payer.balance || 0) - messagePrice) * 100) / 100);
                totalDeducted += messagePrice;
                campaign.totalDeducted += messagePrice;
              }

              await SheetMessage.create({
                userId: campaign.userId, campaignId: campaign._id.toString(), phone, name, text: `[Template: ${campaign.templateName}]`, direction: "out", 
                messageType: "template", mediaUrl: campaign.mediaUrl, whatsappMessageId: wamid, status: "sent", 
                templateName: campaign.templateName, templateLanguage: campaign.languageCode, whatsappPhoneNumberId: PHONE_NUMBER_ID,
                isSheetCampaign: true, additionalData
              });
            } else {
              campaign.failedCount++;
              newFailedCount++;
              await SheetMessage.create({
                userId: campaign.userId, campaignId: campaign._id.toString(), phone, name, text: "Failed to send", direction: "out", 
                status: "failed", templateName: campaign.templateName, templateLanguage: campaign.languageCode, 
                whatsappPhoneNumberId: PHONE_NUMBER_ID, isSheetCampaign: true, additionalData
              });
              processedPhones.set(phone, "failed");
            }
          } catch (err) {
            campaign.failedCount++;
            newFailedCount++;
            await SheetMessage.create({
              userId: campaign.userId, campaignId: campaign._id.toString(), phone, name, text: "API Error", direction: "out", 
              status: "failed", templateName: campaign.templateName, templateLanguage: campaign.languageCode, 
              whatsappPhoneNumberId: PHONE_NUMBER_ID, isSheetCampaign: true, additionalData
            });
            processedPhones.set(phone, "failed");
          }
        }

        if (totalDeducted > 0) await payer.save();
        campaign.lastSynced = new Date();
        campaign.totalMessages = campaign.sentCount + campaign.failedCount;
        await campaign.save();

        // ✅ LOG TRANSACTION FOR SHEET CAMPAIGN SPEND
        if (totalDeducted > 0) {
          try {
            await Transaction.create({
              userId: campaign.userId, // ✅ Log under the user who ran the campaign
              type: "campaign",
              amount: totalDeducted,
              description: `Sheet Campaign sent: ${campaign.templateName}`,
              status: "success",
              createdAt: new Date(),
              metadata: {
                campaignName: campaign.name,
                templateName: campaign.templateName,
                sentCount: newSentCount,
                failedCount: newFailedCount,
                sentBy: campaign.userId,
              },
            });
          } catch (txErr) {
            console.error("⚠️ Failed to log sheet campaign transaction:", txErr);
          }
        }

        // ==========================================
        // ✅ GOOGLE SHEET LIVE REPORT SYNC
        // ==========================================
        const reportData = await getSheetCampaignReportData(campaign._id.toString());

        if (reportData && reportData.messages.length > 0) {
          const { url: reportUrl, id: reportId } = await syncSheetCampaignToGoogleSheet(
            campaign.userId.toString(), 
            campaign, 
            reportData.messages, 
            reportData.campaign.additionalFields || []
          );

          if (reportUrl && reportId && (campaign.reportSpreadsheetUrl !== reportUrl)) {
            campaign.reportSpreadsheetUrl = reportUrl;
            campaign.reportSpreadsheetId = reportId;
            await campaign.save();
          }
        }

      } catch (error: any) {
        console.error(`[Worker] Error processing campaign ${campaign._id}:`, error.message);
      }
    };

    // ==========================================
    // ✅ MAIN LOOP
    // ==========================================
    const runWorker = async () => {
      try {
        const { connectDB } = await import("@/lib/mongodb");
        const SheetCampaign = (await import("@/models/SheetCampaign")).default;
        const SheetSyncConfig = (await import("@/models/SheetSyncConfig")).default;
        await connectDB();

        const activeSyncs = await SheetSyncConfig.find({ isSyncing: true });
        if (activeSyncs.length > 0) {
          await Promise.allSettled(activeSyncs.map(c => processSheetSync(c)));
        }

        const activeCampaigns = await SheetCampaign.find({ status: "running" });
        if (activeCampaigns.length > 0) {
          await Promise.allSettled(activeCampaigns.map(c => processCampaign(c)));
        }

      } catch (error) {
        console.error("[Background Worker] Loop error:", error);
      } finally {
        setTimeout(runWorker, 10000); 
      }
    };

    setTimeout(runWorker, 5000);
  }
}
