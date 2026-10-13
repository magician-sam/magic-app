import { randomUUID } from "node:crypto";
import { z } from "zod";
import { hash } from "./auth.js";
import { requireThat } from "./domain.js";
import type { Store } from "./store.js";
import { marketplaceSchemaState, MarketplaceStorage } from "./marketplace-storage.js";
import { membershipSchema, organizationSchema, offeringSchema, type Organization, type Membership } from "./marketplace.js";

export const workspaceSessionKind = z.enum(["staff", "customer"]);
type SessionKind = z.infer<typeof workspaceSessionKind>;
const profileInput = z.object({ name: organizationSchema.shape.name, publicDescription: organizationSchema.shape.publicDescription,
  categories: organizationSchema.shape.categories, publicContact: organizationSchema.shape.publicContact,
  publicLocation: organizationSchema.shape.publicLocation, publicMedia: organizationSchema.shape.publicMedia,
  expectedRevision: z.number().int().nonnegative() }).strict();
const listingInput = offeringSchema.pick({ title: true, kind: true, categories: true }).strict();
const listingUpdate = listingInput.extend({ expectedRevision: z.number().int().nonnegative() }).strict();
const applicationInput = z.object({ ...profileInput.omit({ expectedRevision: true }).shape,
  slug: organizationSchema.shape.slug, kind: organizationSchema.shape.kind }).strict();
const revisionInput = z.object({ expectedRevision: z.number().int().nonnegative() }).strict();
const reviewInput = revisionInput.extend({ decision: z.enum(["approve", "return"]), note: z.string().trim().min(1).max(2000) }).strict();

// Session, mapping, membership and writes share one database transaction. The
// caller supplies only the cookie header and explicit login type, never roles.
export class MarketplaceWorkspaces {
  private storage: MarketplaceStorage;
  constructor(private store: Store) { this.storage = new MarketplaceStorage(store.db); }

  private async login(cookieHeader: string | undefined, suppliedKind: unknown) {
    const kind = workspaceSessionKind.parse(suppliedKind);
    const cookieName = kind === "staff" ? "magic_session" : "magic_customer";
    const cookie = cookieHeader?.match(new RegExp(`(?:^|;\\s*)${cookieName}=([a-f0-9]{64})(?:;|$)`))?.[1];
    requireThat(cookie, "Please sign in to this account.", 401);
    const row = kind === "staff"
      ? await this.store.db.prepare("SELECT u.id,u.business_id,u.data FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.hash=? AND s.expires>?").get(hash(cookie), Date.now())
      : await this.store.db.prepare("SELECT a.id,a.business_id FROM customer_sessions s JOIN customer_accounts a ON a.id=s.account_id WHERE s.hash=? AND s.expires>?").get(hash(cookie), Date.now());
    requireThat(row, "Please sign in to this account.", 401);
    requireThat(await marketplaceSchemaState(this.store.db) === "ready", "Partner workspaces are not activated yet.", 503);
    return { row, kind };
  }

  private async identity(cookieHeader: string | undefined, suppliedKind: unknown) {
    const { row, kind } = await this.login(cookieHeader, suppliedKind);
    const mapped = await this.store.db.prepare(`SELECT a.id,a.status FROM marketplace_legacy_accounts l
      JOIN marketplace_accounts a ON a.id=l.account_id WHERE l.kind=? AND l.legacy_id=? AND l.business_id=?`).get(kind, row.id, row.business_id);
    requireThat(mapped && mapped.status === "active", "This account does not have active marketplace access.", 403);
    return String(mapped.id);
  }

  private async platformIdentity(cookieHeader: string | undefined) {
    const { row } = await this.login(cookieHeader, "staff");
    const user = JSON.parse(String(row.data));
    requireThat(user.id === row.id && user.businessId === row.business_id && user.role === "admin", "Platform review access denied.", 403);
    // Platform capability comes from the persisted master-admin login, not a
    // partner role or support-business header. It grants no partner membership.
    return this.identity(cookieHeader, "staff");
  }

