import type { Express, Request } from "express";
import { z } from "zod";
import type { Store } from "./store.js";
import { id } from "./store.js";
import type { Business, Customer, User } from "./models.js";
import { requireThat, normalizePhone } from "./domain.js";
import { writeRoutes } from "./write-routes.js";

export const campaignSchema = z.object({
  title: z.string().trim().min(2).max(120), channel: z.enum(["sms", "whatsapp"]),
  purpose: z.enum(["reminder", "event_update", "app_invite", "public_show", "offer", "announcement", "custom"]),
  message: z.string().trim().min(1).max(1600), audience: z.enum(["selected", "all"]),
  customerIds: z.array(z.string().max(80)).max(1000),
  plannedAt: z.union([z.literal(""), z.iso.datetime()]).default(""),
}).strict();
export type CampaignInput = z.infer<typeof campaignSchema>;
export interface Campaign extends CampaignInput {
  id: string; createdAt: string; createdBy: string; status: "draft" | "archived";
  recipients: { customerId: string; name: string; phone: string; markedSentAt?: string }[];
  exclusions: { doNotContact: number; noConsent: number; duplicatePhone: number; invalidPhone: number };
}
type StaffRequest = Request & { user: User; business: Business };
const marketing = (purpose: CampaignInput["purpose"]) => !["reminder", "event_update"].includes(purpose);
function owner(request: Request) {
  const req = request as StaffRequest;
  requireThat(["owner", "admin"].includes(req.user.role), "Messaging is controlled by the owner.", 403);
  return req;
}
export function campaignAudience(customers: Customer[], input: CampaignInput) {
  const chosen = input.audience === "all" ? customers : customers.filter(customer => input.customerIds.includes(customer.id));
  if (input.audience === "selected") requireThat(input.customerIds.every(key => customers.some(customer => customer.id === key)), "Choose customers from this business.");
  const exclusions = { doNotContact: 0, noConsent: 0, duplicatePhone: 0, invalidPhone: 0 };
  const phones = new Set<string>();
  const recipients: Campaign["recipients"] = [];
  for (const customer of chosen) {
    if (customer.doNotContact) { exclusions.doNotContact++; continue; }
    if (marketing(input.purpose) && !customer.offersConsent) { exclusions.noConsent++; continue; }
    const phone = normalizePhone(customer.phone);
    if (!/^\+?\d{7,16}$/.test(phone)) { exclusions.invalidPhone++; continue; }
    if (phones.has(phone)) { exclusions.duplicatePhone++; continue; }
    phones.add(phone); recipients.push({ customerId: customer.id, name: customer.name, phone: customer.phone });
  }
  return { recipients, exclusions };
}
export function messaging(app: Express, store: Store, origin: string) {
  const writes = writeRoutes(app, store);
  app.get("/api/manage/messaging", async (request, res) => {
    const req = owner(request);
    const customers = await store.all<Customer>(req.business.id, "customers");
    res.set("Cache-Control", "private, no-store").json({
      customers: customers.filter(customer => !customer.doNotContact).map(({ id, name, phone, offersConsent }) => ({ id, name, phone, offersConsent })),
      campaigns: (await store.all<Campaign>(req.business.id, "messageCampaigns")).filter(item => item.status !== "archived").reverse(),
      siteUrl: `/b/${req.business.slug}`,
      delivery: { automatedSms: false, automatedWhatsApp: false, mode: "manual" },
    });
  });
  writes.post("/api/manage/messaging/preview", async (request, res) => {
    const req = owner(request), input = campaignSchema.parse(req.body);
    res.json(campaignAudience(await store.all<Customer>(req.business.id, "customers"), input));
  });
  writes.post("/api/manage/messaging/drafts", async (request, res) => {
    const req = owner(request), input = campaignSchema.parse(req.body);
    const audience = campaignAudience(await store.all<Customer>(req.business.id, "customers"), input);
    requireThat(audience.recipients.length > 0, "No eligible customers. Review the audience and contact permissions.");
    const campaign: Campaign = { ...input, ...audience, id: id(), status: "draft", createdAt: new Date().toISOString(), createdBy: req.user.email };
    await store.put(req.business.id, "messageCampaigns", campaign);
    await store.audit(req.business.id, req.user.email, "messaging.draft-created", campaign.id, null, { title: campaign.title, channel: campaign.channel, recipients: campaign.recipients.length });
    res.json(campaign);
  });
  writes.post("/api/manage/messaging/:id/prepare/:customerId", async (request, res) => {
    const req = owner(request);
    const campaign = await store.get<Campaign>(req.business.id, "messageCampaigns", String(req.params.id));
    requireThat(campaign?.status === "draft", "Draft not found", 404);
    const customer = await store.get<Customer>(req.business.id, "customers", String(req.params.customerId));
    requireThat(customer && campaign.recipients.some(row => row.customerId === customer.id), "Recipient not found", 404);
    requireThat(!customer.doNotContact && (!marketing(campaign.purpose) || customer.offersConsent), "Contact permission changed. This customer cannot receive this message.", 409);
    requireThat(/^(\+|00)\d{7,16}$/.test(customer.phone.replace(/[\s().-]/g, "")), "Add an international phone number with a country code to this customer first.");
    const phone = customer.phone.replace(/\D/g, "").replace(/^00/, "");
    const text = campaign.message.replaceAll("{name}", customer.name).replaceAll("{company}", req.business.name).replaceAll("{app_link}", `${origin}/b/${req.business.slug}`);
    const url = campaign.channel === "whatsapp" ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}` : `sms:+${phone}?body=${encodeURIComponent(text)}`;
    await store.audit(req.business.id, req.user.email, "messaging.manual-message-prepared", campaign.id, null, { customerId: customer.id, channel: campaign.channel });
    res.json({ url, text, name: customer.name, channel: campaign.channel });
  });
  writes.post("/api/manage/messaging/:id/marked-sent/:customerId", async (request, res) => {
    const req = owner(request);
    const campaign = await store.get<Campaign>(req.business.id, "messageCampaigns", String(req.params.id));
    requireThat(campaign?.status === "draft", "Draft not found", 404);
    const recipient = campaign.recipients.find(row => row.customerId === req.params.customerId);
    requireThat(recipient, "Recipient not found", 404);
    if (!recipient.markedSentAt) {
      recipient.markedSentAt = new Date().toISOString();
      await store.put(req.business.id, "messageCampaigns", campaign);
      await store.audit(req.business.id, req.user.email, "messaging.marked-sent-manually", campaign.id, null, { customerId: recipient.customerId, channel: campaign.channel });
    }
    res.json(campaign);
  });
  writes.post("/api/manage/messaging/:id/archive", async (request, res) => {
    const req = owner(request);
    const campaign = await store.get<Campaign>(req.business.id, "messageCampaigns", String(req.params.id));
    requireThat(campaign, "Draft not found", 404);
    campaign.status = "archived";
    await store.put(req.business.id, "messageCampaigns", campaign);
    await store.audit(req.business.id, req.user.email, "messaging.draft-archived", campaign.id, null, { title: campaign.title });
    res.json(campaign);
  });
}
