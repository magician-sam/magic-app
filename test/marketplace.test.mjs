import test from "node:test";
import assert from "node:assert/strict";
import { canPartnerAction, organizationSchema, providerBookingSchema, publicOrganization, requestProviderBooking, transitionProviderBooking, summarizeEvent } from "../dist/marketplace.js";

const organization = (id = "venue", mode = "direct") => ({ id, slug: id, name: "Synthetic partner", kind: "venue_operator", status: "approved", bookingMode: mode, ...(mode === "managed" ? { coordinatorOrganizationId: "sam" } : {}), publicDescription: "Sample", categories: ["playgrounds"], revision: 0 });
const membership = (org = "venue", account = "owner", role = "owner", status = "active") => ({ id: `${org}-${account}`, accountId: account, organizationId: org, role, status, revision: 0 });
const offering = (organizationId = "venue") => ({ id: "room", organizationId, title: "Room", categories: ["playgrounds"], status: "approved", revision: 3 });
const request = (provider = organization(), id = "booking") => requestProviderBooking({ id, eventId: "event", customerAccountId: "customer" }, provider, offering(provider.id));
const actor = (org = organization(), accountId = "owner", role = "owner") => ({ kind: "partner", accountId, organization: org, memberships: [membership(org.id, accountId, role)] });

