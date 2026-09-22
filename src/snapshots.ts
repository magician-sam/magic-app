import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";
import { z } from "zod";
import type { Store } from "./store.js";
const tables = {
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
} as const;
type Table = keyof typeof tables;
const snapshotSchema = z
  .object({
    version: z.literal(1),
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
    const data: Record<string, unknown> = {};
    for (const [table, columns] of Object.entries(tables))
      data[table] = await store.db
        .prepare(`SELECT ${columns.join(",")} FROM ${table} ORDER BY rowid`)
        .all();
    return snapshotSchema.parse({
      version: 1,
      createdAt: new Date().toISOString(),
      tables: data,
    });
  });
}
export async function restoreSnapshot(store: Store, input: unknown) {
  const data = snapshotSchema.parse(input);
  if (
    JSON.stringify(Object.keys(data.tables).sort()) !==
    JSON.stringify(Object.keys(tables).sort())
  )
    throw new Error("Backup table list does not match this version.");
  return store.transaction(async () => {
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
    for (const table of Object.keys(tables) as Table[]) {
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
