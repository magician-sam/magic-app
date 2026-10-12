import test from "node:test";
import assert from "node:assert/strict";
import { TestStore as Store } from "./store-fixture.mjs";
import { migrateMarketplace, MarketplaceStorage } from "../dist/marketplace-storage.js";
import { MarketplacePublic } from "../dist/marketplace-public.js";
import { createApp } from "../dist/server.js";
import { createUser } from "../dist/auth.js";
import { snapshot } from "../dist/snapshots.js";
async function fixture(t, expanded = true) {
  const store = new Store(":memory:"); t.after(() => store.db.close());
  const business = await store.createBusiness("Synthetic directory", "magic-by-sam");
  if (!expanded) return { store, publicData: new MarketplacePublic(store) };
  const user = await createUser(store, business.id, "directory@fixture.test", "Fixture-password-42!", "Test");
  await migrateMarketplace(store.db);
  const storage = new MarketplaceStorage(store.db), actor = await storage.mapLegacyAccount("staff", user.id);
  const org = (id, status = "approved", kind = "venue_operator") => ({ id, slug: id, name: id === "venue" ? "Venue <script>privateAttack()</script>" : id,
    kind, status, bookingMode: "direct", categories: ["playgrounds"], publicDescription: "Synthetic searchable birthday playground.",
    publicContact: { phone: "+96171299716", email: "public@fixture.test" }, revision: 0 });
  for (const status of ["approved", "draft", "pending", "suspended", "archived"]) await storage.insertOrganization(org(status === "approved" ? "venue" : status, status), actor);
  await storage.insertOrganization(org("agency", "approved", "company"), actor);
  await storage.insertOrganization(org("artist", "approved", "independent_artist"), actor);
  await storage.insertMembership({ id: "private-member", accountId: actor, organizationId: "venue", role: "owner", status: "active", revision: 0 }, actor);
  for (const status of ["approved", "draft", "pending", "paused", "archived"]) await storage.insertOffering({ id: "listing-" + status, organizationId: "venue", status,
    title: "Synthetic " + status, kind: "playground_entry", categories: ["playgrounds"], revision: 0 }, actor);
  await storage.insertOffering({ id: "foreign-listing", organizationId: "agency", status: "approved", title: "Synthetic agency service", kind: "service", categories: ["magic"], revision: 0 }, actor);
  return { store, storage, publicData: new MarketplacePublic(store), actor, org };
}
test("public discovery works on legacy databases without migration or identity writes", async t => {
  const { store, publicData } = await fixture(t, false), before = await snapshot(store);
  assert.deepEqual(await publicData.directory({ group: "venues" }), { partners: [], total: 0, next: null, workspaceReady: false });
  await assert.rejects(publicData.profile("venue"), /not found/);
  assert.deepEqual((await snapshot(store)).tables, before.tables);
});
test("public directory partitions approved provider types and never returns memberships, audit, revisions or credentials", async t => {
  const { publicData } = await fixture(t);
  for (const [group, expected] of [["venues", "venue"], ["companies", "agency"], ["artists", "artist"]]) {
    const data = await publicData.directory({ group }); assert.equal(data.total, 1); assert.equal(data.partners.length, 1);
    assert.equal(data.partners[0].id, expected);
    assert.deepEqual(Object.keys(data.partners[0]).sort(), ["id", "slug", "name", "kind", "description", "categories", "bookingMode", "contact"].sort());
  }
  for (const slug of ["draft", "pending", "suspended", "archived"]) await assert.rejects(publicData.profile(slug), /not found/);
  assert.equal((await publicData.directory({ group: "venues", q: "birthday" })).total, 1);
  assert.equal((await publicData.directory({ group: "venues", q: "%" })).total, 0);
  await assert.rejects(publicData.directory({ group: "venues", organizationId: "private" }));
});
test("public profiles expose only approved own offerings and disappear immediately when suspended", async t => {
  const { publicData, storage, actor } = await fixture(t);
  const value = await publicData.profile("venue"); assert.equal(value.total, 1);
  assert.deepEqual(value.listings.map(listing => listing.id), ["listing-approved"]);
  assert.deepEqual(Object.keys(value.listings[0]).sort(), ["id", "title", "kind", "categories"].sort());
  const organization = await storage.organization("venue");
  await storage.updateOrganization({ ...organization, status: "suspended", revision: 1 }, 0, actor);
  await assert.rejects(publicData.profile("venue"), /not found/);
  assert.equal((await publicData.directory({ group: "venues" })).total, 0);
});
test("directory and profile pagination retain every approved item without repetition", async t => {
  const { publicData, storage, actor, org } = await fixture(t);
  for (let i = 0; i < 27; i++) {
    const id = "test-venue-" + String(i).padStart(2, "0"); await storage.insertOrganization(org(id), actor);
    await storage.insertOffering({ id: "entry-" + String(i).padStart(2, "0"), organizationId: "venue", title: "Synthetic entry " + i,
      kind: "playground_entry", categories: ["playgrounds"], status: "approved", revision: 0 }, actor);
  }
  const one = await publicData.directory({ group: "venues" }), two = await publicData.directory({ group: "venues", after: one.next });
  assert.equal(one.partners.length, 25); assert.equal(two.partners.length, 3); assert.equal(two.next, null);
  assert.equal(new Set([...one.partners, ...two.partners].map(p => p.id)).size, 28);
  const first = await publicData.profile("venue"), second = await publicData.profile("venue", { after: first.next });
  assert.equal(first.listings.length, 25); assert.equal(second.listings.length, 3); assert.equal(second.next, null);
  assert.equal(new Set([...first.listings, ...second.listings].map(p => p.id)).size, 28);
});
test("public profile HTTP routes escape metadata, reject private profiles and need no staff cookie", async t => {
  const { store } = await fixture(t), server = createApp(store, "https://directory.test").listen(0, "127.0.0.1");
  await new Promise(resolve => server.on("listening", resolve)); t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const response = await fetch(base + "/providers/venue"); assert.equal(response.status, 200);
  const html = await response.text(); assert.match(html, /Venue &lt;script&gt;/); assert.doesNotMatch(html, /<script>privateAttack/);
  for (const path of ["/providers/draft", "/api/marketplace/public/providers/pending"]) assert.equal((await fetch(base + path)).status, 404);
  const directory = await fetch(base + "/api/marketplace/public/directory?group=venues"); assert.equal(directory.status, 200);
  assert.match(directory.headers.get("cache-control"), /no-store/);
  assert.equal((await directory.json()).partners.length, 1);
});