  private async access(accountId: string, organizationId: string) {
    const row = await this.store.db.prepare("SELECT * FROM marketplace_memberships WHERE account_id=? AND organization_id=?").get(accountId, organizationId);
    const membership = row && membershipSchema.parse(JSON.parse(String(row.data)));
    requireThat(membership && membership.status === "active" && membership.accountId === accountId
      && membership.organizationId === organizationId && membership.id === row!.id && membership.revision === Number(row!.revision),
    "Workspace access denied.", 403);
    const organization = await this.storage.organization(organizationId);
    requireThat(organization, "Workspace access denied.", 403);
    return { organization, membership };
  }

  private canEdit(organization: Organization, membership: Membership) {
    return ["draft", "pending", "approved"].includes(organization.status) && ["owner", "work"].includes(membership.role);
  }

  async list(cookie: string | undefined, kind: SessionKind, after = "") {
    return this.store.transaction(async () => {
      const accountId = await this.identity(cookie, kind);
      // Stable membership cursor; no other account's memberships are selected.
      const rows = await this.store.db.prepare("SELECT organization_id,id FROM marketplace_memberships WHERE account_id=? AND id>? ORDER BY id LIMIT 51").all(accountId, after);
      const memberships = await this.storage.memberships(accountId);
      const workspaces = [];
      for (const row of rows.slice(0, 50)) {
        const membership = memberships.find(value => value.id === row.id && value.organizationId === row.organization_id && value.status === "active");
        if (!membership) continue;
        const organization = await this.storage.organization(String(row.organization_id));
        if (organization) workspaces.push({ id: organization.id, name: organization.name, kind: organization.kind,
          status: organization.status, role: membership.role });
      }
      return { workspaces, next: rows.length > 50 ? String(rows[49].id) : null };
    });
  }

  async view(cookie: string | undefined, kind: SessionKind, organizationId: string) {
    return this.store.transaction(async () => {
      const accountId = await this.identity(cookie, kind);
      const { organization, membership } = await this.access(accountId, organizationId);
      return { organization, membership: { role: membership.role, revision: membership.revision },
        canEditDrafts: this.canEdit(organization, membership) };
    });
  }

  async editProfile(cookie: string | undefined, kind: SessionKind, organizationId: string, input: unknown) {
    const value = profileInput.parse(input);
    return this.store.transaction(async () => {
      const accountId = await this.identity(cookie, kind);
      const { organization, membership } = await this.access(accountId, organizationId);
      requireThat(this.canEdit(organization, membership), "Profile editing is not permitted.", 403);
      // Approved public profiles need a separate reviewable amendment. Never
      // bypass platform approval by writing partner-supplied public content.
      requireThat(["draft", "pending"].includes(organization.status), "Published profile changes need platform review; this editor currently handles unpublished profiles.", 409);
      requireThat(organization.revision === value.expectedRevision, "Profile changed; reload before editing.", 409);
      return this.storage.updateOrganization({ ...organization, name: value.name, publicDescription: value.publicDescription,
        categories: value.categories, publicContact: value.publicContact,
        ...(value.publicLocation !== undefined ? { publicLocation: value.publicLocation } : {}),
        ...(value.publicMedia !== undefined ? { publicMedia: value.publicMedia } : {}),
        revision: organization.revision + 1 }, organization.revision, accountId);
    });
  }

  async listings(cookie: string | undefined, kind: SessionKind, organizationId: string, after = "") {
    return this.store.transaction(async () => {
      const accountId = await this.identity(cookie, kind);
      const { organization, membership } = await this.access(accountId, organizationId);
      requireThat(["owner", "work"].includes(membership.role), "Listing access denied.", 403);
      const rows = await this.store.db.prepare("SELECT id FROM marketplace_offerings WHERE organization_id=? AND id>? ORDER BY id LIMIT 51").all(organization.id, after);
      const listings = [];
      for (const row of rows.slice(0, 50)) listings.push(await this.storage.offering(String(row.id), organization.id));
      return { listings, next: rows.length > 50 ? String(rows[49].id) : null };
    });
  }

