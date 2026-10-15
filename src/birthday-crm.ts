import type { Express, Request } from "express";
import { DateTime } from "luxon";
import { z } from "zod";
import { hash } from "./auth.js";
import { requireThat, normalizePhone } from "./domain.js";
import type { Booking, Business, Customer } from "./models.js";
import type { Store } from "./store.js";
import { writeRoutes } from "./write-routes.js";
import { userCanStaffAction } from "./staff-permissions.js";

export const birthdaySettingsSchema = z.object({
  enabled: z.boolean().default(false),
  startDays: z.number().int().min(1).max(90).default(45),
  intervalDays: z.number().int().min(1).max(90).default(5),
  bundleEnabled: z.boolean().default(false),
  bundleName: z.string().trim().max(150).default(""),
  bundleDetails: z.string().trim().max(2000).default(""),
  reminderText: z.string().trim().min(1).max(3000).default("Hello {customer}, {child}'s birthday is coming up on {date}. Would you like help planning a celebration with {business}?"),
  bundleText: z.string().trim().min(1).max(3000).default("Hello {customer}, there is still time to celebrate {child}. Our birthday option: {bundle}. {details}"),
  revision: z.number().int().min(0).default(0),
}).refine(s => !s.bundleEnabled || !!(s.bundleName && s.bundleDetails), "Add the bundle name and its price/inclusions/conditions before enabling it.");
export const birthdayProfileSchema = z.object({
  enabled: z.boolean().default(false),
  intervalDays: z.number().int().min(1).max(90).default(5),
  nextReminderDate: z.union([z.literal(""), z.iso.date()]).default(""),
  // Separate, explicit permission for this birthday message programme.
  messageConsent: z.boolean().default(false),
  revision: z.number().int().min(0).default(0),
}).strict();
export type BirthdaySettings = z.infer<typeof birthdaySettingsSchema>;
export type BirthdayProfile = z.infer<typeof birthdayProfileSchema> & { id: string };
export interface BirthdayDraft {
  id: string; customerId: string; childKey: string; child: string;
  birthday: string; date: string; kind: "countdown" | "bundle";
  draft: string; status: "prepared" | "completed" | "suppressed";
  revision: number; createdAt: string; completedAt?: string; note?: string;
}
export interface BirthdayRow {
  childKey: string; child: string; birthday: string; status: string;
  nextDate: string; bookingIds: string[]; candidate?: BirthdayDraft;
}
export const birthdayChildKey = (child: Customer["children"][number]) => hash(`${child.name.trim().toLowerCase()}:${child.birthday}`);
const bookedStatuses = new Set(["accepted", "confirmed", "completed"]);

