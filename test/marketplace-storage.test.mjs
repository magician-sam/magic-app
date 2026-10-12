import test from "node:test";
import assert from "node:assert/strict";
import { TestStore as Store } from "./store-fixture.mjs";
import { migrateMarketplace, marketplaceSchemaState, MarketplaceStorage, marketplaceColumns } from "../dist/marketplace-storage.js";
import { snapshot, restoreSnapshot, encryptSnapshot, decryptSnapshot, businessBackupScope } from "../dist/snapshots.js";
import { canPartnerAction } from "../dist/marketplace.js";

const organization = (id = "venue", status = "approved") => ({ id, slug: id, name: "Synthetic venue", kind: "venue_operator", status, bookingMode: "direct", publicDescription: "Test", categories: ["playgrounds"], revision: 0 });
const offering = () => ({ id: "entry", organizationId: "venue", title: "Synthetic playground entry", kind: "playground_entry", categories: ["playgrounds"], status: "approved", revision: 0 });
async function fixture(t, migrate = true) {
  const store = new Store(":memory:"); t.after(() => store.db.close());
  const business = await store.createBusiness("Synthetic company", "synthetic-company");
  const user = { id: "same-id", businessId: business.id, email: "same@fixture.test", name: "Synthetic staff", role: "admin" };
  await store.db.prepare("INSERT INTO users VALUES(?,?,?,?,?)").run(user.id, business.id, user.email, "unchanged-staff-hash", JSON.stringify(user));
  await store.db.prepare("INSERT INTO customer_accounts VALUES(?,?,?,?,?)").run("same-id", business.id, "customer", user.email, "unchanged-customer-hash");
  await store.db.prepare("INSERT INTO sessions VALUES(?,?,?)").run("unchanged-session", user.id, 2000000000);
  if (migrate) await migrateMarketplace(store.db);
  const storage = new MarketplaceStorage(store.db);
  return { store, storage, business };
}

test("additive migration preserves every legacy row and is repeatable without auto-granting access", async t => {
  const { store } = await fixture(t, false), before = await snapshot(store);
  assert.deepEqual(await migrateMarketplace(store.db), { applied: true, version: 1 });
  assert.deepEqual(await migrateMarketplace(store.db), { applied: false, version: 1 });
  const after = await snapshot(store);
  assert.equal(after.version, 3);
  assert.equal(Object.keys(after.tables).length, 20);
  for (const name of Object.keys(before.tables)) assert.deepEqual(after.tables[name], before.tables[name]);
  assert.equal(after.tables.marketplace_memberships.length, 0);
  assert.equal(after.tables.marketplace_accounts.length, 0);
});

test("identical customer/staff identifiers and emails stay separate; hashes and sessions are untouched", async t => {
  const { store, storage } = await fixture(t);
  const staff = await storage.mapLegacyAccount("staff", "same-id"), customer = await storage.mapLegacyAccount("customer", "same-id");
  assert.notEqual(staff, customer);
  assert.equal(await storage.mapLegacyAccount("staff", "same-id"), staff);
  assert.equal((await store.db.prepare("SELECT password FROM users").get()).password, "unchanged-staff-hash");
  assert.equal((await store.db.prepare("SELECT password FROM customer_accounts").get()).password, "unchanged-customer-hash");
  assert.equal((await store.db.prepare("SELECT hash FROM sessions").get()).hash, "unchanged-session");
  assert.deepEqual(await storage.memberships(staff), []);
  await assert.rejects(storage.mapLegacyAccount("staff", "missing"), /not found/);
  await store.db.prepare("UPDATE marketplace_accounts SET status='suspended' WHERE id=?").run(staff);
  await assert.rejects(storage.mapLegacyAccount("staff", "same-id"), /Active/);
});

test("failed schema migration rolls back DDL and leaves legacy storage intact", async t => {
  const { store } = await fixture(t, false), prepare = store.db.prepare.bind(store.db);
  store.db.prepare = sql => { if (sql.includes("CREATE TABLE marketplace_memberships")) throw new Error("Injected migration failure"); return prepare(sql); };
  await assert.rejects(migrateMarketplace(store.db), /Injected/);
  store.db.prepare = prepare;
  assert.equal(await marketplaceSchemaState(store.db), "absent");
  assert.equal((await store.db.prepare("SELECT password FROM users").get()).password, "unchanged-staff-hash");
});

test("unknown partial schema and changed migration checksum fail closed", async t => {
  const { store } = await fixture(t);
  await store.db.prepare("UPDATE marketplace_migrations SET checksum='changed'").run();
  await assert.rejects(migrateMarketplace(store.db), /history/);
  await store.db.prepare("CREATE TABLE marketplace_unknown (id TEXT)").run();
  await assert.rejects(snapshot(store), /Unsupported or incomplete/);
});

test("directory projects only approved profiles and requires a real approved coordinator", async t => {
  const { storage, store } = await fixture(t), actor = await storage.mapLegacyAccount("staff", "same-id");
  await storage.insertOrganization(organization(), actor);
  await storage.insertOrganization(organization("draft", "draft"), actor);
  await assert.rejects(storage.insertOrganization({ ...organization("managed"), bookingMode: "managed", coordinatorOrganizationId: "missing" }, actor), /coordinator/);
  const directory = await storage.publicDirectory();
  assert.equal(directory.length, 1);
  assert.equal(directory[0].id, "venue");
  assert.equal(directory[0].revision, undefined);
  assert.equal(directory[0].legacy_business_id, undefined);
  assert.equal(Number((await store.db.prepare("SELECT count(*) AS n FROM marketplace_organizations").get()).n), 2);
});