  async createDraft(cookie: string | undefined, kind: SessionKind, organizationId: string, input: unknown) {
    const value = listingInput.parse(input);
    return this.store.transaction(async () => {
      const accountId = await this.identity(cookie, kind);
      const { organization, membership } = await this.access(accountId, organizationId);
      requireThat(this.canEdit(organization, membership), "Listing editing is not permitted.", 403);
      return this.storage.insertOffering({ ...value, id: randomUUID(), organizationId: organization.id, status: "draft", revision: 0 }, accountId);
    });
  }

  async editDraft(cookie: string | undefined, kind: SessionKind, organizationId: string, offeringId: string, input: unknown) {
    const value = listingUpdate.parse(input);
    return this.store.transaction(async () => {
      const accountId = await this.identity(cookie, kind);
      const { organization, membership } = await this.access(accountId, organizationId);
      requireThat(this.canEdit(organization, membership), "Listing editing is not permitted.", 403);
      const listing = await this.storage.offering(offeringId, organization.id);
      requireThat(listing, "Listing not found.", 404);
      requireThat(listing.status === "draft", "Published listings need platform review; this editor currently handles drafts.", 409);
      requireThat(listing.revision === value.expectedRevision, "Listing changed; reload before editing.", 409);
      return this.storage.updateOffering({ ...listing, title: value.title, kind: value.kind, categories: value.categories,
        revision: listing.revision + 1 }, listing.revision, accountId);
    });
  }

  async apply(cookie: string | undefined, kind: SessionKind, input: unknown) {
    const value = applicationInput.parse(input);
    return this.store.transaction(async () => {
      const login = await this.login(cookie, kind);
      // An explicit application may create this login's independent identity.
      // Simply browsing does not link accounts or grant workspace access.
      const accountId = await this.storage.mapLegacyAccount(kind, String(login.row.id));
      const open = await this.store.db.prepare(`SELECT count(*) AS n FROM marketplace_memberships m
        JOIN marketplace_organizations o ON o.id=m.organization_id WHERE m.account_id=?
        AND json_extract(m.data,'$.role')='owner' AND json_extract(m.data,'$.status')='active'
        AND json_extract(o.data,'$.status') IN ('draft','pending')`).get(accountId);
      requireThat(Number(open?.n) < 3, "Finish your existing partner applications before adding another.", 409);
      requireThat(!(await this.store.db.prepare("SELECT id FROM marketplace_organizations WHERE slug=?").get(value.slug)), "That profile address is unavailable.", 409);
      const organization = await this.storage.insertOrganization({ ...value, id: randomUUID(), status: "draft", bookingMode: "direct", revision: 0 }, accountId);
      await this.storage.insertMembership({ id: randomUUID(), accountId, organizationId: organization.id, role: "owner", status: "active", revision: 0 }, accountId);
      return organization;
    });
  }

  async submitProfile(cookie: string | undefined, kind: SessionKind, organizationId: string, input: unknown) {
    const value = revisionInput.parse(input);
    return this.store.transaction(async () => {
      const accountId = await this.identity(cookie, kind);
      const { organization, membership } = await this.access(accountId, organizationId);
      requireThat(membership.role === "owner", "Only the partner owner can submit this application.", 403);
      requireThat(organization.status === "draft" && organization.revision === value.expectedRevision, "Application changed; reload before submitting.", 409);
      requireThat(organization.categories.length > 0 && organization.publicDescription.trim().length >= 20, "Add a category and a short description before submitting.");
      return this.storage.updateOrganization({ ...organization, status: "pending", revision: organization.revision + 1 }, organization.revision, accountId);
    });
  }

