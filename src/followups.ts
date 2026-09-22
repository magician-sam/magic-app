import type { Express, Request } from "express";
import { DateTime } from "luxon";
import { z } from "zod";
import { Store, id } from "./store.js";
import { hash } from "./auth.js";
import { date, requireThat } from "./domain.js";
import { writeRoutes } from "./write-routes.js";
import type { Business, Booking, Customer, Reminder } from "./models.js";
import type { ContactEntry } from "./contact-history.js";

export const followupSchema = z.object({
  enabled: z.boolean().default(false),
  birthday: z.boolean().default(true),
  birthdayDays: z.number().int().min(0).max(90).default(30),
  afterEvent: z.boolean().default(true),
  afterEventDays: z.number().int().min(1).max(30).default(1),
  quote: z.boolean().default(true),
  quoteDays: z.number().int().min(1).max(30).default(3),
  schoolDate: z.union([date, z.literal("")]).default(""),
  schoolDays: z.number().int().min(0).max(90).default(30),
  birthdayText: z
    .string()
    .trim()
    .min(1)
    .max(3000)
    .default(
      "Hello {customer}, {child}’s birthday is coming up on {date}. Would you like to explore a show with {business}?",
    ),
  afterEventText: z
    .string()
    .trim()
    .min(1)
    .max(3000)
    .default(
      "Hello {customer}, thank you for having {business} at {event}. We would love to hear how it went.",
    ),
  quoteText: z
    .string()
    .trim()
    .min(1)
    .max(3000)
    .default(
      "Hello {customer}, would you like any help with the proposal for {event}?",
    ),
  schoolText: z
    .string()
    .trim()
    .min(1)
    .max(3000)
    .default(
      "Hello {customer}, are you planning activities around {date}? {business} would be happy to discuss a show for your school.",
    ),
  revision: z.number().int().min(0).default(0),
});
export type FollowupSettings = z.infer<typeof followupSchema>;
export type FollowupCandidate = Reminder & {
  generatedKey: string;
  draft: string;
  marketing: boolean;
  revision: number;
};

export function followupCandidates(
  business: Business,
  customers: Customer[],
  bookings: Booking[],
  settings: FollowupSettings,
  today: string,
): FollowupCandidate[] {
  const now = DateTime.fromISO(today, { zone: business.timezone }).startOf(
    "day",
  );
  requireThat(now.isValid, "Invalid planning date.");
  const results: FollowupCandidate[] = [];
  const add = (
    customer: Customer,
    kind: string,
    entity: string,
    target: string,
    due: DateTime,
    title: string,
    template: string,
    marketing: boolean,
    booking?: Booking,
    child = "",
  ) => {
    if (
      customer.doNotContact ||
      (marketing && !customer.offersConsent) ||
      due > now ||
      now.diff(due, "days").days > 90
    )
      return;
    const key = hash(`${kind}:${entity}:${target}`);
    const values: Record<string, string> = {
      customer: customer.name,
      child,
      event: booking?.name ?? "",
      business: business.name,
      date: target,
    };
    results.push({
      id: `auto-${key}`,
      generatedKey: key,
      customerId: customer.id,
      bookingId: booking?.id ?? "",
      date: due.toISODate()!,
      title,
      done: false,
      revision: 1,
      marketing,
      draft: template.replace(
        /\{(customer|child|event|business|date)\}/g,
        (_, key: string) => values[key],
      ),
    });
  };
  for (const customer of customers) {
    if (settings.birthday)
      for (const child of customer.children)
        for (const year of [now.year, now.year + 1]) {
          const source = DateTime.fromISO(child.birthday);
          if (!source.isValid) continue;
          // Use February 28 for February 29 birthdays in non-leap years.
          const first = DateTime.fromObject(
            { year, month: source.month, day: 1 },
            { zone: business.timezone },
          );
          const birthday = first.set({
            day: Math.min(source.day, first.daysInMonth!),
          });
          if (birthday < now) continue;
          add(
            customer,
            "birthday",
            `${customer.id}:${child.name}:${child.birthday}`,
            birthday.toISODate()!,
            birthday.minus({ days: settings.birthdayDays }),
            `Birthday follow-up · ${child.name}`,
            settings.birthdayText,
            true,
            undefined,
            child.name,
          );
        }
    if (customer.kind === "school" && settings.schoolDate) {
      const campaign = DateTime.fromISO(settings.schoolDate, {
        zone: business.timezone,
      });
      if (campaign >= now)
        add(
          customer,
          "school",
          customer.id,
          settings.schoolDate,
          campaign.minus({ days: settings.schoolDays }),
          "School show follow-up",
          settings.schoolText,
          true,
        );
    }
    for (const booking of bookings.filter(
      (b) => b.customerId === customer.id,
    )) {
      const eventDate = DateTime.fromISO(booking.date, {
        zone: business.timezone,
      });
      if (settings.afterEvent && booking.status === "completed") {
        const due = eventDate.plus({ days: settings.afterEventDays });
        if (now.diff(due, "days").days <= 30)
          add(
            customer,
            "after-event",
            booking.id,
            booking.date,
            due,
            `After the show · ${booking.name}`,
            settings.afterEventText,
            false,
            booking,
          );
      }
      if (settings.quote && booking.status === "quoted" && eventDate >= now) {
        const due = DateTime.fromISO(booking.updatedAt, {
          zone: business.timezone,
        })
          .startOf("day")
          .plus({ days: settings.quoteDays });
        add(
          customer,
          "quote",
          `${booking.id}:${booking.quotes.map((q) => q.id).join(",")}`,
          booking.date,
          due,
          `Proposal follow-up · ${booking.name}`,
          settings.quoteText,
          false,
          booking,
        );
      }
    }
  }
  return [...new Map(results.map((r) => [r.generatedKey, r])).values()].sort(
    (a, b) => a.date.localeCompare(b.date),
  );
}

