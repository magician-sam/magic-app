import { z } from "zod";
import type { Store } from "./store.js";
import type { Booking, Customer, MoneyEntry } from "./models.js";
import { totals } from "./domain.js";

export const rewardSchema = z
  .object({
    enabled: z.boolean().default(false),
    freeShowPackageId: z.string().max(240).default(""),
    returnOnCancel: z.boolean().default(true),
    discountPercent: z.number().min(0).max(100).default(15),
    eventsForFree: z.number().int().min(1).max(100).default(5),
    qualification: z
      .enum(["unconfigured", "referrals", "personal"])
      .default("unconfigured"),
    loyaltyEvery: z.number().int().min(1).max(100).default(3),
    loyaltyPercent: z.number().min(0).max(100).default(15),
    emailPoints: z.number().int().min(0).max(10000).default(10),
    childrenPoints: z.number().int().min(0).max(10000).default(10),
    terms: z.string().trim().max(3000).default(""),
  })
  .refine(
    (x) =>
      !x.enabled ||
      (x.qualification !== "unconfigured" && x.terms.length >= 10),
    "Choose qualifying events and describe reward conditions before enabling the program.",
  );
export type RewardSettings = z.infer<typeof rewardSchema>;
export type CustomerExtras = {
  id: string;
  childrenAges: number[];
  referredBy: string;
};
export const rewardSettings = async (
  store: Store,
  businessId: string,
): Promise<RewardSettings> =>
  rewardSchema.parse(
    (await store.get(businessId, "rewardSettings", "program")) ?? {},
  );
export async function customerRewards(
  store: Store,
  businessId: string,
  customer: Customer,
) {
  const settings = await rewardSettings(store, businessId);
  const extras = await store.get<CustomerExtras>(
    businessId,
    "customerExtras",
    customer.id,
  );
  const referred = new Set(
    (await store.all<CustomerExtras>(businessId, "customerExtras"))
      .filter((x) => x.referredBy === customer.id)
      .map((x) => x.id),
  );
  const ledger = await store.all<MoneyEntry>(businessId, "money");
  const paid = (await store.all<Booking>(businessId, "bookings")).filter(
    (b) => {
      const t = totals(b, ledger);
      return b.status === "completed" && t.agreed > 0 && t.paid >= t.agreed;
    },
  );
  const personalEvents = paid.filter(
    (b) => b.customerId === customer.id,
  ).length;
  const referralEvents = paid.filter((b) => referred.has(b.customerId)).length;
  return {
    settings,
    personalEvents,
    referralEvents,
    qualifyingEvents:
      settings.qualification === "personal"
        ? personalEvents
        : settings.qualification === "referrals"
          ? referralEvents
          : 0,
    profilePoints:
      (customer.email ? settings.emailPoints : 0) +
      (extras?.childrenAges.length ? settings.childrenPoints : 0),
  };
}
