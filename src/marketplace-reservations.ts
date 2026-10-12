import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Database } from "./database.js";
import { canPartnerAction, type Membership, type Organization } from "./marketplace.js";

// Not installed by the application. Apply only through a future versioned migration
// after snapshots cover these tables and a fresh production restore is verified.
export const reservationSchemaSql = `
CREATE TABLE marketplace_resources (
  id TEXT PRIMARY KEY, organization_id TEXT NOT NULL,
  capacity INTEGER NOT NULL CHECK(capacity > 0), active INTEGER NOT NULL CHECK(active IN (0,1))
);
CREATE TABLE marketplace_hold_groups (
  id TEXT PRIMARY KEY, booking_id TEXT NOT NULL, organization_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('held','confirmed','released')),
  expires INTEGER, revision INTEGER NOT NULL CHECK(revision >= 0),
  CHECK((status='held' AND expires IS NOT NULL) OR (status!='held' AND expires IS NULL))
);
CREATE TABLE marketplace_allocations (
  group_id TEXT NOT NULL REFERENCES marketplace_hold_groups(id),
  resource_id TEXT NOT NULL REFERENCES marketplace_resources(id),
  starts INTEGER NOT NULL, ends INTEGER NOT NULL, quantity INTEGER NOT NULL CHECK(quantity > 0),
  PRIMARY KEY(group_id,resource_id), CHECK(ends > starts)
);
CREATE INDEX marketplace_allocations_interval ON marketplace_allocations(resource_id,starts,ends);
CREATE TABLE marketplace_reservation_audit (
  id TEXT PRIMARY KEY, group_id TEXT NOT NULL REFERENCES marketplace_hold_groups(id),
  actor_id TEXT NOT NULL, at INTEGER NOT NULL, action TEXT NOT NULL,
  before_data TEXT, after_data TEXT NOT NULL
);`;

const identifier = z.string().trim().min(1).max(128);
const requestSchema = z.object({
  id: identifier, bookingId: identifier,
  startsAt: z.iso.datetime({ offset: true }), endsAt: z.iso.datetime({ offset: true }),
  setupMinutes: z.number().int().min(0).max(1440).default(0),
  teardownMinutes: z.number().int().min(0).max(1440).default(0),
  holdMinutes: z.number().int().min(1).max(30).default(15),
  resources: z.array(z.object({ id: identifier, quantity: z.number().int().positive() }).strict()).min(1).max(50),
}).strict();

export type ReservationActor = {
  accountId: string; organization: Organization; memberships: readonly Membership[];
};
type Hold = { id: string; bookingId: string; organizationId: string;
  status: "held" | "confirmed" | "released"; expires: number | null; revision: number };
export type HoldRequest = z.input<typeof requestSchema>;

// Server-internal adapter: actors and booking ownership must be loaded from
// trusted session/storage. Never accept these structures from request bodies.
// This increment permits only resources owned by the actor's organization.
// Cross-organization sharing requires an explicit grant model before activation.
export class MarketplaceReservations {
  constructor(private db: Database, private clock: () => number = Date.now) {}

  private authorize(actor: ReservationActor) {
    if (!canPartnerAction(actor.accountId, actor.organization, actor.memberships, "calendar.manage"))
      throw new Error("Resource action is not permitted.");
  }

  private async read(groupId: string, organizationId: string): Promise<Hold> {
    const row = await this.db.prepare("SELECT * FROM marketplace_hold_groups WHERE id=? AND organization_id=?").get(groupId, organizationId);
    if (!row) throw new Error("Reservation not found.");
    return { id: String(row.id), bookingId: String(row.booking_id), organizationId: String(row.organization_id),
      status: row.status as Hold["status"], expires: row.expires === null ? null : Number(row.expires), revision: Number(row.revision) };
  }

  // Check the peak occupied capacity, not the sum across the entire interval:
  // two sequential bookings may each share this interval without overlapping.
  private async available(resourceId: string, organizationId: string, starts: number,
    ends: number, quantity: number, now: number, excludingGroup = "") {
    const resource = await this.db.prepare("SELECT capacity FROM marketplace_resources WHERE id=? AND organization_id=? AND active=1").get(resourceId, organizationId);
    if (!resource) throw new Error("A selected resource is unavailable.");
    const rows = await this.db.prepare(`SELECT a.starts,a.ends,a.quantity FROM marketplace_allocations a
      JOIN marketplace_hold_groups g ON g.id=a.group_id
      WHERE a.resource_id=? AND a.starts<? AND a.ends>? AND g.id!=?
        AND (g.status='confirmed' OR (g.status='held' AND g.expires>?))`).all(resourceId, ends, starts, excludingGroup, now);
    const changes: { at: number; delta: number }[] = [];
    for (const row of rows) {
      changes.push({ at: Math.max(starts, Number(row.starts)), delta: Number(row.quantity) },
        { at: Math.min(ends, Number(row.ends)), delta: -Number(row.quantity) });
    }
    // Ending at a boundary frees capacity before the next booking starts there.
    changes.sort((a, b) => a.at - b.at || a.delta - b.delta);
    let occupied = 0;
    if (quantity > Number(resource.capacity)) throw new Error("A selected resource is unavailable.");
    for (const change of changes) {
      occupied += change.delta;
      if (occupied + quantity > Number(resource.capacity)) throw new Error("A selected resource is unavailable.");
    }
  }

