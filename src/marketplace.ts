import { z } from "zod";

// Shared domain rules only. No legacy account migration or new public routes.
const identifier = z.string().trim().min(1).max(128);
export const bookingModeSchema = z.enum(["managed", "direct"]);
export type BookingMode = z.infer<typeof bookingModeSchema>;
export const organizationSchema = z.object({
  id: identifier,
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100),
  name: z.string().trim().min(1).max(200),
  kind: z.enum(["independent_artist", "venue_operator", "company"]),
  status: z.enum(["draft", "pending", "approved", "suspended", "archived"]),
  bookingMode: bookingModeSchema,
  coordinatorOrganizationId: identifier.optional(),
  publicDescription: z.string().max(4000),
  categories: z.array(identifier).max(50),
  publicContact: z.object({
    phone: z.string().max(40).optional(),
    email: z.email().optional(),
  }).strict().optional(),
  revision: z.number().int().nonnegative(),
}).strict().superRefine((value, ctx) => {
  if (value.bookingMode === "managed" && !value.coordinatorOrganizationId)
    ctx.addIssue({ code: "custom", message: "Managed partners need a coordinator.", path: ["coordinatorOrganizationId"] });
});
export type Organization = z.infer<typeof organizationSchema>;

export const offeringSchema = z.object({
  id: identifier,
  organizationId: identifier,
  title: z.string().trim().min(1).max(200),
  kind: z.enum(["service", "birthday_package", "playground_entry"]).default("service"),
  categories: z.array(identifier).min(1).max(50),
  status: z.enum(["draft", "pending", "approved", "paused", "archived"]),
  revision: z.number().int().nonnegative(),
}).strict();
export type Offering = z.infer<typeof offeringSchema>;

export const membershipSchema = z.object({
  id: identifier,
  accountId: identifier,
  organizationId: identifier,
  role: z.enum(["owner", "work", "sales", "accounting", "artist"]),
  status: z.enum(["invited", "active", "revoked"]),
  revision: z.number().int().nonnegative(),
}).strict();
export type Membership = z.infer<typeof membershipSchema>;
export type PartnerAction =
  | "profile.edit" | "listings.edit" | "members.manage"
  | "bookings.read" | "bookings.quote" | "bookings.confirm"
  | "finance.read" | "finance.write" | "calendar.manage"
  | "prices.request" | "promotions.request"
  | "artist.jobs.own" | "artist.availability.own";
const partnerActions: Record<Membership["role"], readonly PartnerAction[]> = {
  owner: ["profile.edit", "listings.edit", "members.manage", "bookings.read", "bookings.quote", "bookings.confirm", "finance.read", "finance.write", "calendar.manage", "prices.request", "promotions.request"],
  work: ["profile.edit", "listings.edit", "bookings.read", "bookings.confirm", "calendar.manage"],
  sales: ["bookings.read", "bookings.quote", "prices.request", "promotions.request"],
  accounting: ["finance.read", "finance.write", "prices.request"],
  artist: ["artist.jobs.own", "artist.availability.own"],
};

// accountId must come from a verified session; memberships from server storage.
// Platform support roles never confer partner membership implicitly.
export function canPartnerAction(accountId: string, organization: Organization,
  memberships: readonly Membership[], action: PartnerAction): boolean {
  if (!accountId || !organizationSchema.safeParse(organization).success || organization.status !== "approved") return false;
  return memberships.some((candidate) => {
    const result = membershipSchema.safeParse(candidate);
    return result.success && result.data.status === "active"
      && result.data.accountId === accountId && result.data.organizationId === organization.id
      && partnerActions[result.data.role].includes(action);
  });
}

// Allowlist public fields; never spread a storage record into a public response.
export function publicOrganization(input: unknown) {
  const result = organizationSchema.safeParse(input);
  if (!result.success || result.data.status !== "approved") return undefined;
  const value = result.data;
  return { id: value.id, slug: value.slug, name: value.name, kind: value.kind,
    description: value.publicDescription, categories: [...value.categories],
    bookingMode: value.bookingMode,
    ...(value.publicContact ? { contact: { ...value.publicContact } } : {}),
  };
}

export const providerBookingSchema = z.object({
  id: identifier,
  eventId: identifier,
  customerAccountId: identifier,
  providerOrganizationId: identifier,
  handlingOrganizationId: identifier,
  bookingMode: bookingModeSchema,
  offeringId: identifier,
  offeringRevision: z.number().int().nonnegative(),
  status: z.enum(["requested", "checking", "proposed", "customer_agreed", "confirmed", "preparing", "completed", "declined", "cancelled"]),
  customerAgreementId: identifier.optional(),
  resourcesConfirmed: z.boolean(),
  revision: z.number().int().nonnegative(),
}).strict().superRefine((value, ctx) => {
  if (value.bookingMode === "direct" && value.providerOrganizationId !== value.handlingOrganizationId)
    ctx.addIssue({ code: "custom", message: "Direct bookings must be handled by their provider.", path: ["handlingOrganizationId"] });
  if (["customer_agreed", "confirmed", "preparing", "completed"].includes(value.status) && !value.customerAgreementId)
    ctx.addIssue({ code: "custom", message: "An agreed proposal reference is required.", path: ["customerAgreementId"] });
  if (["confirmed", "preparing", "completed"].includes(value.status) && !value.resourcesConfirmed)
    ctx.addIssue({ code: "custom", message: "Confirmed bookings need committed resources.", path: ["resourcesConfirmed"] });
});
export type ProviderBooking = z.infer<typeof providerBookingSchema>;

