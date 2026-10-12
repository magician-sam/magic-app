import { z } from "zod";
import { canPartnerAction, offeringSchema, type Membership, type Offering, type Organization } from "./marketplace.js";

const identifier = z.string().trim().min(1).max(128);
const proposalFields = {
  id: identifier, organizationId: identifier, offeringId: identifier,
  offeringRevision: z.number().int().nonnegative(), requestedBy: identifier,
  requestedAt: z.iso.datetime({ offset: true }),
  status: z.enum(["pending", "approved", "rejected"]), revision: z.number().int().nonnegative(),
  reviewedBy: identifier.optional(), reviewedAt: z.iso.datetime({ offset: true }).optional(),
  reviewNote: z.string().trim().min(1).max(2000).optional(),
};
const priceSchema = z.object({ amountMinor: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  currency: z.string().regex(/^[A-Z]{3}$/), minorUnit: z.number().int().min(0).max(4) }).strict();

export const priceChangeSchema = z.object({ ...proposalFields, proposedPrice: priceSchema,
  reason: z.string().trim().min(1).max(2000) }).strict().superRefine((value, ctx) => {
  if (value.status === "pending" && (value.reviewedBy || value.reviewedAt || value.reviewNote))
    ctx.addIssue({ code: "custom", message: "Pending requests cannot contain a review." });
  if (value.status !== "pending" && (!value.reviewedBy || !value.reviewedAt))
    ctx.addIssue({ code: "custom", message: "A review record is required." });
  if (value.status === "rejected" && !value.reviewNote)
    ctx.addIssue({ code: "custom", message: "Give the partner a reason for rejection." });
});
export type PriceChange = z.infer<typeof priceChangeSchema>;

export const promotionSchema = z.object({ ...proposalFields,
  kind: z.enum(["announcement", "free_entry", "percentage_discount"]),
  title: z.string().trim().min(1).max(140), message: z.string().trim().min(1).max(2000),
  startsAt: z.iso.datetime({ offset: true }), endsAt: z.iso.datetime({ offset: true }),
  discountPercent: z.number().int().min(1).max(100).optional(), mediaId: identifier.optional(),
}).strict().superRefine((value, ctx) => {
  if (Date.parse(value.endsAt) <= Date.parse(value.startsAt))
    ctx.addIssue({ code: "custom", message: "Promotion end must follow its start." });
  if ((value.kind === "percentage_discount") !== (value.discountPercent !== undefined))
    ctx.addIssue({ code: "custom", message: "Discount percentage is required only for percentage offers." });
  if (value.status === "pending" && (value.reviewedBy || value.reviewedAt || value.reviewNote))
    ctx.addIssue({ code: "custom", message: "Pending requests cannot contain a review." });
  if (value.status !== "pending" && (!value.reviewedBy || !value.reviewedAt))
    ctx.addIssue({ code: "custom", message: "A review record is required." });
  if (value.status === "rejected" && !value.reviewNote)
    ctx.addIssue({ code: "custom", message: "Give the partner a reason for rejection." });
});
export type Promotion = z.infer<typeof promotionSchema>;
type PartnerActor = { accountId: string; organization: Organization; memberships: readonly Membership[] };
export type PlatformReviewActor = { accountId: string; platformCapabilities: readonly ("prices.approve" | "promotions.approve")[] };

// Internal rule layer only: actors, capabilities, offering revisions and currency
// configuration must be loaded from server storage. No public API accepts them.
// These functions propose/review only. Applying a price requires CAS + audit in
// the same transaction. Existing accepted quotes must retain their snapshots.
export function proposePrice(input: { id: string; proposedPrice: z.infer<typeof priceSchema>; reason: string },
  target: Offering, actor: PartnerActor, now = new Date().toISOString()): PriceChange {
  const offering = offeringSchema.parse(target);
  if (offering.organizationId !== actor.organization.id || !["approved", "paused"].includes(offering.status)
    || !canPartnerAction(actor.accountId, actor.organization, actor.memberships, "prices.request"))
    throw new Error("Price request is not permitted.");
  return priceChangeSchema.parse({ ...input, organizationId: offering.organizationId, offeringId: offering.id,
    offeringRevision: offering.revision, requestedBy: actor.accountId, requestedAt: now, status: "pending", revision: 0 });
}

