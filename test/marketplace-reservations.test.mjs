import test from "node:test";
import assert from "node:assert/strict";
import { createClient } from "@libsql/client";
import { mkdirSync, mkdtempSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { Database } from "../dist/database.js";
import { MarketplaceReservations, reservationSchemaSql } from "../dist/marketplace-reservations.js";

const clockStart = Date.parse("2030-01-01T00:00:00Z");
const actor = (id = "venue", role = "owner", status = "active") => ({ accountId: "staff", organization: {
  id, slug: id, name: "Test", kind: "venue_operator", status: "approved", bookingMode: "direct",
  publicDescription: "Test", categories: ["playgrounds"], revision: 0,
}, memberships: [{ id: id + "-staff", accountId: "staff", organizationId: id, role, status, revision: 0 }] });
const request = (id = "hold", resources = [{ id: "room", quantity: 1 }], extra = {}) => ({
  id, bookingId: "booking-" + id, startsAt: "2030-01-02T10:00:00Z", endsAt: "2030-01-02T11:00:00Z", resources, ...extra,
});
async function fixture(t, capacity = 1) {
  const client = process.env.TEST_LIBSQL === "1" ? createClient({ url: "file::memory:", intMode: "number" }) : undefined;
  const db = new Database(":memory:", reservationSchemaSql, undefined, client);
  t.after(() => db.close());
  await db.prepare("INSERT INTO marketplace_resources VALUES(?,?,?,?)").run("room", "venue", capacity, 1);
  await db.prepare("INSERT INTO marketplace_resources VALUES(?,?,?,?)").run("speaker", "venue", 1, 1);
  await db.prepare("INSERT INTO marketplace_resources VALUES(?,?,?,?)").run("foreign", "other", 1, 1);
  let now = clockStart;
  return { db, reservations: new MarketplaceReservations(db, () => now), setNow: value => { now = value; } };
}

test("concurrent overlapping requests cannot both hold the same room", async t => {
  const { reservations, db } = await fixture(t);
  const results = await Promise.allSettled([reservations.hold(request("a"), actor()), reservations.hold(request("b"), actor())]);
  assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(results.filter(r => r.status === "rejected").length, 1);
  assert.match(results.find(r => r.status === "rejected").reason.message, /^A selected resource is unavailable\.$/);
  assert.equal(Number((await db.prepare("SELECT count(*) AS n FROM marketplace_hold_groups").get()).n), 1);
  assert.equal(Number((await db.prepare("SELECT count(*) AS n FROM marketplace_reservation_audit").get()).n), 1);
});

test("capacity uses peak overlap and permits adjacent, sequential reservations", async t => {
  const { reservations } = await fixture(t, 2);
  await reservations.hold(request("first", undefined, { endsAt: "2030-01-02T10:30:00Z" }), actor());
  await reservations.hold(request("second", undefined, { startsAt: "2030-01-02T10:30:00Z" }), actor());
  const across = await reservations.hold(request("across"), actor());
  assert.equal(across.status, "held");
  await assert.rejects(reservations.hold(request("fourth"), actor()), /unavailable/);
  const boundary = await reservations.hold(request("boundary", undefined, { startsAt: "2030-01-02T11:00:00Z", endsAt: "2030-01-02T12:00:00Z" }), actor());
  assert.equal(boundary.status, "held");
});

test("setup and teardown block the resource around the public event time", async t => {
  const { reservations } = await fixture(t);
  await reservations.hold(request("buffered", undefined, { setupMinutes: 30, teardownMinutes: 20 }), actor());
  await assert.rejects(reservations.hold(request("setup", undefined, { startsAt: "2030-01-02T09:00:00Z", endsAt: "2030-01-02T09:45:00Z" }), actor()), /unavailable/);
  await assert.rejects(reservations.hold(request("teardown", undefined, { startsAt: "2030-01-02T11:10:00Z", endsAt: "2030-01-02T12:00:00Z" }), actor()), /unavailable/);
  assert.equal((await reservations.hold(request("after", undefined, { startsAt: "2030-01-02T11:20:00Z", endsAt: "2030-01-02T12:00:00Z" }), actor())).status, "held");
});

test("holds expire, cannot be confirmed late and free capacity without cron", async t => {
  const { reservations, setNow } = await fixture(t);
  await reservations.hold(request("old", undefined, { holdMinutes: 1 }), actor());
  setNow(clockStart + 60_000);
  await assert.rejects(reservations.confirm("old", 0, actor()), /expired/);
  assert.equal((await reservations.hold(request("replacement"), actor())).status, "held");
});

test("confirmed reservations stay occupied, release is scoped and revision guarded", async t => {
  const { reservations, db, setNow } = await fixture(t);
  await reservations.hold(request(), actor());
  const confirmed = await reservations.confirm("hold", 0, actor());
  assert.equal(confirmed.expires, null);
  assert.equal(confirmed.revision, 1);
  setNow(clockStart + 120 * 60_000);
  await assert.rejects(reservations.hold(request("other"), actor()), /unavailable/);
  await assert.rejects(reservations.release("hold", 0, actor()), /changed/);
  await assert.rejects(reservations.release("hold", 1, actor("other")), /not found/);
  const released = await reservations.release("hold", 1, actor());
  assert.equal(released.status, "released");
  assert.equal((await reservations.hold(request("new"), actor())).status, "held");
  const logs = await db.prepare("SELECT actor_id,action,before_data,after_data FROM marketplace_reservation_audit WHERE group_id=? ORDER BY rowid").all("hold");
  assert.deepEqual(logs.map(v => v.action), ["hold", "confirm", "release"]);
  assert.equal(logs.every(v => v.actor_id === "staff"), true);
  assert.equal(JSON.parse(logs[2].before_data).status, "confirmed");
});

test("one unavailable item rolls back the whole selection; audit failure also rolls back", async t => {
  const { reservations, db } = await fixture(t);
  await assert.rejects(reservations.hold(request("many", [{ id: "room", quantity: 1 }, { id: "foreign", quantity: 1 }]), actor()), /unavailable/);
  assert.equal(Number((await db.prepare("SELECT count(*) AS n FROM marketplace_hold_groups").get()).n), 0);
  await db.prepare("CREATE TRIGGER audit_failure BEFORE INSERT ON marketplace_reservation_audit BEGIN SELECT RAISE(ABORT,'test audit unavailable'); END;").run();
  await assert.rejects(reservations.hold(request("audit-fail", [{ id: "room", quantity: 1 }, { id: "speaker", quantity: 1 }]), actor()), /audit unavailable/);
  assert.equal(Number((await db.prepare("SELECT count(*) AS n FROM marketplace_hold_groups").get()).n), 0);
  assert.equal(Number((await db.prepare("SELECT count(*) AS n FROM marketplace_allocations").get()).n), 0);
});

test("permissions, ownership, inactive resources and request validation fail closed", async t => {
  const { reservations, db } = await fixture(t);
  for (const who of [actor("venue", "sales"), actor("venue", "accounting"), actor("venue", "artist"), actor("venue", "owner", "revoked"), { ...actor(), memberships: [] }])
    await assert.rejects(reservations.hold(request(), who), /not permitted/);
  for (const invalid of [request("dup", [{ id: "room", quantity: 1 }, { id: "room", quantity: 1 }]), request("empty", []), request("qty", [{ id: "room", quantity: 2 }]), request("bad", undefined, { endsAt: "2030-01-02T09:00:00Z" }), request("past", undefined, { startsAt: "2029-12-31T09:00:00Z", endsAt: "2029-12-31T10:00:00Z" })])
    await assert.rejects(reservations.hold(invalid, actor()));
  await db.prepare("UPDATE marketplace_resources SET active=0 WHERE id=?").run("room");
  await assert.rejects(reservations.hold(request(), actor()), /unavailable/);
});

test("confirm rechecks changed capacity and does not record success on failure", async t => {
  const { reservations, db } = await fixture(t, 2);
  await reservations.hold(request("a"), actor());
  await reservations.hold(request("b"), actor());
  await db.prepare("UPDATE marketplace_resources SET capacity=1 WHERE id=?").run("room");
  await assert.rejects(reservations.confirm("a", 0, actor()), /unavailable/);
  const row = await db.prepare("SELECT status,revision FROM marketplace_hold_groups WHERE id=?").get("a");
  assert.equal(row.status, "held");
  assert.equal(Number(row.revision), 0);
  assert.equal(Number((await db.prepare("SELECT count(*) AS n FROM marketplace_reservation_audit WHERE action='confirm'").get()).n), 0);
});

test("time offsets describe the same occupancy interval", async t => {
  const { reservations } = await fixture(t);
  await reservations.hold(request("utc"), actor());
  await assert.rejects(reservations.hold(request("offset", undefined, { startsAt: "2030-01-02T12:00:00+02:00", endsAt: "2030-01-02T13:00:00+02:00" }), actor()), /unavailable/);
});

test("separate libSQL connections serialize contention for the last slot", { skip: process.env.TEST_LIBSQL !== "1" }, async t => {
  const root = resolve(process.env.MAGIC_TEST_ROOT || "test-temp");
  mkdirSync(root, { recursive: true });
  const folder = mkdtempSync(resolve(root, "marketplace-reservations-"));
  const url = pathToFileURL(resolve(folder, "shared.sqlite")).href;
  const first = new Database(":memory:", reservationSchemaSql, undefined, createClient({ url, intMode: "number" }));
  const second = new Database(":memory:", "PRAGMA foreign_keys=ON;", undefined, createClient({ url, intMode: "number" }));
  t.after(() => {
    first.close(); second.close();
    // Windows libSQL may retain file handles until process exit. The external
    // driver-test harness removes MAGIC_TEST_ROOT after its child exits.
  });
  await Promise.all([first.ready, second.ready]);
  await first.prepare("INSERT INTO marketplace_resources VALUES(?,?,?,?)").run("room", "venue", 1, 1);
  const engines = [first, second].map(db => new MarketplaceReservations(db, () => clockStart));
  const result = await Promise.allSettled(engines.map((engine, index) => engine.hold(request("connection-" + index), actor())));
  assert.equal(result.filter(v => v.status === "fulfilled").length, 1);
  assert.match(result.find(v => v.status === "rejected").reason.message, /unavailable/);
  assert.equal(Number((await first.prepare("SELECT count(*) AS n FROM marketplace_hold_groups").get()).n), 1);
});