test("partner access requires exact active membership, approved organization and permitted role", () => {
  const org = organization();
  assert.equal(canPartnerAction("owner", org, [membership()], "members.manage"), true);
  for (const memberships of [[membership("other")], [membership("venue", "other")], [membership("venue", "owner", "owner", "revoked")], [membership("venue", "owner", "owner", "invited")], []])
    assert.equal(canPartnerAction("owner", org, memberships, "bookings.read"), false);
  assert.equal(canPartnerAction("owner", { ...org, status: "suspended" }, [membership()], "bookings.read"), false);
  assert.equal(canPartnerAction("owner", org, [{ ...membership(), role: "admin" }], "bookings.read"), false);
  assert.equal(canPartnerAction("owner", org, [membership("venue", "owner", "accounting")], "bookings.confirm"), false);
  assert.equal(canPartnerAction("owner", org, [membership("venue", "owner", "artist")], "finance.read"), false);
  assert.equal(canPartnerAction("owner", org, [membership("venue", "owner", "artist")], "artist.jobs.own"), true);
});
test("public directory rejects pending/private records and returns only approved public fields", () => {
  assert.equal(publicOrganization({ ...organization(), status: "pending" }), undefined);
  assert.equal(publicOrganization({ ...organization(), privateNotes: "secret" }), undefined);
  const org = organization("venue", "managed");
  const projection = publicOrganization(org);
  assert.equal(projection.coordinatorOrganizationId, undefined);
  assert.equal(projection.revision, undefined);
  projection.categories.push("changed");
  assert.deepEqual(org.categories, ["playgrounds"]);
});
test("managed requests require a coordinator and snapshot responsibility", () => {
  assert.equal(organizationSchema.safeParse({ ...organization(), bookingMode: "managed" }).success, false);
  const org = organization("venue", "managed");
  const booking = request(org);
  org.bookingMode = "direct";
  assert.equal(booking.handlingOrganizationId, "sam");
  assert.equal(booking.bookingMode, "managed");
  assert.equal(request().handlingOrganizationId, "venue");
  assert.throws(() => request({ ...organization(), status: "suspended" }));
});
test("only responsible coordinator can progress managed requests; customer owns agreement", () => {
  const booking = request(organization("venue", "managed"));
  assert.throws(() => transitionProviderBooking(booking, "checking", actor(), 0));
  const checking = transitionProviderBooking(booking, "checking", actor(organization("sam")), 0);
  const proposal = transitionProviderBooking(checking, "proposed", actor(organization("sam"), "sales", "sales"), 1);
  assert.throws(() => transitionProviderBooking(proposal, "customer_agreed", actor(organization("sam")), 2, "quote-v1"));
  assert.throws(() => transitionProviderBooking(proposal, "customer_agreed", { kind: "customer", accountId: "stranger" }, 2, "quote-v1"));
  assert.equal(transitionProviderBooking(proposal, "customer_agreed", { kind: "customer", accountId: "customer" }, 2, "quote-v1").status, "customer_agreed");
});
test("confirmation needs agreement and resource commitment, retains pay-later independence", () => {
  const booking = { ...request(), status: "customer_agreed", customerAgreementId: "quote-v1" };
  assert.throws(() => transitionProviderBooking(booking, "confirmed", actor(), 0));
  const confirmed = transitionProviderBooking({ ...booking, resourcesConfirmed: true }, "confirmed", actor(), 0);
  assert.equal(confirmed.status, "confirmed");
  assert.equal(confirmed.paid, undefined);
  assert.equal(booking.status, "customer_agreed");
  assert.throws(() => transitionProviderBooking(confirmed, "preparing", actor(), 0));
  const prepared = transitionProviderBooking(confirmed, "preparing", actor(), 1);
  const done = transitionProviderBooking(prepared, "completed", actor(), 2);
  assert.throws(() => transitionProviderBooking(done, "cancelled", actor(), 3));
});
test("rechecking clears stale agreement and reservations without mutating source", () => {
  const original = { ...request(), status: "customer_agreed", customerAgreementId: "quote", resourcesConfirmed: true };
  const result = transitionProviderBooking(original, "checking", actor(), 0);
  assert.equal(result.customerAgreementId, undefined);
  assert.equal(result.resourcesConfirmed, false);
  assert.equal(original.customerAgreementId, "quote");
});
test("mixed-provider event reflects partial confirmation, declines and cancellations", () => {
  const one = { ...request(), status: "confirmed", customerAgreementId: "quote", resourcesConfirmed: true };
  const two = request(organization("decor", "managed"), "booking-2");
  assert.equal(summarizeEvent([]), "draft");
  assert.equal(summarizeEvent([one, two]), "partially_confirmed");
  assert.equal(summarizeEvent([one, { ...two, status: "declined" }]), "needs_attention");
  assert.equal(summarizeEvent([one, { ...two, status: "cancelled" }]), "partially_cancelled");
  assert.equal(summarizeEvent([{ ...one, status: "cancelled" }]), "cancelled");
  assert.equal(summarizeEvent([one, { ...two, status: "confirmed", customerAgreementId: "other-quote", resourcesConfirmed: true }]), "confirmed");
  assert.throws(() => summarizeEvent([one, { ...two, eventId: "other-event" }]));
  assert.throws(() => summarizeEvent([one, { ...two, customerAccountId: "other-customer" }]));
  assert.throws(() => summarizeEvent([one, one]));
});
test("invalid stored confirmation cannot appear as a confirmed event", () => {
  assert.equal(providerBookingSchema.safeParse({ ...request(), status: "confirmed" }).success, false);
  assert.equal(providerBookingSchema.safeParse({ ...request(), status: "confirmed", customerAgreementId: "quote" }).success, false);
  assert.throws(() => summarizeEvent([{ ...request(), status: "completed", resourcesConfirmed: true }]));
});
test("requests reject another partner's offering and paused, archived or unpublished services", () => {
  const input = { id: "job", eventId: "event", customerAccountId: "customer" };
  assert.throws(() => requestProviderBooking(input, organization(), offering("other")));
  for (const status of ["draft", "paused", "archived"])
    assert.throws(() => requestProviderBooking(input, organization(), { ...offering(), status }));
  const service = offering();
  const booking = requestProviderBooking(input, organization(), service);
  service.revision = 4;
  assert.equal(booking.offeringRevision, 3);
  assert.equal(providerBookingSchema.safeParse({ ...booking, handlingOrganizationId: "unrelated" }).success, false);
});