  private async audit(actor: ReservationActor, action: string, before: Hold | null, after: Hold, now: number) {
    await this.db.prepare(`INSERT INTO marketplace_reservation_audit
      (id,group_id,actor_id,at,action,before_data,after_data) VALUES(?,?,?,?,?,?,?)`).run(
      randomUUID(), after.id, actor.accountId, now, action, before ? JSON.stringify(before) : null, JSON.stringify(after));
  }

  async hold(input: HoldRequest, actor: ReservationActor): Promise<Hold> {
    this.authorize(actor);
    const value = requestSchema.parse(input);
    if (new Set(value.resources.map(r => r.id)).size !== value.resources.length) throw new Error("Duplicate resource selection.");
    const eventStart = Date.parse(value.startsAt), eventEnd = Date.parse(value.endsAt);
    if (eventEnd <= eventStart) throw new Error("Event end must follow its start.");
    const starts = eventStart - value.setupMinutes * 60_000, ends = eventEnd + value.teardownMinutes * 60_000;
    return this.db.transaction(async () => {
      const now = this.clock();
      if (eventStart <= now) throw new Error("New reservations require a future event.");
      for (const resource of value.resources)
        await this.available(resource.id, actor.organization.id, starts, ends, resource.quantity, now);
      const hold: Hold = { id: value.id, bookingId: value.bookingId, organizationId: actor.organization.id,
        status: "held", expires: Math.min(eventStart, now + value.holdMinutes * 60_000), revision: 0 };
      await this.db.prepare(`INSERT INTO marketplace_hold_groups
        (id,booking_id,organization_id,status,expires,revision) VALUES(?,?,?,?,?,?)`).run(
        hold.id, hold.bookingId, hold.organizationId, hold.status, hold.expires, hold.revision);
      for (const resource of value.resources)
        await this.db.prepare("INSERT INTO marketplace_allocations(group_id,resource_id,starts,ends,quantity) VALUES(?,?,?,?,?)").run(
          hold.id, resource.id, starts, ends, resource.quantity);
      await this.audit(actor, "hold", null, hold, now);
      return hold;
    });
  }

  async confirm(groupId: string, expectedRevision: number, actor: ReservationActor): Promise<Hold> {
    this.authorize(actor);
    return this.db.transaction(async () => {
      const before = await this.read(groupId, actor.organization.id), now = this.clock();
      if (before.revision !== expectedRevision) throw new Error("Reservation changed; reload before continuing.");
      if (before.status !== "held" || before.expires! <= now) throw new Error("Reservation expired or is not held.");
      const allocations = await this.db.prepare("SELECT * FROM marketplace_allocations WHERE group_id=?").all(groupId);
      if (!allocations.length) throw new Error("Reservation has no resources.");
      for (const resource of allocations)
        await this.available(String(resource.resource_id), actor.organization.id, Number(resource.starts), Number(resource.ends), Number(resource.quantity), now, groupId);
      const after: Hold = { ...before, status: "confirmed", expires: null, revision: before.revision + 1 };
      const result = await this.db.prepare("UPDATE marketplace_hold_groups SET status='confirmed',expires=NULL,revision=? WHERE id=? AND revision=?").run(after.revision, groupId, before.revision);
      if (Number(result.changes) !== 1) throw new Error("Reservation changed; reload before continuing.");
      await this.audit(actor, "confirm", before, after, now);
      return after;
    });
  }

  async release(groupId: string, expectedRevision: number, actor: ReservationActor): Promise<Hold> {
    this.authorize(actor);
    return this.db.transaction(async () => {
      const before = await this.read(groupId, actor.organization.id), now = this.clock();
      if (before.revision !== expectedRevision || before.status === "released") throw new Error("Reservation changed; reload before continuing.");
      const after: Hold = { ...before, status: "released", expires: null, revision: before.revision + 1 };
      const result = await this.db.prepare("UPDATE marketplace_hold_groups SET status='released',expires=NULL,revision=? WHERE id=? AND revision=?").run(after.revision, groupId, before.revision);
      if (Number(result.changes) !== 1) throw new Error("Reservation changed; reload before continuing.");
      await this.audit(actor, "release", before, after, now);
      return after;
    });
  }
}
