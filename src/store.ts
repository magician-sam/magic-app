import { Database } from "./database.js";
import type { Client } from "@libsql/client/web";
import { randomUUID } from "node:crypto";
import type { Audit, Business, Package } from "./models.js";

export const id = () => randomUUID();
export class Store {
  db: Database;
  constructor(path: string, authToken?: string, client?: Client) {
    this.db = new Database(
      path,
      `
      CREATE TABLE IF NOT EXISTS rate_limits (id TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS businesses (id TEXT PRIMARY KEY, slug TEXT UNIQUE NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, business_id TEXT NOT NULL REFERENCES businesses(id), email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS records (business_id TEXT NOT NULL REFERENCES businesses(id), kind TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (business_id,kind,id));
      CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS links (hash TEXT PRIMARY KEY, business_id TEXT NOT NULL REFERENCES businesses(id), booking_id TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS visits (business_id TEXT NOT NULL REFERENCES businesses(id), source TEXT NOT NULL, day TEXT NOT NULL, count INTEGER NOT NULL, PRIMARY KEY(business_id,source,day));
      CREATE INDEX IF NOT EXISTS records_kind ON records(business_id,kind);
      CREATE TABLE IF NOT EXISTS customer_accounts (
        id TEXT PRIMARY KEY, business_id TEXT NOT NULL REFERENCES businesses(id),
        customer_id TEXT NOT NULL, username TEXT NOT NULL, password TEXT NOT NULL,
        UNIQUE(business_id, username));
      CREATE TABLE IF NOT EXISTS customer_sessions (
        hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES customer_accounts(id), expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS customer_resets (
        id TEXT UNIQUE NOT NULL, account_id TEXT PRIMARY KEY REFERENCES customer_accounts(id),
        requested_at TEXT NOT NULL, code_hash TEXT, expires INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0);
      `,
      authToken,
      client,
    );
  }
  async all<T>(businessId: string, kind: string): Promise<T[]> {
    return (
      await this.db
        .prepare(
          "SELECT data FROM records WHERE business_id=? AND kind=? ORDER BY rowid",
        )
        .all(businessId, kind)
    ).map((row) => JSON.parse(String(row.data)) as T);
  }
  async get<T>(
    businessId: string,
    kind: string,
    recordId: string,
  ): Promise<T | undefined> {
    const row = await this.db
      .prepare(
        "SELECT data FROM records WHERE business_id=? AND kind=? AND id=?",
      )
      .get(businessId, kind, recordId);
    return row ? (JSON.parse(String(row.data)) as T) : undefined;
  }
  async put<T extends { id: string }>(
    businessId: string,
    kind: string,
    value: T,
  ) {
    await this.db
      .prepare(
        "INSERT INTO records(business_id,kind,id,data) VALUES(?,?,?,?) ON CONFLICT(business_id,kind,id) DO UPDATE SET data=excluded.data",
      )
      .run(businessId, kind, value.id, JSON.stringify(value));
    return value;
  }
  async transaction<T>(work: () => T | Promise<T>): Promise<T> {
    return await this.db.transaction(work);
  }
  async audit(
    businessId: string,
    actor: string,
    action: string,
    entityId: string,
    before: unknown,
    after: unknown,
  ) {
    await this.put<Audit>(businessId, "audit", {
      id: id(),
      actor,
      action,
      entityId,
      at: new Date().toISOString(),
      before,
      after,
    });
  }
  async business(value: string, bySlug = false): Promise<Business | undefined> {
    const row = await this.db
      .prepare(`SELECT data FROM businesses WHERE ${bySlug ? "slug" : "id"}=?`)
      .get(value);
    return row ? (JSON.parse(String(row.data)) as Business) : undefined;
  }
  async createBusiness(name: string, slug: string, timezone = "Asia/Beirut") {
    const business: Business = {
      id: id(),
      slug,
      name,
      timezone,
      currency: "USD",
      instagram: "",
      whatsapp: "",
      intro:
        "A little wonder. A lot of happy memories. Magic, science and bubbles, brought together for your celebration.",
    };
    await this.db
      .prepare("INSERT INTO businesses(id,slug,data) VALUES(?,?,?)")
      .run(business.id, slug, JSON.stringify(business));
    const packages: Package[] = [
      {
        id: "magic",
        name: "A little hocus pocus",
        category: "magic",
        description:
          "Surprises, laughter and a chance to be part of the magic. A playful centrepiece for your celebration.",
        duration: 45,
        setup: 30,
        minAge: 0,
        maxAge: 99,
        indoorOnly: false,
        needsPower: false,
        minSpace: 12,
        priceMode: "quote",
        price: 0,
        active: true,
        checklist: ["Magic props", "Performance table", "Sound check"],
      },
      {
        id: "science",
        name: "Wonder lab",
        category: "science",
        description:
          "Big questions. Bigger smiles. A lively science show for curious minds and wide-eyed discoveries.",
        duration: 45,
        setup: 40,
        minAge: 0,
        maxAge: 99,
        indoorOnly: false,
        needsPower: true,
        minSpace: 16,
        priceMode: "quote",
        price: 0,
        active: true,
        checklist: [
          "Approved demonstration supplies",
          "Safety equipment",
          "Electricity confirmed",
        ],
      },
      {
        id: "bubbles",
        name: "Bubbles & daydreams",
        category: "bubbles",
        description:
          "Tiny bubbles, giant bubbles and wonderfully floaty moments. A dreamy addition to your event box.",
        duration: 30,
        setup: 30,
        minAge: 0,
        maxAge: 99,
        indoorOnly: true,
        needsPower: false,
        minSpace: 16,
        priceMode: "quote",
        price: 0,
        active: true,
        checklist: [
          "Bubble liquid",
          "Floor protection",
          "Indoor space confirmed",
        ],
      },
    ];
    await Promise.all(
      packages.map(async (p) => await this.put(business.id, "packages", p)),
    );
    return business;
  }
}