// An accepted birthday event near the date suppresses prompts conservatively.
// Display all matching bookings so staff can resolve ambiguous sibling records.
export function birthdayRows(business: Business, customer: Customer, bookings: Booking[], settings: BirthdaySettings, profile: BirthdayProfile, today: string): BirthdayRow[] {
  const now = DateTime.fromISO(today, { zone: business.timezone }).startOf("day");
  requireThat(now.isValid, "Invalid birthday planning date.");
  const rows: BirthdayRow[] = [], seen = new Set<string>();
  for (const child of customer.children) {
    const source = DateTime.fromISO(child.birthday, { zone: business.timezone });
    const childKey = birthdayChildKey(child);
    if (!source.isValid || source > now || seen.has(childKey)) continue;
    seen.add(childKey);
    const anniversaries = [now.year - 1, now.year, now.year + 1].map(year => {
      const first = DateTime.fromObject({ year, month: source.month, day: 1 }, { zone: business.timezone });
      return first.set({ day: Math.min(source.day, first.daysInMonth!) });
    });
    // Catch up a missed +10-day offer for up to 30 days, including New Year.
    const birthday = anniversaries.find(d => d.plus({ days: 30 }) >= now)!;
    const target = birthday.toISODate()!;
    const matching = bookings.filter(b => b.customerId === customer.id && bookedStatuses.has(b.status) && /birthday/i.test(b.occasion) && Math.abs(DateTime.fromISO(b.date, { zone: business.timezone }).diff(birthday, "days").days) <= 30);
    const start = birthday.minus({ days: settings.startDays });
    const bundleDue = birthday.plus({ days: 10 });
    const interval = profile.intervalDays;
    const slot = Math.max(0, Math.floor(now.diff(start, "days").days / interval));
    let due = start.plus({ days: slot * interval });
    let kind: BirthdayDraft["kind"] = "countdown";
    if (now > birthday) { due = bundleDue; kind = "bundle"; }
    if (profile.nextReminderDate) {
      const override = DateTime.fromISO(profile.nextReminderDate, { zone: business.timezone });
      if (override > due) due = override;
    }
    let status = !settings.enabled ? "Planner disabled" : !profile.enabled ? "Paused" : customer.doNotContact ? "Opted out" : !customer.offersConsent || !profile.messageConsent ? "Consent required" : matching.length ? "Booked — prompts stopped" : now < start ? "Scheduled" : now > birthday && !settings.bundleEnabled ? "Bundle disabled" : due > now ? "Scheduled" : "Ready for review";
    if (kind === "countdown" && due > birthday) status = "Scheduled";
    const values: Record<string, string> = { customer: customer.name, child: child.name, date: target, business: business.name, bundle: settings.bundleName, details: settings.bundleDetails };
    const candidate: BirthdayDraft = {
      // Slots remain stable if staff change an interval, avoiding duplicate dates.
      id: `birthday-${hash(`${customer.id}:${childKey}:${target}:${kind}:${kind === "bundle" ? "once" : due.toISODate()}`)}`,
      customerId: customer.id, childKey, child: child.name, birthday: target,
      date: due.toISODate()!, kind,
      draft: (kind === "bundle" ? settings.bundleText : settings.reminderText).replace(/\{(customer|child|date|business|bundle|details)\}/g, (_, k: string) => values[k]),
      status: "prepared", revision: 1, createdAt: new Date().toISOString(),
    };
    rows.push({ childKey, child: child.name, birthday: target, status, nextDate: ["Scheduled", "Ready for review"].includes(status) ? due.toISODate()! : "", bookingIds: matching.map(b => b.id), ...(status === "Ready for review" ? { candidate } : {}) });
  }
  return rows;
}

export async function birthdayContext(store: Store, business: Business, planningDate?: string) {
  const [saved, customers, bookings, profiles, history] = await Promise.all([
    store.get(business.id, "birthdaySettings", "settings"),
    store.all<Customer>(business.id, "customers"), store.all<Booking>(business.id, "bookings"),
    store.all<BirthdayProfile>(business.id, "birthdayProfiles"), store.all<BirthdayDraft>(business.id, "birthdayDrafts"),
  ]);
  const settings = birthdaySettingsSchema.parse(saved ?? {});
  const today = planningDate ?? DateTime.now().setZone(business.timezone).toISODate()!;
  const identities = new Set<string>();
  return { settings, today, customers: customers.map(customer => {
    const profile = profiles.find(p => p.id === customer.id) ?? { id: customer.id, ...birthdayProfileSchema.parse({ intervalDays: settings.intervalDays }) };
    const rows = birthdayRows(business, customer, bookings, settings, profile, today).map(row => {
      const identity = `${normalizePhone(customer.phone) || customer.id}:${row.childKey}:${row.birthday}`;
      if (identities.has(identity)) return { ...row, candidate: undefined, status: "Duplicate contact — review customer records" };
      identities.add(identity);
      const prior = history.find(d => d.id === row.candidate?.id);
      const latest = history.filter(d => d.customerId === customer.id && d.childKey === row.childKey && d.birthday === row.birthday && d.kind === "countdown" && d.status !== "suppressed").sort((a,b)=>b.date.localeCompare(a.date))[0];
      if (row.candidate?.kind === "countdown" && latest && latest.id !== row.candidate.id) {
        const next = DateTime.fromISO(latest.date, { zone: business.timezone }).plus({ days: profile.intervalDays });
        if (next.toISODate()! > today) return { ...row, candidate: undefined, status: "Scheduled", nextDate: next.toISODate()! };
      }
      if (!prior || prior.status === "prepared") return row;
      return { ...row, candidate: undefined, status: prior.kind === "bundle" ? "Bundle handled this year" : "Scheduled", nextDate: prior.kind === "bundle" ? "" : DateTime.fromISO(prior.date, { zone: business.timezone }).plus({ days: profile.intervalDays }).toISODate()! };
    });
    return { customer, profile, rows, bookings: bookings.filter(b => b.customerId === customer.id).map(({ id, name, date, status, occasion }) => ({ id, name, date, status, occasion })), history: history.filter(h => h.customerId === customer.id) };
  }), history };
}

