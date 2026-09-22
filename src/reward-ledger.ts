import { writeRoutes } from "./write-routes.js";
import type { Express, Request } from "express";
import { z } from "zod";
import { Store, id } from "./store.js";
import { requireThat, totals, short } from "./domain.js";
import {
  rewardSettings,
  type CustomerExtras,
  type RewardSettings,
} from "./rewards.js";
import type { Booking, MoneyEntry, Package, Quote } from "./models.js";

export type RewardKind = "referral" | "loyalty" | "free_show";
export interface RewardAward {
  id: string;
  customerId: string;
  kind: RewardKind;
  sourceEventIds: string[];
  sourceCustomers: Record<string, string>;
  settings: RewardSettings;
  percent: number;
  issuedAt: string;
  voided: boolean;
}
export interface QuoteReward {
  awardId: string;
  kind: RewardKind;
  originalAmount: number;
  discount: number;
  originalDeposit: number;
  percent: number;
  terms: string;
  returnOnCancel: boolean;
}
async function paidEvents(store: Store, businessId: string) {
  const money = await store.all<MoneyEntry>(businessId, "money");
  return (await store.all<Booking>(businessId, "bookings")).filter((b) => {
    const t = totals(b, money);
    return b.status === "completed" && t.agreed > 0 && t.paid >= t.agreed;
  });
}
export async function rewardUsage(
  store: Store,
  businessId: string,
  awardId: string,
) {
  return (await store.all<Booking>(businessId, "bookings")).flatMap((b) =>
    b.quotes
      .filter((q) => q.reward?.awardId === awardId)
      .filter(
        (q) =>
          b.status === "quoted" ||
          (b.acceptedQuoteId === q.id &&
            (b.status !== "cancelled" || !q.reward!.returnOnCancel)),
      )
      .map((q) => ({
        bookingId: b.id,
        quoteId: q.id,
        status: b.status === "quoted" ? "reserved" : "used",
      })),
  );
}
export async function rewardView(
  store: Store,
  businessId: string,
  award: RewardAward,
) {
  const paid = new Map(
    (await paidEvents(store, businessId)).map((b) => [b.id, b.customerId]),
  );
  const eligible = award.sourceEventIds.every(
    (key) => paid.has(key) && paid.get(key) === award.sourceCustomers[key],
  );
  const usage = await rewardUsage(store, businessId, award.id);
  return {
    ...award,
    eligible,
    usage,
    status: award.voided
      ? "voided"
      : (usage[0]?.status ?? (eligible ? "available" : "suspended")),
  };
}
export async function validateQuoteReward(
  store: Store,
  businessId: string,
  booking: Booking,
  quote: Quote,
) {
  if (!quote.reward) return;
  const award = await store.get<RewardAward>(
    businessId,
    "rewardAwards",
    quote.reward.awardId,
  );
  requireThat(
    award && award.customerId === booking.customerId && !award.voided,
    "This reward is not available for this customer.",
    409,
  );
  const view = await rewardView(store, businessId, award);
  requireThat(
    view.eligible,
    "A qualifying event was refunded or changed. Review this reward before proceeding.",
    409,
  );
  requireThat(
    view.usage.every(
      (u) => u.bookingId === booking.id && u.quoteId === quote.id,
    ),
    "This reward is already reserved or used on another proposal.",
    409,
  );
}
export function rewardLedger(
  app: Express,
  store: Store,
  canManage: (req: Request) => void,
) {
  const writes = writeRoutes(app, store);
  app.get("/api/manage/customers/:id/rewards", async (req, res) => {
    canManage(req);
    requireThat(
      await store.get(req.business.id, "customers", String(req.params.id)),
      "Customer not found",
      404,
    );
    res.json(
      await Promise.all(
        (await store.all<RewardAward>(req.business.id, "rewardAwards"))
          .filter((a) => a.customerId === req.params.id)
          .map(async (a) => await rewardView(store, req.business.id, a)),
      ),
    );
  });
  writes.post("/api/manage/customers/:id/rewards", async (req, res) => {
    canManage(req);
    const input = z
      .object({
        kind: z.enum(["referral", "loyalty", "free_show"]),
        reviewed: z.literal(true),
      })
      .parse(req.body);
    const bid = req.business.id,
      customerId = String(req.params.id);
    requireThat(
      await store.get(bid, "customers", customerId),
      "Customer not found",
      404,
    );
    const award = await store.transaction(async () => {
      const settings = await rewardSettings(store, bid);
      requireThat(
        settings.enabled,
        "Enable and configure the reward program first.",
      );
      const personal =
        input.kind === "loyalty" ||
        (input.kind === "free_show" && settings.qualification === "personal");
      const referred = new Set(
        (await store.all<CustomerExtras>(bid, "customerExtras"))
          .filter((e) => e.referredBy === customerId)
          .map((e) => e.id),
      );
      const existing = (
        await store.all<RewardAward>(bid, "rewardAwards")
      ).filter(
        (a) =>
          !a.voided && a.customerId === customerId && a.kind === input.kind,
      );
      const used = new Set(existing.flatMap((a) => a.sourceEventIds));
      const count =
        input.kind === "referral"
          ? 1
          : input.kind === "loyalty"
            ? settings.loyaltyEvery
            : settings.eventsForFree;
      const sources = (await paidEvents(store, bid))
        .filter(
          (b) =>
            (personal
              ? b.customerId === customerId
              : referred.has(b.customerId)) && !used.has(b.id),
        )
        .slice(0, count);
      requireThat(
        sources.length === count,
        `This reward needs ${count} unused, completed and fully paid qualifying events.`,
        409,
      );
      const percent =
        input.kind === "free_show"
          ? 100
          : input.kind === "referral"
            ? settings.discountPercent
            : settings.loyaltyPercent;
      requireThat(percent > 0, "This reward's discount is currently zero.");
      if (input.kind === "free_show") {
        const show = await store.get<Package>(
          bid,
          "packages",
          settings.freeShowPackageId,
        );
        requireThat(
          show?.active && show.category.toLowerCase() === "magic",
          "Choose an active magic package for the free-show reward first.",
        );
      }
      const award: RewardAward = {
        id: id(),
        customerId,
        kind: input.kind,
        sourceEventIds: sources.map((b) => b.id),
        sourceCustomers: Object.fromEntries(
          sources.map((b) => [b.id, b.customerId]),
        ),
        settings,
        percent,
        issuedAt: new Date().toISOString(),
        voided: false,
      };
      await store.put(bid, "rewardAwards", award);
      await store.audit(
        bid,
        req.user.email,
        "reward.issued",
        award.id,
        null,
        award,
      );
      return award;
    });
    res.status(201).json(await rewardView(store, bid, award));
  });
  writes.post("/api/manage/rewards/:id/void", async (req, res) => {
    canManage(req);
    const { reason } = z.object({ reason: short.min(3) }).parse(req.body);
    const before = await store.get<RewardAward>(
      req.business.id,
      "rewardAwards",
      String(req.params.id),
    );
    requireThat(before, "Reward not found", 404);
    requireThat(
      !(await rewardUsage(store, req.business.id, before.id)).length,
      "Remove the reward from its proposal or resolve its booking before voiding it.",
      409,
    );
    await store.transaction(async () => {
      const after = { ...before, voided: true };
      await store.put(req.business.id, "rewardAwards", after);
      await store.audit(
        req.business.id,
        req.user.email,
        "reward.voided",
        before.id,
        before,
        { ...after, reason },
      );
    });
    res.json({ ok: true });
  });
  writes.post("/api/manage/bookings/:id/reward", async (req, res) => {
    canManage(req);
    const input = z
      .object({ awardId: short, quoteId: short, revision: z.number().int() })
      .parse(req.body);
    const bid = req.business.id;
    const result = await store.transaction(async () => {
      const before = await store.get<Booking>(
        bid,
        "bookings",
        String(req.params.id),
      );
      requireThat(before, "Event not found", 404);
      requireThat(
        before.revision === input.revision && before.status === "quoted",
        "Refresh this event and prepare a current unaccepted proposal first.",
        409,
      );
      requireThat(
        !before.quotes.some((q) => q.reward),
        "Use only one reward per proposal set. Replace the proposal to remove its reward.",
        409,
      );
      const award = await store.get<RewardAward>(
        bid,
        "rewardAwards",
        input.awardId,
      );
      requireThat(
        award && award.customerId === before.customerId && !award.voided,
        "Reward not found for this customer",
        404,
      );
      const view = await rewardView(store, bid, award);
      requireThat(
        view.status === "available",
        "This reward is not currently available.",
        409,
      );
      const next = await structuredClone(before),
        quote = next.quotes.find((q) => q.id === input.quoteId);
      requireThat(quote && quote.amount > 0, "Choose a nonzero quote option.");
      if (award.kind === "free_show")
        requireThat(
          quote.packageIds.length === 1 &&
            quote.packageIds[0] === award.settings.freeShowPackageId,
          "A free-show reward covers only its configured magic package. Quote paid extras separately.",
        );
      const discount = Math.round((quote.amount * award.percent) / 100);
      requireThat(discount > 0, "The calculated discount is below one cent.");
      const reward: QuoteReward = {
        awardId: award.id,
        kind: award.kind,
        originalAmount: quote.amount,
        originalDeposit: quote.deposit,
        discount,
        percent: award.percent,
        terms: award.settings.terms,
        returnOnCancel: award.settings.returnOnCancel,
      };
      quote.amount -= discount;
      requireThat(
        quote.amount >=
          totals(before, await store.all<MoneyEntry>(bid, "money")).paid,
        "Refund or correct collected payments before reducing this quote.",
        409,
      );
      quote.deposit = Math.min(quote.deposit, quote.amount);
      quote.reward = reward;
      next.revision++;
      next.updatedAt = new Date().toISOString();
      await store.put(bid, "bookings", next);
      await store.audit(
        bid,
        req.user.email,
        "reward.applied-to-proposal",
        before.id,
        before,
        next,
      );
      return next;
    });
    res.json(result);
  });
}
