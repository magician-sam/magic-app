import { createHash, randomUUID } from "node:crypto";
import { Database } from "./database.js";
import { organizationSchema, membershipSchema, offeringSchema, publicOrganization,
  type Organization, type Membership, type Offering } from "./marketplace.js";

export const marketplaceColumns = {
  marketplace_migrations: ["version", "checksum", "applied_at"],
  marketplace_accounts: ["id", "status", "created_at"],
  marketplace_legacy_accounts: ["kind", "legacy_id", "business_id", "account_id"],
  marketplace_organizations: ["id", "slug", "legacy_business_id", "revision", "data"],
  marketplace_memberships: ["id", "account_id", "organization_id", "revision", "data"],
  marketplace_offerings: ["id", "organization_id", "revision", "data"],
  marketplace_offering_versions: ["offering_id", "revision", "data"],
  marketplace_audit: ["id", "actor_id", "organization_id", "action", "entity_id", "at", "data"],
} as const;

const statements = [
  `CREATE TABLE marketplace_migrations (version INTEGER PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL)`,
  `CREATE TABLE marketplace_accounts (id TEXT PRIMARY KEY, status TEXT NOT NULL CHECK(status IN ('active','suspended')), created_at TEXT NOT NULL)`,
  `CREATE TABLE marketplace_legacy_accounts (
    kind TEXT NOT NULL CHECK(kind IN ('staff','customer')), legacy_id TEXT NOT NULL,
    business_id TEXT NOT NULL REFERENCES businesses(id), account_id TEXT NOT NULL REFERENCES marketplace_accounts(id),
    PRIMARY KEY(kind,legacy_id))`,
  `CREATE TABLE marketplace_organizations (
    id TEXT PRIMARY KEY, slug TEXT UNIQUE NOT NULL, legacy_business_id TEXT UNIQUE REFERENCES businesses(id),
    revision INTEGER NOT NULL CHECK(revision>=0), data TEXT NOT NULL CHECK(json_valid(data)))`,
  `CREATE TABLE marketplace_memberships (
    id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES marketplace_accounts(id),
    organization_id TEXT NOT NULL REFERENCES marketplace_organizations(id), revision INTEGER NOT NULL CHECK(revision>=0),
    data TEXT NOT NULL CHECK(json_valid(data)), UNIQUE(account_id,organization_id))`,
  `CREATE TABLE marketplace_offerings (
    id TEXT PRIMARY KEY, organization_id TEXT NOT NULL REFERENCES marketplace_organizations(id),
    revision INTEGER NOT NULL CHECK(revision>=0), data TEXT NOT NULL CHECK(json_valid(data)))`,
  `CREATE TABLE marketplace_offering_versions (
    offering_id TEXT NOT NULL REFERENCES marketplace_offerings(id), revision INTEGER NOT NULL CHECK(revision>=0),
    data TEXT NOT NULL CHECK(json_valid(data)), PRIMARY KEY(offering_id,revision))`,
  `CREATE TABLE marketplace_audit (
    id TEXT PRIMARY KEY, actor_id TEXT REFERENCES marketplace_accounts(id),
    organization_id TEXT REFERENCES marketplace_organizations(id), action TEXT NOT NULL, entity_id TEXT NOT NULL,
    at TEXT NOT NULL, data TEXT NOT NULL CHECK(json_valid(data)))`,
];
export const marketplaceMigrationChecksum = createHash("sha256").update(statements.join(";\n")).digest("hex");