export function requestProviderBooking(input: {
  id: string; eventId: string; customerAccountId: string;
}, provider: Organization, suppliedOffering: Offering): ProviderBooking {
  const organization = organizationSchema.parse(provider);
  const offering = offeringSchema.parse(suppliedOffering);
  if (organization.status !== "approved") throw new Error("Partner is not available for new requests.");
  if (offering.organizationId !== organization.id || offering.status !== "approved")
    throw new Error("Offering is not available from this partner.");
  // Snapshot responsibility: later profile/mode edits cannot change this request.
  return providerBookingSchema.parse({ ...input,
    offeringId: offering.id, offeringRevision: offering.revision,
    providerOrganizationId: organization.id,
    handlingOrganizationId: organization.bookingMode === "direct" ? organization.id : organization.coordinatorOrganizationId,
    bookingMode: organization.bookingMode, status: "requested",
    resourcesConfirmed: false, revision: 0,
  });
}

type TransitionActor = { kind: "customer"; accountId: string }
  | { kind: "partner"; accountId: string; organization: Organization; memberships: readonly Membership[] };
const nextStates: Record<ProviderBooking["status"], readonly ProviderBooking["status"][]> = {
  requested: ["checking", "declined", "cancelled"],
  checking: ["proposed", "declined", "cancelled"],
  proposed: ["customer_agreed", "checking", "declined", "cancelled"],
  customer_agreed: ["confirmed", "checking", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["completed", "cancelled"],
  completed: [], declined: [], cancelled: [],
};
export function transitionProviderBooking(input: ProviderBooking,
  next: ProviderBooking["status"], actor: TransitionActor, expectedRevision: number,
  agreementId?: string): ProviderBooking {
  const booking = providerBookingSchema.parse(input);
  if (expectedRevision !== booking.revision) throw new Error("Booking changed; reload before continuing.");
  if (!nextStates[booking.status].includes(next)) throw new Error("Booking transition is not permitted.");
  if (actor.kind === "customer") {
    if (actor.accountId !== booking.customerAccountId || next !== "customer_agreed" || !agreementId)
      throw new Error("Customer cannot perform this action.");
  } else {
    const action = next === "proposed" ? "bookings.quote" : "bookings.confirm";
    if (actor.organization.id !== booking.handlingOrganizationId || !canPartnerAction(actor.accountId, actor.organization, actor.memberships, action) || next === "customer_agreed")
      throw new Error("Partner cannot perform this action.");
  }
  if (next === "confirmed" && (!booking.customerAgreementId || !booking.resourcesConfirmed))
    throw new Error("Customer agreement and reserved resources are required.");
  // A return to checking invalidates the old commitment. Payment is a separate ledger.
  const updated = { ...booking, status: next, revision: booking.revision + 1 };
  if (next === "checking") { delete updated.customerAgreementId; updated.resourcesConfirmed = false; }
  if (next === "customer_agreed") updated.customerAgreementId = agreementId;
  return providerBookingSchema.parse(updated);
}

// All contributions are required; removal/replacement will need an approved amendment.
export function summarizeEvent(input: readonly ProviderBooking[]) {
  const bookings = input.map(value => providerBookingSchema.parse(value));
  if (!bookings.length) return "draft";
  if (new Set(bookings.map(b => b.eventId)).size !== 1 || new Set(bookings.map(b => b.customerAccountId)).size !== 1 || new Set(bookings.map(b => b.id)).size !== bookings.length)
    throw new Error("Event contributions must have one event and customer, without duplicates.");
  if (bookings.every(b => b.status === "cancelled")) return "cancelled";
  if (bookings.some(b => b.status === "cancelled")) return "partially_cancelled";
  if (bookings.some(b => b.status === "declined")) return "needs_attention";
  if (bookings.every(b => b.status === "completed")) return "completed";
  const committed = ["confirmed", "preparing", "completed"];
  if (bookings.every(b => committed.includes(b.status)))
    return bookings.some(b => b.status === "preparing" || b.status === "completed") ? "preparing" : "confirmed";
  if (bookings.some(b => committed.includes(b.status))) return "partially_confirmed";
  return "awaiting_replies";
}
