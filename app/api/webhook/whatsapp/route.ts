/* eslint-disable prefer-const */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { connectDB } from "@/lib/mongodb";
import Message from "@/models/Message";
import Campaign from "@/models/Campaign";
import Workflow from "@/models/Workflow";
import User from "@/models/User";
import Session from "@/models/Session";
import Contact from "@/models/Contact";
import Tag from "@/models/Tag";
import OptNumber from "@/models/OptNumber";
import Form from "@/models/Form";
import FormResponse from "@/models/FormResponse";
import { sendWhatsAppMessage } from "@/lib/sendWhatsApp";
import { getPriceForCategory } from "@/lib/billing";
import { syncCampaignToGoogleSheet, syncTestMessageToGoogleSheet } from "@/lib/googleSheetSync";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const VERIFY_TOKEN = "my_secret_token";

const workflowTimers = new Map<string, NodeJS.Timeout>();
const clearWorkflowTimer = (phone: string) => { const t = workflowTimers.get(phone); if (t) { clearInterval(t); workflowTimers.delete(phone); } };

const startWorkflowInactivityTimer = (phone: string, userId: string, workflowId: string, ou: any) => {
  clearWorkflowTimer(phone);
  (async () => {
    try {
      await connectDB();
      const wf = await Workflow.findById(workflowId); if (!wf?.steps) return;
      const n = Object.values(wf.steps).find((s: any) => s.stepType === "inactivity_node") as any; if (!n) return;
      let s = 0;
      const tid = setInterval(async () => {
        try { const ses = await Session.findOne({ phone, userId }); if (!ses || ses.formId) { clearInterval(tid); return; } if (s < (n.repeatCount || 1)) { await sendWhatsAppMessage(phone, { message: n.message || "Are you still there?", stepType: "text" }, ou?.whatsappPhoneNumberId, ou?.whatsappAccessToken); s++; } else clearInterval(tid); } catch { clearInterval(tid); }
      }, (n.delaySeconds || 30) * 1000);
      workflowTimers.set(phone, tid);
    } catch {}
  })();
};

const startFormInactivityTimer = (phone: string, userId: string, fid: string, fi: number, f: any, form: any, ou: any) => {
  if (f.delaySeconds > 0 && f.repeatCount > 0 && f.delayMessage) {
    let s = 0;
    const iid = setInterval(async () => {
      try {
        await connectDB(); const cs = await Session.findOne({ phone, userId });
        if (!cs || !cs.formId || cs.formFieldIndex !== fi) { clearInterval(iid); return; }
        if (s < f.repeatCount) { await sendWhatsAppMessage(phone, { message: f.delayMessage, stepType: "text" }, ou?.whatsappPhoneNumberId, ou?.whatsappAccessToken); s++; }
        else { clearInterval(iid); await sendWhatsAppMessage(phone, { message: form.abandonmentMessage || "Paused.", stepType: "message", buttons: [{ id: `restart_form_${fid}`, label: "🔄 Restart", nextStepId: null }] }, ou?.whatsappPhoneNumberId, ou?.whatsappAccessToken); cs.formId = null; cs.formFieldIndex = 0; await cs.save(); await FormResponse.updateOne({ formId: fid, phone, status: "incomplete" }, { $set: { status: "abandoned" } }); }
      } catch { clearInterval(iid); }
    }, f.delaySeconds * 1000);
  }
};

export async function GET(req: Request) {
  try {
    const u = new URL(req.url); const m = u.searchParams.get("hub.mode"); const t = u.searchParams.get("hub.verify_token"); const c = u.searchParams.get("hub.challenge");
    if (!m && !t && !c) return new Response("Webhook Live ✅", { status: 200, headers: { "Content-Type": "text/plain" } });
    if (m === "subscribe" && t === VERIFY_TOKEN) return new Response(c || "", { status: 200, headers: { "Content-Type": "text/plain" } });
    return new Response("Forbidden", { status: 403 });
  } catch { return new Response("Error", { status: 500 }); }
}

/* ============================================================================
   ✅ ARRAY-FIRST CREDENTIAL RESOLUTION
   Searches whatsappNumbers[] FIRST, top-level LAST.
   This fixes TRL (only in array) and TataMotors (in both).
   ============================================================================ */