export async function marketplaceSchemaState(db: Database): Promise<"absent" | "ready"> {
  const names = (await db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'marketplace_%'").all()).map(row => String(row.name));
  if (!names.length) return "absent";
  if (JSON.stringify(names.sort()) !== JSON.stringify(Object.keys(marketplaceColumns).sort()))
    throw new Error("Unsupported or incomplete marketplace schema. No data was changed.");
  return "ready";
}

// Explicitly invoked by migration/restore tooling, never on Store startup.
// Call inside a transaction. Restores populate the metadata from the snapshot.
export async function createMarketplaceRestoreSchema(db: Database) {
  if (await marketplaceSchemaState(db) !== "absent") throw new Error("Marketplace schema already exists.");
  for (const statement of statements) await db.prepare(statement).run();
}

export async function migrateMarketplace(db: Database) {
  return db.transaction(async () => {
    const state = await marketplaceSchemaState(db);
    if (state === "ready") {
      const versions = await db.prepare("SELECT version,checksum FROM marketplace_migrations ORDER BY version").all();
      if (versions.length !== 1 || Number(versions[0].version) !== 1 || versions[0].checksum !== marketplaceMigrationChecksum)
        throw new Error("Marketplace migration history does not match this build.");
      return { applied: false, version: 1 };
    }
    await createMarketplaceRestoreSchema(db);
    await db.prepare("INSERT INTO marketplace_migrations VALUES(?,?,?)").run(1, marketplaceMigrationChecksum, new Date().toISOString());
    return { applied: true, version: 1 };
  });
}

type LegacyKind = "staff" | "customer";
// Private persistence adapter, NOT an authorization boundary. The service layer
// must resolve verified sessions, permission checks and platform approval before
// writes, within the enclosing transaction. Never expose arbitrary puts as APIs.
export class MarketplaceStorage {
  constructor(readonly db: Database) {}

  async mapLegacyAccount(kind: LegacyKind, legacyId: string): Promise<string> {
    if (!["staff", "customer"].includes(kind)) throw new Error("Unknown legacy account type.");
    return this.db.transaction(async () => {
      const source = await this.db.prepare(`SELECT business_id FROM ${kind === "staff" ? "users" : "customer_accounts"} WHERE id=?`).get(legacyId);
      if (!source) throw new Error("Legacy account not found.");
      const existing = await this.db.prepare("SELECT account_id FROM marketplace_legacy_accounts WHERE kind=? AND legacy_id=?").get(kind, legacyId);
      if (existing) { await this.actor(String(existing.account_id)); return String(existing.account_id); }
      // Each legacy login has its own identity. No email/phone/name comparison,
      // password copy, membership grant or credential change occurs here.
      const accountId = randomUUID();
      await this.db.prepare("INSERT INTO marketplace_accounts VALUES(?,?,?)").run(accountId, "active", new Date().toISOString());
      await this.db.prepare("INSERT INTO marketplace_legacy_accounts VALUES(?,?,?,?)").run(kind, legacyId, String(source.business_id), accountId);
      await this.audit(accountId, null, "identity.legacy-mapped", accountId, { kind, legacyId, businessId: String(source.business_id) });
      return accountId;
    });
  }

  private async audit(actorId: string | null, organizationId: string | null, action: string, entityId: string, value: unknown) {
    await this.db.prepare("INSERT INTO marketplace_audit VALUES(?,?,?,?,?,?,?)").run(
      randomUUID(), actorId, organizationId, action, entityId, new Date().toISOString(), JSON.stringify(value));
  }

  private async actor(accountId: string) {
    const row = await this.db.prepare("SELECT status FROM marketplace_accounts WHERE id=?").get(accountId);
    if (!row || row.status !== "active") throw new Error("Active marketplace identity required.");
  }

  async organization(id: string): Promise<Organization | undefined> {
    const row = await this.db.prepare("SELECT * FROM marketplace_organizations WHERE id=?").get(id);
    if (!row) return undefined;
    const value = organizationSchema.parse(JSON.parse(String(row.data)));
    if (value.id !== row.id || value.slug !== row.slug || value.revision !== Number(row.revision)) throw new Error("Organization storage is inconsistent.");
    return value;
  }

  async insertOrganization(input: Organization, actorId: string, legacyBusinessId?: string) {
    const value = organizationSchema.parse(input);
    if (value.revision !== 0) throw new Error("New organization revision must be zero.");
    return this.db.transaction(async () => {
      await this.actor(actorId);
      if (value.bookingMode === "managed") {
        const coordinator = await this.organization(value.coordinatorOrganizationId!);
        if (!coordinator || coordinator.status !== "approved") throw new Error("Approved coordinator required.");
      }
      await this.db.prepare("INSERT INTO marketplace_organizations VALUES(?,?,?,?,?)").run(value.id, value.slug, legacyBusinessId ?? null, value.revision, JSON.stringify(value));
      await this.audit(actorId, value.id, "organization.created", value.id, { after: value });
      return value;
    });
  }

  async insertMembership(input: Membership, actorId: string) {
    const value = membershipSchema.parse(input);
    if (value.revision !== 0) throw new Error("New membership revision must be zero.");
    return this.db.transaction(async () => {
      await this.actor(actorId);
      await this.actor(value.accountId);
      await this.db.prepare("INSERT INTO marketplace_memberships VALUES(?,?,?,?,?)").run(value.id, value.accountId, value.organizationId, value.revision, JSON.stringify(value));
      await this.audit(actorId, value.organizationId, "membership.created", value.id, { after: value });
      return value;
    });
  }

  async updateOrganization(input: Organization, expectedRevision: number, actorId: string, reviewNote?: string) {
    const value = organizationSchema.parse(input);
    if (value.revision !== expectedRevision + 1) throw new Error("Organization revision must advance once.");
    return this.db.transaction(async () => {
      await this.actor(actorId);
      const before = await this.organization(value.id);
      if (!before || before.revision !== expectedRevision) throw new Error("Organization changed; reload before editing.");
      if (value.bookingMode === "managed") {
        const coordinator = await this.organization(value.coordinatorOrganizationId!);
        if (!coordinator || coordinator.status !== "approved") throw new Error("Approved coordinator required.");
      }
      const result = await this.db.prepare("UPDATE marketplace_organizations SET slug=?,revision=?,data=? WHERE id=? AND revision=?").run(
        value.slug, value.revision, JSON.stringify(value), value.id, expectedRevision);
      if (Number(result.changes) !== 1) throw new Error("Organization changed; reload before editing.");
      await this.audit(actorId, value.id, "organization.updated", value.id, { before, after: value, ...(reviewNote ? { reviewNote } : {}) });
      return value;
    });
  }

  async memberships(accountId: string): Promise<Membership[]> {
    const rows = await this.db.prepare("SELECT * FROM marketplace_memberships WHERE account_id=? ORDER BY id").all(accountId);
    return rows.map(row => {
      const value = membershipSchema.parse(JSON.parse(String(row.data)));
      if (value.id !== row.id || value.accountId !== row.account_id || value.organizationId !== row.organization_id || value.revision !== Number(row.revision))
        throw new Error("Membership storage is inconsistent.");
      return value;
    });
  }

  async updateMembership(input: Membership, expectedRevision: number, actorId: string) {
    const value = membershipSchema.parse(input);
    if (value.revision !== expectedRevision + 1) throw new Error("Membership revision must advance once.");
    return this.db.transaction(async () => {
      await this.actor(actorId);
      const before = (await this.memberships(value.accountId)).find(item => item.id === value.id && item.organizationId === value.organizationId);
      if (!before || before.revision !== expectedRevision) throw new Error("Membership changed; reload before editing.");
      const result = await this.db.prepare("UPDATE marketplace_memberships SET revision=?,data=? WHERE id=? AND account_id=? AND organization_id=? AND revision=?").run(
        value.revision, JSON.stringify(value), value.id, value.accountId, value.organizationId, expectedRevision);
      if (Number(result.changes) !== 1) throw new Error("Membership changed; reload before editing.");
      await this.audit(actorId, value.organizationId, "membership.updated", value.id, { before, after: value });
      return value;
    });
  }

  async offering(id: string, organizationId: string): Promise<Offering | undefined> {
    const row = await this.db.prepare("SELECT * FROM marketplace_offerings WHERE id=? AND organization_id=?").get(id, organizationId);
    if (!row) return undefined;
    const value = offeringSchema.parse(JSON.parse(String(row.data)));
    if (value.id !== row.id || value.organizationId !== row.organization_id || value.revision !== Number(row.revision)) throw new Error("Offering storage is inconsistent.");
    return value;
  }

  async insertOffering(input: Offering, actorId: string) {
    const value = offeringSchema.parse(input);
    if (value.revision !== 0) throw new Error("New offering revision must be zero.");
    return this.db.transaction(async () => {
      await this.actor(actorId);
      const organization = await this.organization(value.organizationId);
      if (!organization || (value.status === "approved" && organization.status !== "approved")) throw new Error("Offering organization is not approved.");
      await this.db.prepare("INSERT INTO marketplace_offerings VALUES(?,?,?,?)").run(value.id, value.organizationId, value.revision, JSON.stringify(value));
      await this.db.prepare("INSERT INTO marketplace_offering_versions VALUES(?,?,?)").run(value.id, value.revision, JSON.stringify(value));
      await this.audit(actorId, value.organizationId, "offering.created", value.id, { after: value });
      return value;
    });
  }

  async updateOffering(input: Offering, expectedRevision: number, actorId: string, reviewNote?: string) {
    const value = offeringSchema.parse(input);
    if (value.revision !== expectedRevision + 1) throw new Error("Offering revision must advance once.");
    return this.db.transaction(async () => {
      await this.actor(actorId);
      const before = await this.offering(value.id, value.organizationId);
      if (!before || before.revision !== expectedRevision) throw new Error("Offering changed; reload before editing.");
      const organization = await this.organization(value.organizationId);
      if (!organization || (value.status === "approved" && organization.status !== "approved")) throw new Error("Offering organization is not approved.");
      const result = await this.db.prepare("UPDATE marketplace_offerings SET revision=?,data=? WHERE id=? AND organization_id=? AND revision=?").run(value.revision, JSON.stringify(value), value.id, value.organizationId, expectedRevision);
      if (Number(result.changes) !== 1) throw new Error("Offering changed; reload before editing.");
      await this.db.prepare("INSERT INTO marketplace_offering_versions VALUES(?,?,?)").run(value.id, value.revision, JSON.stringify(value));
      await this.audit(actorId, value.organizationId, "offering.updated", value.id, { before, after: value, ...(reviewNote ? { reviewNote } : {}) });
      return value;
    });
  }

  async publicDirectory() {
    const rows = await this.db.prepare("SELECT id FROM marketplace_organizations ORDER BY slug").all();
    const values = [];
    for (const row of rows) {
      const organization = await this.organization(String(row.id));
      const projection = publicOrganization(organization);
      if (projection) values.push(projection);
    }
    return values;
  }
}
