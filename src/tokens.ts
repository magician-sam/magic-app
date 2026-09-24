import type { Store } from "./store.js";
import type { Booking, MoneyEntry, Package } from "./models.js";
import type { CustomerExtras } from "./rewards.js";
import type { RewardAward } from "./reward-ledger.js";
import { totals } from "./domain.js";

export const tokenPercent = { 1: 10, 2: 20, 3: 30, 4: 40, 5: 100 } as const;
export type TokenCost = keyof typeof tokenPercent;

export interface TokenAdjustment {
  id: string;
  customerId: string;
  amount: number;
  reason: string;
  at: string;
  actor: string;
}

function hasQualifyingShow(booking: Booking, packages: Package[]) {
  const quote = booking.quotes.find((q) => q.id === booking.acceptedQuoteId);
  const chosen = quote?.packageSnapshot ?? booking.packageSnapshot ??
    (quote?.packageIds ?? booking.packageIds)
      .map((key) => packages.find((item) => item.id === key))
      .filter((item): item is Package => !!item);
  const ids = chosen.flatMap((item) => [item.id, ...(item.bundleIds ?? [])]);
  return ids.some((key) => {
    const item = packages.find((entry) => entry.id === key) ?? chosen.find((entry) => entry.id === key);
    return item && ["magic", "science", "bubbles", "bubble"].includes(item.category.toLowerCase());
  });
}

export async function tokenWallet(store: Store, businessId: string, customerId: string) {
  const referred = (await store.all<CustomerExtras>(businessId, "customerExtras"))
    .filter((entry) => entry.referredBy === customerId);
  const referredIds = new Set(referred.map((entry) => entry.id));
  const money = await store.all<MoneyEntry>(businessId, "money");
  const packages = await store.all<Package>(businessId, "packages");
  const qualified = (await store.all<Booking>(businessId, "bookings"))
    .filter((booking) => {
      if (!referredIds.has(booking.customerId) || booking.status !== "completed") return false;
      const payment = totals(booking, money);
      return payment.agreed > 0 && payment.paid >= payment.agreed &&
        hasQualifyingShow(booking, packages);
    });
  const earned = new Set(qualified.map((booking) => booking.customerId)).size;
  const adjustments = (await store.all<TokenAdjustment>(businessId, "tokenAdjustments"))
    .filter((entry) => entry.customerId === customerId);
  const manual = adjustments.reduce((sum, entry) => sum + entry.amount, 0);
  const awards = (await store.all<RewardAward>(businessId, "rewardAwards"))
    .filter((award) => award.customerId === customerId && award.kind === "token" && !award.voided);
  const bookings = await store.all<Booking>(businessId, "bookings");
  const spent = awards.reduce((sum, award) => {
    const inUse = bookings.some((booking) => booking.quotes.some((quote) =>
      quote.reward?.awardId === award.id &&
      (booking.status === "quoted" ||
        (booking.acceptedQuoteId === quote.id &&
          (booking.status !== "cancelled" || !quote.reward.returnOnCancel)))));
    return sum + (inUse ? award.tokenCost ?? 0 : 0);
  }, 0);
  return {
    earned,
    manual,
    spent,
    balance: Math.max(0, earned + manual - spent),
    referredCount: referred.length,
    qualifiedCustomerIds: [...new Set(qualified.map((booking) => booking.customerId))],
  };
}