export function proposePromotion(input: Pick<Promotion, "id" | "kind" | "title" | "message" | "startsAt" | "endsAt" | "discountPercent" | "mediaId">,
  target: Offering, actor: PartnerActor, now = new Date().toISOString()): Promotion {
  const offering = offeringSchema.parse(target);
  if (offering.organizationId !== actor.organization.id || offering.status !== "approved"
    || !canPartnerAction(actor.accountId, actor.organization, actor.memberships, "promotions.request"))
    throw new Error("Promotion request is not permitted.");
  if (input.kind === "free_entry" && offering.kind !== "playground_entry")
    throw new Error("Free entrance requires a playground entry offering.");
  if (Date.parse(input.startsAt) <= Date.parse(now)) throw new Error("Choose a future promotion start.");
  return promotionSchema.parse({ ...input, organizationId: offering.organizationId, offeringId: offering.id,
    offeringRevision: offering.revision, requestedBy: actor.accountId, requestedAt: now, status: "pending", revision: 0 });
}

function reviewFields(value: PriceChange | Promotion, outcome: "approved" | "rejected", actor: PlatformReviewActor,
  target: Offering, expectedRevision: number, capability: PlatformReviewActor["platformCapabilities"][number], now: string, note?: string) {
  if (!actor.accountId || !actor.platformCapabilities.includes(capability)) throw new Error("Platform approval permission is required.");
  if (value.status !== "pending" || value.revision !== expectedRevision) throw new Error("Request changed; reload before review.");
  const offering = offeringSchema.parse(target);
  if (offering.id !== value.offeringId || offering.organizationId !== value.organizationId)
    throw new Error("Request target does not match.");
  if (outcome === "approved" && (offering.revision !== value.offeringRevision || !["approved", "paused"].includes(offering.status)))
    throw new Error("Offering changed; ask for an updated request.");
  return { ...value, status: outcome, revision: value.revision + 1, reviewedBy: actor.accountId, reviewedAt: now,
    ...(note ? { reviewNote: note } : {}) };
}

export function reviewPrice(input: PriceChange, outcome: "approved" | "rejected", actor: PlatformReviewActor,
  target: Offering, expectedRevision: number, note?: string, now = new Date().toISOString()): PriceChange {
  const value = priceChangeSchema.parse(input);
  return priceChangeSchema.parse(reviewFields(value, outcome, actor, target, expectedRevision, "prices.approve", now, note));
}

export function reviewPromotion(input: Promotion, outcome: "approved" | "rejected", actor: PlatformReviewActor,
  target: Offering, expectedRevision: number, note?: string, now = new Date().toISOString()): Promotion {
  const value = promotionSchema.parse(input);
  const offering = offeringSchema.parse(target);
  if (outcome === "approved" && (Date.parse(value.endsAt) <= Date.parse(now) || offering.status !== "approved"))
    throw new Error("Promotion has expired or the offering is not published.");
  return promotionSchema.parse(reviewFields(value, outcome, actor, offering, expectedRevision, "promotions.approve", now, note));
}

// Even an approved promotion is not a notification job. Consent, media/price
// validation, suppression, recipient targeting and outbox delivery come later.
export function isPromotionInWindow(input: Promotion, now = new Date().toISOString()): boolean {
  const value = promotionSchema.parse(input), time = Date.parse(now);
  return value.status === "approved" && Number.isFinite(time) && Date.parse(value.startsAt) <= time && time < Date.parse(value.endsAt);
}