export async function generateFollowups(
  store: Store,
  business: Business,
  today = DateTime.now().setZone(business.timezone).toISODate()!,
) {
  return store.transaction(async () => {
    const settings = followupSchema.parse(
      (await store.get(business.id, "followupSettings", "settings")) ?? {},
    );
    if (!settings.enabled) return { added: 0 };
    const candidates = followupCandidates(
      business,
      await store.all<Customer>(business.id, "customers"),
      await store.all<Booking>(business.id, "bookings"),
      settings,
      today,
    );
    let added = 0;
    for (const candidate of candidates) {
      if (await store.get(business.id, "followupRuns", candidate.generatedKey))
        continue;
      await store.put(business.id, "reminders", candidate);
      await store.put(business.id, "followupRuns", {
        id: candidate.generatedKey,
        reminderId: candidate.id,
        at: new Date().toISOString(),
      });
      await store.audit(
        business.id,
        "follow-up planner",
        "followup.created",
        candidate.id,
        null,
        candidate,
      );
      added++;
    }
    return { added };
  });
}

export function followups(app: Express, store: Store) {
  const writes = writeRoutes(app, store);
  const staff = (req: Request) =>
    requireThat(req.user.role !== "performer", "Access denied", 403);
  app.get("/api/manage/followups/settings", async (req, res) => {
    staff(req);
    res.json(
      followupSchema.parse(
        (await store.get(req.business.id, "followupSettings", "settings")) ??
          {},
      ),
    );
  });
  writes.put("/api/manage/followups/settings", async (req, res) => {
    requireThat(
      ["owner", "admin"].includes(req.user.role),
      "Owner access required",
      403,
    );
    const before = followupSchema.parse(
        (await store.get(req.business.id, "followupSettings", "settings")) ??
          {},
      ),
      input = followupSchema.parse(req.body);
    requireThat(
      input.revision === before.revision,
      "Settings changed. Reopen them before saving.",
      409,
    );
    const next = { ...input, revision: before.revision + 1, id: "settings" };
    await store.put(req.business.id, "followupSettings", next);
    await store.audit(
      req.business.id,
      req.user.email,
      "followup.settings",
      next.id,
      before,
      next,
    );
    res.json(next);
  });
  writes.post("/api/manage/followups/generate", async (req, res) => {
    staff(req);
    res.json(await generateFollowups(store, req.business));
  });
  writes.post("/api/manage/reminders/:id/contact", async (req, res) => {
    staff(req);
    const input = z
      .object({
        confirmed: z.literal(true),
        revision: z.number().int().min(0),
        channel: z.enum(["phone", "whatsapp", "email", "in_person"]),
        summary: z.string().trim().min(1).max(5000),
        date,
      })
      .parse(req.body);
    const reminder = await store.get<Reminder>(
      req.business.id,
      "reminders",
      String(req.params.id),
    );
    requireThat(reminder, "Reminder not found", 404);
    requireThat(
      !reminder.done && input.revision === (reminder.revision ?? 0),
      "This follow-up changed or is already completed.",
      409,
    );
    const customer = await store.get<Customer>(
      req.business.id,
      "customers",
      reminder.customerId,
    );
    requireThat(customer, "Choose a customer first.");
    requireThat(
      !customer.doNotContact && (!reminder.marketing || customer.offersConsent),
      "Contact preferences prevent this follow-up.",
      409,
    );
    if (reminder.bookingId) {
      const booking = await store.get<Booking>(
        req.business.id,
        "bookings",
        reminder.bookingId,
      );
      requireThat(
        booking?.customerId === customer.id,
        "Event no longer belongs to this customer.",
        409,
      );
    }
    const now = new Date().toISOString();
    const entry: ContactEntry = {
      id: id(),
      customerId: customer.id,
      bookingId: reminder.bookingId,
      date: input.date,
      channel: input.channel,
      direction: "outbound",
      summary: input.summary,
      archived: false,
      revision: 1,
      createdAt: now,
      updatedAt: now,
    };
    await store.put(req.business.id, "contactHistory", entry);
    const next = {
      ...reminder,
      done: true,
      revision: (reminder.revision ?? 0) + 1,
    };
    await store.put(req.business.id, "reminders", next);
    await store.audit(
      req.business.id,
      req.user.email,
      "followup.contact-recorded",
      reminder.id,
      reminder,
      { reminder: next, contactId: entry.id },
    );
    res.json(entry);
  });
}