export async function generateBirthdays(store: Store, business: Business, planningDate?: string) {
  return store.transaction(async () => {
    const context = await birthdayContext(store, business, planningDate);
    let added = 0, suppressed = 0;
    for (const item of context.customers) {
      const eligible = item.rows.flatMap(r => r.candidate ? [r.candidate] : []);
      // Reconcile stale drafts after pause, consent changes, booking or birthday edits.
      for (const old of item.history.filter(d => d.status === "prepared")) {
        if (!eligible.some(d => d.id === old.id)) {
          const next = { ...old, status: "suppressed", revision: old.revision + 1 };
          await store.put(business.id, "birthdayDrafts", next);
          await store.audit(business.id, "birthday planner", "birthday.suppressed", old.id, old, next);
          suppressed++;
        }
      }
      for (const draft of eligible) {
        // Never re-create a removed/completed/suppressed draft; history is the dedup ledger.
        if (await store.get(business.id, "birthdayDrafts", draft.id)) continue;
        // Do not stack several open prompts for the same child/cycle.
        await store.put(business.id, "birthdayDrafts", draft);
        await store.audit(business.id, "birthday planner", "birthday.prepared", draft.id, null, draft);
        added++;
      }
    }
    return { added, suppressed };
  });
}

export function birthdayCrm(app: Express, store: Store) {
  const writes = writeRoutes(app, store);
  const staff = (req: Request) => requireThat(userCanStaffAction(req.user, "followups") && userCanStaffAction(req.user, "customers"), "Customer and follow-up access required", 403);
  const owner = (req: Request) => requireThat(["owner", "admin"].includes(req.user.role), "Owner access required", 403);
  app.get("/api/manage/birthdays", async (req, res) => {
    staff(req);
    const context = await birthdayContext(store, req.business);
    res.set("Cache-Control", "private, no-store").json(context);
  });
  writes.put("/api/manage/birthdays/settings", async (req, res) => {
    owner(req);
    const before = birthdaySettingsSchema.parse(await store.get(req.business.id, "birthdaySettings", "settings") ?? {});
    const input = birthdaySettingsSchema.parse(req.body);
    requireThat(before.revision === input.revision, "Settings changed. Reload before saving.", 409);
    const next = { ...input, id: "settings", revision: input.revision + 1 };
    await store.put(req.business.id, "birthdaySettings", next);
    await store.audit(req.business.id, req.user.email, "birthday.settings", "settings", before, next);
    await generateBirthdays(store, req.business);
    res.json(next);
  });
  writes.put("/api/manage/birthdays/customers/:id", async (req, res) => {
    staff(req);
    const key = String(req.params.id), input = birthdayProfileSchema.parse(req.body);
    requireThat(await store.get(req.business.id, "customers", key), "Customer not found", 404);
    const before = await store.get<BirthdayProfile>(req.business.id, "birthdayProfiles", key);
    requireThat((before?.revision ?? 0) === input.revision, "Customer plan changed. Reload before saving.", 409);
    const next = { ...input, id: key, revision: input.revision + 1 };
    await store.put(req.business.id, "birthdayProfiles", next);
    await store.audit(req.business.id, req.user.email, "birthday.customer-settings", key, before ?? null, next);
    await generateBirthdays(store, req.business);
    res.json(next);
  });
  writes.post("/api/manage/birthdays/generate", async (req, res) => { staff(req); res.json(await generateBirthdays(store, req.business)); });
  writes.post("/api/manage/birthdays/:id/complete", async (req, res) => {
    staff(req);
    const input = z.object({ revision: z.number().int().min(1), note: z.string().trim().min(1).max(2000) }).strict().parse(req.body);
    const draft = await store.get<BirthdayDraft>(req.business.id, "birthdayDrafts", String(req.params.id));
    requireThat(draft && draft.status === "prepared" && draft.revision === input.revision, "Draft changed or completed. Reload first.", 409);
    const context = await birthdayContext(store, req.business);
    requireThat(context.customers.some(c => c.rows.some(r => r.candidate?.id === draft.id)), "Booking, date or consent changed. Refresh the birthday planner.", 409);
    const next = { ...draft, note: input.note, status: "completed" as const, completedAt: new Date().toISOString(), revision: draft.revision + 1 };
    await store.put(req.business.id, "birthdayDrafts", next);
    await store.audit(req.business.id, req.user.email, "birthday.completed", draft.id, draft, { ...next, note: input.note });
    res.json(next);
  });
}