async function findUserAndCredentials(metaPhoneId: string) {
  if (!metaPhoneId) return null;

  // STEP 1: Search inside whatsappNumbers array FIRST
  const arrayUser = await User.findOne({
    "whatsappNumbers.whatsappPhoneNumberId": metaPhoneId
  }).lean();

  if (arrayUser && Array.isArray(arrayUser.whatsappNumbers)) {
    const matched = arrayUser.whatsappNumbers.find(
      (n: any) => n.whatsappPhoneNumberId === metaPhoneId
    );
    if (matched) {
      console.log(`✅ WEBHOOK: Found "${matched.name}" (${metaPhoneId}) in array`);
      return {
        userId: arrayUser._id.toString(),
        whatsappPhoneNumberId: matched.whatsappPhoneNumberId,
        whatsappAccessToken: matched.whatsappAccessToken || arrayUser.whatsappAccessToken,
      };
    }
  }

  // STEP 2: Fall back to top-level ONLY if array search failed
  const topLevelUser = await User.findOne({ whatsappPhoneNumberId: metaPhoneId }).lean();
  if (topLevelUser) {
    console.log(`✅ WEBHOOK: Found ${metaPhoneId} at top-level`);
    return {
      userId: topLevelUser._id.toString(),
      whatsappPhoneNumberId: topLevelUser.whatsappPhoneNumberId,
      whatsappAccessToken: topLevelUser.whatsappAccessToken,
    };
  }

  return null;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const value = body?.entry?.[0]?.changes?.[0]?.value;
    if (!value) return NextResponse.json({ success: true });
    await connectDB();

    const metaPhoneId = value?.metadata?.phone_number_id;
    let userId: string | null = null;
    let ownerUser: any = null;

    if (metaPhoneId) {
      const match = await findUserAndCredentials(metaPhoneId);
      if (match) {
        userId = match.userId;
        ownerUser = { _id: userId, whatsappPhoneNumberId: match.whatsappPhoneNumberId, whatsappAccessToken: match.whatsappAccessToken };
      }
    }
    if (!userId) {
      ownerUser = await User.findOne().sort({ _id: -1 }).lean();
      if (ownerUser) userId = ownerUser._id.toString();
    }

    /* --- STATUSES --- */
    if (value.statuses?.length > 0) {
      try {
        const su = value.statuses[0]; const wamid = su.id; let sp = su.recipient_id; const ns = su.status;
        const ec = su.errors?.[0]?.code; const esc = su.errors?.[0]?.error_subcode; const ed = String(su.errors?.[0]?.error_data?.details || "").toLowerCase();
        if (sp?.startsWith("whatsapp:")) sp = sp.replace("whatsapp:", ""); sp = (sp || "").replace(/\+/g, "");
        if (wamid && sp && ns) {
          const cq: any = { "reportData.sentWamid": wamid, status: { $in: ["running", "paused", "completed"] } }; if (userId) cq.userId = userId;
          for (const camp of await Campaign.find(cq)) {
            if (!camp.reportData) continue; const ri = camp.reportData.findIndex((r: any) => r.sentWamid === wamid); if (ri === -1) continue;
            const ci = camp.reportData[ri]; let fs = ns;
            if (ns === "failed" || ns === "undelivered") { fs = (ec === 1005 || ec === 1001 || ec === 1006 || esc === 1005 || esc === 1001 || ed.includes("not registered") || ed.includes("invalid")) ? "invalid" : "failed"; }
            const sp2: any = { read: 5, delivered: 4, sent: 3, invalid: 2, failed: 1, pending: 0 };
            if ((sp2[fs] || 0) > (sp2[ci.status] || 0)) {
              let ba = 0; const cost = ownerUser ? getPriceForCategory(ownerUser, camp.templateCategory || "MARKETING") : 0;
              if ((fs === "failed" || fs === "invalid") && ci.charged) { ba += cost; ci.charged = false; camp.totalDeducted = Math.max(0, (camp.totalDeducted || 0) - cost); }
              ci.status = fs; camp.markModified("reportData"); await camp.save();
              if (ba !== 0 && userId) await User.findByIdAndUpdate(userId, { $inc: { balance: ba } });
            }
          }
          if (userId) { try { await syncTestMessageToGoogleSheet(userId, { phone: sp, status: ns }, false); } catch {} }
        }
      } catch (e) { console.error("⚠️ Status Err:", e); }
      return NextResponse.json({ success: true });
    }

    /* --- INBOUND --- */
    if (!value?.messages?.length) return NextResponse.json({ success: true });
    const msg = value.messages[0];
    let rp = msg.from; if (rp?.startsWith("whatsapp:")) rp = rp.replace("whatsapp:", "");
    const phone = (rp || "").replace(/\+/g, ""); clearWorkflowTimer(phone);
    const cName = value.contacts?.[0]?.profile?.name || "Unknown";
    let lt = "", tts = "", bid: string | null = null, mt = "text", mid = null, ibr = false;
    if (msg.type === "text") { lt = msg.text?.body?.toLowerCase().trim() || ""; tts = msg.text.body.trim(); }
    else if (msg.type === "interactive") { const b = msg.interactive?.button_reply || msg.interactive?.list_reply; tts = b?.title?.trim() || b?.id?.trim() || ""; lt = tts.toLowerCase(); bid = b?.id || null; ibr = true; }
    else if (msg.type === "button") { tts = msg.button?.text?.trim() || msg.button?.payload?.trim() || ""; lt = tts.toLowerCase(); bid = msg.button?.payload || null; ibr = true; }
    else if (["image", "video", "document", "audio", "sticker"].includes(msg.type)) { mt = msg.type; mid = msg[msg.type]?.id || null; tts = msg[msg.type]?.caption || ""; lt = tts.toLowerCase().trim(); if (msg.type === "document") tts = msg[msg.type]?.filename || "Document.pdf"; }
    if (!tts && !bid && !mid) return NextResponse.json({ success: true });

    await Message.create({ userId, phone, text: tts, direction: "in", messageType: mt, mediaUrl: mid, whatsappMessageId: msg.id || null, contactName: cName, whatsappPhoneNumberId: metaPhoneId || null });

    /* --- FORMS --- */
    const as = await Session.findOne({ phone, userId });
    if (as?.formId) {
      try {
        const form = await Form.findById(as.formId); if (!form) { await Session.deleteOne({ _id: as._id }); return NextResponse.json({ success: true }); }
        const cf = form.fields[as.formFieldIndex];
        await FormResponse.findOneAndUpdate({ formId: form._id, phone, status: "incomplete" }, { $set: { [`data.${cf.label}`]: tts } }, { upsert: true, new: true });
        const ni = as.formFieldIndex + 1;
        if (ni < form.fields.length) { as.formFieldIndex = ni; await as.save(); await sendWhatsAppMessage(phone, { message: form.fields[ni].label, stepType: "text" }, ownerUser?.whatsappPhoneNumberId, ownerUser?.whatsappAccessToken); startFormInactivityTimer(phone, userId!, form._id.toString(), ni, form.fields[ni], form, ownerUser); }
        else { await FormResponse.updateOne({ formId: form._id, phone, status: "incomplete" }, { $set: { status: "complete" } }); as.formId = null; as.formFieldIndex = 0; await as.save(); const cm = form.completionMessage || "✅ Done."; await Message.create({ userId, phone, text: cm, direction: "out", messageType: "text", whatsappPhoneNumberId: metaPhoneId || null }); await sendWhatsAppMessage(phone, { message: cm, stepType: "text" }, ownerUser?.whatsappPhoneNumberId, ownerUser?.whatsappAccessToken); }
        return NextResponse.json({ success: true });
      } catch { return NextResponse.json({ success: true }); }
    }

    /* --- CAMPAIGNS --- */
    if (tts) {
      try {
        const cid = msg?.context?.id || null;
        const tc: any[] = [];

        if (cid) {
          const q: any = { "reportData.sentWamid": cid, status: { $in: ["running", "completed"] } };
          if (userId) q.userId = userId;
          const c = await Campaign.findOne(q);
          if (c) tc.push(c);
        }

        if (!tc.length) {
          const q: any = { "reportData.phone": phone, status: { $in: ["running", "completed"] } };
          if (userId) q.userId = userId;
          const c = await Campaign.findOne(q).sort({ createdAt: -1 });
          if (c) tc.push(c);
        }

        const ut: any[] = userId ? await Tag.find({ userId }).select("name isCampaignSpecific campaignId") : [];

        for (const camp of tc) {
          if (!camp.reportData) continue;

          let ri = cid
            ? camp.reportData.findIndex((r: any) => r.sentWamid === cid)
            : -1;
          if (ri === -1) {
            ri = camp.reportData.findIndex((r: any) => r.phone === phone);
          }

          if (ri === -1) continue;

          const cr = camp.reportData[ri].replies || [];
          if (cr.length < 5) {
            cr.push(tts);
            camp.reportData[ri].replies = cr;
            camp.reportData[ri].status = "read";

            const ct = camp.reportData[ri].tags || [];
            const dt: string[] = [];

            for (const t of ut) {
              const tl = t.name.toLowerCase();
              if (!tl || !lt.includes(tl)) continue;
              if (t.isCampaignSpecific) {
                if (t.campaignId?.toString() === camp._id.toString()) {
                  dt.push(t.name);
                }
              } else {
                dt.push(t.name);
              }
            }

            if (dt.length) {
              for (const d of dt) {
                if (!ct.includes(d)) ct.push(d);
              }
              camp.reportData[ri].tags = ct;
            }

            camp.markModified("reportData");
            await camp.save();

            if (dt.length && userId) {
              for (const d of dt) {
                await Tag.findOneAndUpdate(
                  { userId, name: d },
                  { $setOnInsert: { userId, name: d } },
                  { upsert: true }
                );
                await Contact.findOneAndUpdate(
                  { userId, phone },
                  { $setOnInsert: { userId, phone, name: cName }, $addToSet: { tags: d } },
                  { upsert: true }
                );
              }
            }
          }
        }

        if (userId) {
          try {
            await syncTestMessageToGoogleSheet(userId, { phone, status: "read", reply: tts }, false);
          } catch {}
        }
      } catch (e) {
        console.error("⚠️ Report Err:", e);
      }
    }

    /* --- WORKFLOWS --- */
    if (mt === "text" || ibr) {
      try {
        if (ibr && bid?.startsWith("restart_form_")) {
          const fd = await Form.findById(bid.replace("restart_form_", ""));
          if (fd?.fields?.length) { await Session.findOneAndUpdate({ phone, userId }, { formId: fd._id, formFieldIndex: 0, updatedAt: new Date() }, { upsert: true, new: true }); await FormResponse.create({ formId: fd._id, userId, phone, data: {}, status: "incomplete" }); const tm = `*${fd.name}*\n\n${fd.fields[0].label}`; await Message.create({ userId, phone, text: tm, direction: "out", messageType: "text", whatsappPhoneNumberId: metaPhoneId || null }); await sendWhatsAppMessage(phone, { message: tm, stepType: "text" }, ownerUser?.whatsappPhoneNumberId, ownerUser?.whatsappAccessToken); startFormInactivityTimer(phone, userId!, fd._id.toString(), 0, fd.fields[0], fd, ownerUser); return NextResponse.json({ success: true }); }
        }
        if (ibr && userId) {
          const ses = as || await Session.findOne({ phone, userId });
          if (ses) {
            const wf = await Workflow.findById(ses.workflowId);
            if (wf?.active && wf.steps) {
              let cb = null; for (const sid in wf.steps) { const s = wf.steps[sid]; const b = s.buttons?.find((b: any) => b.id === bid || b.label?.toLowerCase() === lt); if (b) { cb = b; break; } }
              if (cb) {
                if (cb.optInNodeId) { try { if (!(await OptNumber.findOne({ userId, phoneNumber: phone }))) await OptNumber.create({ userId, phoneNumber: phone }); } catch {} }
                if (cb.nextStepId) {
                  let ns = wf.steps[cb.nextStepId]; while (ns?.stepType === "delay_node") { if (ns.delaySeconds > 0) await new Promise(r => setTimeout(r, ns.delaySeconds * 1000)); ns = ns.nextStepId ? wf.steps[ns.nextStepId] : null; }
                  if (ns) {
                    if (ns.stepType === "form_node" && ns.selectedForm) { const fd = await Form.findById(ns.selectedForm); if (fd?.fields?.length) { ses.formId = fd._id; ses.formFieldIndex = 0; await ses.save(); await FormResponse.create({ formId: fd._id, userId, phone, data: {}, status: "incomplete" }); const tm = `*${fd.name}*\n\n${fd.fields[0].label}`; await Message.create({ userId, phone, text: tm, direction: "out", messageType: "text", whatsappPhoneNumberId: metaPhoneId || null }); await sendWhatsAppMessage(phone, { message: tm, stepType: "text" }, ownerUser?.whatsappPhoneNumberId, ownerUser?.whatsappAccessToken); startFormInactivityTimer(phone, userId!, fd._id.toString(), 0, fd.fields[0], fd, ownerUser); return NextResponse.json({ success: true }); } }
                    ses.currentStepId = ns.id; await ses.save(); await sendWhatsAppMessage(phone, ns, ownerUser?.whatsappPhoneNumberId, ownerUser?.whatsappAccessToken); await Message.create({ userId, phone, text: ns.message || `[${ns.stepType?.toUpperCase()}]`, direction: "out", messageType: "text", whatsappPhoneNumberId: metaPhoneId || null }); if (ns.buttons?.length) startWorkflowInactivityTimer(phone, userId!, wf._id.toString(), ownerUser); return NextResponse.json({ success: true });
                  } else { await Session.deleteOne({ _id: ses._id }); return NextResponse.json({ success: true }); }
                } else { await Session.deleteOne({ _id: ses._id }); return NextResponse.json({ success: true }); }
              } else { await Session.deleteOne({ _id: ses._id }); return NextResponse.json({ success: true }); }
            } else await Session.deleteOne({ _id: ses._id });
          }
        }
        const wq: any = { active: true }; if (userId) wq.userId = userId;
        const wfs = await Workflow.find(wq); let msid: string | null = null, mw: any = null; const ctx = ibr ? tts || "" : lt;
        for (const w of wfs) { if (w.triggers?.some((t: any) => { const tk = t.keyword.toLowerCase().trim(); if (tk === "*") return true; const m = t.matchMode || "contains"; return m === "exact" ? ctx === tk : ctx.includes(tk); })) { mw = w; msid = w.rootStepId; break; } }
        if (mw && msid) {
          let st = mw.steps?.[msid]; while (st?.stepType === "delay_node") { if (st.delaySeconds > 0) await new Promise(r => setTimeout(r, st.delaySeconds * 1000)); st = st.nextStepId ? mw.steps[st.nextStepId] : null; }
          if (st?.message || st?.stepType === "template" || st?.stepType === "url_action" || st?.stepType === "call_action" || st?.stepType === "form_node") {
            if (st.stepType === "form_node" && st.selectedForm) { const fd = await Form.findById(st.selectedForm); if (fd?.fields?.length) { await Session.findOneAndUpdate({ phone, userId }, { formId: fd._id, formFieldIndex: 0, workflowId: mw._id, currentStepId: st.id, updatedAt: new Date() }, { upsert: true, new: true }); await FormResponse.create({ formId: fd._id, userId, phone, data: {}, status: "incomplete" }); const tm = `*${fd.name}*\n\n${fd.fields[0].label}`; await Message.create({ userId, phone, text: tm, direction: "out", messageType: "text", whatsappPhoneNumberId: metaPhoneId || null }); await sendWhatsAppMessage(phone, { message: tm, stepType: "text" }, ownerUser?.whatsappPhoneNumberId, ownerUser?.whatsappAccessToken); startFormInactivityTimer(phone, userId!, fd._id.toString(), 0, fd.fields[0], fd, ownerUser); return NextResponse.json({ success: true }); } }
            await sendWhatsAppMessage(phone, st, ownerUser?.whatsappPhoneNumberId, ownerUser?.whatsappAccessToken); await Message.create({ userId, phone, text: st.message || `[${st.stepType?.toUpperCase()}]`, direction: "out", messageType: "text", whatsappPhoneNumberId: metaPhoneId || null }); await Session.findOneAndUpdate({ phone, userId }, { workflowId: mw._id, currentStepId: st.id, updatedAt: new Date() }, { upsert: true, new: true }); if (st.buttons?.length) startWorkflowInactivityTimer(phone, userId!, mw._id.toString(), ownerUser);
          }
        }
      } catch (e) { console.error("⚠️ WF Err:", e); }
    }
    return NextResponse.json({ success: true });
  } catch (error: any) { console.error("❌ CRASH:", error); return NextResponse.json({ success: false, error: error.message }, { status: 500 }); }
}
