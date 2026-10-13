import test from "node:test";
import assert from "node:assert/strict";
import { TestStore as Store } from "./store-fixture.mjs";
import { createApp } from "../dist/server.js";
import { createUser, token, hash } from "../dist/auth.js";
import { MarketplaceStorage, migrateMarketplace } from "../dist/marketplace-storage.js";
import { snapshot } from "../dist/snapshots.js";

const draft = { title: "Synthetic birthday package", kind: "birthday_package", categories: ["playgrounds"] };
const profile = { name: "Synthetic venue", publicDescription: "Test venue", categories: ["playgrounds"], expectedRevision: 0 };

test("location and media edits are scoped, revisioned, reviewed and recoverable", async t => {
  const f = await fixture(t);
  const body = { ...profile, publicLocation: { city: 'Beirut', area: 'Hamra', address: 'Synthetic street', aliases: ['بيروت'], coordinates: { latitude: 33.9, longitude: 35.5 } }, publicMedia: [{ kind:'photo',url:'/venue.jpg',caption:'Synthetic venue',permissionReference:'Private owner permission' }] };
  assert.equal((await f.request('staff/workspaces/foreign-company/profile',{method:'PUT',body})).status,403);
  assert.equal((await f.request('staff/workspaces/own-venue/profile',{method:'PUT',body})).status,200);
  const saved = await f.storage.organization('own-venue');
  assert.equal(saved.publicLocation.city,'Beirut');assert.equal(saved.publicMedia[0].permissionReference,'Private owner permission');assert.equal(saved.status,'draft');
  assert.equal((await f.request('staff/workspaces/own-venue/profile',{method:'PUT',body})).status,409);
  const exported=await snapshot(f.store);
  assert.ok(JSON.stringify(exported.tables.marketplace_organizations).includes('Private owner permission'));
  assert.equal((await f.request('staff/workspaces/own-venue/profile',{method:'PUT',body:{...profile,expectedRevision:1}})).status,200);
  assert.equal((await f.storage.organization('own-venue')).publicLocation.city,'Beirut','Older editor does not silently remove added details');
  assert.equal((await f.request('staff/workspaces/own-venue/profile',{method:'PUT',body:{...profile,expectedRevision:2,publicLocation:null,publicMedia:[]}})).status,200);
  assert.equal((await f.storage.organization('own-venue')).publicLocation,null);
  assert.deepEqual((await f.storage.organization('own-venue')).publicMedia,[]);
});
async function fixture(t, migrate = true) {
  const store = new Store(":memory:");
  t.after(() => store.db.close());
  const business = await store.createBusiness("Workspace fixture", "workspace-fixture");
  const owner = await createUser(store, business.id, "owner@workspace.test", "Fixture-password-42!", "Owner");
  const admin = await createUser(store, business.id, "admin@workspace.test", "Fixture-password-42!", "Platform support", "admin");
  // No phone/email matching: the customer account remains a separate login.
  await store.db.prepare("INSERT INTO customer_accounts VALUES(?,?,?,?,?)").run(owner.id, business.id, "synthetic-customer", owner.email, "unused-synthetic-hash");
  const cookie = async (kind, legacyId) => {
    const value = token(), table = kind === "staff" ? "sessions" : "customer_sessions";
    await store.db.prepare(`INSERT INTO ${table} VALUES(?,?,?)`).run(hash(value), legacyId, Date.now() + 3600000);
    return `${kind === "staff" ? "magic_session" : "magic_customer"}=${value}`;
  };
  const ownerCookie = await cookie("staff", owner.id), adminCookie = await cookie("staff", admin.id), customerCookie = await cookie("customer", owner.id);
  let storage, ownerAccount, adminAccount, customerAccount;
  if (migrate) {
    await migrateMarketplace(store.db);
    storage = new MarketplaceStorage(store.db);
    ownerAccount = await storage.mapLegacyAccount("staff", owner.id);
    adminAccount = await storage.mapLegacyAccount("staff", admin.id);
    customerAccount = await storage.mapLegacyAccount("customer", owner.id);
    for (const id of ["own-venue", "foreign-company"]) await storage.insertOrganization({
      id, slug: id, name: id, kind: "venue_operator", status: "draft", bookingMode: "direct",
      publicDescription: "Synthetic", categories: ["playgrounds"], revision: 0,
    }, ownerAccount);
    await storage.insertMembership({ id: "own-membership", accountId: ownerAccount, organizationId: "own-venue", role: "owner", status: "active", revision: 0 }, ownerAccount);
  }
  const origin = "https://workspace.test", server = createApp(store, origin).listen(0, "127.0.0.1");
  await new Promise(resolve => server.on("listening", resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = async (path, { method = "GET", cookie: selected = ownerCookie, body, withOrigin = true } = {}) => fetch(base + "/api/marketplace/" + path, {
    method, headers: { ...(selected ? { cookie: selected } : {}), ...(withOrigin ? { origin } : {}), "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { store, storage, ownerAccount, adminAccount, customerAccount, ownerCookie, adminCookie, customerCookie, request };
}

test("workspace endpoints do not activate migrations or link accounts on read", async t => {
  const { store, request } = await fixture(t, false), before = await snapshot(store);
  assert.equal((await request("staff/workspaces", { cookie: "" })).status, 401);
  assert.equal((await request("staff/workspaces")).status, 503);
  const after = await snapshot(store);
  assert.equal(after.version, 2);
  assert.deepEqual(after.tables.users, before.tables.users);
  assert.deepEqual(after.tables.sessions, before.tables.sessions);
});

test("workspace access uses persisted memberships; platform support and matching customer login confer no partner rights", async t => {
  const f = await fixture(t);
  const response = await f.request("staff/workspaces");
  assert.equal(response.status, 200); assert.match(response.headers.get("cache-control"), /no-store/);
  assert.deepEqual((await response.json()).workspaces.map(value => value.id), ["own-venue"]);
  assert.equal((await f.request("staff/workspaces/foreign-company")).status, 403);
  assert.equal((await f.request("staff/workspaces/own-venue", { cookie: f.adminCookie })).status, 403);
  assert.equal((await f.request("customer/workspaces/own-venue", { cookie: f.customerCookie })).status, 403);
  assert.equal((await f.request("customer/workspaces", { cookie: f.ownerCookie })).status, 401);
  const both = f.ownerCookie + "; " + f.customerCookie;
  assert.equal((await f.request("customer/workspaces/own-venue", { cookie: both })).status, 403);
  assert.equal((await f.request("staff/workspaces/own-venue", { cookie: both })).status, 200);
});

test("revoked membership, suspended account and expired/deleted session take effect on the next request", async t => {
  const f = await fixture(t);
  const membership = (await f.storage.memberships(f.ownerAccount))[0];
  await f.storage.updateMembership({ ...membership, status: "revoked", revision: 1 }, 0, f.adminAccount);
  assert.equal((await f.request("staff/workspaces/own-venue")).status, 403);
  await f.storage.updateMembership({ ...membership, revision: 2 }, 1, f.adminAccount);
  await f.store.db.prepare("UPDATE marketplace_accounts SET status='suspended' WHERE id=?").run(f.ownerAccount);
  assert.equal((await f.request("staff/workspaces")).status, 403);
  await f.store.db.prepare("UPDATE marketplace_accounts SET status='active' WHERE id=?").run(f.ownerAccount);
  await f.store.db.prepare("UPDATE sessions SET expires=0").run();
  assert.equal((await f.request("staff/workspaces/own-venue")).status, 401);
  await f.store.db.prepare("DELETE FROM sessions").run();
  assert.equal((await f.request("staff/workspaces/own-venue")).status, 401);
});

test("draft listing writes enforce tenant, role, origin, strict fields and revisions without granting publication", async t => {
  const f = await fixture(t), path = "staff/workspaces/own-venue/listings";
  assert.equal((await f.request(path, { method: "POST", body: draft, withOrigin: false })).status, 403);
  assert.equal((await f.request(path, { method: "POST", body: { ...draft, status: "approved" } })).status, 400);
  assert.equal((await f.request(path, { method: "POST", body: { ...draft, organizationId: "foreign-company", role: "owner" } })).status, 400);
  assert.equal((await f.request("staff/workspaces/foreign-company/listings", { method: "POST", body: draft })).status, 403);
  const created = await f.request(path, { method: "POST", body: draft }); assert.equal(created.status, 201);
  const listing = await created.json(); assert.equal(listing.organizationId, "own-venue"); assert.equal(listing.status, "draft");
  const body = { ...draft, title: "Revised synthetic birthday", expectedRevision: 0 };
  assert.equal((await f.request(path + "/" + listing.id, { method: "PUT", body })).status, 200);
  assert.equal((await f.request(path + "/" + listing.id, { method: "PUT", body })).status, 409);
  assert.equal((await f.request("staff/workspaces/foreign-company/listings/" + listing.id, { method: "PUT", body })).status, 403);
  assert.equal(Number((await f.store.db.prepare("SELECT count(*) AS n FROM marketplace_offering_versions").get()).n), 2);
  const member = (await f.storage.memberships(f.ownerAccount))[0];
  await f.storage.updateMembership({ ...member, role: "accounting", revision: 1 }, 0, f.adminAccount);
  assert.equal((await f.request(path, { method: "POST", body: draft })).status, 403);
  assert.equal((await f.request(path)).status, 403);
  assert.equal((await f.request("staff/workspaces/own-venue/profile", { method: "PUT", body: profile })).status, 403);
});

test("profile editor cannot alter approval, slug, handling mode or membership and rejects stale edits", async t => {
  const f = await fixture(t), path = "staff/workspaces/own-venue/profile";
  for (const field of [{ status: "approved" }, { slug: "take-over" }, { bookingMode: "managed" }, { role: "owner" }])
    assert.equal((await f.request(path, { method: "PUT", body: { ...profile, ...field } })).status, 400);
  assert.equal((await f.request(path, { method: "PUT", body: profile })).status, 200);
  assert.equal((await f.request(path, { method: "PUT", body: profile })).status, 409);
  const value = await f.storage.organization("own-venue");
  assert.equal(value.status, "draft"); assert.equal(value.revision, 1); assert.equal(value.name, profile.name);
  await f.storage.updateOrganization({ ...value, status: "approved", revision: 2 }, 1, f.adminAccount);
  assert.equal((await f.request(path, { method: "PUT", body: { ...profile, expectedRevision: 2 } })).status, 409);
  await f.storage.updateOrganization({ ...value, status: "suspended", revision: 3 }, 2, f.adminAccount);
  assert.equal((await f.request("staff/workspaces/own-venue/listings", { method: "POST", body: draft })).status, 403);
});

test("failed atomic workspace audit cannot save a profile or listing or return HTTP success", async t => {
  const f = await fixture(t), prepare = f.store.db.prepare.bind(f.store.db);
  f.store.db.prepare = sql => { if (sql.includes("INSERT INTO marketplace_audit")) throw Error("Injected workspace audit failure"); return prepare(sql); };
  assert.equal((await f.request("staff/workspaces/own-venue/profile", { method: "PUT", body: profile })).status, 500);
  assert.equal((await f.request("staff/workspaces/own-venue/listings", { method: "POST", body: draft })).status, 500);
  f.store.db.prepare = prepare;
  assert.equal((await f.storage.organization("own-venue")).revision, 0);
  assert.equal(Number((await f.store.db.prepare("SELECT count(*) AS n FROM marketplace_offerings").get()).n), 0);
  assert.equal(Number((await f.store.db.prepare("SELECT count(*) AS n FROM marketplace_offering_versions").get()).n), 0);
});

test("explicit customer application creates only its own unpublished workspace, prevents collisions and caps unfinished applications", async t => {
  const f = await fixture(t, false); await migrateMarketplace(f.store.db);
  const body = { name: "Synthetic independent artist", slug: "synthetic-new-artist", kind: "independent_artist",
    publicDescription: "An unpublished synthetic application for testing.", categories: ["juggling"] };
  assert.equal((await f.request("customer/applications", { method: "POST", cookie: f.customerCookie, body: { ...body, status: "approved" } })).status, 400);
  const response = await f.request("customer/applications", { method: "POST", cookie: f.customerCookie, body });
  assert.equal(response.status, 201); const value = await response.json(); assert.equal(value.status, "draft");
  const storage = new MarketplaceStorage(f.store.db);
  assert.deepEqual(await storage.publicDirectory(), []);
  assert.equal(Number((await f.store.db.prepare("SELECT count(*) AS n FROM marketplace_accounts").get()).n), 1);
  assert.equal((await f.request("staff/workspaces/" + value.id)).status, 403);
  const own = await (await f.request("customer/workspaces", { cookie: f.customerCookie })).json(); assert.equal(own.workspaces.length, 1);
  assert.equal((await f.request("customer/applications", { method: "POST", cookie: f.customerCookie, body })).status, 409);
  for (const number of [2, 3]) assert.equal((await f.request("customer/applications", { method: "POST", cookie: f.customerCookie, body: { ...body, slug: "application-" + number } })).status, 201);
  assert.equal((await f.request("customer/applications", { method: "POST", cookie: f.customerCookie, body: { ...body, slug: "application-4" } })).status, 409);
});

test("partner submission and master review enforce distinct authority, stale checks and recorded reasons", async t => {
  const f = await fixture(t), root = "staff/workspaces/own-venue", review = "platform/organizations/own-venue/review";
  assert.equal((await f.request(root + "/submit", { method: "POST", body: { expectedRevision: 0 } })).status, 400);
  assert.equal((await f.request(root + "/profile", { method: "PUT", body: { ...profile, publicDescription: "A synthetic venue ready for review." } })).status, 200);
  assert.equal((await f.request(root + "/submit", { method: "POST", body: { expectedRevision: 1 } })).status, 200);
  assert.deepEqual(await f.storage.publicDirectory(), []);
  assert.equal((await f.request("platform/applications")).status, 403);
  assert.equal((await f.request("platform/applications", { cookie: f.customerCookie })).status, 401);
  const queue = await f.request("platform/applications", { cookie: f.adminCookie }); assert.equal(queue.status, 200);
  assert.equal((await queue.json()).applications.length, 1);
  const body = { decision: "approve", expectedRevision: 2, note: "Reviewed synthetic application" };
  assert.equal((await f.request(review, { method: "POST", body })).status, 403);
  assert.equal((await f.request(review, { method: "POST", cookie: f.adminCookie, body: { ...body, role: "admin" } })).status, 400);
  assert.equal((await f.request(review, { method: "POST", cookie: f.adminCookie, body })).status, 200);
  assert.equal((await f.request(review, { method: "POST", cookie: f.adminCookie, body })).status, 409);
  assert.equal((await f.storage.publicDirectory()).length, 1);
  assert.equal((await f.request(root, { cookie: f.adminCookie })).status, 403);
  const audit = await f.store.db.prepare("SELECT data FROM marketplace_audit WHERE entity_id=? ORDER BY rowid DESC LIMIT 1").get("own-venue");
  assert.equal(JSON.parse(audit.data).reviewNote, body.note);
  // Demotion in the stored login takes effect even though the session remains.
  const userRow = await f.store.db.prepare("SELECT id,data FROM users WHERE email=?").get("admin@workspace.test");
  await f.store.db.prepare("UPDATE users SET data=? WHERE id=?").run(JSON.stringify({ ...JSON.parse(userRow.data), role: "owner" }), userRow.id);
  assert.equal((await f.request("platform/applications", { cookie: f.adminCookie })).status, 403);
});

test("submitted listings stay private until both partner and listing are approved, and can be returned with a reason", async t => {
  const f = await fixture(t), root = "staff/workspaces/own-venue/listings";
  const offering = await (await f.request(root, { method: "POST", body: draft })).json();
  assert.equal((await f.request(root + "/" + offering.id + "/submit", { method: "POST", body: { expectedRevision: 0 } })).status, 200);
  assert.equal((await f.request(root + "/" + offering.id, { method: "PUT", body: { ...draft, expectedRevision: 1 } })).status, 409);
  const path = "platform/organizations/own-venue/listings/" + offering.id + "/review", body = { decision: "approve", expectedRevision: 1, note: "Synthetic listing review" };
  assert.equal((await f.request(path, { method: "POST", cookie: f.adminCookie, body })).status, 409);
  assert.equal((await f.request(path, { method: "POST", body })).status, 403);
  const queue = await (await f.request("platform/listings", { cookie: f.adminCookie })).json();
  assert.equal(queue.listings.length, 1); assert.equal(queue.listings[0].partner.status, "draft");
  assert.equal((await f.request(path, { method: "POST", cookie: f.adminCookie, body: { ...body, decision: "return" } })).status, 200);
  assert.equal((await f.storage.offering(offering.id, "own-venue")).status, "draft");
  assert.equal((await f.request(root + "/" + offering.id + "/submit", { method: "POST", body: { expectedRevision: 2 } })).status, 200);
  const organization = await f.storage.organization("own-venue");
  await f.storage.updateOrganization({ ...organization, status: "approved", revision: 1 }, 0, f.adminAccount);
  assert.equal((await f.request("platform/organizations/foreign-company/listings/" + offering.id + "/review", { method: "POST", cookie: f.adminCookie, body })).status, 404);
  assert.equal((await f.request(path, { method: "POST", cookie: f.adminCookie, body: { ...body, expectedRevision: 3 } })).status, 200);
  assert.equal((await f.storage.offering(offering.id, "own-venue")).status, "approved");
  assert.equal((await f.request(root + "/" + offering.id, { method: "PUT", body: { ...draft, expectedRevision: 4 } })).status, 409);
});

test("application audit failure rolls back identity mapping, organization and membership together", async t => {
  const f = await fixture(t, false); await migrateMarketplace(f.store.db);
  const prepare = f.store.db.prepare.bind(f.store.db);
  f.store.db.prepare = sql => { if (sql.includes("INSERT INTO marketplace_audit")) throw Error("Injected application audit failure"); return prepare(sql); };
  const body = { name: "Synthetic new company", slug: "new-company", kind: "company", publicDescription: "Synthetic company application.", categories: ["decoration"] };
  assert.equal((await f.request("customer/applications", { method: "POST", cookie: f.customerCookie, body })).status, 500);
  f.store.db.prepare = prepare;
  for (const table of ["marketplace_accounts", "marketplace_legacy_accounts", "marketplace_organizations", "marketplace_memberships"])
    assert.equal(Number((await f.store.db.prepare(`SELECT count(*) AS n FROM ${table}`).get()).n), 0);
});