test("membership revocation is persisted/audited and stale or moved membership edits fail", async t => {
  const { storage, store } = await fixture(t), actor = await storage.mapLegacyAccount("staff", "same-id"), customer = await storage.mapLegacyAccount("customer", "same-id");
  const org = organization(); await storage.insertOrganization(org, actor);
  const member = { id: "member", accountId: customer, organizationId: org.id, role: "owner", status: "active", revision: 0 };
  await storage.insertMembership(member, actor);
  assert.equal(canPartnerAction(customer, org, await storage.memberships(customer), "members.manage"), true);
  await storage.updateMembership({ ...member, status: "revoked", revision: 1 }, 0, actor);
  assert.equal(canPartnerAction(customer, org, await storage.memberships(customer), "members.manage"), false);
  await assert.rejects(storage.updateMembership({ ...member, status: "active", revision: 1 }, 0, actor), /changed/);
  await assert.rejects(storage.updateMembership({ ...member, organizationId: "other", revision: 2 }, 1, actor), /changed/);
  assert.equal(Number((await store.db.prepare("SELECT count(*) AS n FROM marketplace_audit WHERE action='membership.updated'").get()).n), 1);
});

test("offering edits retain immutable versions, exact ownership and stale-write protection", async t => {
  const { storage, store } = await fixture(t), actor = await storage.mapLegacyAccount("staff", "same-id");
  await storage.insertOrganization(organization(), actor);
  const initial = await storage.insertOffering(offering(), actor);
  await storage.updateOffering({ ...initial, title: "New title", revision: 1 }, 0, actor);
  assert.equal((await storage.offering("entry", "venue")).title, "New title");
  assert.equal(await storage.offering("entry", "other"), undefined);
  const original = await store.db.prepare("SELECT data FROM marketplace_offering_versions WHERE offering_id=? AND revision=?").get("entry", 0);
  assert.equal(JSON.parse(original.data).title, initial.title);
  await assert.rejects(storage.updateOffering({ ...initial, title: "Stale", revision: 1 }, 0, actor), /changed/);
  assert.equal(Number((await store.db.prepare("SELECT count(*) AS n FROM marketplace_offering_versions").get()).n), 2);
});

test("failed audit rolls offering changes and version insertion back together", async t => {
  const { storage, store } = await fixture(t), actor = await storage.mapLegacyAccount("staff", "same-id");
  await storage.insertOrganization(organization(), actor); const initial = await storage.insertOffering(offering(), actor);
  await store.db.prepare("CREATE TRIGGER fail_marketplace_audit BEFORE INSERT ON marketplace_audit BEGIN SELECT RAISE(ABORT,'Injected audit failure'); END").run();
  await assert.rejects(storage.updateOffering({ ...initial, title: "Not saved", revision: 1 }, 0, actor), /audit failure/);
  assert.equal((await storage.offering("entry", "venue")).revision, 0);
  assert.equal(Number((await store.db.prepare("SELECT count(*) AS n FROM marketplace_offering_versions").get()).n), 1);
});

test("version-three encrypted backup restores all 20 tables and refuses a populated destination", async t => {
  const { store, storage } = await fixture(t), target = new Store(":memory:"); t.after(() => target.db.close());
  const actor = await storage.mapLegacyAccount("staff", "same-id");
  await storage.insertOrganization(organization(), actor); await storage.insertOffering(offering(), actor);
  const data = await snapshot(store), phrase = "Synthetic-backup-passphrase-only";
  const decoded = decryptSnapshot(encryptSnapshot(data, phrase), phrase);
  await restoreSnapshot(target, decoded);
  assert.deepEqual((await snapshot(target)).tables, data.tables);
  assert.deepEqual(await migrateMarketplace(target.db), { applied: false, version: 1 });
  await assert.rejects(restoreSnapshot(target, data), /empty destination/);
  assert.deepEqual((await snapshot(target)).tables, data.tables);
});

test("corrupt version-three restore rolls back new schema and all legacy inserts", async t => {
  const { store, storage } = await fixture(t), target = new Store(":memory:"); t.after(() => target.db.close());
  await storage.mapLegacyAccount("staff", "same-id");
  const data = await snapshot(store); data.tables.marketplace_legacy_accounts[0].account_id = "missing";
  await assert.rejects(restoreSnapshot(target, data));
  assert.equal(await marketplaceSchemaState(target.db), "absent");
  assert.equal(Number((await target.db.prepare("SELECT count(*) AS n FROM businesses").get()).n), 0);
});

test("legacy backups restore first then migrate without changing credentials", async t => {
  const { store } = await fixture(t, false), target = new Store(":memory:"); t.after(() => target.db.close());
  const data = await snapshot(store); assert.equal(data.version, 2);
  await restoreSnapshot(target, data); await migrateMarketplace(target.db);
  const upgraded = await snapshot(target);
  for (const name of Object.keys(data.tables)) assert.deepEqual(upgraded.tables[name], data.tables[name]);
  assert.equal(Object.keys(marketplaceColumns).length, 8);
});

test("one legacy business does not entitle its owner to another partner's marketplace data", async t => {
  const { store, storage, business } = await fixture(t), actor = await storage.mapLegacyAccount("staff", "same-id");
  assert.equal(await businessBackupScope(store, business.id), true);
  await storage.insertOrganization(organization(), actor, business.id);
  assert.equal(await businessBackupScope(store, business.id), true);
  await storage.insertOrganization(organization("independent-partner"), actor);
  assert.equal(await businessBackupScope(store, business.id), false);
  assert.equal((await snapshot(store)).tables.marketplace_organizations.length, 2);
});
