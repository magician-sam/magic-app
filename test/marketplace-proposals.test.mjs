import test from "node:test";
import assert from "node:assert/strict";
import { offeringSchema } from "../dist/marketplace.js";
import { proposePrice, reviewPrice, proposePromotion, reviewPromotion, isPromotionInWindow, priceChangeSchema, promotionSchema } from "../dist/marketplace-proposals.js";

const now = "2030-01-01T00:00:00Z";
const offering = (kind = "playground_entry") => ({ id: "entry", organizationId: "venue", title: "Synthetic visit", kind, categories: ["playgrounds"], status: "approved", revision: 3 });
const partner = (role = "owner") => ({ accountId: "partner", organization: { id: "venue", slug: "venue", name: "Synthetic venue", kind: "venue_operator", status: "approved", bookingMode: "direct", publicDescription: "Test", categories: ["playgrounds"], revision: 0 }, memberships: [{ id: "membership", accountId: "partner", organizationId: "venue", role, status: "active", revision: 0 }] });
const moderator = (platformCapabilities = ["prices.approve", "promotions.approve"]) => ({ accountId: "reviewer", platformCapabilities });
const price = () => ({ id: "price-request", proposedPrice: { amountMinor: 100, currency: "USD", minorUnit: 2 }, reason: "Synthetic test change" });
const promotion = (kind = "percentage_discount") => ({ id: "promo", kind, title: "Synthetic Friday offer", message: "Test only, never send", startsAt: "2030-01-04T10:00:00+02:00", endsAt: "2030-01-04T18:00:00+02:00", ...(kind === "percentage_discount" ? { discountPercent: 25 } : {}) });

test("service, birthday and playground entry types remain distinct; legacy offerings default to service", () => {
  const legacy = offering(); delete legacy.kind;
  assert.equal(offeringSchema.parse(legacy).kind, "service");
  assert.equal(offeringSchema.parse(offering("birthday_package")).kind, "birthday_package");
  assert.equal(offeringSchema.parse(offering()).kind, "playground_entry");
});
test("partner price requests are pending, owned, validated and do not mutate live offerings", () => {
  const target = offering(), before = structuredClone(target);
  const request = proposePrice(price(), target, partner(), now);
  assert.equal(request.status, "pending");
  assert.equal(request.offeringRevision, 3);
  assert.deepEqual(target, before);
  assert.throws(() => proposePrice(price(), { ...target, organizationId: "other" }, partner(), now), /not permitted/);
  assert.throws(() => proposePrice(price(), target, partner("artist"), now), /not permitted/);
  assert.throws(() => proposePrice({ ...price(), proposedPrice: { amountMinor: 1.2, currency: "USD", minorUnit: 2 } }, target, partner(), now));
  assert.throws(() => proposePrice({ ...price(), proposedPrice: { amountMinor: -1, currency: "USD", minorUnit: 2 } }, target, partner(), now));
});
test("price approval requires platform capability and a current target/request revision", () => {
  const request = proposePrice(price(), offering(), partner(), now);
  assert.throws(() => reviewPrice(request, "approved", moderator([]), offering(), 0), /permission/);
  assert.throws(() => reviewPrice(request, "approved", moderator(["promotions.approve"]), offering(), 0), /permission/);
  assert.throws(() => reviewPrice(request, "approved", moderator(), { ...offering(), revision: 4 }, 0), /Offering changed/);
  assert.throws(() => reviewPrice(request, "approved", moderator(), { ...offering(), organizationId: "other" }, 0), /target/);
  assert.throws(() => reviewPrice(request, "approved", moderator(), offering(), 1), /Request changed/);
  const approved = reviewPrice(request, "approved", moderator(), offering(), 0, undefined, "2030-01-01T01:00:00Z");
  assert.equal(approved.reviewedBy, "reviewer");
  assert.equal(approved.revision, 1);
  assert.equal(request.status, "pending");
  assert.throws(() => reviewPrice(approved, "approved", moderator(), offering(), 1), /Request changed/);
});
test("rejection records a reason; pending records cannot forge review metadata", () => {
  const request = proposePrice(price(), offering(), partner(), now);
  assert.throws(() => reviewPrice(request, "rejected", moderator(), offering(), 0));
  assert.equal(reviewPrice(request, "rejected", moderator(), { ...offering(), revision: 4 }, 0, "Please update the request").status, "rejected");
  assert.equal(priceChangeSchema.safeParse({ ...request, reviewedBy: "forged" }).success, false);
  assert.equal(priceChangeSchema.safeParse({ ...request, status: "approved" }).success, false);
});
test("free entrance targets entry tickets, not birthday packages; schedules and discounts are validated", () => {
  assert.equal(proposePromotion(promotion("free_entry"), offering(), partner(), now).status, "pending");
  assert.throws(() => proposePromotion(promotion("free_entry"), offering("birthday_package"), partner(), now), /playground entry/);
  assert.throws(() => proposePromotion(promotion(), offering(), partner("accounting"), now), /not permitted/);
  assert.throws(() => proposePromotion({ ...promotion(), discountPercent: 101 }, offering(), partner(), now));
  assert.throws(() => proposePromotion({ ...promotion("free_entry"), discountPercent: 25 }, offering(), partner(), now));
  assert.throws(() => proposePromotion({ ...promotion(), startsAt: "2029-12-31T10:00:00Z" }, offering(), partner(), now), /future/);
  assert.throws(() => proposePromotion({ ...promotion(), endsAt: "2030-01-03T10:00:00Z" }, offering(), partner(), now));
});
test("promotion review requires its own capability and rejects expired or unpublished offerings", () => {
  const request = proposePromotion(promotion(), offering(), partner(), now);
  assert.throws(() => reviewPromotion(request, "approved", moderator(["prices.approve"]), offering(), 0), /permission/);
  assert.throws(() => reviewPromotion(request, "approved", moderator(), { ...offering(), revision: 4 }, 0, undefined, now), /Offering changed/);
  assert.throws(() => reviewPromotion(request, "approved", moderator(), { ...offering(), status: "paused" }, 0, undefined, now), /not published/);
  assert.throws(() => reviewPromotion(request, "approved", moderator(), offering(), 0, undefined, "2030-01-05T00:00:00Z"), /expired/);
  assert.equal(promotionSchema.safeParse({ ...request, status: "approved" }).success, false);
});
test("pending/rejected offers never qualify for publication; approved window uses UTC boundaries", () => {
  const request = proposePromotion(promotion(), offering(), partner(), now);
  assert.equal(isPromotionInWindow(request, "2030-01-04T12:00:00Z"), false);
  const approved = reviewPromotion(request, "approved", moderator(), offering(), 0, undefined, now);
  assert.equal(isPromotionInWindow(approved, "2030-01-04T07:59:59Z"), false);
  assert.equal(isPromotionInWindow(approved, "2030-01-04T08:00:00Z"), true);
  assert.equal(isPromotionInWindow(approved, "2030-01-04T16:00:00Z"), false);
  const rejected = reviewPromotion(request, "rejected", moderator(), offering(), 0, "Test rejection", now);
  assert.equal(isPromotionInWindow(rejected, "2030-01-04T12:00:00Z"), false);
  assert.equal(approved.notificationJob, undefined);
});