  async submitListing(cookie: string | undefined, kind: SessionKind, organizationId: string, offeringId: string, input: unknown) {
    const value = z.union([revisionInput, listingUpdate]).parse(input);
    return this.store.transaction(async () => {
      const accountId = await this.identity(cookie, kind);
      const { organization, membership } = await this.access(accountId, organizationId);
      requireThat(this.canEdit(organization, membership), "Listing submission is not permitted.", 403);
      const offering = await this.storage.offering(offeringId, organizationId);
      requireThat(offering, "Listing not found.", 404);
      requireThat(offering.status === "draft" && offering.revision === value.expectedRevision, "Listing changed; reload before submitting.", 409);
      // The desk may save edits and submit in one action. Both use one revision
      // and transaction, avoiding a saved draft followed by a failed submission.
      const edits = "title" in value ? { title: value.title, kind: value.kind, categories: value.categories } : {};
      return this.storage.updateOffering({ ...offering, ...edits, status: "pending", revision: offering.revision + 1 }, offering.revision, accountId);
    });
  }

  async platformQueue(cookie: string | undefined, after = "") {
    return this.store.transaction(async () => {
      await this.platformIdentity(cookie);
      const rows = await this.store.db.prepare("SELECT id FROM marketplace_organizations WHERE id>? AND json_extract(data,'$.status')='pending' ORDER BY id LIMIT 51").all(after);
      const applications = [];
      for (const row of rows.slice(0, 50)) applications.push(await this.storage.organization(String(row.id)));
      return { applications, next: rows.length > 50 ? String(rows[49].id) : null };
    });
  }

  async reviewProfile(cookie: string | undefined, organizationId: string, input: unknown) {
    const value = reviewInput.parse(input);
    return this.store.transaction(async () => {
      const actorId = await this.platformIdentity(cookie);
      const organization = await this.storage.organization(organizationId);
      requireThat(organization, "Application not found.", 404);
      requireThat(organization.status === "pending" && organization.revision === value.expectedRevision, "Application changed; reload before reviewing.", 409);
      return this.storage.updateOrganization({ ...organization, status: value.decision === "approve" ? "approved" : "draft",
        revision: organization.revision + 1 }, organization.revision, actorId, value.note);
    });
  }

  async platformListings(cookie: string | undefined, organizationId: string, after = "") {
    return this.store.transaction(async () => {
      await this.platformIdentity(cookie);
      const rows = await this.store.db.prepare("SELECT id FROM marketplace_offerings WHERE organization_id=? AND id>? AND json_extract(data,'$.status')='pending' ORDER BY id LIMIT 51").all(organizationId, after);
      const listings = [];
      for (const row of rows.slice(0, 50)) listings.push(await this.storage.offering(String(row.id), organizationId));
      return { listings, next: rows.length > 50 ? String(rows[49].id) : null };
    });
  }

  async platformListingQueue(cookie: string | undefined, after = "") {
    return this.store.transaction(async () => {
      await this.platformIdentity(cookie);
      const rows = await this.store.db.prepare("SELECT id,organization_id FROM marketplace_offerings WHERE id>? AND json_extract(data,'$.status')='pending' ORDER BY id LIMIT 51").all(after);
      const listings = [];
      for (const row of rows.slice(0, 50)) {
        const offering = await this.storage.offering(String(row.id), String(row.organization_id));
        const organization = await this.storage.organization(String(row.organization_id));
        if (offering && organization) listings.push({ offering, partner: { id: organization.id, name: organization.name, status: organization.status } });
      }
      return { listings, next: rows.length > 50 ? String(rows[49].id) : null };
    });
  }

  async reviewListing(cookie: string | undefined, organizationId: string, offeringId: string, input: unknown) {
    const value = reviewInput.parse(input);
    return this.store.transaction(async () => {
      const actorId = await this.platformIdentity(cookie);
      const organization = await this.storage.organization(organizationId), offering = await this.storage.offering(offeringId, organizationId);
      requireThat(organization && offering, "Listing not found.", 404);
      requireThat(offering.status === "pending" && offering.revision === value.expectedRevision, "Listing changed; reload before reviewing.", 409);
      requireThat(value.decision !== "approve" || organization.status === "approved", "Approve the partner profile before publishing a listing.", 409);
      return this.storage.updateOffering({ ...offering, status: value.decision === "approve" ? "approved" : "draft",
        revision: offering.revision + 1 }, offering.revision, actorId, value.note);
    });
  }
}
