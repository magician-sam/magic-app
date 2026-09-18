import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type { Audit, Business, Package } from "./models.js";

export const id = () => randomUUID();
export class Store {
  db: DatabaseSync;
  constructor(path: string) {
    if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db
      .exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS businesses (id TEXT PRIMARY KEY, slug TEXT UNIQUE NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, business_id TEXT NOT NULL REFERENCES businesses(id), email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS records (business_id TEXT NOT NULL REFERENCES businesses(id), kind TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (business_id,kind,id));
      CREATE TABLE IF NOT EXISTS sessions (hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS links (hash TEXT PRIMARY KEY, business_id TEXT NOT NULL REFERENCES businesses(id), booking_id TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS visits (business_id TEXT NOT NULL REFERENCES businesses(id), source TEXT NOT NULL, day TEXT NOT NULL, count INTEGER NOT NULL, PRIMARY KEY(business_id,source,day));
      CREATE INDEX IF NOT EXISTS records_kind ON records(business_id,kind);`);
  }
  all<T>(businessId: string, kind: string): T[] {
    return this.db
      .prepare(
        "SELECT data FROM records WHERE business_id=? AND kind=? ORDER BY rowid",
      )
      .all(businessId, kind)
      .map((row) => JSON.parse(String(row.data)) as T);
  }
  get<T>(businessId: string, kind: string, recordId: string): T | undefined {
    const row = this.db
      .prepare(
        "SELECT data FROM records WHERE business_id=? AND kind=? AND id=?",
      )
      .get(businessId, kind, recordId);
    return row ? (JSON.parse(String(row.data)) as T) : undefined;
  }
  put<T extends { id: string }>(businessId: string, kind: string, value: T) {
    this.db
      .prepare(
        "INSERT INTO records(business_id,kind,id,data) VALUES(?,?,?,?) ON CONFLICT(business_id,kind,id) DO UPDATE SET data=excluded.data",
      )
      .run(businessId, kind, value.id, JSON.stringify(value));
    return value;
  }
  transaction<T>(work: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const result = work();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }
  audit(
    businessId: string,
    actor: string,
    action: string,
    entityId: string,
    before: unknown,
    after: unknown,
  ) {
    this.put<Audit>(businessId, "audit", {
      id: id(),
      actor,
      action,
      entityId,
      at: new Date().toISOString(),
      before,
      after,
    });
  }
  business(value: string, bySlug = false): Business | undefined {
    const row = this.db
      .prepare(`SELECT data FROM businesses WHERE ${bySlug ? "slug" : "id"}=?`)
      .get(value);
    return row ? (JSON.parse(String(row.data)) as Business) : undefined;
  }
  createBusiness(name: string, slug: string, timezone = "Asia/Beirut") {
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
    this.db
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
        minAge: 4,
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
        minAge: 6,
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
        minAge: 2,
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
    packages.forEach((p) => this.put(business.id, "packages", p));
    return business;
  }
}
