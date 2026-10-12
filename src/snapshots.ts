import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";
import { z } from "zod";
import type { Store } from "./store.js";
import { marketplaceColumns, marketplaceSchemaState, createMarketplaceRestoreSchema, marketplaceMigrationChecksum } from "./marketplace-storage.js";
const legacyTables = {
  businesses: ["id", "slug", "data"],
  users: ["id", "business_id", "email", "password", "data"],
  records: ["business_id", "kind", "id", "data"],
  sessions: ["hash", "user_id", "expires"],
  links: ["hash", "business_id", "booking_id", "expires"],
  visits: ["business_id", "source", "day", "count"],
  customer_accounts: [
    "id",
    "business_id",
    "customer_id",
    "username",
    "password",
  ],
  customer_sessions: ["hash", "account_id", "expires"],
  customer_resets: [
    "id",
    "account_id",
    "requested_at",
    "code_hash",
    "expires",
    "used",
  ],
  referral_codes: ["code", "business_id", "account_id"],
  interest_clicks: ["business_id", "kind", "item_key", "day", "count"],
  rate_limits: ["id", "count", "expires"],
} as const;
export async function snapshotTables(store: Store): Promise<{ version: 2 | 3; tables: Record<string, readonly string[]> }> {
  const expanded = await marketplaceSchemaState(store.db) === "ready";
  const tables = expanded ? { ...legacyTables, ...marketplaceColumns } : legacyTables;
  const actual = (await store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()).map(row => String(row.name)).sort();
  if (JSON.stringify(actual) !== JSON.stringify(Object.keys(tables).sort()))
    throw new Error("Unknown database tables are not covered by this backup format.");
  return { version: expanded ? 3 : 2, tables };
}

export async function businessBackupScope(store: Store, businessId: string): Promise<boolean> {
  const businesses = await store.db.prepare("SELECT id FROM businesses").all();
  if (businesses.length !== 1 || businesses[0].id !== businessId) return false;
  if (await marketplaceSchemaState(store.db) === "absent") return true;
  // A single legacy business can still coexist with several independent partner
  // organizations. Its owner must not download their accounts/records.
  const foreignOrganization = await store.db.prepare("SELECT id FROM marketplace_organizations WHERE legacy_business_id IS NULL OR legacy_business_id!=? LIMIT 1").get(businessId);
  const unscopedAccount = await store.db.prepare(`SELECT a.id FROM marketplace_accounts a WHERE NOT EXISTS
    (SELECT 1 FROM marketplace_legacy_accounts l WHERE l.account_id=a.id AND l.business_id=?)
    OR EXISTS (SELECT 1 FROM marketplace_legacy_accounts l WHERE l.account_id=a.id AND l.business_id!=?) LIMIT 1`).get(businessId, businessId);
  return !foreignOrganization && !unscopedAccount;
}
const snapshotSchema = z
  .object({
    version: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    createdAt: z.iso.datetime(),
    tables: z.record(
      z.string(),
      z.array(
        z.record(
          z.string(),
          z.union([z.string(), z.number().finite(), z.null()]),
        ),
      ),
    ),
  })
  .strict();
export async function snapshot(store: Store) {
  return store.transaction(async () => {
    const { version, tables } = await snapshotTables(store);
    const data: Record<string, unknown> = {};
    for (const [table, columns] of Object.entries(tables))
      data[table] = await store.db
        .prepare(`SELECT ${columns.join(",")} FROM ${table} ORDER BY rowid`)
        .all();
    return snapshotSchema.parse({
      version,
      createdAt: new Date().toISOString(),
      tables: data,
    });
  });
}
export async function restoreSnapshot(store: Store, input: unknown) {
  const data = snapshotSchema.parse(input);
  const tables: Record<string, readonly string[]> = data.version === 3 ? { ...legacyTables, ...marketplaceColumns } : legacyTables;
  if (data.version === 1) {
    // Older encrypted backups predate these tables; restore them as empty.
    for (const name of ["referral_codes", "interest_clicks", "rate_limits"])
      data.tables[name] ??= [];
  }
  if (
    JSON.stringify(Object.keys(data.tables).sort()) !==
    JSON.stringify(Object.keys(tables).sort())
  )
    throw new Error("Backup table list does not match this version.");
  return store.transaction(async () => {
    const state = await marketplaceSchemaState(store.db);
    if (data.version === 3) {
      const migrations = data.tables.marketplace_migrations;
      if (migrations.length !== 1 || migrations[0].version !== 1 || migrations[0].checksum !== marketplaceMigrationChecksum)
        throw new Error("Unsupported marketplace migration in backup.");
      if (state === "absent") await createMarketplaceRestoreSchema(store.db);
    } else if (state !== "absent") {
      throw new Error("Restore legacy backups into a legacy destination first, then migrate.");
    }
    for (const table of Object.keys(tables)) {
      const row = await store.db
        .prepare(`SELECT count(*) AS count FROM ${table}`)
        .get();
      if (Number(row!.count))
        throw new Error(
          "Restore requires an empty destination. Existing data was not changed.",
        );
    }
    let count = 0;
    for (const table of Object.keys(tables)) {
      const columns = tables[table];
      for (const row of data.tables[table]) {
        if (
          Object.keys(row).length !== columns.length ||
          columns.some((c) => !(c in row))
        )
          throw new Error("Invalid backup columns.");
        await store.db
          .prepare(
            `INSERT INTO ${table} (${columns.join(",")}) VALUES (${columns.map(() => "?").join(",")})`,
          )
          .run(...columns.map((c) => row[c]));
        count++;
      }
    }
    if ((await store.db.prepare("PRAGMA foreign_key_check").all()).length)
      throw new Error("Backup contains broken relationships.");
    return { rows: count };
  });
}
function key(passphrase: string, salt: Buffer) {
  if (passphrase.length < 20)
    throw new Error("BACKUP_PASSPHRASE must contain at least 20 characters.");
  return scryptSync(passphrase, salt, 32);
}
export function encryptSnapshot(input: unknown, passphrase: string): Buffer {
  const data = snapshotSchema.parse(input),
    salt = randomBytes(16),
    iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(passphrase, salt), iv);
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(data), "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([
    Buffer.from("MAGICBK1"),
    salt,
    iv,
    cipher.getAuthTag(),
    encrypted,
  ]);
}
export function decryptSnapshot(data: Buffer, passphrase: string) {
  if (data.length < 52 || data.subarray(0, 8).toString() !== "MAGICBK1")
    throw new Error("Invalid backup file.");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    key(passphrase, data.subarray(8, 24)),
    data.subarray(24, 36),
  );
  decipher.setAuthTag(data.subarray(36, 52));
  return snapshotSchema.parse(
    JSON.parse(
      Buffer.concat([
        decipher.update(data.subarray(52)),
        decipher.final(),
      ]).toString("utf8"),
    ),
  );
}
