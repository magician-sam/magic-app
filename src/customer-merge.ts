import { writeRoutes } from "./write-routes.js";
import { createHash } from "node:crypto";
import type { Express, Request } from "express";
import { z } from "zod";
import { Store, id } from "./store.js";
import { requireThat, short, customerSchema } from "./domain.js";
import type { Customer, Booking, Reminder } from "./models.js";
import type { ContactEntry } from "./contact-history.js";
import type { CustomerExtras } from "./rewards.js";
import type { RewardAward } from "./reward-ledger.js";

export function customerMerge(app: Express, store: Store) {
  const writes = writeRoutes(app, store);
  async function preview(req: Request, targetId: string, sourceId: string) {
    requireThat(
      ["owner", "admin"].includes(req.user.role),
      "Owner access required.",
      403,
    );
    requireThat(targetId !== sourceId, "Choose two different customers.");
    const bid = req.business.id;
    const target = await store.get<Customer>(bid, "customers", targetId);
    const source = await store.get<Customer>(bid, "customers", sourceId);
    requireThat(target && source, "Customer not found.", 404);
    const reasons: string[] = [];
    if (
      await store.db
        .prepare(
          "SELECT id FROM customer_accounts WHERE business_id=? AND customer_id IN (?,?)",
        )
        .get(bid, targetId, sourceId)
    )
      reasons.push(
        "A customer has a login. Account-linked records need verified identity handling and cannot be merged here.",
      );
    const extras = (
      await store.all<CustomerExtras>(bid, "customerExtras")
    ).filter(
      (x) =>
        [targetId, sourceId].includes(x.id) ||
        [targetId, sourceId].includes(x.referredBy),
    );
    const awards = (await store.all<RewardAward>(bid, "rewardAwards")).filter(
      (x) =>
        [targetId, sourceId].includes(x.customerId) ||
        Object.values(x.sourceCustomers).some((v) =>
          [targetId, sourceId].includes(v),
        ),
    );
    if (extras.length || awards.length)
      reasons.push(
        "Referral, profile or reward history needs a separate review; this merge would affect eligibility.",
      );
    const bookings = (await store.all<Booking>(bid, "bookings")).filter(
      (b) => b.customerId === sourceId,
    );
    const reminders = (await store.all<Reminder>(bid, "reminders")).filter(
      (r) => r.customerId === sourceId,
    );
    const history = (
      await store.all<ContactEntry>(bid, "contactHistory")
    ).filter((h) => h.customerId === sourceId);
    const unique = <T>(items: T[]) => [
      ...new Map(items.map((x) => [JSON.stringify(x), x])).values(),
    ];
    const notes = [
      target.notes,
      source.notes && `Merged notes from ${source.name}:\n${source.notes}`,
    ]
      .filter(Boolean)
      .join("\n\n");
    const draft = {
      ...target,
      children: unique([...target.children, ...source.children]),
      contacts: unique([...target.contacts, ...source.contacts]),
      notes,
      offersConsent: target.offersConsent && source.offersConsent,
      doNotContact: target.doNotContact || source.doNotContact,
      followUp:
        [target.followUp, source.followUp].filter(Boolean).sort()[0] ?? "",
    };
    const parsed = customerSchema.safeParse(draft);
    if (!parsed.success)
      reasons.push(
        "Combined notes, children or contacts exceed the record limits. Review the records first.",
      );
    const revision = createHash("sha256")
      .update(
        JSON.stringify({
          target,
          source,
          bookings,
          reminders,
          history,
          extras,
          awards,
          reasons,
        }),
      )
      .digest("hex");
    return {
      target,
      source,
      merged: draft,
      revision,
      reasons,
      bookings,
      reminders,
      history,
    };
  }
  writes.post("/api/manage/customer-merge/preview", async (req, res) => {
    const input = z
      .object({ targetId: short.min(1), sourceId: short.min(1) })
      .parse(req.body);
    const p = await preview(req, input.targetId, input.sourceId);
    res.json({
      target: p.target,
      source: p.source,
      merged: p.merged,
      revision: p.revision,
      reasons: p.reasons,
      counts: {
        bookings: p.bookings.length,
        reminders: p.reminders.length,
        history: p.history.length,
      },
    });
  });
  writes.post("/api/manage/customer-merge/confirm", async (req, res) => {
    const input = z
      .object({
        targetId: short.min(1),
        sourceId: short.min(1),
        revision: z.string().regex(/^[a-f0-9]{64}$/),
        identityConfirmed: z.literal(true),
      })
      .parse(req.body);
    const result = await store.transaction(async () => {
      const p = await preview(req, input.targetId, input.sourceId);
      requireThat(!p.reasons.length, p.reasons.join(" "), 409);
      requireThat(
        input.revision === p.revision,
        "These records changed. Preview the merge again.",
        409,
      );
      const bid = req.business.id,
        now = new Date().toISOString();
      for (const before of p.bookings) {
        const next = {
          ...before,
          customerId: p.target.id,
          revision: before.revision + 1,
          updatedAt: now,
        };
        await store.put(bid, "bookings", next);
        await store.audit(
          bid,
          req.user.email,
          "booking.customer-merged",
          before.id,
          before,
          next,
        );
      }
      for (const before of p.reminders)
        await store.put(bid, "reminders", {
          ...before,
          customerId: p.target.id,
          revision: (before.revision ?? 0) + 1,
        });
      for (const before of p.history)
        await store.put(bid, "contactHistory", {
          ...before,
          customerId: p.target.id,
          revision: before.revision + 1,
          updatedAt: now,
        });
      await store.put(bid, "customers", p.merged);
      // Preserve the original records and associations in a business-scoped archive.
      const archive = {
        id: id(),
        at: now,
        actor: req.user.email,
        targetId: p.target.id,
        sourceId: p.source.id,
        before: {
          target: p.target,
          source: p.source,
          bookings: p.bookings,
          reminders: p.reminders,
          history: p.history,
        },
        after: p.merged,
      };
      await store.put(bid, "customerMerges", archive);
      await store.db
        .prepare(
          "DELETE FROM records WHERE business_id=? AND kind='customers' AND id=?",
        )
        .run(bid, p.source.id);
      await store.audit(
        bid,
        req.user.email,
        "customer.merged",
        p.target.id,
        archive.before,
        { customer: p.merged, archiveId: archive.id },
      );
      return { customer: p.merged, archiveId: archive.id };
    });
    res.json(result);
  });
}
